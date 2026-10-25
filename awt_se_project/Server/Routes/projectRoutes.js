const express = require("express");
const router = express.Router();
const { protect } = require("../Middleware/auth");
const c = require("../controllers/projectController");

router.use(protect);

// NOTE: fixed paths (collaborators, invites) must come BEFORE "/:id"

// Collaborators + invitations
router.get("/collaborators", c.listCollaborators);
router.put("/collaborators/:userId/invite", c.sendInvite);
router.delete("/collaborators/:userId/invite", c.cancelInvite);

router.get("/invites", c.myInvites);
router.post("/invites/:inviteId/accept", c.acceptInvite);
router.post("/invites/:inviteId/decline", c.declineInvite);

// Projects
router.get("/", c.listProjects);
router.post("/", c.createProject);
router.get("/:id", c.getProject);
router.put("/:id", c.updateProject);
router.delete("/:id", c.deleteProject);

// Milestones (any team member) and team (owner)
router.patch("/:id/milestones", c.updateMilestones);
router.post("/:id/team", c.addMember);
router.delete("/:id/team/:memberId", c.removeMember);

module.exports = router;
