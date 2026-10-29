app.controller("WalletController", function ($scope, $http, $interval) {
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
  // EARN  -> my own published (open) teaching sessions. Every learner who
  //          joins one pays me its price right away. Real data only.
  // ============================================================

  $scope.openSessions = [];

  $scope.earnLoaded = false;

  $scope.loadOpenSessions = function () {
    $http
      .get("/api/teach/sessions")

      .then(function (response) {
        $scope.openSessions = (response.data.sessions || []).filter(function (s) {
          return s.status === "published";
        });
      })

      .catch(function (error) {
        console.error("Failed to load teaching sessions:", error);
      })

      .finally(function () {
        $scope.earnLoaded = true;
      });
  };

  $scope.modeIcon = function (mode) {
    return {
      "Live online": "📡",
      "In person on campus": "📍",
      "Recorded mini lesson": "🎬",
      "Pair programming": "👩‍💻",
      "Quiz / practice session": "🧠"
    }[mode] || "🎓";
  };

  // ============================================================
  // SPEND  -> real sessions other students are teaching, cheapest first,
  //           with the token price you would pay to join
  // ============================================================

  $scope.learnOptions = [];

  $scope.spendLoaded = false;

  $scope.loadLearnOptions = function () {
    $http
      .get("/api/teach/discover", { params: { limit: 60 } })

      .then(function (response) {
        $scope.learnOptions = (response.data.sessions || [])
          .sort(function (a, b) { return a.reward - b.reward; })
          .slice(0, 4);
      })

      .catch(function (error) {
        console.error("Failed to load sessions:", error);
      })

      .finally(function () {
        $scope.spendLoaded = true;
      });
  };

  // ============================================================
  // INITIALIZE
  // ============================================================

  $scope.loadWallet();

  $scope.loadOpenSessions();

  $scope.loadLearnOptions();

  // Tokens can change while this page is open (a learner joins my session, or the
  // header refreshed the balance): reload the numbers + history.
  $scope.$on("wallet:changed", function () {
    $scope.loadWallet();
    $scope.loadOpenSessions();
  });

  var refresh = $interval(function () {
    if (!document.hidden) $scope.loadWallet();
  }, 30 * 1000);

  $scope.$on("$destroy", function () {
    $interval.cancel(refresh);
  });
});
