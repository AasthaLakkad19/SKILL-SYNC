const mongoose = require("mongoose");
const User = require("../Models/User");
const Profile = require("../Models/Profile");
const Resume = require("../Models/Resume");
const Project = require("../Models/Project");
const Connection = require("../Models/Connection");
const TeamPreference = require("../Models/TeamPreference");
const {
  INTERESTS,
  INTEREST_LABELS,
  deriveInterest,
  makePairKey,
  educationLine,
  mergeSkills,
  matchesFilters
} = require("../utils/teammateUtils");

const SCAN_LIMIT = 500; // users examined per search (campus-sized app)
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;
const MAX_PENDING_SENT = 50;
const RE_REQUEST_COOLDOWN_DAYS = 7;
const AVAILABILITY = ["available", "busy", "offline"];

// ------------------------------------------------------------
// helpers
// ------------------------------------------------------------

const uid = (req) => String(req.user._id);

const serverError = (res, label, err) => {
  console.error(label, err);
  res.status(500).json({ message: "Server error" });
};

const notFound = (res, what = "Teammate") => res.status(404).json({ message: `${what} not found` });

// "B.Tech IT · 2026" from the first education row of the resume
function resumeEducationLine(resume) {
  const edu = resume && resume.education && resume.education[0];
  if (!edu) return "";
  const parts = [edu.degree, edu.year].map((p) => (p || "").trim()).filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return (edu.college || "").trim();
}

// ?v= changes when the resume is saved, so browsers refetch a new photo
const photoUrlFor = (userId, stamp) =>
  `/api/teammates/${userId}/photo` + (stamp ? `?v=${new Date(stamp).getTime()}` : "");

// "none" | "requested" (I asked) | "incoming" (they asked me) | "connected"
function connectionState(conn, me) {
  if (!conn) return "none";
  if (conn.status === "accepted") return "connected";
  if (conn.status === "pending") return conn.requesterId === me ? "requested" : "incoming";
  return "none"; // declined
}

// Builds the cards the page shows. Joins User + Profile + preferences +
// my connection state. Public info only: never email or password.
async function buildCards(req, { ids = null } = {}) {
  const me = uid(req);

  const userFilter = { _id: { $ne: req.user._id }, isActive: true };
  if (ids) userFilter._id = { $in: ids, $ne: req.user._id };

  const users = await User.find(userFilter).select("name skills").limit(SCAN_LIMIT).lean();
  const userIds = users.map((u) => String(u._id));

  const [profiles, resumes, photoDocs, prefs, conns, myProjects] = await Promise.all([
    Profile.find({ userId: { $in: userIds } })
      .select("userId headline bio education availability skills.name")
      .lean(),
    // Resume = where the "Build Resume" page stores bio / education / skills / photo.
    // The photo itself (a big base64 string) is NOT loaded here, see photoDocs.
    Resume.find({ userId: { $in: userIds } })
      .select("userId personalInfo.bio education skills updatedAt")
      .lean(),
    // Only ids of people who actually have a photo; the image is served by GET /:userId/photo
    Resume.find({ userId: { $in: userIds }, "personalInfo.photo": { $nin: [null, ""] } })
      .select("userId updatedAt")
      .lean(),
    TeamPreference.find({ userId: { $in: userIds } }).lean(),
    Connection.find({ $or: [{ requesterId: me }, { recipientId: me }] }).lean(),
    Project.find({ ownerId: me, status: { $ne: "completed" } }).select("tech").lean()
  ]);

  const profileBy = new Map(profiles.map((p) => [p.userId, p]));
  const resumeBy = new Map(resumes.map((r) => [r.userId, r]));
  const photoBy = new Map(photoDocs.map((r) => [r.userId, r]));
  const prefBy = new Map(prefs.map((p) => [p.userId, p]));
  const connBy = new Map(conns.map((c) => [c.requesterId === me ? c.recipientId : c.requesterId, c]));
  const wanted = new Set(myProjects.flatMap((p) => (p.tech || []).map((t) => t.toLowerCase())));

  return users.map((u) => {
    const id = String(u._id);
    const profile = profileBy.get(id);
    const resume = resumeBy.get(id);
    const photoDoc = photoBy.get(id);
    const pref = prefBy.get(id);

    const resumeSkills = resume && resume.skills ? [...(resume.skills.technical || []), ...(resume.skills.tools || [])] : [];
    const skills = mergeSkills(
      u.skills,
      ((profile && profile.skills) || []).map((s) => s.name),
      resumeSkills
    ).slice(0, 8);
    const interest = (pref && pref.interest) || deriveInterest(skills);
    const availability = (pref && pref.availability) || (profile && profile.availability) || "available";
    const connection = connectionState(connBy.get(id), me);

    return {
      id,
      name: u.name,
      education: educationLine(profile && profile.education) || resumeEducationLine(resume),
      description: (
        (profile && (profile.bio || profile.headline)) ||
        (resume && resume.personalInfo && resume.personalInfo.bio) ||
        ""
      ).trim(),
      photoUrl: photoDoc ? photoUrlFor(id, photoDoc.updatedAt) : null,
      skills,
      interest,
      interestLabel: interest ? INTEREST_LABELS[interest] : "",
      availability,
      connection,
      connected: connection !== "none", // kept for the old `t.connected` binding
      _score: skills.filter((s) => wanted.has(s.toLowerCase())).length
    };
  });
}

// People who set themselves "offline" stay hidden unless already connected
const isVisible = (card) => card.availability !== "offline" || card.connection === "connected";

const publicCard = ({ _score, ...card }) => card;

// ------------------------------------------------------------
// SEARCH
// ------------------------------------------------------------

// GET /api/teammates?search=&skill=&interest=&availability=&limit=
exports.listTeammates = async (req, res) => {
  try {
    const { search = "", skill = "all", interest = "all", availability = "all" } = req.query;

    if (interest !== "all" && !INTEREST_LABELS[interest]) {
      return res.status(400).json({ message: "Invalid interest" });
    }
    if (availability !== "all" && !AVAILABILITY.includes(availability)) {
      return res.status(400).json({ message: "Invalid availability" });
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

    const cards = (await buildCards(req))
      .filter(isVisible)
      .filter((c) => matchesFilters(c, { search: String(search), skill: String(skill), interest, availability }));

    // Available first, then best skill match with MY open projects, then A-Z
    cards.sort(
      (a, b) =>
        (b.availability === "available") - (a.availability === "available") ||
        b._score - a._score ||
        a.name.localeCompare(b.name)
    );

    res.json({ total: cards.length, teammates: cards.slice(0, limit).map(publicCard) });
  } catch (err) {
    serverError("LIST TEAMMATES ERROR:", err);
  }
};

// GET /api/teammates/:userId
exports.getTeammate = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return notFound(res);

    const [card] = await buildCards(req, { ids: [userId] });
    if (!card || !isVisible(card)) return notFound(res);

    res.json({ teammate: publicCard(card) });
  } catch (err) {
    serverError("GET TEAMMATE ERROR:", err);
  }
};

// ------------------------------------------------------------
// MY SEARCH PREFERENCES
// ------------------------------------------------------------

// GET /api/teammates/me
exports.getMyPreferences = async (req, res) => {
  try {
    const pref = await TeamPreference.findOne({ userId: uid(req) }).lean();
    res.json({
      interest: (pref && pref.interest) || null,
      availability: (pref && pref.availability) || null,
      interests: INTERESTS
    });
  } catch (err) {
    serverError("GET PREFERENCES ERROR:", err);
  }
};

// PUT /api/teammates/me   { interest?: "web development" | null, availability?: "available" | "busy" | "offline" | null }
exports.updateMyPreferences = async (req, res) => {
  try {
    const body = req.body || {};
    const update = {};

    if ("interest" in body) {
      const v = body.interest === "" ? null : body.interest;
      if (v !== null && !INTEREST_LABELS[v]) return res.status(400).json({ message: "Invalid interest" });
      update.interest = v;
    }
    if ("availability" in body) {
      const v = body.availability === "" ? null : body.availability;
      if (v !== null && !AVAILABILITY.includes(v)) return res.status(400).json({ message: "Invalid availability" });
      update.availability = v;
    }
    if (!Object.keys(update).length) {
      return res.status(400).json({ message: "Send interest and/or availability" });
    }

    const pref = await TeamPreference.findOneAndUpdate(
      { userId: uid(req) },
      { $set: update },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    res.json({ message: "Preferences saved", interest: pref.interest, availability: pref.availability });
  } catch (err) {
    serverError("UPDATE PREFERENCES ERROR:", err);
  }
};

// ------------------------------------------------------------
// CONNECT / DISCONNECT
// ------------------------------------------------------------

// PUT /api/teammates/:userId/connect
exports.sendConnect = async (req, res) => {
  try {
    const me = uid(req);
    const other = req.params.userId;

    if (!mongoose.isValidObjectId(other)) return notFound(res);
    if (other === me) return res.status(400).json({ message: "You can't connect with yourself" });

    const target = await User.findOne({ _id: other, isActive: true }).select("name").lean();
    if (!target) return notFound(res);

    const pairKey = makePairKey(me, other);
    const conn = await Connection.findOne({ pairKey }).lean();

    if (conn) {
      if (conn.status === "accepted") {
        return res.json({ connection: "connected", message: `You're already connected with ${target.name}` });
      }

      if (conn.status === "pending") {
        if (conn.requesterId === me) {
          return res.json({ connection: "requested", message: `Request already sent to ${target.name}` });
        }
        // They asked me first, so clicking Connect means "yes"
        await Connection.updateOne(
          { _id: conn._id, status: "pending" },
          { $set: { status: "accepted", responseSeen: false } }
        );
        return res.json({ connection: "connected", message: `You're now connected with ${target.name}` });
      }

      // declined: whoever was declined has to wait; the decliner is free to ask
      if (conn.requesterId === me && conn.declinedAt) {
        const waitMs = RE_REQUEST_COOLDOWN_DAYS * 24 * 60 * 60 * 1000 - (Date.now() - new Date(conn.declinedAt).getTime());
        if (waitMs > 0) {
          const days = Math.ceil(waitMs / (24 * 60 * 60 * 1000));
          return res.status(429).json({ message: `You can send ${target.name} another request in ${days} day${days === 1 ? "" : "s"}.` });
        }
      }
    }

    const pending = await Connection.countDocuments({ requesterId: me, status: "pending" });
    if (pending >= MAX_PENDING_SENT) {
      return res.status(400).json({ message: "You have too many pending requests. Wait for some replies first." });
    }

    if (!conn) {
      try {
        await Connection.create({ pairKey, requesterId: me, recipientId: other });
      } catch (err) {
        if (err.code !== 11000) throw err; // created by a parallel request
        return res.json({ connection: "requested", message: `Request already sent to ${target.name}` });
      }
    } else {
      await Connection.updateOne(
        { _id: conn._id },
        { $set: { status: "pending", requesterId: me, recipientId: other, declinedAt: null } }
      );
    }

    res.status(201).json({ connection: "requested", message: `Connection request sent to ${target.name}` });
  } catch (err) {
    serverError("SEND CONNECT ERROR:", err);
  }
};

// DELETE /api/teammates/:userId/connect
// Cancels a request I sent, or removes an existing connection. Idempotent.
exports.removeConnect = async (req, res) => {
  try {
    const me = uid(req);
    const other = req.params.userId;
    if (!mongoose.isValidObjectId(other)) return notFound(res);

    await Connection.deleteOne({
      pairKey: makePairKey(me, other),
      $or: [{ status: "pending", requesterId: me }, { status: "accepted" }]
    });

    res.json({ connection: "none", message: "Connection removed" });
  } catch (err) {
    serverError("REMOVE CONNECT ERROR:", err);
  }
};

// ------------------------------------------------------------
// REQUESTS I RECEIVED + MY CONNECTIONS
// ------------------------------------------------------------

// GET /api/teammates/requests
exports.incomingRequests = async (req, res) => {
  try {
    const me = uid(req);
    const reqs = await Connection.find({ recipientId: me, status: "pending" }).lean();
    const cards = await buildCards(req, { ids: reqs.map((r) => r.requesterId).filter(mongoose.isValidObjectId) });
    const cardBy = new Map(cards.map((c) => [c.id, c]));

    res.json({
      requests: reqs
        .filter((r) => cardBy.has(r.requesterId))
        .map((r) => ({ id: String(r._id), createdAt: r.createdAt, from: publicCard(cardBy.get(r.requesterId)) }))
    });
  } catch (err) {
    serverError("INCOMING REQUESTS ERROR:", err);
  }
};

// POST /api/teammates/requests/:id/accept
exports.acceptRequest = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return notFound(res, "Request");

    // Atomic: only the recipient, only while pending, so double clicks are harmless
    const conn = await Connection.findOneAndUpdate(
      { _id: id, recipientId: uid(req), status: "pending" },
      { $set: { status: "accepted", responseSeen: false } },
      { new: true }
    );
    if (!conn) return notFound(res, "Request");

    res.json({ connection: "connected", message: "You're now connected" });
  } catch (err) {
    serverError("ACCEPT REQUEST ERROR:", err);
  }
};

// POST /api/teammates/requests/:id/decline
exports.declineRequest = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return notFound(res, "Request");

    const conn = await Connection.findOneAndUpdate(
      { _id: id, recipientId: uid(req), status: "pending" },
      { $set: { status: "declined", declinedAt: new Date() } },
      { new: true }
    );
    if (!conn) return notFound(res, "Request");

    res.json({ connection: "none", message: "Request declined" });
  } catch (err) {
    serverError("DECLINE REQUEST ERROR:", err);
  }
};

// GET /api/teammates/connections
exports.myConnections = async (req, res) => {
  try {
    const me = uid(req);
    const accepted = await Connection.find({
      status: "accepted",
      $or: [{ requesterId: me }, { recipientId: me }]
    }).lean();

    const otherIds = accepted
      .map((c) => (c.requesterId === me ? c.recipientId : c.requesterId))
      .filter(mongoose.isValidObjectId);

    const cards = otherIds.length ? await buildCards(req, { ids: otherIds }) : [];
    res.json({ connections: cards.sort((a, b) => a.name.localeCompare(b.name)).map(publicCard) });
  } catch (err) {
    serverError("MY CONNECTIONS ERROR:", err);
  }
};


// ------------------------------------------------------------
// PHOTO  (GET /api/teammates/:userId/photo)
// The resume stores the picture as a base64 data URL. Sending it inside every
// card would make the list huge, so cards carry a small URL and the browser
// loads each image separately (and caches it).
// ------------------------------------------------------------
exports.getPhoto = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return notFound(res, "Photo");

    const resume = await Resume.findOne({ userId }).select("personalInfo.photo").lean();
    const photo = resume && resume.personalInfo && resume.personalInfo.photo;
    const match = /^data:(image\/(?:png|jpe?g|gif|webp|avif));base64,([A-Za-z0-9+/=\s]+)$/i.exec(photo || "");
    if (!match) return notFound(res, "Photo");

    res.set({
      "Content-Type": match[1].toLowerCase(),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff"
    });
    res.send(Buffer.from(match[2].replace(/\s/g, ""), "base64"));
  } catch (err) {
    serverError("GET PHOTO ERROR:", err);
  }
};

// ------------------------------------------------------------
// NOTIFICATIONS  (the bell in the header)
//   - requests: people who asked ME to connect (still pending)
//   - accepted: people who accepted a request I sent (until I open the bell)
// ------------------------------------------------------------
const ACCEPTED_WINDOW_DAYS = 14;

// GET /api/teammates/notifications
exports.notifications = async (req, res) => {
  try {
    const me = uid(req);
    const since = new Date(Date.now() - ACCEPTED_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [pending, accepted] = await Promise.all([
      Connection.find({ recipientId: me, status: "pending" }).lean(),
      Connection.find({ requesterId: me, status: "accepted" }).lean()
    ]);
    const recentAccepted = accepted.filter((a) => !a.updatedAt || new Date(a.updatedAt) >= since);

    const ids = [...pending.map((r) => r.requesterId), ...recentAccepted.map((a) => a.recipientId)].filter(
      mongoose.isValidObjectId
    );
    const cards = ids.length ? await buildCards(req, { ids }) : [];
    const cardBy = new Map(cards.map((c) => [c.id, c]));

    const requests = pending
      .filter((r) => cardBy.has(r.requesterId))
      .map((r) => ({ id: String(r._id), createdAt: r.createdAt, from: publicCard(cardBy.get(r.requesterId)) }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const acceptedList = recentAccepted
      .filter((a) => cardBy.has(a.recipientId))
      .map((a) => ({
        id: String(a._id),
        createdAt: a.updatedAt || a.createdAt,
        unseen: a.responseSeen === false,
        user: publicCard(cardBy.get(a.recipientId))
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      unread: requests.length + acceptedList.filter((a) => a.unseen).length,
      requests,
      accepted: acceptedList
    });
  } catch (err) {
    serverError("NOTIFICATIONS ERROR:", err);
  }
};

// POST /api/teammates/notifications/seen
// Called when the bell is opened: clears the "accepted" part of the badge.
// (Pending requests keep counting until the person accepts or declines them.)
exports.markNotificationsSeen = async (req, res) => {
  try {
    await Connection.updateMany(
      { requesterId: uid(req), status: "accepted", responseSeen: false },
      { $set: { responseSeen: true } }
    );
    res.json({ message: "ok" });
  } catch (err) {
    serverError("MARK SEEN ERROR:", err);
  }
};
