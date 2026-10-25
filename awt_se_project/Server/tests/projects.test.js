const assert = require("assert");
const mongoose = require("mongoose");
const path = require("path").join(__dirname, "..") + "/";
const Project = require(path + "Models/Project");
const Invitation = require(path + "Models/Invitation");
const { parseProjectInput, parseMember, parseMilestoneStates } = require(path + "utils/projectInput");
const c = require(path + "controllers/projectController");

let passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { console.log("  ✗", name, "\n   ", e.message); process.exitCode = 1; } };

// ---- in-memory stand-in for the DB (real Mongoose docs + validation) ----
const store = new Map();
Project.create = async (data) => { const d = new Project(data); await d.validate(); store.set(String(d._id), d); return d; };
Project.findById = async (id) => store.get(String(id)) || null;
Project.countDocuments = async () => 0;
Project.deleteOne = async ({ _id }) => { store.delete(String(_id)); };
Project.prototype.save = async function () { await this.validate(); this.updatedAt = new Date(); store.set(String(this._id), this); return this; };
Invitation.deleteMany = async () => {};

const mkUser = (name) => ({ _id: new mongoose.Types.ObjectId(), name });
const call = async (fn, user, { body = {}, params = {}, query = {} } = {}) => {
  const out = { status: 200, body: null };
  const res = { status(s) { out.status = s; return this; }, json(b) { out.body = b; return this; } };
  await fn({ user, body, params, query }, res);
  return out;
};

(async () => {
  console.log("input validation");
  await t("accepts a valid project, trims + dedupes tech", () => {
    const r = parseProjectInput({ title: " App ", description: "d", tech: ["React", "react", " Node ", ""], status: "in-progress",
      github: "https://github.com/x", milestones: [{ title: "a" }, { title: "  " }] });
    assert.ok(!r.error, r.error);
    assert.deepStrictEqual(r.data.tech, ["React", "Node"]);
    assert.strictEqual(r.data.title, "App");
    assert.strictEqual(r.data.milestones.length, 1);
  });
  await t("rejects missing title / long description / bad status", () => {
    assert.ok(parseProjectInput({ description: "d" }).error);
    assert.ok(parseProjectInput({ title: "t", description: "x".repeat(401) }).error);
    assert.ok(parseProjectInput({ title: "t", description: "d", status: "hacked" }).error);
  });
  await t("rejects javascript: and non-URL links", () => {
    assert.ok(parseProjectInput({ title: "t", description: "d", github: "javascript:alert(1)" }).error);
    assert.ok(parseProjectInput({ title: "t", description: "d", demo: "not a url" }).error);
    assert.ok(!parseProjectInput({ title: "t", description: "d", demo: "http://localhost:3000" }).error);
  });
  await t("rejects non-object body, bad member, bad milestone states", () => {
    assert.ok(parseProjectInput(null).error);
    assert.ok(parseMember({ name: "  " }).error);
    assert.strictEqual(parseMember({ name: "Asha" }).data.role, "Contributor");
    assert.ok(parseMilestoneStates([{ id: "x", done: "yes" }]).error);
  });

  console.log("controller flows");
  const alice = mkUser("Alice Rao"), bob = mkUser("Bob Shah"), eve = mkUser("Eve Jain");
  let pid, msIds;

  await t("create: owner is team[0], shows as 'You', owner=true, ignores injected ownerId", async () => {
    const r = await call(c.createProject, alice, { body: { title: "SkillSync", description: "desc", tech: ["Node"], ownerId: "evil", team: [{ name: "x" }],
      milestones: [{ title: "m1" }, { title: "m2" }, { title: "m3" }, { title: "m4" }] } });
    assert.strictEqual(r.status, 201);
    const p = r.body.project; pid = p.id; msIds = p.milestones.map((m) => m.id);
    assert.strictEqual(p.owner, true);
    assert.strictEqual(p.team.length, 1);
    assert.deepStrictEqual([p.team[0].name, p.team[0].role], ["You", "Project lead"]);
    assert.strictEqual(store.get(pid).ownerId, String(alice._id));
    assert.strictEqual(p.progress, 0);
  });
  await t("create: 400 on invalid input", async () => {
    const r = await call(c.createProject, alice, { body: { title: "", description: "d" } });
    assert.strictEqual(r.status, 400);
  });
  await t("non-members get 404 (not 403) on read / edit / delete", async () => {
    for (const fn of [c.getProject, c.updateProject, c.deleteProject]) {
      const r = await call(fn, eve, { params: { id: pid }, body: { title: "x", description: "y" } });
      assert.strictEqual(r.status, 404);
    }
    assert.strictEqual((await call(c.getProject, alice, { params: { id: "not-an-id" } })).status, 404);
  });
  await t("owner adds member; duplicate name -> 409; non-owner member can't add", async () => {
    let r = await call(c.addMember, alice, { params: { id: pid }, body: { name: "Meera", role: "UI/UX" } });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.project.team.length, 2);
    r = await call(c.addMember, alice, { params: { id: pid }, body: { name: "meera" } });
    assert.strictEqual(r.status, 409);
    // make Bob a real member, then check he can't add
    store.get(pid).team.push({ userId: String(bob._id), name: "Bob Shah", role: "Backend" });
    r = await call(c.addMember, bob, { params: { id: pid }, body: { name: "Zed" } });
    assert.strictEqual(r.status, 403);
  });
  await t("member sees project as joined (owner=false) with himself as 'You'", async () => {
    const r = await call(c.getProject, bob, { params: { id: pid } });
    assert.strictEqual(r.body.project.owner, false);
    assert.ok(r.body.project.team.some((m) => m.name === "You" && m.role === "Backend"));
    assert.ok(r.body.project.team.some((m) => m.name === "Alice Rao"));
  });
  await t("member can tick milestones: progress + status follow, titles untouched", async () => {
    let r = await call(c.updateMilestones, bob, { params: { id: pid }, body: { milestones: [{ id: msIds[0], done: true }, { id: "bogus", done: true }] } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.project.progress, 25);
    assert.strictEqual(r.body.project.status, "in-progress");
    r = await call(c.updateMilestones, bob, { params: { id: pid }, body: { milestones: msIds.map((id) => ({ id, done: true })) } });
    assert.strictEqual(r.body.project.progress, 100);
    assert.strictEqual(r.body.project.status, "completed");
    r = await call(c.updateMilestones, bob, { params: { id: pid }, body: { milestones: msIds.map((id) => ({ id, done: false })) } });
    assert.strictEqual(r.body.project.status, "in-progress");
    assert.strictEqual(r.body.project.milestones[0].title, "m1");
  });
  await t("owner can't be removed; other member can", async () => {
    const team = store.get(pid).team;
    let r = await call(c.removeMember, alice, { params: { id: pid, memberId: String(team[0]._id) } });
    assert.strictEqual(r.status, 400);
    r = await call(c.removeMember, alice, { params: { id: pid, memberId: String(team[1]._id) } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.project.team.length, 2);
  });
  await t("update keeps milestone ids that still exist, drops foreign ids, rejects non-owner", async () => {
    const keep = msIds[1];
    let r = await call(c.updateProject, bob, { params: { id: pid }, body: { title: "x", description: "y" } });
    assert.strictEqual(r.status, 403);
    r = await call(c.updateProject, alice, { params: { id: pid }, body: { title: "Renamed", description: "d2", tech: ["Go"], status: "in-progress",
      milestones: [{ id: keep, title: "m2 edited", done: true }, { id: String(new mongoose.Types.ObjectId()), title: "new", done: false }] } });
    assert.strictEqual(r.status, 200);
    const ms = r.body.project.milestones;
    assert.strictEqual(ms.length, 2);
    assert.strictEqual(ms[0].id, keep);
    assert.notStrictEqual(ms[1].id, undefined);
    assert.strictEqual(r.body.project.title, "Renamed");
    assert.strictEqual(r.body.project.progress, 50);
  });
  await t("list sorts by progress / title and delete removes it", async () => {
    await call(c.createProject, alice, { body: { title: "Aardvark", description: "d" } });
    Project.find = async () => [...store.values()];
    let r = await call(c.listProjects, alice, { query: { sort: "title" } });
    assert.deepStrictEqual(r.body.projects.map((p) => p.title), ["Aardvark", "Renamed"]);
    r = await call(c.listProjects, alice, { query: { sort: "-progress" } });
    assert.strictEqual(r.body.projects[0].title, "Renamed");
    r = await call(c.deleteProject, bob, { params: { id: pid } });
    assert.strictEqual(r.status, 403);
    r = await call(c.deleteProject, alice, { params: { id: pid } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(store.has(pid), false);
  });

  console.log("routes");
  await t("fixed paths are registered before /:id", () => {
    process.env.JWT_SECRET = "x";
    const router = require(path + "Routes/projectRoutes");
    const paths = router.stack.filter((l) => l.route).map((l) => Object.keys(l.route.methods)[0].toUpperCase() + " " + l.route.path);
    assert.ok(paths.indexOf("GET /collaborators") < paths.indexOf("GET /:id"), paths.join("\n"));
    assert.ok(paths.indexOf("GET /invites") < paths.indexOf("GET /:id"));
    assert.strictEqual(paths.length, 14);
  });

  console.log(`\n${passed} passed${process.exitCode ? " — with FAILURES" : ""}`);
  process.exit(process.exitCode || 0);
})();
