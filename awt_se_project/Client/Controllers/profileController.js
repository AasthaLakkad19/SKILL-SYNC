angular.module("skillSyncApp").controller("ProfileController", [
  "$scope",
  "$window",
  "$http",

  function ($scope, $window, $http) {

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

    $scope.isOwnProfile = true;

    $scope.loading = true;

    $scope.error = "";


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

        url:
          "/api/profile/me",})


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


        $scope.error =
          "Unable to connect to server.";

      })


      .finally(function () {

        $scope.loading = false;

      });

    };


    // ==========================================
    // CONNECT
    // ==========================================

    $scope.connect = function () {

      alert(
        "Connection request sent to " +
        $scope.profile.name +
        "!"
      );

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

  }

]);