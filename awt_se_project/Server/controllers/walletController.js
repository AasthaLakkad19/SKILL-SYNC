const Wallet = require("../Models/Wallet");


// ============================================================
// DEFAULT USER
// ============================================================

const DEFAULT_USER_ID = "demo-user";


// ============================================================
// GET WALLET
// ============================================================

exports.getWallet = async (req, res) => {

  try {

    const userId =
      req.params.userId || DEFAULT_USER_ID;


    // Find wallet
    let wallet = await Wallet.findOne({
      userId: userId
    });


    // ========================================================
    // CREATE WALLET FOR NEW USER
    // ========================================================

    if (!wallet) {

      wallet = await Wallet.create({

        userId: userId,

        // New users get 5 Skill Tokens
        balance: 5,

        totalEarned: 5,

        totalSpent: 0,

        transactions: [

          {
            type: "earn",

            title: "Welcome Bonus",

            category: "Bonus",

            amount: 5,

            date: formatDate(new Date())
          }

        ]

      });

    }


    // ========================================================
    // RESPONSE
    // ========================================================

    res.status(200).json({

      success: true,

      wallet: {

        userId: wallet.userId,

        // IMPORTANT:
        // Current Skill Token balance
        balance: wallet.balance,

        totalEarned: wallet.totalEarned,

        totalSpent: wallet.totalSpent,

        transactions: wallet.transactions

      }

    });

  }

  catch (error) {

    console.error(
      "GET WALLET ERROR:",
      error
    );


    res.status(500).json({

      success: false,

      message: "Failed to fetch wallet",

      error: error.message

    });

  }

};



// ============================================================
// EARN TOKENS
// ============================================================

exports.earnTokens = async (req, res) => {

  try {

    const {
      userId,
      amount,
      title,
      category
    } = req.body;


    // ========================================================
    // VALIDATION
    // ========================================================

    if (
      !userId ||
      amount === undefined ||
      amount === null ||
      Number(amount) <= 0
    ) {

      return res.status(400).json({

        success: false,

        message: "Invalid wallet data"

      });

    }


    const tokenAmount =
      Number(amount);


    // ========================================================
    // FIND WALLET
    // ========================================================

    const wallet =
      await Wallet.findOne({
        userId: userId
      });


    if (!wallet) {

      return res.status(404).json({

        success: false,

        message: "Wallet not found"

      });

    }


    // ========================================================
    // UPDATE BALANCE
    // ========================================================

    wallet.balance += tokenAmount;

    wallet.totalEarned += tokenAmount;


    // ========================================================
    // ADD TRANSACTION
    // ========================================================

    wallet.transactions.push({

      type: "earn",

      title:
        title || "Earned Skill Tokens",

      category:
        category || "Teaching",

      amount: tokenAmount,

      date:
        formatDate(new Date())

    });


    // ========================================================
    // SAVE
    // ========================================================

    await wallet.save();


    // ========================================================
    // RESPONSE
    // ========================================================

    res.status(200).json({

      success: true,

      message:
        `${tokenAmount} Skill Tokens earned`,

      wallet

    });

  }

  catch (error) {

    console.error(
      "EARN TOKENS ERROR:",
      error
    );


    res.status(500).json({

      success: false,

      message: "Failed to earn tokens",

      error: error.message

    });

  }

};



// ============================================================
// SPEND TOKENS
// ============================================================

exports.spendTokens = async (req, res) => {

  try {

    const {
      userId,
      amount,
      title,
      category
    } = req.body;


    // ========================================================
    // VALIDATION
    // ========================================================

    if (
      !userId ||
      amount === undefined ||
      amount === null ||
      Number(amount) <= 0
    ) {

      return res.status(400).json({

        success: false,

        message: "Invalid wallet data"

      });

    }


    const tokenAmount =
      Number(amount);


    // ========================================================
    // FIND WALLET
    // ========================================================

    const wallet =
      await Wallet.findOne({
        userId: userId
      });


    if (!wallet) {

      return res.status(404).json({

        success: false,

        message: "Wallet not found"

      });

    }


    // ========================================================
    // CHECK BALANCE
    // ========================================================

    if (
      wallet.balance < tokenAmount
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Insufficient Skill Tokens"

      });

    }


    // ========================================================
    // UPDATE BALANCE
    // ========================================================

    wallet.balance -= tokenAmount;

    wallet.totalSpent += tokenAmount;


    // ========================================================
    // ADD TRANSACTION
    // ========================================================

    wallet.transactions.push({

      type: "spend",

      title:
        title || "Learning Session",

      category:
        category || "Learning",

      amount: tokenAmount,

      date:
        formatDate(new Date())

    });


    // ========================================================
    // SAVE
    // ========================================================

    await wallet.save();


    // ========================================================
    // RESPONSE
    // ========================================================

    res.status(200).json({

      success: true,

      message:
        `${tokenAmount} Skill Tokens spent`,

      wallet

    });

  }

  catch (error) {

    console.error(
      "SPEND TOKENS ERROR:",
      error
    );


    res.status(500).json({

      success: false,

      message:
        "Failed to spend tokens",

      error: error.message

    });

  }

};



// ============================================================
// GET TRANSACTIONS
// ============================================================

exports.getTransactions = async (
  req,
  res
) => {

  try {

    const userId =
      req.params.userId;


    const wallet =
      await Wallet.findOne({
        userId: userId
      });


    if (!wallet) {

      return res.status(404).json({

        success: false,

        message: "Wallet not found"

      });

    }


    res.status(200).json({

      success: true,

      transactions:
        wallet.transactions

    });

  }

  catch (error) {

    console.error(
      "GET TRANSACTIONS ERROR:",
      error
    );


    res.status(500).json({

      success: false,

      message:
        "Failed to fetch transactions",

      error: error.message

    });

  }

};



// ============================================================
// DATE FORMAT
// ============================================================

function formatDate(date) {

  const months = [

    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",

    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"

  ];


  return (

    String(
      date.getDate()
    ).padStart(2, "0")

    + " "

    + months[
      date.getMonth()
    ]

    + " "

    + date.getFullYear()

  );

}