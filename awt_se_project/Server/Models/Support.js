const mongoose = require("mongoose");

const supportSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        type: { type: String, enum: ["bug", "contact"], required: true },
        subject: { type: String, required: true, trim: true, maxlength: 120 },
        message: { type: String, required: true, trim: true, maxlength: 2000 },
        status: { type: String, enum: ["open", "resolved"], default: "open" }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Support", supportSchema);
