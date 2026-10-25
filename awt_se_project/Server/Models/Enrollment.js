const mongoose = require("mongoose");

// One row per "user is learning / has learned this skill"
const enrollmentSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },

    skillId: { type: Number, required: true },
    name: { type: String, required: true },
    icon: { type: String, default: "📘" },

    teacher: { type: String, required: true },

    // Tokens charged when the user enrolled (kept for history / refunds)
    tokensSpent: { type: Number, required: true, min: 0 },

    progress: { type: Number, default: 0, min: 0, max: 100 },

    status: {
      type: String,
      enum: ["learning", "completed"],
      default: "learning"
    },

    completedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// A user can only have ONE active enrollment per skill.
// (They may enrol again after completing it.)
enrollmentSchema.index(
  { userId: 1, skillId: 1 },
  { unique: true, partialFilterExpression: { status: "learning" } }
);

enrollmentSchema.methods.toClient = function () {
  return {
    skillId: this.skillId,
    name: this.name,
    icon: this.icon,
    teacher: this.teacher,
    progress: this.progress,
    status: this.status
  };
};

module.exports = mongoose.model("Enrollment", enrollmentSchema);
