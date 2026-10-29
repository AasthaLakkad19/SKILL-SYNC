const express = require("express");
const router = express.Router();
const { protect } = require("../Middleware/auth");
const c = require("../controllers/teammateController");

router.use(protect);

// NOTE: fixed paths (me, requests, connections) must come BEFORE "/:userId"

router.get("/", c.listTeammates);

router.get("/me", c.getMyPreferences);
router.put("/me", c.updateMyPreferences);

router.get("/requests", c.incomingRequests);
router.post("/requests/:id/accept", c.acceptRequest);
router.post("/requests/:id/decline", c.declineRequest);

router.get("/connections", c.myConnections);

router.get("/notifications", c.notifications);
router.post("/notifications/seen", c.markNotificationsSeen);

router.get("/:userId/photo", c.getPhoto);
router.get("/:userId", c.getTeammate);
router.put("/:userId/connect", c.sendConnect);
router.delete("/:userId/connect", c.removeConnect);

module.exports = router;
