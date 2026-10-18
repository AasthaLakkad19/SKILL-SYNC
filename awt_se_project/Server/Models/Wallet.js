const mongoose = require("mongoose");

// ============================================================
// TRANSACTION SCHEMA
// ============================================================

const transactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["earn", "spend"],
      required: true
    },

    title: {
      type: String,
      required: true
    },

    category: {
      type: String,
      required: true
    },

    amount: {
      type: Number,
      required: true,
      min: 0
    },

    date: {
      type: String,
      required: true
    }
  }
);


// ============================================================
// WALLET SCHEMA
// ============================================================

const walletSchema = new mongoose.Schema(
  {
    // User ID
    userId: {
      type: String,
      required: true,
      unique: true
    },

    // Current Skill Token balance
    // This is the MAIN Skill Token value
    balance: {
      type: Number,
      default: 5,
      min: 0
    },

    // Total tokens earned
    totalEarned: {
      type: Number,
      default: 0,
      min: 0
    },

    // Total tokens spent
    totalSpent: {
      type: Number,
      default: 0,
      min: 0
    },

    // Transaction history
    transactions: {
      type: [transactionSchema],
      default: []
    }
  },
  {
    timestamps: true
  }
);


module.exports = mongoose.model("Wallet", walletSchema);