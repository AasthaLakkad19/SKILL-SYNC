const express = require("express");

const router = express.Router();

const {
  getAchievements,
  getAchievementById,
  updateProgress,
  getSummary
} = require("../controllers/achievementController");


// Get all achievements
router.get("/", getAchievements);


// Get summary
router.get("/summary", getSummary);


// Get single achievement
router.get("/:id", getAchievementById);


// Update progress
router.put("/:id/progress", updateProgress);


module.exports = router;