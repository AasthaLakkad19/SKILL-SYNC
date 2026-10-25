app.controller("WalletController", function ($scope, $http) {
  // ============================================================
  // USER
  // ============================================================


  // ============================================================
  // UI STATE
  // ============================================================

  $scope.sidebarOpen = false;

  $scope.toggleSidebar = function () {
    $scope.sidebarOpen = !$scope.sidebarOpen;
  };

  $scope.profileOpen = false;

  $scope.toggleProfileMenu = function () {
    $scope.profileOpen = !$scope.profileOpen;
  };

  // ============================================================
  // WALLET NUMBERS
  // ============================================================

  $scope.balance = 0;

  $scope.totalEarned = 0;

  $scope.totalSpent = 0;

  // ============================================================
  // TRANSACTIONS
  // ============================================================

  $scope.transactions = [];

  // ============================================================
  // LOAD WALLET
  // ============================================================

  $scope.loadWallet = function () {
    $http
      .get("/api/wallet")

      .then(function (response) {
        if (response.data.success) {
          var wallet = response.data.wallet;

          $scope.balance = wallet.balance;

          $scope.totalEarned = wallet.totalEarned;

          $scope.totalSpent = wallet.totalSpent;

          $scope.transactions = wallet.transactions;
        }
      })

      .catch(function (error) {
        console.error("Failed to load wallet:", error);
      });
  };

  // ============================================================
  // TRANSACTION FILTERS
  // ============================================================

  $scope.txFilters = ["All", "Earned", "Spent"];

  $scope.selectedTxFilter = "All";

  $scope.setTxFilter = function (filter) {
    $scope.selectedTxFilter = filter;
  };

  $scope.filteredTransactions = function () {
    if ($scope.selectedTxFilter === "All") {
      return $scope.transactions;
    }

    if ($scope.selectedTxFilter === "Earned") {
      return $scope.transactions.filter(function (transaction) {
        return transaction.type === "earn";
      });
    }

    return $scope.transactions.filter(function (transaction) {
      return transaction.type === "spend";
    });
  };

  // ============================================================
  // SPEND TOKENS
  // ============================================================
  $scope.spendTokens = function (amount, title, category) {
    $http
      .post("/api/wallet/spend", {
        amount: Number(amount),
        title: title,
        category: category,
      })

      .then(function (response) {
        if (response.data.success) {
          // Reload latest wallet from database
          $scope.loadWallet();
        }
      })

      .catch(function (error) {
        alert((error.data && error.data.message) || "Failed to spend tokens");
      });
  };
  // ============================================================
  // EARN TASKS
  // ============================================================

  $scope.earnTasks = [
    {
      icon: "🎓",
      title: "Teach a skill",
      description: "Host a 1-hour session",
      reward: 4,
    },

    {
      icon: "🔥",
      title: "7-day teaching streak",
      description: "Teach every day for a week",
      reward: 5,
    },

    {
      icon: "👥",
      title: "Help 5 students",
      description: "Complete mentoring sessions",
      reward: 6,
    },

    {
      icon: "📄",
      title: "Share a resource",
      description: "Upload notes or a template",
      reward: 1,
    },
  ];

  // ============================================================
  // SPEND OPTIONS
  // ============================================================

  $scope.spendOptions = [
    {
      icon: "📚",
      title: "Beginner skill session",
      description: "1-hour guided learning",
      cost: 2,
    },

    {
      icon: "🚀",
      title: "Intermediate workshop",
      description: "Deep-dive session",
      cost: 3,
    },

    {
      icon: "⭐",
      title: "Premium skill track",
      description: "Full multi-day course",
      cost: 8,
    },

    {
      icon: "🎯",
      title: "1-on-1 mentoring",
      description: "Personal coaching call",
      cost: 5,
    },
  ];

  // ============================================================
  // INITIALIZE
  // ============================================================

  $scope.loadWallet();
});
