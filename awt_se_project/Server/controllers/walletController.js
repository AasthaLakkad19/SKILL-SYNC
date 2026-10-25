const Wallet = require("../Models/Wallet");

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDate(date) {
  return String(date.getDate()).padStart(2, "0") + " " + MONTHS[date.getMonth()] + " " + date.getFullYear();
}

// Gets the user's wallet, creating it with the 5-token welcome bonus if missing
async function ensureWallet(userId) {
  let wallet = await Wallet.findOne({ userId });
  if (wallet) return wallet;

  try {
    wallet = await Wallet.create({
      userId,
      balance: 5,
      totalEarned: 5,
      totalSpent: 0,
      transactions: [
        { type: "earn", title: "Welcome Bonus", category: "Bonus", amount: 5, date: formatDate(new Date()) }
      ]
    });
  } catch (err) {
    if (err.code !== 11000) throw err; // created by a parallel request
    wallet = await Wallet.findOne({ userId });
  }
  return wallet;
}

// Server-side helper for awarding tokens (e.g. when a teaching session is
// completed). NOT exposed as a public route, so users can't mint tokens.
async function awardTokens(userId, amount, title, category) {
  const tokens = Number(amount);
  if (!Number.isFinite(tokens) || tokens <= 0) throw new Error("Invalid token amount");

  userId = String(userId);
  await ensureWallet(userId);

  return Wallet.findOneAndUpdate(
    { userId },
    {
      $inc: { balance: tokens, totalEarned: tokens },
      $push: {
        transactions: {
          type: "earn",
          title: title || "Earned Skill Tokens",
          category: category || "Teaching",
          amount: tokens,
          date: formatDate(new Date())
        }
      }
    },
    { new: true }
  );
}

// GET /api/wallet   (logged-in user's wallet)
exports.getWallet = async (req, res) => {
  try {
    const wallet = await ensureWallet(String(req.user._id));
    res.status(200).json({
      success: true,
      wallet: {
        userId: wallet.userId,
        balance: wallet.balance,
        totalEarned: wallet.totalEarned,
        totalSpent: wallet.totalSpent,
        transactions: wallet.transactions
      }
    });
  } catch (error) {
    console.error("GET WALLET ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to fetch wallet", error: error.message });
  }
};

// POST /api/wallet/spend   (atomic: balance can never go below 0)
exports.spendTokens = async (req, res) => {
  try {
    const { amount, title, category } = req.body;
    const tokens = Number(amount);

    if (!Number.isFinite(tokens) || tokens <= 0) {
      return res.status(400).json({ success: false, message: "Invalid wallet data" });
    }

    const userId = String(req.user._id);
    await ensureWallet(userId);

    const wallet = await Wallet.findOneAndUpdate(
      { userId, balance: { $gte: tokens } },
      {
        $inc: { balance: -tokens, totalSpent: tokens },
        $push: {
          transactions: {
            type: "spend",
            title: title || "Learning Session",
            category: category || "Learning",
            amount: tokens,
            date: formatDate(new Date())
          }
        }
      },
      { new: true }
    );

    if (!wallet) {
      return res.status(400).json({ success: false, message: "Insufficient Skill Tokens" });
    }

    res.status(200).json({ success: true, message: `${tokens} Skill Tokens spent`, wallet });
  } catch (error) {
    console.error("SPEND TOKENS ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to spend tokens", error: error.message });
  }
};

// GET /api/wallet/transactions
exports.getTransactions = async (req, res) => {
  try {
    const wallet = await ensureWallet(String(req.user._id));
    res.status(200).json({ success: true, transactions: wallet.transactions });
  } catch (error) {
    console.error("GET TRANSACTIONS ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to fetch transactions", error: error.message });
  }
};

exports.awardTokens = awardTokens;
