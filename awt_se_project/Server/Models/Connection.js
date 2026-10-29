const mongoose = require("mongoose");

// One document per PAIR of users, so two people can never have two
// competing requests. `pairKey` is the two ids sorted and joined.
const connectionSchema = new mongoose.Schema(
  {
    pairKey: { type: String, required: true, unique: true },

    // Who sent the (latest) request, and who has to answer it
    requesterId: { type: String, required: true, index: true },
    recipientId: { type: String, required: true, index: true },

    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending"
    },

    // Used for the re-request cooldown after a decline
    declinedAt: { type: Date, default: null },

    // false = the requester has not yet seen that their request was accepted
    // (drives the "X accepted your request" notification + bell badge)
    responseSeen: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Connection", connectionSchema);
