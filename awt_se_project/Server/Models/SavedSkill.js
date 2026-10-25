const mongoose = require("mongoose");

// "Save for later" list
const savedSkillSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    skillId: { type: Number, required: true }
  },
  { timestamps: true }
);

savedSkillSchema.index({ userId: 1, skillId: 1 }, { unique: true });

module.exports = mongoose.model("SavedSkill", savedSkillSchema);
