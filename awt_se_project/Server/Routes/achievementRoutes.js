const express = require("express");
const router = express.Router();
const { protect } = require("../Middleware/auth");
const { getAchievements, getAchievementById, updateProgress, getSummary } =
  require("../controllers/achievementController");

router.use(protect);

router.get("/", getAchievements);
router.get("/summary", getSummary);
router.get("/:id", getAchievementById);
router.put("/:id/progress", updateProgress);

module.exports = router;
