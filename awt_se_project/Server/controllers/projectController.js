const mongoose = require("mongoose");
const Project = require("../Models/Project");
const Invitation = require("../Models/Invitation");
const User = require("../Models/User");
const Profile = require("../Models/Profile");
const { parseProjectInput, parseMember, parseMilestoneStates } = require("../utils/projectInput");

const MAX_OWNED_PROJECTS = 50;
const MAX_TEAM_SIZE = 20;

// ------------------------------------------------------------
// helpers
// ------------------------------------------------------------

const uid = (req) => String(req.user._id);

const serverError = (res, label, err) => {
  console.error(label, err);
  res.status(500).json({ message: "Server error" });
};

const notFound = (res, what = "Project") => res.status(404).json({ message: `${what} not found` });

// Loads a project the caller belongs to. Non-members get a 404 so project
// ids can't be probed. Returns null after sending the response.
async function loadProject(req, res, { ownerOnly = false } = {}) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    notFound(res);
    return null;
  }

  const project = await Project.findById(id);
  const me = uid(req);
  const isOwner = !!project && project.ownerId === me;
  const isMember = isOwner || (!!project && project.team.some((m) => m.userId === me));

  if (!project || !isMember) {
    notFound(res);
    return null;
  }
  if (ownerOnly && !isOwner) {
    res.status(403).json({ message: "Only the project owner can do this" });
    return null;
  }
  return project;
}

const SORTS = {
  "-updated": (a, b) => b.updated - a.updated,
  title: (a, b) => a.title.localeCompare(b.title),
  "-progress": (a, b) => b.progress - a.progress || b.updated - a.updated
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ------------------------------------------------------------
// PROJECTS
// ------------------------------------------------------------

// GET /api/projects?status=in-progress&q=react&sort=-updated
// Projects you created + projects you were added to.
exports.listProjects = async (req, res) => {
  try {
    const me = uid(req);
    const { status, q, sort = "-updated" } = req.query;

    const filter = { $or: [{ ownerId: me }, { "team.userId": me }] };
    if (typeof status === "string" && status !== "all") filter.status = status;

    if (typeof q === "string" && q.trim()) {
      const rx = new RegExp(escapeRegex(q.trim()), "i");
      filter.$and = [{ $or: [{ title: rx }, { tech: rx }] }];
    }

    const docs = await Project.find(filter);
    const projects = docs.map((p) => p.toClient(me)).sort(SORTS[sort] || SORTS["-updated"]);

    res.json({ projects });
  } catch (err) {
    serverError("LIST PROJECTS ERROR:", err);
  }
};

// GET /api/projects/:id
exports.getProject = async (req, res) => {
  try {
    const project = await loadProject(req, res);
    if (!project) return;
    res.json({ project: project.toClient(uid(req)) });
  } catch (err) {
    serverError("GET PROJECT ERROR:", err);
  }
};

// POST /api/projects
exports.createProject = async (req, res) => {
  try {
    const me = uid(req);
    const parsed = parseProjectInput(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const owned = await Project.countDocuments({ ownerId: me });
    if (owned >= MAX_OWNED_PROJECTS) {
      return res.status(400).json({ message: `You can own at most ${MAX_OWNED_PROJECTS} projects` });
    }

    const { milestones, ...fields } = parsed.data;

    const project = await Project.create({
      ...fields,
      milestones: milestones.map((m) => ({ title: m.title, done: m.done })),
      ownerId: me,
      team: [{ userId: me, name: req.user.name, role: "Project lead", contribution: "Project owner" }]
    });

    res.status(201).json({ message: "Project created", project: project.toClient(me) });
  } catch (err) {
    serverError("CREATE PROJECT ERROR:", err);
  }
};

// PUT /api/projects/:id   (owner only)
exports.updateProject = async (req, res) => {
  try {
    const project = await loadProject(req, res, { ownerOnly: true });
    if (!project) return;

    const parsed = parseProjectInput(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const { milestones, ...fields } = parsed.data;
    project.set(fields);

    // Keep the _id (and so the history) of milestones that still exist;
    // ignore ids that don't belong to this project.
    project.milestones = milestones.map((m) => {
      const existing = m.id && project.milestones.id(m.id);
      return existing
        ? { _id: existing._id, title: m.title, done: m.done }
        : { title: m.title, done: m.done };
    });

    await project.save();
    res.json({ message: "Changes saved", project: project.toClient(uid(req)) });
  } catch (err) {
    serverError("UPDATE PROJECT ERROR:", err);
  }
};

// DELETE /api/projects/:id   (owner only)
exports.deleteProject = async (req, res) => {
  try {
    const project = await loadProject(req, res, { ownerOnly: true });
    if (!project) return;

    await Promise.all([
      Project.deleteOne({ _id: project._id }),
      Invitation.deleteMany({ projectId: project._id })
    ]);

    res.json({ message: "Project deleted" });
  } catch (err) {
    serverError("DELETE PROJECT ERROR:", err);
  }
};

// ------------------------------------------------------------
// MILESTONES  (any team member can tick them)
// ------------------------------------------------------------

// PATCH /api/projects/:id/milestones   { milestones: [{ id, done }] }
exports.updateMilestones = async (req, res) => {
  try {
    const project = await loadProject(req, res);
    if (!project) return;

    const parsed = parseMilestoneStates(req.body.milestones);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    parsed.data.forEach((s) => {
      const m = mongoose.isValidObjectId(s.id) ? project.milestones.id(s.id) : null;
      if (m) m.done = s.done; // only `done` can change here, never titles
    });

    project.syncStatusWithMilestones();
    await project.save();

    res.json({ project: project.toClient(uid(req)) });
  } catch (err) {
    serverError("UPDATE MILESTONES ERROR:", err);
  }
};

// ------------------------------------------------------------
// TEAM  (owner only)
// ------------------------------------------------------------

// POST /api/projects/:id/team   { name, role }
exports.addMember = async (req, res) => {
  try {
    const project = await loadProject(req, res, { ownerOnly: true });
    if (!project) return;

    const parsed = parseMember(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    if (project.team.length >= MAX_TEAM_SIZE) {
      return res.status(400).json({ message: `A project can have at most ${MAX_TEAM_SIZE} members` });
    }

    const taken = project.team.some((m) => m.name.toLowerCase() === parsed.data.name.toLowerCase());
    if (taken) return res.status(409).json({ message: `${parsed.data.name} is already on this team` });

    project.team.push({ ...parsed.data, contribution: "Just joined" });
    await project.save();

    res.status(201).json({ message: "Team member added", project: project.toClient(uid(req)) });
  } catch (err) {
    serverError("ADD MEMBER ERROR:", err);
  }
};

// DELETE /api/projects/:id/team/:memberId
exports.removeMember = async (req, res) => {
  try {
    const project = await loadProject(req, res, { ownerOnly: true });
    if (!project) return;

    const { memberId } = req.params;
    const member = mongoose.isValidObjectId(memberId) ? project.team.id(memberId) : null;
    if (!member) return notFound(res, "Team member");

    if (member.userId === project.ownerId) {
      return res.status(400).json({ message: "The project owner can't be removed" });
    }

    project.team.pull({ _id: member._id });
    await project.save();

    res.json({ message: "Team member removed", project: project.toClient(uid(req)) });
  } catch (err) {
    serverError("REMOVE MEMBER ERROR:", err);
  }
};

// ------------------------------------------------------------
// COLLABORATORS  (people you can invite)
// ------------------------------------------------------------

// GET /api/projects/collaborators
// Other users, best skill match with your open projects first.
exports.listCollaborators = async (req, res) => {
  try {
    const me = uid(req);

    const [users, sent, mine] = await Promise.all([
      User.find({ _id: { $ne: req.user._id }, isActive: true }).select("name skills").limit(100).lean(),
      Invitation.find({ fromUserId: me, status: "pending" }).select("toUserId").lean(),
      Project.find({ ownerId: me, status: { $ne: "completed" } }).select("tech").lean()
    ]);

    const profiles = await Profile.find({ userId: { $in: users.map((u) => String(u._id)) } })
      .select("userId headline skills.name")
      .lean();
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));

    const invited = new Set(sent.map((i) => i.toUserId));
    const wanted = new Set(mine.flatMap((p) => p.tech.map((t) => t.toLowerCase())));

    const list = users.map((u) => {
      const id = String(u._id);
      const profile = profileByUser.get(id);
      const skills = [
        ...new Set([...(u.skills || []), ...((profile && profile.skills) || []).map((s) => s.name).filter(Boolean)])
      ].slice(0, 6);

      return {
        id,
        name: u.name,
        role: (profile && profile.headline) || "Student",
        skills,
        invited: invited.has(id),
        _score: skills.filter((s) => wanted.has(s.toLowerCase())).length
      };
    });

    list.sort((a, b) => b._score - a._score || a.name.localeCompare(b.name));
    const collaborators = list.slice(0, 12).map(({ _score, ...c }) => c);

    res.json({ collaborators });
  } catch (err) {
    serverError("LIST COLLABORATORS ERROR:", err);
  }
};

// PUT /api/projects/collaborators/:userId/invite   { projectId? , role? }
// Without projectId the invite goes to your most recently updated open project.
exports.sendInvite = async (req, res) => {
  try {
    const me = uid(req);
    const { userId } = req.params;

    if (!mongoose.isValidObjectId(userId)) return notFound(res, "User");
    if (userId === me) return res.status(400).json({ message: "You can't invite yourself" });

    const target = await User.findOne({ _id: userId, isActive: true }).select("name");
    if (!target) return notFound(res, "User");

    let project;
    const { projectId } = req.body || {};
    if (projectId) {
      project = mongoose.isValidObjectId(projectId) ? await Project.findById(projectId) : null;
      if (!project || project.ownerId !== me) return notFound(res);
    } else {
      project = await Project.findOne({ ownerId: me, status: { $ne: "completed" } }).sort({ updatedAt: -1 });
      if (!project) {
        return res.status(400).json({ message: "Create a project first, then invite teammates." });
      }
    }

    if (project.team.some((m) => m.userId === userId)) {
      return res.status(409).json({ message: `${target.name} is already on ${project.title}` });
    }
    if (project.team.length >= MAX_TEAM_SIZE) {
      return res.status(400).json({ message: `A project can have at most ${MAX_TEAM_SIZE} members` });
    }

    const role = typeof req.body?.role === "string" && req.body.role.trim() ? req.body.role.trim().slice(0, 40) : "Contributor";

    try {
      await Invitation.create({ projectId: project._id, fromUserId: me, toUserId: userId, role });
    } catch (err) {
      if (err.code !== 11000) throw err; // already invited: treat as success
    }

    res.json({ invited: true, message: `Invitation sent to ${target.name} for ${project.title}` });
  } catch (err) {
    serverError("SEND INVITE ERROR:", err);
  }
};

// DELETE /api/projects/collaborators/:userId/invite   (cancel pending invites)
exports.cancelInvite = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return notFound(res, "User");

    await Invitation.deleteMany({ fromUserId: uid(req), toUserId: userId, status: "pending" });
    res.json({ invited: false, message: "Invitation cancelled" });
  } catch (err) {
    serverError("CANCEL INVITE ERROR:", err);
  }
};

// ------------------------------------------------------------
// INVITES YOU RECEIVED
// ------------------------------------------------------------

// GET /api/projects/invites
exports.myInvites = async (req, res) => {
  try {
    const invites = await Invitation.find({ toUserId: uid(req), status: "pending" }).sort({ createdAt: -1 });

    const [projects, senders] = await Promise.all([
      Project.find({ _id: { $in: invites.map((i) => i.projectId) } }).select("title"),
      User.find({ _id: { $in: invites.map((i) => i.fromUserId).filter(mongoose.isValidObjectId) } }).select("name")
    ]);
    const titleById = new Map(projects.map((p) => [String(p._id), p.title]));
    const nameById = new Map(senders.map((u) => [String(u._id), u.name]));

    res.json({
      invites: invites
        .filter((i) => titleById.has(String(i.projectId)))
        .map((i) => ({
          id: String(i._id),
          project: { id: String(i.projectId), title: titleById.get(String(i.projectId)) },
          from: nameById.get(i.fromUserId) || "A student",
          role: i.role,
          createdAt: i.createdAt
        }))
    });
  } catch (err) {
    serverError("MY INVITES ERROR:", err);
  }
};

// POST /api/projects/invites/:inviteId/accept
exports.acceptInvite = async (req, res) => {
  try {
    const me = uid(req);
    const { inviteId } = req.params;
    if (!mongoose.isValidObjectId(inviteId)) return notFound(res, "Invitation");

    // Atomically claim it so a double click can't add the member twice
    const invite = await Invitation.findOneAndUpdate(
      { _id: inviteId, toUserId: me, status: "pending" },
      { status: "accepted" },
      { new: true }
    );
    if (!invite) return notFound(res, "Invitation");

    const project = await Project.findById(invite.projectId);
    if (!project) {
      await Invitation.updateOne({ _id: invite._id }, { status: "declined" });
      return notFound(res);
    }
    if (project.team.length >= MAX_TEAM_SIZE) {
      await Invitation.updateOne({ _id: invite._id }, { status: "declined" });
      return res.status(400).json({ message: "This project's team is full" });
    }

    if (!project.team.some((m) => m.userId === me)) {
      project.team.push({ userId: me, name: req.user.name, role: invite.role, contribution: "Just joined" });
      await project.save();
    }

    res.json({ message: `You joined ${project.title}`, project: project.toClient(me) });
  } catch (err) {
    serverError("ACCEPT INVITE ERROR:", err);
  }
};

// POST /api/projects/invites/:inviteId/decline
exports.declineInvite = async (req, res) => {
  try {
    const { inviteId } = req.params;
    if (!mongoose.isValidObjectId(inviteId)) return notFound(res, "Invitation");

    const invite = await Invitation.findOneAndUpdate(
      { _id: inviteId, toUserId: uid(req), status: "pending" },
      { status: "declined" }
    );
    if (!invite) return notFound(res, "Invitation");

    res.json({ message: "Invitation declined" });
  } catch (err) {
    serverError("DECLINE INVITE ERROR:", err);
  }
};
