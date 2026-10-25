const express = require("express");
const router = express.Router();
const { protect } = require("../Middleware/auth");
const c = require("../controllers/settingsController");

router.use(protect);

router.get("/settings", c.getSettings);
router.put("/settings", c.updateSettings);

router.put("/account/email", c.changeEmail);
router.put("/account/password", c.changePassword);
router.delete("/account", c.deleteAccount);

router.get("/tokens/history", c.tokenHistory);
router.get("/login-activity", c.loginActivity);

router.post("/support", c.createSupportTicket);

module.exports = router;