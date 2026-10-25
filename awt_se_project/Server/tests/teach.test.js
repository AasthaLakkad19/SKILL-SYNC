// Teach Skills backend tests.
// Real: Express app, routes, controllers, Mongoose validation, file upload, HTTP calls.
// Stand-in: the database (same idea as projects.test.js), so no MongoDB is needed.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const express = require("express");
const mongoose = require("mongoose");

process.env.JWT_SECRET = "test";
process.env.TEACH_MAX_VIDEO_MB = "1";
process.env.TEACH_MAX_VIEWERS = "2";
process.env.TEACH_UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "teach-test-"));

const root = path.join(__dirname, "..") + "/";

// ---------- fake auth: "Authorization: Bearer <name>" ----------
const users = {};
const mkUser = (name) => (users[name] = { _id: new mongoose.Types.ObjectId(), name });
const alice = mkUser("alice"), bob = mkUser("bob"), cara = mkUser("cara"), dan = mkUser("dan");
require.cache[require.resolve(root + "Middleware/auth")] = {
  id: "auth", filename: "auth", loaded: true,
  exports: { protect: (req, res, next) => {
    const u = users[(req.headers.authorization || "").replace("Bearer ", "")];
    if (!u) return res.status(401).json({ message: "no" });
    req.user = u; next();
  } }
};

// ---------- fake wallet + achievements ----------
const wallet = require(root + "controllers/walletController");
const paid = []; let walletFails = false;
wallet.awardTokens = async (userId, amount, title, category) => {
  if (walletFails) throw new Error("db down");
  paid.push({ userId: String(userId), amount, title, category });
  return { balance: 5 + paid.reduce((s, p) => s + p.amount, 0) };
};
const achievements = require(root + "utils/achievementUtils");
const activity = [];
achievements.recordActivity = async (u, c, n) => { activity.push([String(u), c, n]); };

// ---------- in-memory models ----------
const TeachSession = require(root + "Models/TeachSession");
const QuizAttempt = require(root + "Models/QuizAttempt");

const pathValues = (obj, p) => p.split(".").reduce((vals, key) =>
  vals.flatMap((v) => (v == null ? [] : Array.isArray(v) ? v.map((x) => x && x[key]) : [v[key]])), [obj]);
const eq = (a, b) => String(a) === String(b);
const matches = (doc, filter) => Object.entries(filter).every(([k, cond]) => {
  if (k === "$or") return cond.some((f) => matches(doc, f));
  const vals = pathValues(doc, k);
  if (cond instanceof RegExp) return vals.some((v) => cond.test(v));
  if (cond && typeof cond === "object" && "$ne" in cond) return !vals.some((v) => eq(v, cond.$ne));
  return vals.some((v) => eq(v, cond));
});
const applyUpdate = (doc, upd) => {
  Object.entries(upd.$set || {}).forEach(([k, v]) => doc.set(k, v));
  Object.entries(upd.$inc || {}).forEach(([k, v]) => doc.set(k, (doc.get(k) || 0) + v));
  Object.entries(upd.$push || {}).forEach(([k, v]) => { const arr = doc.get(k) || []; arr.push(v); doc.set(k, arr); });
};
const names = {}; Object.values(users).forEach((u) => (names[String(u._id)] = u.name));

class Query {
  constructor(fn) { this.fn = fn; this.sorts = []; this.max = Infinity; this.pop = false; }
  sort(s) { this.sorts = Object.entries(s); return this; }
  limit(n) { this.max = n; return this; }
  populate() { this.pop = true; return this; }
  select() { return this; }
  lean() { return this; }
  then(res, rej) {
    return Promise.resolve().then(() => {
      let out = this.fn();
      if (Array.isArray(out)) {
        out = [...out].sort((a, b) => { for (const [k, dir] of this.sorts) {
          const x = pathValues(a, k)[0], y = pathValues(b, k)[0];
          if (x !== y) return (x > y ? 1 : -1) * dir; } return 0; }).slice(0, this.max);
      }
      const pop = (d) => d && this.pop ? new Proxy(d, { get: (t, k) => {
        if (k === "user") return { _id: t.user, name: names[String(t.user)] };
        const v = Reflect.get(t, k, t); return typeof v === "function" ? v.bind(t) : v; } }) : d;
      return Array.isArray(out) ? out.map(pop) : pop(out);
    }).then(res, rej);
  }
}
const store = new Map();
TeachSession.create = async (data) => { const d = new TeachSession(data); d.set("createdAt", new Date()); await d.validate(); store.set(String(d._id), d); return d; };
TeachSession.find = (f = {}) => new Query(() => [...store.values()].filter((d) => matches(d, f)));
TeachSession.findOne = (f) => new Query(() => [...store.values()].find((d) => matches(d, f)) || null);
TeachSession.findById = (id) => new Query(() => store.get(String(id)) || null);
TeachSession.exists = async (f) => ([...store.values()].some((d) => matches(d, f)) ? { _id: 1 } : null);
TeachSession.findOneAndUpdate = async (f, upd) => { const d = [...store.values()].find((x) => matches(x, f)); if (d) applyUpdate(d, upd); return d || null; };
TeachSession.findOneAndDelete = async (f) => { const d = [...store.values()].find((x) => matches(x, f)); if (d) store.delete(String(d._id)); return d || null; };
TeachSession.updateOne = async (f, upd) => { const d = [...store.values()].find((x) => matches(x, f)); if (d) applyUpdate(d, upd); return { modifiedCount: d ? 1 : 0 }; };
TeachSession.updateMany = async (f, upd) => { [...store.values()].filter((x) => matches(x, f)).forEach((d) => applyUpdate(d, upd)); };
TeachSession.prototype.save = async function () { await this.validate(); store.set(String(this._id), this); return this; };
const attempts = [];
QuizAttempt.create = async (data) => { const d = new QuizAttempt(data); await d.validate(); attempts.push(d); return d; };
QuizAttempt.findOne = (f) => new Query(() => attempts.filter((a) => matches(a, f)).sort((a, b) => b.score - a.score)[0] || null);
QuizAttempt.find = (f) => new Query(() => attempts.filter((a) => matches(a, f)).reverse().map((a) => a.toObject()));
QuizAttempt.countDocuments = async (f) => attempts.filter((a) => matches(a, f)).length;
QuizAttempt.deleteMany = async (f) => { for (let i = attempts.length - 1; i >= 0; i--) if (matches(attempts[i], f)) attempts.splice(i, 1); };

// ---------- app (same mounts as server.js) ----------
const uploads = require(root + "utils/teachUploads");
uploads.ensureVideoDir();
const app = express();
app.use(express.json({ limit: "10mb" }));
app.use("/api/teach", require(root + "Routes/teachRoutes"));
app.use("/uploads/teach-videos", express.static(uploads.VIDEO_DIR, { index: false, dotfiles: "deny", fallthrough: false }));
let base;
const api = async (who, method, url, body, headers = {}) => {
  const isRaw = body instanceof Buffer;
  const r = await fetch(base + url, {
    method, headers: { Authorization: "Bearer " + who, ...(body && !isRaw ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? (isRaw ? body : JSON.stringify(body)) : undefined
  });
  let json = null; try { json = await r.clone().json(); } catch (e) {}
  return { status: r.status, body: json, res: r };
};

let passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { console.log("  ✗", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); process.exitCode = 1; } };

const base1 = { title: "Intro", skill: "HTML", category: "Web Development", description: "Learn tags", level: "Beginner", duration: "15 minutes", reward: 3 };
const quiz = [
  { question: "2+2?", options: ["3", "4", "5"], correctIndex: 1, explanation: "Basic maths" },
  { question: "Capital of France?", options: ["Paris", "Rome"], correctIndex: 0 }
];
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(2000, 1)]);
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(500, 2)]);

(async () => {
  const server = http.createServer(app).listen(0);
  base = "http://127.0.0.1:" + server.address().port;

  console.log("quiz sessions");
  let quizId;
  await t("rejects a quiz session without questions", async () => {
    const r = await api("alice", "POST", "/api/teach/sessions", { ...base1, mode: "Quiz / practice session", details: { quiz: [] } });
    assert.strictEqual(r.status, 400); assert.match(r.body.message, /at least one quiz question/);
  });
  await t("rejects a bad quiz (correct index out of range, duplicate options)", async () => {
    const bad = [{ question: "q", options: ["a", "a"], correctIndex: 5 }];
    const r = await api("alice", "POST", "/api/teach/sessions", { ...base1, mode: "Quiz / practice session", details: { quiz: bad } });
    assert.strictEqual(r.status, 400); assert.ok(r.body.errors.length >= 2);
  });
  await t("creates a quiz session; teacher sees answers", async () => {
    const r = await api("alice", "POST", "/api/teach/sessions", { ...base1, mode: "Quiz / practice session", details: { quiz, meetingLink: "http://ignored" } });
    assert.strictEqual(r.status, 201); quizId = r.body.session.id;
    assert.strictEqual(r.body.session.details.quiz[0].correctIndex, 1);
    assert.strictEqual(r.body.session.details.meetingLink, undefined, "fields of other formats are dropped");
    assert.strictEqual(r.body.session.canComplete, false);
  });
  await t("learner view hides correct answers + explanations", async () => {
    const r = await api("bob", "GET", "/api/teach/view/" + quizId);
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.session.isOwner, false);
    assert.strictEqual(r.body.session.details.quiz[0].correctIndex, undefined);
    assert.strictEqual(r.body.session.details.quiz[0].explanation, undefined);
    assert.strictEqual(r.body.session.teacher, "alice");
    assert.strictEqual(r.body.session.details.quizCount, 2);
  });
  await t("grades on the server, stores attempt, counts learner once", async () => {
    let r = await api("bob", "POST", `/api/teach/view/${quizId}/quiz`, { answers: [1, 1] });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.score, 1); assert.strictEqual(r.body.percent, 50);
    assert.strictEqual(r.body.results[1].correctIndex, 0); assert.strictEqual(r.body.results[0].explanation, "Basic maths");
    r = await api("bob", "POST", `/api/teach/view/${quizId}/quiz`, { answers: [1, 0] });
    assert.strictEqual(r.body.score, 2);
    r = await api("bob", "GET", "/api/teach/view/" + quizId);
    assert.deepStrictEqual(r.body.session.myBest, { score: 2, total: 2, attempts: 2 });
    assert.strictEqual(r.body.session.participantCount, 1);
    assert.strictEqual(r.body.session.joined, true);
  });
  await t("rejects wrong answer count; treats junk answers as skipped", async () => {
    assert.strictEqual((await api("bob", "POST", `/api/teach/view/${quizId}/quiz`, { answers: [1] })).status, 400);
    const r = await api("cara", "POST", `/api/teach/view/${quizId}/quiz`, { answers: [null, 99] });
    assert.strictEqual(r.body.score, 0); assert.strictEqual(r.body.results[0].chosen, null);
  });
  await t("owner can preview the quiz without saving or self-counting", async () => {
    const before = attempts.length;
    const r = await api("alice", "POST", `/api/teach/view/${quizId}/quiz`, { answers: [1, 0] });
    assert.strictEqual(r.body.saved, false); assert.strictEqual(attempts.length, before);
  });
  await t("teacher sees learner results; others can't", async () => {
    const r = await api("alice", "GET", `/api/teach/sessions/${quizId}/attempts`);
    assert.strictEqual(r.body.count, 3); assert.strictEqual(r.body.average, Math.round((50 + 100 + 0) / 3));
    assert.strictEqual((await api("bob", "GET", `/api/teach/sessions/${quizId}/attempts`)).status, 404);
  });

  console.log("completing + tokens");
  await t("completing pays the WALLET once, with a clear title", async () => {
    const r = await api("alice", "PATCH", `/api/teach/sessions/${quizId}/complete`);
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.session.status, "completed");
    assert.deepStrictEqual(paid[0], { userId: String(alice._id), amount: 3, title: "Taught: Intro", category: "Teaching" });
    assert.strictEqual(r.body.balance, 8);
    assert.deepStrictEqual(activity[0], [String(alice._id), "Teaching", 1]);
    assert.strictEqual((await api("alice", "PATCH", `/api/teach/sessions/${quizId}/complete`)).status, 409);
    assert.strictEqual(paid.length, 1);
  });
  await t("can't complete without a learner; only owner can complete", async () => {
    const c = await api("alice", "POST", "/api/teach/sessions", { ...base1, mode: "Pair programming", details: { repoLink: "https://github.com/a/b" } });
    const id = c.body.session.id;
    let r = await api("alice", "PATCH", `/api/teach/sessions/${id}/complete`);
    assert.strictEqual(r.status, 409); assert.match(r.body.message, /student has taken part/);
    assert.strictEqual((await api("bob", "PATCH", `/api/teach/sessions/${id}/complete`)).status, 404);
    assert.strictEqual((await api("alice", "POST", `/api/teach/view/${id}/join`)).status, 400, "owner can't join own");
    r = await api("bob", "POST", `/api/teach/view/${id}/join`); assert.strictEqual(r.body.participantCount, 1);
    r = await api("bob", "POST", `/api/teach/view/${id}/join`); assert.strictEqual(r.body.participantCount, 1, "idempotent");
    walletFails = true;
    r = await api("alice", "PATCH", `/api/teach/sessions/${id}/complete`);
    assert.strictEqual(r.status, 500);
    walletFails = false;
    r = await api("alice", "GET", `/api/teach/sessions/${id}`);
    assert.strictEqual(r.body.session.status, "published", "wallet failure is rolled back");
    assert.strictEqual((await api("alice", "PATCH", `/api/teach/sessions/${id}/complete`)).status, 200);
  });
  await t("completed sessions can't be edited", async () => {
    const r = await api("alice", "PUT", `/api/teach/sessions/${quizId}`, { title: "New" });
    assert.strictEqual(r.status, 409);
  });

  console.log("video upload");
  let videoUrl, recId;
  await t("rejects files that are not videos (checked by file signature)", async () => {
    const r = await api("alice", "POST", "/api/teach/upload?name=evil.mp4", Buffer.from("<script>alert(1)</script>" + "x".repeat(100)), { "Content-Type": "video/mp4" });
    assert.strictEqual(r.status, 415);
    assert.deepStrictEqual(fs.readdirSync(uploads.VIDEO_DIR), [], "no temp file left behind");
  });
  await t("rejects non-video content types and oversize files", async () => {
    assert.strictEqual((await api("alice", "POST", "/api/teach/upload", mp4, { "Content-Type": "text/html" })).status, 415);
    const big = Buffer.concat([mp4, Buffer.alloc(1024 * 1024)]);
    assert.strictEqual((await api("alice", "POST", "/api/teach/upload", big, { "Content-Type": "video/mp4" })).status, 413);
    assert.deepStrictEqual(fs.readdirSync(uploads.VIDEO_DIR), []);
  });
  await t("stores an mp4, names it by owner + random, ignores client-given name for the path", async () => {
    const r = await api("alice", "POST", "/api/teach/upload?name=../../my lesson.mp4", mp4, { "Content-Type": "video/mp4" });
    assert.strictEqual(r.status, 201); videoUrl = r.body.video.url;
    assert.match(videoUrl, new RegExp(`^/uploads/teach-videos/${alice._id}-[a-f0-9]{32}\\.mp4$`));
    assert.strictEqual(r.body.video.originalName, "my lesson.mp4");
    assert.strictEqual(r.body.video.size, mp4.length);
  });
  await t("a recorded lesson needs a video or a link", async () => {
    const r = await api("alice", "POST", "/api/teach/sessions", { ...base1, mode: "Recorded mini lesson", details: {} });
    assert.strictEqual(r.status, 400); assert.match(r.body.message, /Upload a video/);
  });
  await t("can't attach someone else's upload or a made-up path", async () => {
    let r = await api("bob", "POST", "/api/teach/sessions", { ...base1, mode: "Recorded mini lesson", details: { video: { url: videoUrl } } });
    assert.strictEqual(r.status, 400);
    r = await api("alice", "POST", "/api/teach/sessions", { ...base1, mode: "Recorded mini lesson", details: { video: { url: "/uploads/teach-videos/../../.env" } } });
    assert.strictEqual(r.status, 400);
  });
  await t("creates a recorded lesson with the uploaded video; learners can stream it with Range", async () => {
    const r = await api("alice", "POST", "/api/teach/sessions", { ...base1, mode: "Recorded mini lesson", details: { video: { url: videoUrl, originalName: "my lesson.mp4" } } });
    assert.strictEqual(r.status, 201); recId = r.body.session.id;
    assert.strictEqual(r.body.session.details.video.mimeType, "video/mp4");
    const v = await fetch(base + videoUrl, { headers: { Range: "bytes=0-99" } });
    assert.strictEqual(v.status, 206); assert.strictEqual(v.headers.get("content-type"), "video/mp4");
    assert.strictEqual((await v.arrayBuffer()).byteLength, 100);
  });
  await t("replacing the video deletes the old file; deleting the session deletes the file", async () => {
    const up = await api("alice", "POST", "/api/teach/upload", webm, { "Content-Type": "video/webm;codecs=vp8" });
    assert.match(up.body.video.url, /\.webm$/);
    let r = await api("alice", "PUT", `/api/teach/sessions/${recId}`, { details: { video: up.body.video } });
    assert.strictEqual(r.status, 200);
    await new Promise((ok) => setTimeout(ok, 50));
    assert.ok(!fs.existsSync(path.join(uploads.VIDEO_DIR, path.basename(videoUrl))), "old file removed");
    assert.strictEqual((await api("alice", "DELETE", `/api/teach/sessions/${recId}`)).status, 200);
    await new Promise((ok) => setTimeout(ok, 50));
    assert.deepStrictEqual(fs.readdirSync(uploads.VIDEO_DIR), [], "no files left");
  });

  console.log("live video");
  let liveId, peer1;
  const live = require(root + "controllers/teachLiveController");
  await t("only 'Live online' sessions can go live; only the teacher can start", async () => {
    const c = await api("alice", "POST", "/api/teach/sessions", { ...base1, mode: "Live online", details: { meetingLink: "https://meet.example.com/x" } });
    liveId = c.body.session.id;
    assert.strictEqual((await api("bob", "POST", `/api/teach/sessions/${liveId}/live/start`)).status, 403);
    const other = await api("alice", "POST", "/api/teach/sessions", { ...base1, mode: "In person on campus", details: { location: "Lab 2" } });
    assert.strictEqual((await api("alice", "POST", `/api/teach/sessions/${other.body.session.id}/live/start`)).status, 400);
  });
  await t("learners can't join before the teacher is live", async () => {
    assert.strictEqual((await api("bob", "POST", `/api/teach/view/${liveId}/live/join`)).status, 409);
  });
  await t("teacher goes live (and can resume after a refresh)", async () => {
    let r = await api("alice", "POST", `/api/teach/sessions/${liveId}/live/start`);
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.peerId, "host"); assert.ok(r.body.iceServers.length);
    r = await api("alice", "POST", `/api/teach/sessions/${liveId}/live/start`); assert.strictEqual(r.status, 200);
    r = await api("bob", "GET", `/api/teach/view/${liveId}`);
    assert.strictEqual(r.body.session.live.isLive, true);
    r = await api("bob", "GET", "/api/teach/discover");
    assert.strictEqual(r.body.sessions[0].id, liveId, "live sessions are listed first");
  });
  await t("learner joins, host sees the peer, offer/answer/candidates flow both ways", async () => {
    let r = await api("bob", "POST", `/api/teach/view/${liveId}/live/join`);
    assert.strictEqual(r.status, 200); peer1 = r.body.peerId;
    r = await api("alice", "GET", `/api/teach/live/${liveId}/poll?peerId=host&since=0`);
    assert.deepStrictEqual(r.body.peers, [{ peerId: peer1, name: "bob" }]);
    await api("alice", "POST", `/api/teach/live/${liveId}/signal`, { peerId: "host", to: peer1, type: "offer", data: { sdp: "OFFER" } });
    await api("alice", "POST", `/api/teach/live/${liveId}/signal`, { peerId: "host", to: peer1, type: "candidate", data: { c: 1 } });
    r = await api("bob", "GET", `/api/teach/live/${liveId}/poll?peerId=${peer1}&since=0`);
    assert.deepStrictEqual(r.body.messages.map((m) => m.type), ["offer", "candidate"]);
    assert.strictEqual(r.body.hostOnline, true);
    const last = r.body.messages[1].seq;
    r = await api("bob", "GET", `/api/teach/live/${liveId}/poll?peerId=${peer1}&since=${last}`);
    assert.strictEqual(r.body.messages.length, 0, "delivered messages are not repeated");
    await api("bob", "POST", `/api/teach/live/${liveId}/signal`, { peerId: peer1, to: "host", type: "answer", data: { sdp: "ANSWER" } });
    r = await api("alice", "GET", `/api/teach/live/${liveId}/poll?peerId=host&since=0`);
    assert.strictEqual(r.body.messages[0].type, "answer"); assert.strictEqual(r.body.messages[0].from, peer1);
    assert.strictEqual(r.body.viewers, 1);
  });
  await t("joining counts the learner as a participant", async () => {
    const r = await api("bob", "GET", `/api/teach/view/${liveId}`);
    assert.strictEqual(r.body.session.participantCount, 1); assert.strictEqual(r.body.session.live.viewers, 1);
  });
  await t("impersonation and learner-to-learner signalling are blocked", async () => {
    assert.strictEqual((await api("cara", "GET", `/api/teach/live/${liveId}/poll?peerId=${peer1}&since=0`)).status, 404);
    assert.strictEqual((await api("cara", "GET", `/api/teach/live/${liveId}/poll?peerId=host&since=0`)).status, 404);
    const c = await api("cara", "POST", `/api/teach/view/${liveId}/live/join`);
    const r = await api("cara", "POST", `/api/teach/live/${liveId}/signal`, { peerId: c.body.peerId, to: peer1, type: "offer", data: {} });
    assert.strictEqual(r.status, 403);
    assert.strictEqual((await api("cara", "POST", `/api/teach/live/${liveId}/signal`, { peerId: c.body.peerId, to: "host", type: "evil", data: {} })).status, 400);
  });
  await t("class size is capped", async () => {
    const r = await api("dan", "POST", `/api/teach/view/${liveId}/live/join`);   // bob + cara already in (max 2)
    assert.strictEqual(r.status, 409); assert.match(r.body.message, /full/);
  });
  await t("teacher ends class: learners are told, session no longer live", async () => {
    assert.strictEqual((await api("alice", "POST", `/api/teach/sessions/${liveId}/live/stop`)).status, 200);
    let r = await api("bob", "GET", `/api/teach/live/${liveId}/poll?peerId=${peer1}&since=0`);
    assert.strictEqual(r.body.live, false);
    r = await api("bob", "GET", `/api/teach/view/${liveId}`); assert.strictEqual(r.body.session.live.isLive, false);
  });
  await t("a teacher who vanishes ends the class (sweeper) and restart clears stale flags", async () => {
    await api("alice", "POST", `/api/teach/sessions/${liveId}/live/start`);
    live._rooms.get(liveId).hostLastSeen = Date.now() - 60000;
    await new Promise((ok) => setTimeout(ok, 10500));
    const r = await api("bob", "GET", `/api/teach/view/${liveId}`); assert.strictEqual(r.body.session.live.isLive, false);
    await api("alice", "POST", `/api/teach/sessions/${liveId}/live/start`);
    live._rooms.clear();                       // simulate a server restart
    await live.resetStaleLive();
    assert.strictEqual((await api("bob", "GET", `/api/teach/view/${liveId}`)).body.session.live.isLive, false);
  });

  console.log("lists, search, stats");
  await t("discover hides own + completed sessions, supports search and mode filter", async () => {
    let r = await api("alice", "GET", "/api/teach/discover"); assert.strictEqual(r.body.count, 0);
    r = await api("bob", "GET", "/api/teach/discover");
    assert.ok(r.body.sessions.every((s) => s.status === "published" && s.teacher === "alice"));
    r = await api("bob", "GET", "/api/teach/discover?q=" + encodeURIComponent("(.*") ); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.count, 0);
    r = await api("bob", "GET", "/api/teach/discover?mode=Live%20online"); assert.ok(r.body.count >= 1);
    assert.strictEqual((await api("bob", "GET", "/api/teach/discover?mode=Nope")).status, 400);
  });
  await t("my sessions survive a 'refresh' (come from the database) and are private", async () => {
    const mine = await api("alice", "GET", "/api/teach/sessions");
    assert.ok(mine.body.count >= 4); assert.ok(mine.body.sessions.every((s) => s.details !== undefined));
    assert.strictEqual((await api("bob", "GET", "/api/teach/sessions")).body.count, 0);
    assert.strictEqual((await api("bob", "GET", `/api/teach/sessions/${liveId}`)).status, 404);
    assert.strictEqual((await api("bob", "DELETE", `/api/teach/sessions/${liveId}`)).status, 404);
  });
  await t("stats reflect real data", async () => {
    const r = await api("alice", "GET", "/api/teach/stats");
    assert.strictEqual(r.body.completedCount, 2); assert.strictEqual(r.body.tokensEarned, 6);
    assert.ok(r.body.learnersReached >= 3); assert.strictEqual(r.body.badges.firstLesson, true);
  });
  await t("requires login", async () => {
    assert.strictEqual((await api("nobody", "GET", "/api/teach/sessions")).status, 401);
  });
  await t("old sessions without the new fields still load", async () => {
    const legacy = new TeachSession({ user: alice._id, title: "Old", skill: "x", category: "Other", description: "d" });
    legacy.set("live", undefined); store.set(String(legacy._id), legacy);
    const r = await api("bob", "GET", "/api/teach/view/" + legacy._id);
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.session.live.isLive, false);
  });

  server.close();
  fs.rmSync(process.env.TEACH_UPLOAD_DIR, { recursive: true, force: true });
  console.log(`\n${passed} passed${process.exitCode ? " (with failures)" : ""}`);
  process.exit(process.exitCode || 0);
})();
