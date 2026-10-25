const mongoose = require("mongoose");

// "Invite" button on the Collaborators list
const invitationSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    fromUserId: { type: String, required: true, index: true },
    toUserId: { type: String, required: true, index: true },
    role: { type: String, trim: true, maxlength: 40, default: "Contributor" },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending"
    }
  },
  { timestamps: true }
);

// Only one pending invite per project and person
invitationSchema.index(
  { projectId: 1, toUserId: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

module.exports = mongoose.model("Invitation", invitationSchema);
