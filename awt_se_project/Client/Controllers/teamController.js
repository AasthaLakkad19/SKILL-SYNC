angular.module("skillSyncApp").controller("TeammateController", [
  "$scope",
  "$window",
  "$http",
  "$timeout",
  function ($scope, $window, $http, $timeout) {
    var API = "/api/teammates";

    // ---- Sidebar (same behaviour as the home page) ----
    $scope.sidebarOpen = false;
    $scope.toggleSidebar = function () {
      $scope.sidebarOpen = !$scope.sidebarOpen;
    };

    // ---- State ----
    $scope.filters = {
      search: "",
      skill: "all",
      interest: "all",
      availability: "all",
    };
    $scope.teammates = [];
    $scope.loaded = false;
    $scope.notice = "";
    $scope.busyId = null; // teammate whose Connect request is running

    // ---- HTTP helpers ----
    function authConfig() {
      return {
        headers: { Authorization: "Bearer " + localStorage.getItem("skillsync_token") },
      };
    }

    function say(message) {
      $scope.notice = message;
      $timeout(function () {
        $scope.notice = "";
      }, 3000);
    }

    function handleError(err) {
      if (err.status === 401) {
        $window.location.href = "login.html";
        return;
      }
      say((err.data && err.data.message) || "Something went wrong. Please try again.");
    }

    // ---- Load (filtering below stays instant and client-side) ----
    function loadTeammates() {
      return $http
        .get(API + "?limit=100", authConfig())
        .then(function (res) {
          $scope.teammates = res.data.teammates;
        })
        .catch(handleError)
        .finally(function () {
          $scope.loaded = true;
        });
    }
    loadTeammates();

    // The bell in the header accepted / declined a request -> refresh the buttons
    $scope.$on("connections:changed", loadTeammates);

    // ---- Filtering (used by: teammates | filter:matchesFilters) ----
    // Same rules as the server's matchesFilters().
    $scope.matchesFilters = function (t) {
      var f = $scope.filters;
      var skills = t.skills.map(function (s) {
        return s.toLowerCase();
      });
      var text = (f.search || "").trim().toLowerCase();

      var matchesText =
        !text ||
        t.name.toLowerCase().indexOf(text) !== -1 ||
        skills.some(function (s) {
          return s.indexOf(text) !== -1;
        });

      var matchesSkill = f.skill === "all" || skills.indexOf(f.skill) !== -1;
      var matchesInterest = f.interest === "all" || t.interest === f.interest;
      var matchesAvailability =
        f.availability === "all" || t.availability === f.availability;

      return (
        matchesText && matchesSkill && matchesInterest && matchesAvailability
      );
    };

    // ---- Actions ----
    $scope.viewProfile = function (t) {
      $window.location.href = "profile.html?userId=" + encodeURIComponent(t.id);
    };

    $scope.connectLabel = function (t) {
      return (
        {
          none: "Connect",
          requested: "Requested ✓",
          incoming: "Accept request",
          connected: "Connected ✓",
        }[t.connection] || "Connect"
      );
    };

    function applyConnection(t, state) {
      t.connection = state;
      t.connected = state !== "none";
    }

    // One button, four states:
    //   none -> send request    requested -> cancel it
    //   incoming -> accept      connected -> remove (asks first)
    $scope.connect = function (t) {
      if ($scope.busyId) return;

      var url = API + "/" + t.id + "/connect";
      var request;

      if (t.connection === "connected") {
        if (!$window.confirm("Remove your connection with " + t.name + "?")) return;
        request = $http.delete(url, authConfig());
      } else if (t.connection === "requested") {
        request = $http.delete(url, authConfig());
      } else {
        request = $http.put(url, {}, authConfig());
      }

      $scope.busyId = t.id;
      request
        .then(function (res) {
          applyConnection(t, res.data.connection);
          say(res.data.message);
        })
        .catch(handleError)
        .finally(function () {
          $scope.busyId = null;
        });
    };
  },
]);
