angular.module("skillSyncApp").controller("ProfileController", [
  "$scope",
  "$window",
  "$http",
  "$timeout",

  function ($scope, $window, $http, $timeout) {

    // ==========================================
    // SIDEBAR
    // ==========================================

    $scope.sidebarOpen = false;

    $scope.toggleSidebar = function () {

      $scope.sidebarOpen =
        !$scope.sidebarOpen;

    };


    // ==========================================
    // PROFILE
    // ==========================================

    // profile.html            -> my profile
    // profile.html?userId=ID  -> that person's profile (View Profile / bell)
    var viewedUserId = (function () {
      try {
        return new URLSearchParams($window.location.search).get("userId") || "";
      } catch (e) {
        return "";
      }
    })();

    $scope.isOwnProfile = !viewedUserId;

    $scope.loading = true;

    $scope.error = "";

    $scope.notFound = false;

    $scope.notice = "";

    $scope.connecting = false;


    $scope.profile = {

      name: "",

      initial: "U",

      photoUrl: null,

      headline: "",

      bio: "",

      location: "",

      verified: false,

      availability: "offline",

      availabilityLabel: "",

      availabilityNote: "",


      education: {

        degree: "",

        school: "",

        years: "",

        detail: ""

      },


      socialLinks: [],


      stats: {

        skills: 0,

        projects: 0,

        achievements: 0,

        rating: 0,

        publicTokens: 0

      },


      // ======================================
      // WALLET DATA
      // ======================================

      tokenSummary: {

        balance: 0,

        earned: 0,

        spent: 0

      },


      skills: [],

      projects: [],

      achievements: [],

      reviews: []

    };


    // ==========================================
    // LOAD PROFILE
    // ==========================================

    $scope.loadProfile = function () {

      $scope.loading = true;

      $scope.error = "";


      $http({

        method: "GET",

        url: viewedUserId
          ? "/api/profile/" + encodeURIComponent(viewedUserId)
          : "/api/profile/me",})


      .then(function (response) {

        console.log(
          "Profile response:",
          response.data
        );


        if (
          response.data &&
          response.data.success &&
          response.data.profile
        ) {

          $scope.profile =
            response.data.profile;

          $scope.isOwnProfile =
            $scope.profile.isOwnProfile !== false;

          $scope.profile.connection =
            $scope.profile.connection || "none";


          // Safety defaults

          $scope.profile.skills =
            $scope.profile.skills || [];


          $scope.profile.projects =
            $scope.profile.projects || [];


          $scope.profile.achievements =
            $scope.profile.achievements || [];


          $scope.profile.reviews =
            $scope.profile.reviews || [];


          $scope.profile.socialLinks =
            $scope.profile.socialLinks || [];


          $scope.profile.tokenSummary =
            $scope.profile.tokenSummary || {

              balance: 0,

              earned: 0,

              spent: 0

            };


          $scope.profile.stats =
            $scope.profile.stats || {

              skills: 0,

              projects: 0,

              achievements: 0,

              rating: 0,

              publicTokens: 0

            };


          console.log(
            "Profile loaded:",
            $scope.profile
          );

        }

        else {

          $scope.error =
            "Profile could not be loaded.";

        }

      })


      .catch(function (error) {

        console.error(
          "Profile API Error:",
          error
        );

        if (error.status === 404) {

          $scope.notFound = true;

          $scope.error =
            "This profile doesn't exist or is no longer available.";

        }

        else if (error.status !== 401) {

          $scope.error =
            "Unable to connect to server.";

        }

      })


      .finally(function () {

        $scope.loading = false;

      });

    };


    // ==========================================
    // CONNECT  (same rules as the Find Teammates page)
    //   none -> send request     requested -> cancel it
    //   incoming -> accept       connected -> remove (asks first)
    // ==========================================

    function say(message) {

      $scope.notice = message;

      $timeout(function () {

        $scope.notice = "";

      }, 3000);

    }

    $scope.connectLabel = function () {

      return {

        none: "Connect",

        requested: "Requested ✓",

        incoming: "Accept request",

        connected: "Connected ✓"

      }[$scope.profile.connection] || "Connect";

    };

    $scope.connect = function () {

      if ($scope.connecting || $scope.isOwnProfile) return;

      var state = $scope.profile.connection;

      var url = "/api/teammates/" + $scope.profile.userId + "/connect";

      var request;

      if (state === "connected") {

        if (!$window.confirm("Remove your connection with " + $scope.profile.name + "?")) return;

        request = $http.delete(url);

      }

      else if (state === "requested") {

        request = $http.delete(url);

      }

      else {

        request = $http.put(url, {});

      }

      $scope.connecting = true;

      request

        .then(function (res) {

          $scope.profile.connection = res.data.connection;

          say(res.data.message);

          // keep the bell in the header up to date
          $scope.$root.$broadcast("connections:changed");

        })

        .catch(function (err) {

          if (err.status !== 401) {

            say((err.data && err.data.message) || "Something went wrong. Please try again.");

          }

        })

        .finally(function () {

          $scope.connecting = false;

        });

    };


    // ==========================================
    // MESSAGE
    // ==========================================

    $scope.message = function () {

      alert(
        "Opening conversation with " +
        $scope.profile.name +
        "..."
      );

    };


    // ==========================================
    // EDIT PROFILE
    // ==========================================

    $scope.editProfile = function () {

      $window.location.href =
        "settings.html";

    };


    // ==========================================
    // LOAD PROFILE
    // ==========================================

    $scope.loadProfile();

    // The bell accepted / declined a request -> refresh the Connect button
    $scope.$on("connections:changed", function () {

      if (!$scope.isOwnProfile && !$scope.connecting) {

        $http.get("/api/profile/" + encodeURIComponent(viewedUserId)).then(function (response) {

          if (response.data && response.data.profile) {

            $scope.profile.connection = response.data.profile.connection || "none";

          }

        });

      }

    });

  }

]);