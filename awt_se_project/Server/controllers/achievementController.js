const Achievement = require("../Models/Achievement");

// Get all achievements
exports.getAchievements = async (req, res) => {
  try {
    const achievements = await Achievement.find().sort({ id: 1 });

    res.status(200).json({
      success: true,
      achievements
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch achievements",
      error: error.message
    });
  }
};


// Get achievement by ID
exports.getAchievementById = async (req, res) => {
  try {
    const achievement = await Achievement.findOne({
      id: req.params.id
    });

    if (!achievement) {
      return res.status(404).json({
        success: false,
        message: "Achievement not found"
      });
    }

    res.status(200).json({
      success: true,
      achievement
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch achievement",
      error: error.message
    });
  }
};


// Update achievement progress
exports.updateProgress = async (req, res) => {
  try {
    const { current } = req.body;

    const achievement = await Achievement.findOne({
      id: req.params.id
    });

    if (!achievement) {
      return res.status(404).json({
        success: false,
        message: "Achievement not found"
      });
    }

    achievement.current = current;

    // Automatic unlocking
    if (achievement.current >= achievement.target) {

      achievement.current = achievement.target;
      achievement.unlocked = true;

      if (!achievement.earnedDate) {
        const date = new Date();

        const months = [
          "Jan", "Feb", "Mar", "Apr",
          "May", "Jun", "Jul", "Aug",
          "Sep", "Oct", "Nov", "Dec"
        ];

        achievement.earnedDate =
          String(date.getDate()).padStart(2, "0") +
          " " +
          months[date.getMonth()] +
          " " +
          date.getFullYear();
      }

    } else {

      achievement.unlocked = false;
      achievement.earnedDate = null;
    }

    await achievement.save();

    res.status(200).json({
      success: true,
      message: "Achievement progress updated",
      achievement
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update progress",
      error: error.message
    });
  }
};


// Get achievement summary
exports.getSummary = async (req, res) => {
  try {

    const achievements = await Achievement.find();

    const total = achievements.length;

    const unlocked = achievements.filter(
      item => item.unlocked === true
    ).length;

    const locked = total - unlocked;

    const completion =
      total === 0
        ? 0
        : Math.round((unlocked / total) * 100);

    res.status(200).json({
      success: true,
      total,
      unlocked,
      locked,
      completion
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get summary",
      error: error.message
    });
  }
};