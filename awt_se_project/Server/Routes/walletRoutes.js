const express = require("express");
const router = express.Router();
const { protect } = require("../Middleware/auth");
const { getWallet, spendTokens, getTransactions } = require("../controllers/walletController");

router.use(protect);

// The wallet always belongs to the logged-in user (no userId in the URL).
router.get("/", getWallet);
router.get("/transactions", getTransactions);
router.post("/spend", spendTokens);

// NOTE: there is intentionally no public "earn" route. Tokens must only be
// awarded by the server (see awardTokens in walletController) after a real
// action such as completing a teaching session.

module.exports = router;
