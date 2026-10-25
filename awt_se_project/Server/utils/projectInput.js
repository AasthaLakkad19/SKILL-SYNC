// Validation / sanitising for project requests.
// Whitelists fields so clients can never set ownerId, team, timestamps, etc.

const STATUSES = ["not-started", "in-progress", "completed"];

const LIMITS = {
  title: 80,
  description: 400,
  url: 300,
  tech: 15,
  techLength: 30,
  milestones: 30,
  milestoneTitle: 120,
  memberName: 60,
  memberRole: 40
};

const text = (v) => (typeof v === "string" ? v.trim() : "");

// Only http(s) links: ng-href would otherwise happily render javascript: URLs
function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (e) {
    return false;
  }
}

function parseProjectInput(body) {
  if (!body || typeof body !== "object") return { error: "Invalid request body" };

  const title = text(body.title);
  if (!title) return { error: "Title is required" };
  if (title.length > LIMITS.title) return { error: `Title must be ${LIMITS.title} characters or fewer` };

  const description = text(body.description);
  if (!description) return { error: "Description is required" };
  if (description.length > LIMITS.description) {
    return { error: `Description must be ${LIMITS.description} characters or fewer` };
  }

  // tech: array of strings, trimmed, de-duplicated (case-insensitive)
  const rawTech = Array.isArray(body.tech) ? body.tech : [];
  const seen = new Set();
  const tech = [];
  for (const t of rawTech) {
    const name = text(t);
    if (!name) continue;
    if (name.length > LIMITS.techLength) return { error: `Each technology must be ${LIMITS.techLength} characters or fewer` };
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    tech.push(name);
  }
  if (tech.length > LIMITS.tech) return { error: `Add at most ${LIMITS.tech} technologies` };

  const github = text(body.github);
  const demo = text(body.demo);
  for (const [label, url] of [["GitHub", github], ["Demo", demo]]) {
    if (!url) continue;
    if (url.length > LIMITS.url || !isHttpUrl(url)) return { error: `${label} link must be a valid http(s) URL` };
  }

  const status = body.status === undefined || body.status === "" ? "not-started" : body.status;
  if (!STATUSES.includes(status)) return { error: "Invalid status" };

  const rawMilestones = Array.isArray(body.milestones) ? body.milestones : [];
  const milestones = [];
  for (const m of rawMilestones) {
    if (!m || typeof m !== "object") continue;
    const mTitle = text(m.title);
    if (!mTitle) continue; // blank rows from the form are dropped
    if (mTitle.length > LIMITS.milestoneTitle) {
      return { error: `Milestone titles must be ${LIMITS.milestoneTitle} characters or fewer` };
    }
    milestones.push({ id: typeof m.id === "string" ? m.id : null, title: mTitle, done: m.done === true });
  }
  if (milestones.length > LIMITS.milestones) return { error: `Add at most ${LIMITS.milestones} milestones` };

  return { data: { title, description, tech, github, demo, status, milestones } };
}

function parseMember(body) {
  if (!body || typeof body !== "object") return { error: "Invalid request body" };

  const name = text(body.name);
  if (!name) return { error: "Member name is required" };
  if (name.length > LIMITS.memberName) return { error: `Name must be ${LIMITS.memberName} characters or fewer` };

  const role = text(body.role) || "Contributor";
  if (role.length > LIMITS.memberRole) return { error: `Role must be ${LIMITS.memberRole} characters or fewer` };

  return { data: { name, role } };
}

// [{ id, done }] used when ticking milestones
function parseMilestoneStates(list) {
  if (!Array.isArray(list) || !list.length) return { error: "milestones must be a non-empty array" };
  const states = [];
  for (const item of list) {
    if (!item || typeof item.id !== "string" || typeof item.done !== "boolean") {
      return { error: "Each milestone needs an id and a boolean done" };
    }
    states.push({ id: item.id, done: item.done });
  }
  return { data: states };
}

module.exports = { STATUSES, LIMITS, isHttpUrl, parseProjectInput, parseMember, parseMilestoneStates };
