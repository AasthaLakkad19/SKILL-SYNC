const mongoose = require("mongoose");

// Per-user progress on an achievement from the shared Achievement catalog.
const userAchievementSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    achievementId: { type: Number, required: true },
    current: { type: Number, default: 0, min: 0 },
    unlocked: { type: Boolean, default: false },
    earnedDate: { type: String, default: null }
  },
  { timestamps: true }
);

userAchievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });

module.exports = mongoose.model("UserAchievement", userAchievementSchema);
