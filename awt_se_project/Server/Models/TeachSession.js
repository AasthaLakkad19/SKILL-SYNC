const mongoose = require("mongoose");

// Keep these lists in sync with the <select> options in teachSkills.html
const CATEGORIES = [
    "Web Development",
    "Programming",
    "Design & Creativity",
    "Data & AI",
    "Career & Communication",
    "Academic Support",
    "Other"
];
const LEVELS = ["Beginner", "Intermediate", "Advanced", "All levels"];
const MODES = [
    "Live online",
    "In person on campus",
    "Recorded mini lesson",
    "Pair programming",
    "Quiz / practice session"
];
const DURATIONS = ["15 minutes", "30 minutes", "45 minutes", "60 minutes"];
const ACTIVITIES = [
    "Live demo + learner practice",
    "Mini quiz at the end",
    "Build something together",
    "Debug this challenge",
    "Flashcards / rapid questions",
    "Feedback and review"
];
const REWARDS = [2, 3, 5];

// One quiz question: the question, its options and which option is correct
const quizQuestionSchema = new mongoose.Schema(
    {
        question: { type: String, required: true, trim: true, maxlength: 200 },
        options: {
            type: [{ type: String, trim: true, maxlength: 100 }],
            validate: [(v) => v.length >= 2 && v.length <= 6, "Each question needs 2 to 6 options"]
        },
        correctIndex: { type: Number, required: true, min: 0 },
        explanation: { type: String, trim: true, maxlength: 200, default: "" }
    },
    { _id: false }
);

// A video the teacher uploaded (or recorded) on SkillSync
const videoSchema = new mongoose.Schema(
    {
        url: { type: String, required: true, maxlength: 200 },       // /uploads/teach-videos/<file>
        originalName: { type: String, trim: true, maxlength: 100, default: "" },
        size: { type: Number, min: 0, default: 0 },                  // bytes
        mimeType: { type: String, default: "" }
    },
    { _id: false }
);

// Extra details that depend on the teaching format (mode)
const detailsSchema = new mongoose.Schema(
    {
        meetingLink: { type: String, trim: true, maxlength: 300 },   // Live online (optional external link)
        location: { type: String, trim: true, maxlength: 100 },      // In person on campus
        recordingUrl: { type: String, trim: true, maxlength: 300 },  // Recorded mini lesson (external link)
        video: { type: videoSchema, default: undefined },            // Recorded mini lesson (uploaded file)
        repoLink: { type: String, trim: true, maxlength: 300 },      // Pair programming
        quiz: { type: [quizQuestionSchema], default: undefined }     // Quiz / practice session
    },
    { _id: false }
);

// Built-in SkillSync live room state (the signalling itself lives in memory)
const liveSchema = new mongoose.Schema(
    {
        isLive: { type: Boolean, default: false },
        startedAt: { type: Date, default: null },
        endedAt: { type: Date, default: null }
    },
    { _id: false }
);

// A learner who joined / watched / took the quiz (never sent to the browser)
const participantSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        joinedAt: { type: Date, default: Date.now }
    },
    { _id: false }
);

const teachSessionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        title: { type: String, required: true, trim: true, maxlength: 70 },
        skill: { type: String, required: true, trim: true, maxlength: 60 },
        category: { type: String, required: true, enum: CATEGORIES },
        level: { type: String, enum: LEVELS, default: "Beginner" },
        mode: { type: String, enum: MODES, default: "Live online" },
        duration: { type: String, enum: DURATIONS, default: "15 minutes" },
        reward: { type: Number, enum: REWARDS, default: 2 },
        description: { type: String, required: true, trim: true, maxlength: 400 },
        activity: { type: String, enum: ACTIVITIES, default: ACTIVITIES[0] },

        // Format-specific info (see detailsSchema)
        details: { type: detailsSchema, default: () => ({}) },

        live: { type: liveSchema, default: () => ({}) },

        // Learners who took part. The list stays on the server (select: false);
        // participantCount is the cheap number shown in the UI.
        participants: { type: [participantSchema], default: [], select: false },
        participantCount: { type: Number, default: 0, min: 0 },

        status: {
            type: String,
            enum: ["published", "completed"],
            default: "published"
        },
        tokensAwarded: { type: Number, default: 0 },
        completedAt: { type: Date, default: null }
    },
    { timestamps: true }
);

teachSessionSchema.index({ user: 1, createdAt: -1 });
teachSessionSchema.index({ status: 1, "live.isLive": -1, createdAt: -1 }); // community list

// Frontend expects `session.id`
teachSessionSchema.set("toJSON", {
    virtuals: true,
    versionKey: false,
    transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.user;
        delete ret.participants;
        return ret;
    }
});

// Adds a learner once (idempotent + race-safe). The owner never counts.
// Returns true only the first time this learner is added.
teachSessionSchema.statics.addParticipant = async function (sessionId, userId) {
    const result = await this.updateOne(
        { _id: sessionId, user: { $ne: userId }, "participants.user": { $ne: userId } },
        { $push: { participants: { user: userId, joinedAt: new Date() } }, $inc: { participantCount: 1 } }
    );
    return result.modifiedCount === 1;
};

// Undo addParticipant (used when paying to join fails half way)
teachSessionSchema.statics.removeParticipant = async function (sessionId, userId) {
    const result = await this.updateOne(
        { _id: sessionId, "participants.user": userId },
        { $pull: { participants: { user: userId } }, $inc: { participantCount: -1 } }
    );
    return result.modifiedCount === 1;
};

const TeachSession = mongoose.model("TeachSession", teachSessionSchema);

TeachSession.OPTIONS = { CATEGORIES, LEVELS, MODES, DURATIONS, ACTIVITIES, REWARDS };

module.exports = TeachSession;