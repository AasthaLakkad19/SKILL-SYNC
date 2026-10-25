const mongoose = require("mongoose");

// One row each time a learner submits a teaching quiz.
const quizAttemptSchema = new mongoose.Schema(
    {
        session: { type: mongoose.Schema.Types.ObjectId, ref: "TeachSession", required: true, index: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        userName: { type: String, trim: true, default: "Learner" },   // copied so the teacher's list needs no populate
        score: { type: Number, required: true, min: 0 },
        total: { type: Number, required: true, min: 1 },
        answers: { type: [Number], default: [] }                      // chosen option index, -1 = skipped
    },
    { timestamps: true }
);

quizAttemptSchema.index({ session: 1, user: 1, score: -1 });

module.exports = mongoose.model("QuizAttempt", quizAttemptSchema);
