const crypto = require("crypto");
const mongoose = require("mongoose");
const TeachSession = require("../Models/TeachSession");

// ------------------------------------------------------------------
// SkillSync Live  (WebRTC video, signalled over plain HTTP polling)
//
// The teacher ("host") publishes camera/screen + mic. Every learner opens a
// direct WebRTC connection with the host. This server only passes the small
// offer / answer / ICE messages between them, so no extra package is needed.
//
// Rooms are kept in memory, which is fine for ONE server process. If you
// ever run several instances, move this to Redis or switch to Socket.IO.
// ------------------------------------------------------------------

const HOST = "host";
const HOST_TIMEOUT_MS = 45 * 1000;   // host stopped polling -> class ends
const PEER_TIMEOUT_MS = 20 * 1000;   // learner stopped polling -> removed
const MAX_QUEUE = 300;
const MAX_SIGNAL_BYTES = 20 * 1024;
const MAX_VIEWERS = Number(process.env.TEACH_MAX_VIEWERS) || 10;
const SIGNAL_TYPES = ["offer", "answer", "candidate"];

const rooms = new Map();   // sessionId -> room

const getUserId = (req) => String(req.user._id || req.user.id);

// STUN is enough for most networks. For strict school / mobile networks add a
// TURN server:  ICE_SERVERS=[{"urls":"turn:host:3478","username":"u","credential":"p"}]
function iceServers() {
    try {
        const parsed = JSON.parse(process.env.ICE_SERVERS || "");
        if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (e) { /* fall through to default */ }
    return [{ urls: "stun:stun.l.google.com:19302" }];
}

function createRoom(hostUserId) {
    return {
        hostUserId: String(hostUserId),
        hostLastSeen: Date.now(),
        startedAt: new Date(),
        seq: 0,
        peers: new Map(),   // peerId -> { userId, name, lastSeen }
        mail: new Map()     // peerId -> [{ seq, from, type, data }]
    };
}

function sweepRoom(room) {
    const now = Date.now();
    for (const [peerId, peer] of room.peers) {
        if (now - peer.lastSeen > PEER_TIMEOUT_MS) {
            room.peers.delete(peerId);
            room.mail.delete(peerId);
        }
    }
}

async function markEnded(sessionId) {
    await TeachSession.updateOne(
        { _id: sessionId },
        { $set: { "live.isLive": false, "live.endedAt": new Date() } }
    );
}

async function endRoom(sessionId) {
    rooms.delete(String(sessionId));
    await markEnded(sessionId);
}

exports.viewerCount = (sessionId) => {
    const room = rooms.get(String(sessionId));
    if (!room) return 0;
    sweepRoom(room);
    return room.peers.size;
};

// Called once after MongoDB connects: a restart wipes the in-memory rooms, so
// any session still flagged "live" in the database is stale.
exports.resetStaleLive = async () => {
    await TeachSession.updateMany(
        { "live.isLive": true },
        { $set: { "live.isLive": false, "live.endedAt": new Date() } }
    );
};

// Ends classes whose host disappeared (closed the tab / lost connection).
const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, room] of rooms) {
        if (now - room.hostLastSeen > HOST_TIMEOUT_MS) {
            endRoom(sessionId).catch((err) => console.warn("live sweep:", err.message));
        } else {
            sweepRoom(room);
        }
    }
}, 10 * 1000);
sweeper.unref();

// Who is calling? Returns the peer record, or null.
function identify(room, peerId, req) {
    const uid = getUserId(req);
    if (peerId === HOST) return room.hostUserId === uid ? { userId: uid } : null;
    const peer = room.peers.get(peerId);
    return peer && peer.userId === uid ? peer : null;
}

function touch(room, peerId, peer) {
    if (peerId === HOST) room.hostLastSeen = Date.now();
    else peer.lastSeen = Date.now();
}

async function findSession(req, res) {
    if (!mongoose.isValidObjectId(req.params.id)) {
        res.status(404).json({ message: "Session not found" });
        return null;
    }
    const session = await TeachSession.findById(req.params.id);
    if (!session) {
        res.status(404).json({ message: "Session not found" });
        return null;
    }
    return session;
}

// POST /api/teach/sessions/:id/live/start   (teacher)  - safe to call again after a refresh
exports.startLive = async (req, res) => {
    try {
        const session = await findSession(req, res);
        if (!session) return;
        if (String(session.user) !== getUserId(req)) {
            return res.status(403).json({ message: "Only the teacher can start the live class" });
        }
        if (session.mode !== "Live online") {
            return res.status(400).json({ message: "Live video is only for \"Live online\" sessions" });
        }
        if (session.status === "completed") {
            return res.status(409).json({ message: "This session is already completed" });
        }

        const id = String(session._id);
        let room = rooms.get(id);
        if (!room) {
            room = createRoom(getUserId(req));
            rooms.set(id, room);
        }
        room.hostLastSeen = Date.now();

        if (!session.live || !session.live.isLive) {
            await TeachSession.updateOne(
                { _id: session._id },
                { $set: { "live.isLive": true, "live.startedAt": room.startedAt, "live.endedAt": null } }
            );
        }

        res.json({
            message: "You are live",
            peerId: HOST,
            iceServers: iceServers(),
            startedAt: room.startedAt,
            viewers: room.peers.size
        });
    } catch (err) {
        console.error("startLive:", err);
        res.status(500).json({ message: "Could not start the live class" });
    }
};

// POST /api/teach/sessions/:id/live/stop   (teacher)
exports.stopLive = async (req, res) => {
    try {
        const session = await findSession(req, res);
        if (!session) return;
        if (String(session.user) !== getUserId(req)) {
            return res.status(403).json({ message: "Only the teacher can end the live class" });
        }
        await endRoom(session._id);
        res.json({ message: "Live class ended" });
    } catch (err) {
        console.error("stopLive:", err);
        res.status(500).json({ message: "Could not end the live class" });
    }
};

// POST /api/teach/view/:id/live/join   (learner)
exports.joinLive = async (req, res) => {
    try {
        const session = await findSession(req, res);
        if (!session) return;
        const uid = getUserId(req);

        if (String(session.user) === uid) {
            return res.status(400).json({ message: "You are the teacher. Use Go live instead." });
        }
        // Learners pay when they join the session (POST /view/:id/join), before the room opens
        const joined = await TeachSession.exists({ _id: session._id, "participants.user": uid });
        if (!joined) {
            return res.status(403).json({ message: "Join this session first to enter the live class.", needsJoin: true });
        }

        const room = rooms.get(String(session._id));
        if (!room || !session.live || !session.live.isLive) {
            return res.status(409).json({ message: "This class isn't live right now" });
        }

        sweepRoom(room);
        // one connection per learner: replace an older tab of the same person
        for (const [peerId, peer] of room.peers) {
            if (peer.userId === uid) { room.peers.delete(peerId); room.mail.delete(peerId); }
        }
        if (room.peers.size >= MAX_VIEWERS) {
            return res.status(409).json({ message: `The class is full (${MAX_VIEWERS} learners max)` });
        }

        const peerId = crypto.randomBytes(6).toString("hex");
        room.peers.set(peerId, { userId: uid, name: req.user.name || "Learner", lastSeen: Date.now() });

        res.json({ peerId, iceServers: iceServers(), hostPeerId: HOST });
    } catch (err) {
        console.error("joinLive:", err);
        res.status(500).json({ message: "Could not join the live class" });
    }
};

// GET /api/teach/live/:id/poll?peerId=...&since=<last seq>
exports.poll = (req, res) => {
    const room = rooms.get(String(req.params.id));
    if (!room) return res.json({ live: false, messages: [] });

    const peerId = String(req.query.peerId || "");
    const me = identify(room, peerId, req);
    if (!me) return res.status(404).json({ message: "Not part of this class. Rejoin.", rejoin: true });

    touch(room, peerId, me);
    sweepRoom(room);

    const since = Number(req.query.since) || 0;
    const queue = (room.mail.get(peerId) || []).filter((m) => m.seq > since);
    room.mail.set(peerId, queue);   // messages the caller already has are dropped

    const body = { live: true, messages: queue };
    if (peerId === HOST) {
        body.peers = [...room.peers].map(([id, p]) => ({ peerId: id, name: p.name }));
        body.viewers = room.peers.size;
    } else {
        body.hostOnline = Date.now() - room.hostLastSeen < 15 * 1000;
        body.viewers = room.peers.size;
    }
    res.json(body);
};

// POST /api/teach/live/:id/signal   { peerId, to, type, data }
exports.signal = (req, res) => {
    const room = rooms.get(String(req.params.id));
    if (!room) return res.status(409).json({ message: "Class has ended", live: false });

    const { peerId, to, type, data } = req.body || {};
    const me = identify(room, String(peerId || ""), req);
    if (!me) return res.status(404).json({ message: "Not part of this class. Rejoin.", rejoin: true });

    if (!SIGNAL_TYPES.includes(type)) return res.status(400).json({ message: "Invalid signal type" });
    if (to !== HOST && !room.peers.has(to)) return res.status(404).json({ message: "That learner left" });
    if (to === peerId) return res.status(400).json({ message: "Can't signal yourself" });
    // learners only ever talk to the host (no learner <-> learner traffic)
    if (peerId !== HOST && to !== HOST) return res.status(403).json({ message: "Learners can only signal the host" });
    if (JSON.stringify(data || {}).length > MAX_SIGNAL_BYTES) {
        return res.status(413).json({ message: "Signal too large" });
    }

    const queue = room.mail.get(to) || [];
    queue.push({ seq: ++room.seq, from: peerId, type, data });
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    room.mail.set(to, queue);

    res.json({ ok: true });
};

// POST /api/teach/live/:id/leave   { peerId }
exports.leave = (req, res) => {
    const room = rooms.get(String(req.params.id));
    const peerId = String((req.body && req.body.peerId) || "");
    if (room && peerId !== HOST && identify(room, peerId, req)) {
        room.peers.delete(peerId);
        room.mail.delete(peerId);
    }
    res.json({ ok: true });
};

exports._rooms = rooms; // exposed for tests only
exports.HOST = HOST;
