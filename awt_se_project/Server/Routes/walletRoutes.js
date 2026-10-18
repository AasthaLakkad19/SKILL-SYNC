const express = require("express");

const router = express.Router();


// ============================================================
// CONTROLLER
// ============================================================

const {

  getWallet,

  earnTokens,

  spendTokens,

  getTransactions

} = require("../controllers/walletController");


// ============================================================
// GET WALLET
// ============================================================

// Example:
// GET /api/wallet/demo-user

router.get(
  "/:userId",
  getWallet
);


// ============================================================
// GET TRANSACTIONS
// ============================================================

// Example:
// GET /api/wallet/demo-user/transactions

router.get(
  "/:userId/transactions",
  getTransactions
);


// ============================================================
// EARN TOKENS
// ============================================================

// POST /api/wallet/earn

router.post(
  "/earn",
  earnTokens
);


// ============================================================
// SPEND TOKENS
// ============================================================

// POST /api/wallet/spend

router.post(
  "/spend",
  spendTokens
);


module.exports = router;