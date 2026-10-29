const mongoose = require("mongoose");
const TeachSession = require("../Models/TeachSession");
const QuizAttempt = require("../Models/QuizAttempt");
const wallets = require("./walletController");
const { recordActivity } = require("../utils/achievementUtils");
const live = require("./teachLiveController");
const uploads = require("../utils/teachUploads");

const { CATEGORIES, LEVELS, MODES, DURATIONS, ACTIVITIES, REWARDS } =
    TeachSession.OPTIONS;

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const getUserId = (req) => req.user && (req.user._id || req.user.id);

// A teacher can only complete a session once at least one OTHER student joined
// it. Set TEACH_REQUIRE_LEARNER=false in .env to turn this off (handy for demos
// with a single account).
//
// TOKEN RULES
//   - A learner pays the session's price (its "reward": 2, 3 or 5 tokens) ONCE,
//     when they join. The same tokens go straight to the teacher's wallet.
//   - Content (video, links, quiz, live room) is only given to people who joined.
const REQUIRE_LEARNER = process.env.TEACH_REQUIRE_LEARNER !== "false";

const FIELDS = [
    "title", "skill", "category", "level", "mode",
    "duration", "reward", "description", "activity"
];

// Only allow known fields (prevents mass-assignment of user/status/etc.)
function pickFields(body) {
    const out = {};
    FIELDS.forEach((f) => {
        if (body[f] !== undefined) out[f] = body[f];
    });
    if (body.details !== undefined) out.details = body.details;
    if (out.reward !== undefined) out.reward = Number(out.reward);
    ["title", "skill", "description"].forEach((f) => {
        if (typeof out[f] === "string") out[f] = out[f].trim();
    });
    return out;
}

function validate(data, { partial = false } = {}) {
    const errors = [];
    const need = (f, label) => {
        if (!partial && !data[f]) errors.push(`${label} is required`);
    };
    need("title", "Title");
    need("skill", "Skill");
    need("category", "Category");
    need("description", "Description");

    if (data.title && data.title.length > 70) errors.push("Title must be 70 characters or less");
    if (data.description && data.description.length > 400) errors.push("Description must be 400 characters or less");
    if (data.category && !CATEGORIES.includes(data.category)) errors.push("Invalid category");
    if (data.level && !LEVELS.includes(data.level)) errors.push("Invalid level");
    if (data.mode && !MODES.includes(data.mode)) errors.push("Invalid teaching format");
    if (data.duration && !DURATIONS.includes(data.duration)) errors.push("Invalid duration");
    if (data.activity && !ACTIVITIES.includes(data.activity)) errors.push("Invalid activity");
    if (data.reward !== undefined && !REWARDS.includes(data.reward)) errors.push("Reward must be 2, 3 or 5 tokens");
    return errors;
}


// ------------------------------------------------------------------
// Format-specific details (one set of extra fields per teaching format)
//   Live online              -> meetingLink (optional URL)
//   In person on campus      -> location (optional text)
//   Recorded mini lesson     -> uploaded video OR recordingUrl (one of them is REQUIRED)
//   Pair programming         -> repoLink (optional URL)
//   Quiz / practice session  -> quiz questions (REQUIRED, 1-10)
// ------------------------------------------------------------------

const str = (v) => (typeof v === "string" ? v.trim() : "");

function isUrl(value) {
    try {
        const u = new URL(value);
        return u.protocol === "http:" || u.protocol === "https:";
    } catch (e) {
        return false;
    }
}

// Keep only the fields that belong to the chosen format
function cleanDetails(mode, raw, userId) {
    raw = raw || {};
    const d = {};
    if (mode === "Live online") d.meetingLink = str(raw.meetingLink);
    if (mode === "In person on campus") d.location = str(raw.location);
    if (mode === "Recorded mini lesson") {
        d.recordingUrl = str(raw.recordingUrl);
        // Only keep an uploaded video that really is one of this user's files
        const file = raw.video && uploads.resolveOwnedVideo(raw.video.url, userId);
        if (file) {
            d.video = {
                url: file.url,
                originalName: uploads.safeOriginalName(raw.video.originalName),
                size: file.size,
                mimeType: file.mimeType
            };
        }
    }
    if (mode === "Pair programming") d.repoLink = str(raw.repoLink);
    if (mode === "Quiz / practice session") {
        const quiz = Array.isArray(raw.quiz) ? raw.quiz : [];
        d.quiz = quiz.map((q) => ({
            question: str(q && q.question),
            options: Array.isArray(q && q.options) ? q.options.map(str) : [],
            correctIndex: Number(q && q.correctIndex),
            explanation: str(q && q.explanation)
        }));
    }
    return d;
}

function validateDetails(mode, d) {
    const errors = [];
    d = d || {};

    if (mode === "Live online" && d.meetingLink && !isUrl(d.meetingLink)) {
        errors.push("Meeting link must be a valid http(s) URL");
    }
    if (mode === "In person on campus" && d.location && d.location.length > 100) {
        errors.push("Location must be 100 characters or less");
    }
    if (mode === "Recorded mini lesson") {
        if (!d.video && !d.recordingUrl) errors.push("Upload a video (or paste a link to your recording)");
        else if (d.recordingUrl && !isUrl(d.recordingUrl)) errors.push("Recording link must be a valid http(s) URL");
    }
    if (mode === "Pair programming" && d.repoLink && !isUrl(d.repoLink)) {
        errors.push("Repository link must be a valid http(s) URL");
    }
    if (mode === "Quiz / practice session") {
        const quiz = d.quiz || [];
        if (quiz.length < 1) errors.push("Add at least one quiz question");
        if (quiz.length > 10) errors.push("A quiz can have at most 10 questions");

        quiz.forEach((q, i) => {
            const n = i + 1;
            if (!q.question) errors.push(`Question ${n}: question text is required`);
            if (q.question && q.question.length > 200) errors.push(`Question ${n}: keep it under 200 characters`);
            if (q.options.length < 2 || q.options.length > 6) {
                errors.push(`Question ${n}: needs 2 to 6 options`);
            } else if (q.options.some((o) => !o || o.length > 100)) {
                errors.push(`Question ${n}: every option must be filled in (max 100 characters)`);
            } else if (new Set(q.options.map((o) => o.toLowerCase())).size !== q.options.length) {
                errors.push(`Question ${n}: options must be different from each other`);
            }
            if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
                errors.push(`Question ${n}: choose which option is correct`);
            }
            if (q.explanation && q.explanation.length > 200) {
                errors.push(`Question ${n}: explanation must be 200 characters or less`);
            }
        });
    }
    return errors;
}

const dayKey = (d) => d.toISOString().slice(0, 10);

// Consecutive days (UTC) with at least one session created.
// Streak stays alive if today has none but yesterday does.
function calcStreak(dates) {
    const days = new Set(dates.map(dayKey));
    const cursor = new Date();
    if (!days.has(dayKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
    let streak = 0;
    while (days.has(dayKey(cursor))) {
        streak++;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return streak;
}

const LEVEL_STEPS = [
    { name: "New Teacher", min: 0 },
    { name: "Helper", min: 1 },
    { name: "Mentor", min: 3 },
    { name: "Expert Guide", min: 7 }
];

function calcLevel(count) {
    let idx = 0;
    LEVEL_STEPS.forEach((s, i) => { if (count >= s.min) idx = i; });
    const next = LEVEL_STEPS[idx + 1];
    return {
        teachingLevel: LEVEL_STEPS[idx].name,
        levelHint: next
            ? `${next.min - count} more session${next.min - count === 1 ? "" : "s"} to ${next.name}`
            : "Top level reached"
    };
}

// Public shape of a session. The teacher gets everything; learners get the
// quiz questions WITHOUT the answers (those are only revealed after grading).
function serialize(doc, { owner = false } = {}) {
    const j = doc.toJSON();
    j.participantCount = doc.participantCount || 0;
    if (doc.user && doc.user.name) j.teacher = doc.user.name;

    const quiz = j.details && j.details.quiz;
    if (quiz) {
        j.details.quizCount = quiz.length;
        if (!owner) j.details.quiz = quiz.map((q) => ({ question: q.question, options: q.options }));
    }
    j.live = j.live || { isLive: false };   // sessions created before live video existed
    j.live.viewers = j.live.isLive ? live.viewerCount(doc.id) : 0;
    j.canComplete = j.status === "published" && (!REQUIRE_LEARNER || j.participantCount > 0);
    return j;
}

// What a learner sees BEFORE joining: no links, video, location or quiz questions.
// (The server hides these, so skipping the payment step isn't possible.)
function lockDetails(j) {
    const quizCount = j.details && j.details.quizCount ? j.details.quizCount : 0;
    j.details = quizCount ? { quizCount } : {};
    j.locked = true;
    return j;
}

const isOwnerOf = (doc, req) => {
    const ownerId = doc.user && doc.user._id ? doc.user._id : doc.user;
    return String(ownerId) === String(getUserId(req));
};

function findOwned(req) {
    if (!mongoose.isValidObjectId(req.params.id)) return null;
    return TeachSession.findOne({ _id: req.params.id, user: getUserId(req) });
}

// ------------------------------------------------------------------
// Handlers
// ------------------------------------------------------------------

const escapeRegex = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const serverError = (res, label, message, err) => {
    console.error(label, err);
    res.status(500).json({ message });
};
const validId = (res, id) => {
    if (mongoose.isValidObjectId(id)) return true;
    res.status(404).json({ message: "Session not found" });
    return false;
};

// GET /api/teach/options -> limits the page needs (upload size, rules)
exports.getOptions = (req, res) => {
    res.json({
        maxVideoMB: uploads.MAX_VIDEO_MB,
        requireLearnerToComplete: REQUIRE_LEARNER,
        maxQuizQuestions: 10
    });
};

// GET /api/teach/sessions?mode=Live online     (the logged-in teacher's own sessions)
exports.getSessions = async (req, res) => {
    try {
        const filter = { user: getUserId(req) };
        if (req.query.mode && req.query.mode !== "all") {
            if (!MODES.includes(req.query.mode)) {
                return res.status(400).json({ message: "Invalid mode filter" });
            }
            filter.mode = req.query.mode;
        }
        const sessions = await TeachSession.find(filter).sort({ createdAt: -1 });
        res.json({ count: sessions.length, sessions: sessions.map((s) => serialize(s, { owner: true })) });
    } catch (err) {
        serverError(res, "getSessions:", "Failed to load sessions", err);
    }
};

// GET /api/teach/stats  -> drives the stat cards + badges
exports.getStats = async (req, res) => {
    try {
        const sessions = await TeachSession.find({ user: getUserId(req) })
            .select("createdAt status tokensAwarded participantCount live")
            .lean();

        const sessionCount = sessions.length;
        const tokensEarned = sessions.reduce((sum, s) => sum + (s.tokensAwarded || 0), 0);
        const streak = calcStreak(sessions.map((s) => s.createdAt));

        res.json({
            sessionCount,
            completedCount: sessions.filter((s) => s.status === "completed").length,
            learnersReached: sessions.reduce((sum, s) => sum + (s.participantCount || 0), 0),
            tokensEarned,
            streak,
            ...calcLevel(sessionCount),
            badges: {
                firstLesson: sessionCount > 0,
                ideaSharer: sessionCount >= 3,
                tokenStar: tokensEarned >= 10
            }
        });
    } catch (err) {
        serverError(res, "getStats:", "Failed to load stats", err);
    }
};

// POST /api/teach/sessions
exports.createSession = async (req, res) => {
    try {
        const userId = getUserId(req);
        const data = pickFields(req.body);
        data.mode = data.mode || "Live online";
        data.details = cleanDetails(data.mode, data.details, userId);

        const errors = validate(data).concat(validateDetails(data.mode, data.details));
        if (errors.length) return res.status(400).json({ message: errors[0], errors });

        const session = await TeachSession.create({ ...data, user: userId });
        res.status(201).json({ message: "Session published", session: serialize(session, { owner: true }) });
    } catch (err) {
        serverError(res, "createSession:", "Failed to create session", err);
    }
};

// GET /api/teach/sessions/:id   (teacher only - includes quiz answers, for editing)
exports.getSession = async (req, res) => {
    try {
        const session = await findOwned(req);
        if (!session) return res.status(404).json({ message: "Session not found" });
        res.json({ session: serialize(session, { owner: true }) });
    } catch (err) {
        serverError(res, "getSession:", "Failed to load session", err);
    }
};

// PUT /api/teach/sessions/:id
exports.updateSession = async (req, res) => {
    try {
        const session = await findOwned(req);
        if (!session) return res.status(404).json({ message: "Session not found" });
        if (session.status === "completed") {
            return res.status(409).json({ message: "Completed sessions can't be edited" });
        }
        const userId = getUserId(req);

        const data = pickFields(req.body);
        const errors = validate(data, { partial: true });

        const oldVideoUrl = session.details && session.details.video && session.details.video.url;

        // Re-check the format details whenever the format or the details change
        if (data.mode !== undefined || data.details !== undefined) {
            const finalMode = data.mode || session.mode;
            const rawDetails = data.details !== undefined
                ? data.details
                : (session.details && session.details.toObject());
            data.details = cleanDetails(finalMode, rawDetails, userId);
            errors.push(...validateDetails(finalMode, data.details));
        }
        if (errors.length) return res.status(400).json({ message: errors[0], errors });

        // Switching away from "Live online" while live would leave a ghost room
        if (data.mode && data.mode !== session.mode && session.live && session.live.isLive) {
            return res.status(409).json({ message: "End the live class before changing the format" });
        }

        Object.assign(session, data);
        await session.save();

        // The old uploaded file is no longer used -> free the disk space
        const newVideoUrl = session.details && session.details.video && session.details.video.url;
        if (oldVideoUrl && oldVideoUrl !== newVideoUrl) uploads.removeVideoByUrl(oldVideoUrl);

        res.json({ message: "Session updated", session: serialize(session, { owner: true }) });
    } catch (err) {
        serverError(res, "updateSession:", "Failed to update session", err);
    }
};

// DELETE /api/teach/sessions/:id
exports.deleteSession = async (req, res) => {
    try {
        if (!validId(res, req.params.id)) return;

        // Learners already paid to join, so the session can't just disappear on them
        const existing = await TeachSession.findOne({ _id: req.params.id, user: getUserId(req) });
        if (existing && existing.participantCount > 0) {
            return res.status(409).json({
                message: "Learners have already joined this session, so it can't be deleted. Complete it instead."
            });
        }

        const deleted = await TeachSession.findOneAndDelete({
            _id: req.params.id,
            user: getUserId(req)
        });
        if (!deleted) return res.status(404).json({ message: "Session not found" });

        if (deleted.details && deleted.details.video) uploads.removeVideoByUrl(deleted.details.video.url);
        await QuizAttempt.deleteMany({ session: deleted._id });
        live._rooms.delete(String(deleted._id));

        res.json({ message: "Session removed" });
    } catch (err) {
        serverError(res, "deleteSession:", "Failed to delete session", err);
    }
};

// PATCH /api/teach/sessions/:id/complete  -> closes the session.
// No tokens are created here: the teacher was already paid by each learner at
// the moment they joined (see joinSession), so completing can't pay twice.
exports.completeSession = async (req, res) => {
    try {
        const session = await findOwned(req);
        if (!session) return res.status(404).json({ message: "Session not found" });
        if (session.status === "completed") {
            return res.status(409).json({ message: "Session already completed" });
        }
        if (REQUIRE_LEARNER && !(session.participantCount > 0)) {
            return res.status(409).json({
                message: "You can complete a session once a student has joined. Share your session and come back after someone joins."
            });
        }

        const userId = getUserId(req);

        // Claim the completion atomically so two quick clicks can't run twice
        const claimed = await TeachSession.findOneAndUpdate(
            { _id: session._id, user: userId, status: "published" },
            {
                $set: {
                    status: "completed",
                    completedAt: new Date(),
                    "live.isLive": false,
                    "live.endedAt": new Date()
                }
            },
            { new: true }
        );
        if (!claimed) return res.status(409).json({ message: "Session already completed" });
        live._rooms.delete(String(claimed._id));

        // Teaching achievements are a bonus: never fail the request because of them
        recordActivity(userId, "Teaching", 1).catch((err) => console.warn("achievement update skipped:", err.message));

        const earned = claimed.tokensAwarded || 0;
        res.json({
            message: earned
                ? `Session completed. You earned ${earned} Skill Tokens from ${claimed.participantCount} learner${claimed.participantCount === 1 ? "" : "s"}.`
                : "Session completed.",
            session: serialize(claimed, { owner: true })
        });
    } catch (err) {
        serverError(res, "completeSession:", "Failed to complete session", err);
    }
};

// GET /api/teach/discover?mode=&q=&limit=   -> other students' open sessions (live ones first)
exports.discover = async (req, res) => {
    try {
        const filter = { user: { $ne: getUserId(req) }, status: "published" };

        if (req.query.mode && req.query.mode !== "all") {
            if (!MODES.includes(req.query.mode)) {
                return res.status(400).json({ message: "Invalid mode filter" });
            }
            filter.mode = req.query.mode;
        }
        const q = String(req.query.q || "").trim().slice(0, 60);
        if (q) {
            const rx = new RegExp(escapeRegex(q), "i");
            filter.$or = [{ title: rx }, { skill: rx }, { description: rx }];
        }
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 60);

        const sessions = await TeachSession.find(filter)
            .sort({ "live.isLive": -1, createdAt: -1 })
            .limit(limit)
            .populate("user", "name");

        res.json({ count: sessions.length, sessions: sessions.map((s) => lockDetails(serialize(s))) });
    } catch (err) {
        serverError(res, "discover:", "Failed to load community sessions", err);
    }
};

// GET /api/teach/view/:id   (any logged-in student: the page for one session)
exports.viewSession = async (req, res) => {
    try {
        if (!validId(res, req.params.id)) return;
        const session = await TeachSession.findById(req.params.id).populate("user", "name");
        if (!session) return res.status(404).json({ message: "Session not found" });

        const owner = isOwnerOf(session, req);
        const out = serialize(session, { owner });
        out.isOwner = owner;

        if (!owner) {
            const uid = getUserId(req);
            out.joined = !!(await TeachSession.exists({ _id: session._id, "participants.user": uid }));
            if (!out.joined) lockDetails(out);

            if (session.mode === "Quiz / practice session") {
                const [best, attempts] = await Promise.all([
                    QuizAttempt.findOne({ session: session._id, user: uid }).sort({ score: -1 }),
                    QuizAttempt.countDocuments({ session: session._id, user: uid })
                ]);
                out.myBest = best ? { score: best.score, total: best.total, attempts } : null;
            }
        }
        res.json({ session: out });
    } catch (err) {
        serverError(res, "viewSession:", "Failed to load session", err);
    }
};

// Learner pays the session price, the teacher receives it. Safe to call twice:
// only the call that actually adds the learner can charge, and every failure
// path puts the tokens (and the learner list) back exactly as they were.
async function payToJoin(session, req) {
    const learnerId = String(getUserId(req));
    const teacherId = String(session.user && session.user._id ? session.user._id : session.user);
    const cost = session.reward || 0;

    // 1) claim the seat (atomic + idempotent). If this returns false the learner
    //    is already in (double click / second tab) and must NOT be charged again.
    const added = await TeachSession.addParticipant(session._id, learnerId);
    if (!added) return { status: "already" };

    const undoSeat = () => TeachSession.removeParticipant(session._id, learnerId);

    // 2) take the tokens from the learner (atomic: balance can't go below 0)
    let charge;
    try {
        charge = await wallets.chargeTokens(learnerId, cost, `Joined: ${session.title}`, "Learning");
    } catch (err) {
        await undoSeat();
        throw err;
    }
    if (!charge) {
        await undoSeat();
        return { status: "insufficient", cost };
    }

    // 3) give the same tokens to the teacher. If that fails, give the learner their tokens back.
    const learnerName = (req.user && req.user.name) || "A learner";
    try {
        await wallets.awardTokens(teacherId, cost, `${learnerName} joined: ${session.title}`, "Teaching");
    } catch (err) {
        await wallets.refundCharge(learnerId, cost, charge.txId).catch((e) => console.error("REFUND FAILED:", learnerId, cost, e));
        await undoSeat();
        throw err;
    }

    // 4) bookkeeping for the teacher's "tokens earned" numbers (not critical)
    await TeachSession.updateOne({ _id: session._id }, { $inc: { tokensAwarded: cost } })
        .catch((e) => console.warn("tokensAwarded not updated:", e.message));

    return { status: "paid", cost, balance: charge.wallet.balance };
}

// POST /api/teach/view/:id/join   -> join the session (pays its price)
exports.joinSession = async (req, res) => {
    try {
        if (!validId(res, req.params.id)) return;
        const session = await TeachSession.findById(req.params.id);
        if (!session) return res.status(404).json({ message: "Session not found" });
        if (isOwnerOf(session, req)) return res.status(400).json({ message: "This is your own session" });

        const learnerId = getUserId(req);
        const alreadyIn = await TeachSession.exists({ _id: session._id, "participants.user": learnerId });
        if (!alreadyIn && session.status === "completed") {
            return res.status(409).json({ message: "This session is already completed" });
        }

        const result = alreadyIn ? { status: "already" } : await payToJoin(session, req);

        if (result.status === "insufficient") {
            return res.status(402).json({
                message: `You need ${result.cost} Skill Tokens to join this session. Teach a skill to earn more.`,
                insufficient: true,
                needed: result.cost
            });
        }

        const fresh = await TeachSession.findById(session._id).select("participantCount");
        res.json({
            joined: true,
            charged: result.status === "paid" ? result.cost : 0,
            balance: result.balance,
            participantCount: fresh ? fresh.participantCount : undefined
        });
    } catch (err) {
        serverError(res, "joinSession:", "Could not join the session. You have not been charged.", err);
    }
};

// GET /api/teach/joined   -> sessions I joined (the learner's "My learning")
exports.joinedSessions = async (req, res) => {
    try {
        const sessions = await TeachSession.find({ "participants.user": getUserId(req) })
            .sort({ updatedAt: -1 })
            .limit(100)
            .populate("user", "name");

        res.json({
            count: sessions.length,
            sessions: sessions.map((s) => {
                const j = lockDetails(serialize(s));
                j.joined = true;
                return j;
            })
        });
    } catch (err) {
        serverError(res, "joinedSessions:", "Failed to load your sessions", err);
    }
};

// POST /api/teach/view/:id/quiz   { answers: [optionIndex | null, ...] }
// Graded here so the correct answers never reach the browser before submitting.
exports.submitQuiz = async (req, res) => {
    try {
        if (!validId(res, req.params.id)) return;
        const session = await TeachSession.findById(req.params.id);
        const quiz = session && session.details && session.details.quiz;
        if (!session || session.mode !== "Quiz / practice session" || !quiz || !quiz.length) {
            return res.status(404).json({ message: "Quiz not found" });
        }

        // Learners must have joined (paid) before answering; the teacher may preview
        if (!isOwnerOf(session, req)) {
            const joined = await TeachSession.exists({ _id: session._id, "participants.user": getUserId(req) });
            if (!joined) {
                return res.status(403).json({ message: "Join this session first to take the quiz.", needsJoin: true });
            }
        }

        const answers = req.body && req.body.answers;
        if (!Array.isArray(answers) || answers.length !== quiz.length) {
            return res.status(400).json({ message: "Please answer every question" });
        }

        const results = quiz.map((q, i) => {
            const a = answers[i];
            const chosen = Number.isInteger(a) && a >= 0 && a < q.options.length ? a : null;
            return {
                chosen,
                correct: chosen === q.correctIndex,
                correctIndex: q.correctIndex,
                explanation: q.explanation || ""
            };
        });
        const score = results.filter((r) => r.correct).length;
        const total = quiz.length;

        const owner = isOwnerOf(session, req);
        if (!owner) {
            await QuizAttempt.create({
                session: session._id,
                user: getUserId(req),
                userName: (req.user && req.user.name) || "Learner",
                score,
                total,
                answers: results.map((r) => (r.chosen === null ? -1 : r.chosen))
            });
        }

        res.json({ score, total, percent: Math.round((score / total) * 100), results, saved: !owner });
    } catch (err) {
        serverError(res, "submitQuiz:", "Could not check your answers", err);
    }
};

// GET /api/teach/sessions/:id/attempts   (teacher: how did learners do?)
exports.getAttempts = async (req, res) => {
    try {
        const session = await findOwned(req);
        if (!session) return res.status(404).json({ message: "Session not found" });

        const attempts = await QuizAttempt.find({ session: session._id })
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        const percent = (a) => Math.round((a.score / a.total) * 100);
        res.json({
            count: attempts.length,
            average: attempts.length
                ? Math.round(attempts.reduce((sum, a) => sum + percent(a), 0) / attempts.length)
                : 0,
            attempts: attempts.map((a) => ({
                learner: a.userName,
                score: a.score,
                total: a.total,
                percent: percent(a),
                at: a.createdAt
            }))
        });
    } catch (err) {
        serverError(res, "getAttempts:", "Failed to load quiz results", err);
    }
};
