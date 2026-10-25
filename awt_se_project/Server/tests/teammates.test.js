// Run with:  node tests/teammates.test.js   (no database needed)
const assert = require("assert");
const mongoose = require("mongoose");
const base = require("path").join(__dirname, "..") + "/";

const User = require(base + "Models/User");
const Profile = require(base + "Models/Profile");
const Project = require(base + "Models/Project");
const Connection = require(base + "Models/Connection");
const TeamPreference = require(base + "Models/TeamPreference");
const U = require(base + "utils/teammateUtils");
const c = require(base + "controllers/teammateController");

let passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { console.log("  ✗", name, "\n   ", e.message); process.exitCode = 1; } };
const oid = () => new mongoose.Types.ObjectId();
const DAY = 24 * 60 * 60 * 1000;

// ---------- tiny in-memory stand-in for MongoDB ----------
function fake(Model, docs, { unique } = {}) {
  const match = (doc, f) => Object.entries(f).every(([k, v]) => {
    if (k === "$or") return v.some((sub) => match(doc, sub));
    const val = doc[k];
    if (v && typeof v === "object" && !(v instanceof mongoose.Types.ObjectId) && !(v instanceof Date)) {
      return Object.entries(v).every(([op, arg]) => {
        if (op === "$in") return arg.map(String).includes(String(val));
        if (op === "$ne") return String(val) !== String(arg);
        throw new Error("fake: unsupported operator " + op);
      });
    }
    return String(val) === String(v);
  });
  const q = (get) => ({ select() { return this; }, limit() { return this; }, lean() { return this; }, then: (a, b) => Promise.resolve(get()).then(a, b) });
  const apply = (doc, upd) => { Object.assign(doc, (upd && upd.$set) || {}); return doc; };

  Model.find = (f = {}) => q(() => docs.filter((d) => match(d, f)));
  Model.findOne = (f = {}) => q(() => docs.find((d) => match(d, f)) || null);
  Model.countDocuments = async (f = {}) => docs.filter((d) => match(d, f)).length;
  Model.deleteOne = async (f) => { const i = docs.findIndex((d) => match(d, f)); if (i > -1) docs.splice(i, 1); };
  Model.updateOne = async (f, upd) => { const d = docs.find((x) => match(x, f)); if (d) apply(d, upd); };
  Model.findOneAndUpdate = async (f, upd, opts = {}) => {
    let d = docs.find((x) => match(x, f));
    if (!d && opts.upsert) { d = { _id: oid(), ...f }; docs.push(d); }
    return d ? apply(d, upd) : null;
  };
  Model.create = async (data) => {
    if (unique && docs.some((d) => d[unique] === data[unique])) throw Object.assign(new Error("dup"), { code: 11000 });
    const d = { _id: oid(), status: "pending", declinedAt: null, createdAt: new Date(), ...data };
    docs.push(d);
    return d;
  };
  return docs;
}

const mk = (name, extra = {}) => ({ _id: oid(), name, isActive: true, skills: [], ...extra });
const alice = mk("Alice Rao"), bob = mk("Bob Shah", { skills: ["React", "Node.js"] }), carol = mk("Carol Mehta"),
  dave = mk("Dave Patel", { skills: ["Python"] }), erin = mk("Erin Joshi", { isActive: false, skills: ["Java"] }),
  frank = mk("Frank Desai", { skills: ["Python", "Machine Learning"] });
const id = (u) => String(u._id);

const users = [alice, bob, carol, dave, erin, frank];
const profiles = [
  { userId: id(bob), headline: "Full-stack student", bio: "Building web apps.", education: { degree: "B.Tech CSE", years: "Semester 5", school: "X" }, availability: "available", skills: [{ name: "MongoDB" }, { name: "react" }] },
  { userId: id(carol), headline: "Designer", bio: "", education: { school: "ABC College" }, availability: "busy", skills: [{ name: "Figma" }, { name: "UI/UX" }] },
  { userId: id(dave), headline: "", bio: "", education: {}, availability: "offline", skills: [] }
];
const prefs = [], conns = [];
const projects = [{ _id: oid(), ownerId: id(alice), status: "in-progress", tech: ["Python"] }];
fake(User, users); fake(Profile, profiles); fake(TeamPreference, prefs); fake(Connection, conns, { unique: "pairKey" }); fake(Project, projects);

const call = async (fn, user, { body = {}, params = {}, query = {} } = {}) => {
  const out = { status: 200, body: null };
  const res = { status(s) { out.status = s; return this; }, json(b) { out.body = b; return this; } };
  await fn({ user, body, params, query }, res);
  return out;
};
const list = async (user, query = {}) => (await call(c.listTeammates, user, { query })).body;
const names = (r) => r.teammates.map((x) => x.name);

(async () => {
  console.log("utils");
  await t("deriveInterest picks the best category, null when ambiguous", () => {
    assert.strictEqual(U.deriveInterest(["React", "Node.js", "Figma"]), "web development");
    assert.strictEqual(U.deriveInterest(["Figma", "UI/UX"]), "ui/ux");
    assert.strictEqual(U.deriveInterest(["Python", "Java"]), null);
  });
  await t("pair key is order independent; education line; skill merge", () => {
    assert.strictEqual(U.makePairKey("b", "a"), U.makePairKey("a", "b"));
    assert.strictEqual(U.educationLine({ degree: "B.Tech CSE", years: "Semester 5", school: "X" }), "B.Tech CSE · Semester 5");
    assert.strictEqual(U.educationLine({ school: "ABC" }), "ABC");
    assert.deepStrictEqual(U.mergeSkills(["React", " "], ["react", "Node.js"]), ["React", "Node.js"]);
  });
  await t("preference model rejects an unknown interest", () => {
    assert.ok(new TeamPreference({ userId: "1", interest: "basket weaving" }).validateSync());
    assert.ok(!new TeamPreference({ userId: "1", interest: "ui/ux", availability: "busy" }).validateSync());
  });

  console.log("search");
  await t("excludes me, inactive and offline users; never leaks email/password", async () => {
    const r = await list(alice);
    assert.ok(!names(r).includes("Alice Rao") && !names(r).includes("Erin Joshi") && !names(r).includes("Dave Patel"));
    assert.deepStrictEqual(Object.keys(r.teammates[0]).sort(),
      ["availability", "connected", "connection", "description", "education", "id", "interest", "interestLabel", "name", "skills"]);
  });
  await t("builds the card: merged skills, education line, bio, derived interest", async () => {
    const bobCard = (await list(alice)).teammates.find((x) => x.name === "Bob Shah");
    assert.deepStrictEqual(bobCard.skills, ["React", "Node.js", "MongoDB"]);
    assert.strictEqual(bobCard.education, "B.Tech CSE · Semester 5");
    assert.strictEqual(bobCard.description, "Building web apps.");
    assert.deepStrictEqual([bobCard.interest, bobCard.interestLabel], ["web development", "Web Development"]);
    const carolCard = (await list(alice)).teammates.find((x) => x.name === "Carol Mehta");
    assert.strictEqual(carolCard.description, "Designer");        // falls back to headline
    assert.strictEqual(carolCard.availability, "busy");
  });
  await t("sorted: available first, then best match with MY open projects (Python), then A-Z", async () => {
    // Alice's open project uses Python -> Frank (Python) before Bob; busy Carol last
    assert.deepStrictEqual(names(await list(alice)), ["Frank Desai", "Bob Shah", "Carol Mehta"]);
  });
  await t("filters match the page's rules (search, skill, interest, availability)", async () => {
    assert.deepStrictEqual(names(await list(alice, { search: "node" })), ["Bob Shah"]);
    assert.deepStrictEqual(names(await list(alice, { skill: "figma" })), ["Carol Mehta"]);
    assert.deepStrictEqual(names(await list(alice, { skill: "node.js" })), ["Bob Shah"]);
    assert.deepStrictEqual(names(await list(alice, { interest: "ui/ux" })), ["Carol Mehta"]);
    assert.deepStrictEqual(names(await list(alice, { availability: "busy" })), ["Carol Mehta"]);
    assert.strictEqual((await list(alice, { search: "zzz" })).total, 0);
  });
  await t("400 on invalid interest / availability", async () => {
    assert.strictEqual((await call(c.listTeammates, alice, { query: { interest: "x" } })).status, 400);
    assert.strictEqual((await call(c.listTeammates, alice, { query: { availability: "x" } })).status, 400);
  });
  await t("single teammate: found, offline hidden, bad id 404", async () => {
    assert.strictEqual((await call(c.getTeammate, alice, { params: { userId: id(bob) } })).body.teammate.name, "Bob Shah");
    assert.strictEqual((await call(c.getTeammate, alice, { params: { userId: id(dave) } })).status, 404);
    assert.strictEqual((await call(c.getTeammate, alice, { params: { userId: "nope" } })).status, 404);
  });

  console.log("my preferences");
  await t("validates and saves; chosen interest overrides the derived one", async () => {
    assert.strictEqual((await call(c.updateMyPreferences, bob, { body: { interest: "nonsense" } })).status, 400);
    assert.strictEqual((await call(c.updateMyPreferences, bob, { body: {} })).status, 400);
    assert.strictEqual((await call(c.updateMyPreferences, bob, { body: { interest: "data science" } })).status, 200);
    assert.strictEqual((await list(alice)).teammates.find((x) => x.name === "Bob Shah").interest, "data science");
    assert.strictEqual((await call(c.getMyPreferences, bob)).body.interest, "data science");
  });
  await t("going offline hides me from search", async () => {
    await call(c.updateMyPreferences, bob, { body: { availability: "offline" } });
    assert.ok(!names(await list(alice)).includes("Bob Shah"));
    await call(c.updateMyPreferences, bob, { body: { availability: "" } });   // back to default
    assert.ok(names(await list(alice)).includes("Bob Shah"));
  });

  console.log("connections");
  await t("send request: 201, repeat is idempotent, states differ per viewer", async () => {
    let r = await call(c.sendConnect, alice, { params: { userId: id(bob) } });
    assert.deepStrictEqual([r.status, r.body.connection], [201, "requested"]);
    r = await call(c.sendConnect, alice, { params: { userId: id(bob) } });
    assert.deepStrictEqual([r.status, r.body.connection], [200, "requested"]);
    assert.strictEqual(conns.length, 1);
    const asAlice = (await list(alice)).teammates.find((x) => x.name === "Bob Shah");
    assert.deepStrictEqual([asAlice.connection, asAlice.connected], ["requested", true]);
    const asBob = (await list(bob)).teammates.find((x) => x.name === "Alice Rao");
    assert.strictEqual(asBob.connection, "incoming");
  });
  await t("guards: self, bad id, unknown / inactive user", async () => {
    assert.strictEqual((await call(c.sendConnect, alice, { params: { userId: id(alice) } })).status, 400);
    assert.strictEqual((await call(c.sendConnect, alice, { params: { userId: "x" } })).status, 404);
    assert.strictEqual((await call(c.sendConnect, alice, { params: { userId: id(erin) } })).status, 404);
  });
  await t("if they asked me first, pressing Connect accepts (no duplicate row)", async () => {
    const r = await call(c.sendConnect, bob, { params: { userId: id(alice) } });
    assert.strictEqual(r.body.connection, "connected");
    assert.strictEqual(conns.length, 1);
    assert.strictEqual(conns[0].status, "accepted");
    assert.strictEqual((await list(alice)).teammates.find((x) => x.name === "Bob Shah").connection, "connected");
  });
  await t("disconnect removes it; cancel only works for MY pending request", async () => {
    await call(c.removeConnect, alice, { params: { userId: id(bob) } });
    assert.strictEqual(conns.length, 0);
    await call(c.sendConnect, alice, { params: { userId: id(carol) } });
    await call(c.removeConnect, carol, { params: { userId: id(alice) } });  // recipient can't "cancel"
    assert.strictEqual(conns.length, 1);
    await call(c.removeConnect, alice, { params: { userId: id(carol) } });
    assert.strictEqual(conns.length, 0);
  });
  await t("incoming list + accept (only the recipient) + connections list", async () => {
    await call(c.sendConnect, carol, { params: { userId: id(alice) } });
    const inbox = (await call(c.incomingRequests, alice)).body.requests;
    assert.strictEqual(inbox.length, 1);
    assert.strictEqual(inbox[0].from.name, "Carol Mehta");
    assert.strictEqual((await call(c.acceptRequest, bob, { params: { id: inbox[0].id } })).status, 404);
    assert.strictEqual((await call(c.acceptRequest, carol, { params: { id: inbox[0].id } })).status, 404); // sender can't accept
    assert.strictEqual((await call(c.acceptRequest, alice, { params: { id: inbox[0].id } })).body.connection, "connected");
    assert.strictEqual((await call(c.acceptRequest, alice, { params: { id: inbox[0].id } })).status, 404); // already used
    assert.deepStrictEqual((await call(c.myConnections, alice)).body.connections.map((x) => x.name), ["Carol Mehta"]);
  });
  await t("decline: sender is blocked 7 days, decliner is free, cooldown then expires", async () => {
    await call(c.sendConnect, frank, { params: { userId: id(alice) } });
    const reqId = String((await call(c.incomingRequests, alice)).body.requests[0].id);
    assert.strictEqual((await call(c.declineRequest, alice, { params: { id: reqId } })).status, 200);
    assert.strictEqual((await list(frank)).teammates.find((x) => x.name === "Alice Rao").connection, "none");
    let r = await call(c.sendConnect, frank, { params: { userId: id(alice) } });
    assert.strictEqual(r.status, 429);
    const row = conns.find((x) => x.status === "declined");
    row.declinedAt = new Date(Date.now() - 8 * DAY);
    r = await call(c.sendConnect, frank, { params: { userId: id(alice) } });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(conns.filter((x) => x.pairKey === row.pairKey).length, 1);   // same row reused
  });
  await t("pending-request cap", async () => {
    const many = Array.from({ length: 50 }, () => ({ _id: oid(), pairKey: String(oid()), requesterId: id(dave), recipientId: String(oid()), status: "pending" }));
    conns.push(...many);
    const r = await call(c.sendConnect, dave, { params: { userId: id(carol) } });
    assert.strictEqual(r.status, 400);
  });
  await t("an offline user stays visible to people they're connected with", async () => {
    // dave is offline; make dave <-> alice connected and check alice still sees dave
    conns.push({ _id: oid(), pairKey: U.makePairKey(id(alice), id(dave)), requesterId: id(alice), recipientId: id(dave), status: "accepted" });
    assert.ok(names(await list(alice)).includes("Dave Patel"));
  });

  console.log("routes");
  await t("fixed paths are registered before /:userId", () => {
    process.env.JWT_SECRET = "x";
    const router = require(base + "Routes/teammateRoutes");
    const paths = router.stack.filter((l) => l.route).map((l) => Object.keys(l.route.methods)[0].toUpperCase() + " " + l.route.path);
    const idx = (p) => paths.indexOf(p);
    assert.ok(idx("GET /me") < idx("GET /:userId") && idx("GET /requests") < idx("GET /:userId") && idx("GET /connections") < idx("GET /:userId"), paths.join("\n"));
    assert.strictEqual(paths.length, 10);
  });

  console.log(`\n${passed} passed${process.exitCode ? " — with FAILURES" : ""}`);
  process.exit(process.exitCode || 0);
})();
