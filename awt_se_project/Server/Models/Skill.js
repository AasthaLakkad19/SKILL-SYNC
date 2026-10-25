const mongoose = require("mongoose");

const teacherSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    bio: { type: String, default: "" },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    sessions: { type: Number, min: 0, default: 0 }
  },
  { _id: false }
);

const reviewSchema = new mongoose.Schema(
  {
    // Set for reviews written by real users (one review per user per skill).
    // Seed reviews leave it empty.
    userId: { type: String, default: null },
    by: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, required: true, trim: true, maxlength: 500 }
  },
  { timestamps: true }
);

const skillSchema = new mongoose.Schema(
  {
    // Public numeric id used by the frontend (kept separate from Mongo's _id)
    skillId: { type: Number, required: true, unique: true, index: true },

    name: { type: String, required: true, trim: true },
    icon: { type: String, default: "📘" },

    category: {
      type: String,
      enum: ["Programming", "Design", "Data", "Career"],
      required: true,
      index: true
    },

    level: {
      type: String,
      enum: ["Beginner", "Intermediate", "Advanced"],
      default: "Beginner"
    },

    // Cost in Skill Tokens
    tokens: { type: Number, required: true, min: 0 },

    duration: { type: String, default: "" },
    learners: { type: Number, default: 0, min: 0 },

    short: { type: String, default: "" },
    description: { type: String, default: "" },
    topics: { type: [String], default: [] },

    teachers: { type: [teacherSchema], default: [] },
    reviews: { type: [reviewSchema], default: [] },

    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

skillSchema.index({ name: "text", category: "text" });

// Average of the teachers' ratings (same rule the frontend used before)
skillSchema.methods.averageRating = function () {
  if (!this.teachers.length) return 0;
  const total = this.teachers.reduce((sum, t) => sum + t.rating, 0);
  return Math.round((total / this.teachers.length) * 10) / 10;
};

// Shape the frontend expects: { id, name, ..., rating }
skillSchema.methods.toClient = function () {
  return {
    id: this.skillId,
    name: this.name,
    icon: this.icon,
    category: this.category,
    level: this.level,
    tokens: this.tokens,
    duration: this.duration,
    learners: this.learners,
    short: this.short,
    description: this.description,
    topics: this.topics,
    teachers: this.teachers.map((t) => ({
      name: t.name,
      bio: t.bio,
      rating: t.rating,
      sessions: t.sessions
    })),
    reviews: this.reviews.map((r) => ({
      by: r.by,
      rating: r.rating,
      text: r.text
    })),
    rating: this.averageRating()
  };
};

module.exports = mongoose.model("Skill", skillSchema);
