const Achievement = require("../Models/Achievement");
const UserAchievement = require("../Models/UserAchievement");
const { merge, getUserAchievements, formatDate } = require("../utils/achievementUtils");

// All achievements, with the logged-in user's own progress
exports.getAchievements = async (req, res) => {
  try {
    const achievements = await getUserAchievements(req.user._id);
    res.status(200).json({ success: true, achievements });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch achievements", error: error.message });
  }
};

// One achievement
exports.getAchievementById = async (req, res) => {
  try {
    const catalog = await Achievement.findOne({ id: Number(req.params.id) });
    if (!catalog) {
      return res.status(404).json({ success: false, message: "Achievement not found" });
    }
    const progress = await UserAchievement.findOne({
      userId: String(req.user._id),
      achievementId: catalog.id
    });
    res.status(200).json({ success: true, achievement: merge(catalog, progress) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch achievement", error: error.message });
  }
};

// Update the logged-in user's progress
exports.updateProgress = async (req, res) => {
  try {
    const current = Number(req.body.current);
    if (!Number.isFinite(current) || current < 0) {
      return res.status(400).json({ success: false, message: "current must be a number >= 0" });
    }

    const catalog = await Achievement.findOne({ id: Number(req.params.id) });
    if (!catalog) {
      return res.status(404).json({ success: false, message: "Achievement not found" });
    }

    const userId = String(req.user._id);
    const progress =
      (await UserAchievement.findOne({ userId, achievementId: catalog.id })) ||
      new UserAchievement({ userId, achievementId: catalog.id });

    progress.current = Math.min(current, catalog.target);

    if (progress.current >= catalog.target) {
      progress.unlocked = true;
      if (!progress.earnedDate) progress.earnedDate = formatDate(new Date());
    } else {
      progress.unlocked = false;
      progress.earnedDate = null;
    }

    await progress.save();

    res.status(200).json({
      success: true,
      message: "Achievement progress updated",
      achievement: merge(catalog, progress)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update progress", error: error.message });
  }
};

// Summary for the logged-in user
exports.getSummary = async (req, res) => {
  try {
    const achievements = await getUserAchievements(req.user._id);
    const total = achievements.length;
    const unlocked = achievements.filter((a) => a.unlocked).length;
    res.status(200).json({
      success: true,
      total,
      unlocked,
      locked: total - unlocked,
      completion: total === 0 ? 0 : Math.round((unlocked / total) * 100)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to get summary", error: error.message });
  }
};
