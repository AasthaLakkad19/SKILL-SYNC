const mongoose = require("mongoose");

const milestoneSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  done: { type: Boolean, default: false }
});

const memberSchema = new mongoose.Schema({
  // Set when the member is a real SkillSync user (the owner, or someone who
  // accepted an invite). Free-text members added by name have no userId.
  userId: { type: String, default: null },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  role: { type: String, trim: true, maxlength: 40, default: "Contributor" },
  contribution: { type: String, trim: true, maxlength: 120, default: "Just joined" }
});

const projectSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },

    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, required: true, trim: true, maxlength: 400 },

    tech: { type: [String], default: [] },

    status: {
      type: String,
      enum: ["not-started", "in-progress", "completed"],
      default: "not-started"
    },

    github: { type: String, trim: true, default: "", maxlength: 300 },
    demo: { type: String, trim: true, default: "", maxlength: 300 },

    milestones: { type: [milestoneSchema], default: [] },

    // team[0] is always the owner
    team: { type: [memberSchema], default: [] }
  },
  { timestamps: true }
);

projectSchema.index({ "team.userId": 1 });

// Same rule as the frontend's progress(): done / total, or 100 for a
// completed project that has no milestones.
projectSchema.methods.progress = function () {
  if (!this.milestones.length) return this.status === "completed" ? 100 : 0;
  const done = this.milestones.filter((m) => m.done).length;
  return Math.round((done / this.milestones.length) * 100);
};

// Keeps status in step with milestone ticks (frontend's milestoneChanged()).
projectSchema.methods.syncStatusWithMilestones = function () {
  if (!this.milestones.length) return;
  const pct = this.progress();
  if (pct === 100) this.status = "completed";
  else if (pct > 0) this.status = "in-progress";
  else if (this.status === "completed") this.status = "in-progress"; // everything un-ticked
};

// Shape the frontend expects. `viewerId` decides owner flag and the "You" label.
projectSchema.methods.toClient = function (viewerId) {
  const me = String(viewerId);
  return {
    id: String(this._id),
    title: this.title,
    description: this.description,
    tech: this.tech,
    status: this.status,
    github: this.github,
    demo: this.demo,
    owner: this.ownerId === me,
    updated: this.updatedAt ? this.updatedAt.getTime() : Date.now(),
    progress: this.progress(),
    milestones: this.milestones.map((m) => ({ id: String(m._id), title: m.title, done: m.done })),
    team: this.team.map((m) => ({
      id: String(m._id),
      name: m.userId && m.userId === me ? "You" : m.name,
      role: m.role,
      contribution: m.contribution
    }))
  };
};

module.exports = mongoose.model("Project", projectSchema);
