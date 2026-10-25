const mongoose = require("mongoose");
const { INTERESTS } = require("../utils/teammateUtils");

// What a student wants to be found for on the Find Teammates page.
// (The Profile model has no "project interest", and not every user has a
// Profile yet, so this lives in its own small collection.)
const teamPreferenceSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },

    // null = not chosen, the page derives one from the user's skills
    interest: {
      type: String,
      enum: [...INTERESTS.map((i) => i.value), null],
      default: null
    },

    // null = fall back to Profile.availability, then "available".
    // "offline" hides the user from search.
    availability: {
      type: String,
      enum: ["available", "busy", "offline", null],
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("TeamPreference", teamPreferenceSchema);
