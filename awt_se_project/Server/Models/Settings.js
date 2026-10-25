const mongoose = require("mongoose");

const loginActivitySchema = new mongoose.Schema(
    {
        ip: String,
        device: String,
        at: { type: Date, default: Date.now }
    },
    { _id: false }
);

const settingsSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true
        },

        // Privacy
        profileVisibility: { type: String, enum: ["everyone", "users", "connections"], default: "everyone" },
        profileView:       { type: String, enum: ["everyone", "users", "connections"], default: "everyone" },
        showEmail:  { type: Boolean, default: false },
        showPhone:  { type: Boolean, default: false },
        twoFactor:  { type: Boolean, default: false },

        // Notifications
        emailNotifications:      { type: Boolean, default: true },
        skillMatchNotifications: { type: Boolean, default: true },
        messageNotifications:    { type: Boolean, default: true },
        projectNotifications:    { type: Boolean, default: true },
        tokenNotifications:      { type: Boolean, default: false },

        // Appearance
        theme: { type: String, enum: ["light", "dark", "system"], default: "system" },

        // Tokens
        autoTokenUse:      { type: Boolean, default: true },
        tokenConfirmation: { type: Boolean, default: false },
        projectTokenUse:   { type: Boolean, default: true },

        // Communication
        allowConnections: { type: Boolean, default: true },
        allowProjects:    { type: Boolean, default: true },
        allowNewMessages: { type: Boolean, default: false },

        loginActivity: { type: [loginActivitySchema], default: [] }
    },
    { timestamps: true }
);

// Fields the client may update (whitelist)
settingsSchema.statics.ENUMS = {
    profileVisibility: ["everyone", "users", "connections"],
    profileView: ["everyone", "users", "connections"],
    theme: ["light", "dark", "system"]
};
settingsSchema.statics.BOOLEANS = [
    "emailNotifications", "skillMatchNotifications", "messageNotifications",
    "projectNotifications", "tokenNotifications", "showEmail", "showPhone",
    "twoFactor", "autoTokenUse", "tokenConfirmation", "projectTokenUse",
    "allowConnections", "allowProjects", "allowNewMessages"
];

module.exports = mongoose.model("Settings", settingsSchema);