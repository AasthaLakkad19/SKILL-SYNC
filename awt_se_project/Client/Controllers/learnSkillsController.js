// Learn Skills: everything here comes from the database.
//   - "Student sessions"  = sessions other students published on Teach Skills
//   - "My learning"       = sessions I joined (I paid the price, the teacher got it)
angular.module("skillSyncApp").controller("LearnSkillsController", [
  "$scope",
  "$http",
  "$window",
  "$interval",
  "$timeout",
  function ($scope, $http, $window, $interval, $timeout) {
    var POLL_MS = 60 * 1000;

    /* ---------- Page state ---------- */
    $scope.sidebarOpen = false;
    $scope.tab = "learning"; // "learning" | "completed"
    $scope.toast = "";
    $scope.loading = true;
    $scope.loadError = "";

    $scope.categories = ["All", "Programming", "Design", "Data", "Career", "Other"];
    $scope.filters = { query: "", category: "All", sort: "new" };

    $scope.tokens = 0;
    $scope.sessions = []; // other students' open sessions
    $scope.joined = []; // sessions I joined

    /* ---------- helpers ---------- */
    var toastTimer = null;
    function notify(message) {
      $scope.toast = message;
      if (toastTimer) $timeout.cancel(toastTimer);
      toastTimer = $timeout(function () {
        $scope.toast = "";
      }, 3200);
    }

    function failed(err, fallback) {
      if (err && err.status === 401) return; // app.js sends the person to the login page
      $scope.loadError = (err && err.data && err.data.message) || fallback;
    }

    /* ---------- Loading ---------- */
    function loadWallet() {
      return $http.get("/api/wallet").then(function (r) {
        if (r.data && r.data.wallet) $scope.tokens = r.data.wallet.balance;
      });
    }

    function loadSessions() {
      return $http.get("/api/teach/discover", { params: { limit: 60 } }).then(function (r) {
        $scope.sessions = r.data.sessions || [];
      });
    }

    function loadJoined() {
      return $http.get("/api/teach/joined").then(function (r) {
        $scope.joined = r.data.sessions || [];
      });
    }

    function loadAll(initial) {
      $scope.loadError = "";
      return Promise.all([
        loadSessions().catch(function (e) { failed(e, "Couldn't load student sessions."); }),
        loadJoined().catch(function (e) { failed(e, "Couldn't load your sessions."); }),
        loadWallet().catch(function () {}),
      ]).then(function () {
        $scope.loading = false;
        $scope.$applyAsync();
      });
    }
    loadAll(true);

    // keep LIVE badges and balances fresh
    var timer = $interval(function () {
      if (!$window.document.hidden) loadAll();
    }, POLL_MS);
    $scope.$on("$destroy", function () { $interval.cancel(timer); });
    // the bell accepted something / a page elsewhere changed tokens
    $scope.$on("connections:changed", function () { loadWallet(); });

    /* ---------- Filtering ---------- */
    // Teach Skills uses its own category names; map them onto this page's chips.
    var CATEGORY_MAP = {
      "Web Development": "Programming",
      "Programming": "Programming",
      "Design & Creativity": "Design",
      "Data & AI": "Data",
      "Career & Communication": "Career",
    };
    function chipFor(session) {
      return CATEGORY_MAP[session.category] || "Other";
    }

    var joinedIds = {};
    function rebuildJoinedIds() {
      joinedIds = {};
      $scope.joined.forEach(function (j) { joinedIds[j.id] = true; });
    }
    $scope.$watchCollection("joined", rebuildJoinedIds);

    $scope.isJoined = function (s) {
      return !!joinedIds[s.id];
    };

    $scope.visibleSessions = function () {
      var q = ($scope.filters.query || "").toLowerCase().trim();
      var list = $scope.sessions.filter(function (s) {
        var inCategory = $scope.filters.category === "All" || chipFor(s) === $scope.filters.category;
        var haystack = [s.title, s.skill, s.category, s.teacher, s.description, s.mode, s.level]
          .join(" ")
          .toLowerCase();
        return inCategory && (!q || haystack.indexOf(q) !== -1);
      });

      var sort = $scope.filters.sort;
      if (sort === "price") {
        list.sort(function (a, b) { return a.reward - b.reward; });
      } else if (sort === "learners") {
        list.sort(function (a, b) { return (b.participantCount || 0) - (a.participantCount || 0); });
      }
      // "new" keeps the server order: live classes first, then newest
      return list;
    };

    $scope.myLearning = function () {
      var wantCompleted = $scope.tab === "completed";
      return $scope.joined.filter(function (j) {
        return wantCompleted ? j.status === "completed" : j.status !== "completed";
      });
    };

    $scope.countBy = function (tab) {
      return $scope.joined.filter(function (j) {
        return tab === "completed" ? j.status === "completed" : j.status !== "completed";
      }).length;
    };

    $scope.resetFilters = function () {
      $scope.filters = { query: "", category: "All", sort: "new" };
    };

    /* ---------- Display ---------- */
    $scope.modeIcon = function (mode) {
      return {
        "Live online": "📡",
        "In person on campus": "📍",
        "Recorded mini lesson": "🎬",
        "Pair programming": "👩‍💻",
        "Quiz / practice session": "🧠",
      }[mode] || "🎓";
    };

    $scope.canAfford = function (s) {
      return $scope.tokens >= s.reward;
    };

    /* ---------- Open a session (the page there shows the price + Join button) ---------- */
    $scope.openSession = function (s) {
      $window.location.href = "teachSession.html?id=" + encodeURIComponent(s.id);
    };

    $scope.toggleSidebar = function () {
      $scope.sidebarOpen = !$scope.sidebarOpen;
    };
  },
]);
