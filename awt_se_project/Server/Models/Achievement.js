const mongoose = require("mongoose");

const achievementSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      required: true,
      unique: true
    },

    title: {
      type: String,
      required: true
    },

    description: {
      type: String,
      required: true
    },

    category: {
      type: String,
      enum: [
        "Learning",
        "Teaching",
        "Collaboration",
        "Community"
      ],
      required: true
    },

    icon: {
      type: String,
      default: "fa-trophy"
    },

    unit: {
      type: String,
      required: true
    },

    current: {
      type: Number,
      default: 0
    },

    target: {
      type: Number,
      required: true
    },

    unlocked: {
      type: Boolean,
      default: false
    },

    earnedDate: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model(
  "Achievement",
  achievementSchema
);