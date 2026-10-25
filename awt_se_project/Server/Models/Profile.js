const mongoose = require("mongoose");

// ==========================
// EDUCATION
// ==========================
const EducationSchema = new mongoose.Schema(
  {
    degree: {
      type: String,
      default: "",
    },

    school: {
      type: String,
      default: "",
    },

    years: {
      type: String,
      default: "",
    },

    detail: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

// ==========================
// SOCIAL LINKS
// ==========================
const SocialLinkSchema = new mongoose.Schema(
  {
    label: String,
    icon: String,
    url: String,
  },
  { _id: false }
);

// ==========================
// SKILLS
// ==========================
const SkillSchema = new mongoose.Schema(
  {
    name: String,
    icon: String,

    level: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    levelBand: {
      type: String,
      enum: [
        "beginner",
        "intermediate",
        "advanced",
        "expert",
      ],
      default: "beginner",
    },

    levelLabel: {
      type: String,
      default: "Beginner",
    },
  },
  { _id: true }
);

// ==========================
// PROJECTS
// ==========================
const ProjectSchema = new mongoose.Schema(
  {
    title: String,

    icon: {
      type: String,
      default: "📁",
    },

    description: String,

    tags: [String],

    role: String,

    year: String,

    status: {
      type: String,
      enum: ["active", "completed"],
      default: "active",
    },

    statusLabel: String,
  },
  { _id: true }
);

// ==========================
// ACHIEVEMENTS
// ==========================
const AchievementSchema = new mongoose.Schema(
  {
    title: String,

    icon: String,

    date: String,

    bg: String,
  },
  { _id: true }
);

// ==========================
// REVIEWS
// ==========================
const ReviewSchema = new mongoose.Schema(
  {
    name: String,

    initial: String,

    context: String,

    date: String,

    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: 5,
    },

    text: String,
  },
  { _id: true }
);

// ==========================
// MAIN PROFILE
// ==========================
const ProfileSchema = new mongoose.Schema(
  {
    // Link profile to User
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
    },

    initial: {
      type: String,
      default: "U",
    },

    photoUrl: {
      type: String,
      default: null,
    },

    headline: {
      type: String,
      default: "",
    },

    bio: {
      type: String,
      default: "",
    },

    location: {
      type: String,
      default: "",
    },

    verified: {
      type: Boolean,
      default: false,
    },

    availability: {
      type: String,
      enum: ["available", "busy", "offline"],
      default: "available",
    },

    availabilityLabel: {
      type: String,
      default: "Available for collaboration",
    },

    availabilityNote: {
      type: String,
      default: "",
    },

    education: {
      type: EducationSchema,
      default: () => ({}),
    },

    socialLinks: {
      type: [SocialLinkSchema],
      default: [],
    },

    skills: {
      type: [SkillSchema],
      default: [],
    },

    projects: {
      type: [ProjectSchema],
      default: [],
    },

    achievements: {
      type: [AchievementSchema],
      default: [],
    },

    reviews: {
      type: [ReviewSchema],
      default: [],
    },

    tokenSummary: {
      earned: {
        type: Number,
        default: 0,
      },

      spent: {
        type: Number,
        default: 0,
      },
    },

    // Public profile statistics
    stats: {
      skills: {
        type: Number,
        default: 0,
      },

      projects: {
        type: Number,
        default: 0,
      },

      achievements: {
        type: Number,
        default: 0,
      },

      rating: {
        type: Number,
        default: 0,
      },

      publicTokens: {
        type: Number,
        default: 0,
      },
    },
  },

  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Profile", ProfileSchema);