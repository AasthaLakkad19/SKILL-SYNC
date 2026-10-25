// =====================================================
// Below: state & functions for the after-login dashboard
// home page (firstLogin.html), merged into HomeController
// so both "home" pages share one controller.
// =====================================================
app.controller("HomeController", function ($scope, $http) {
  // ---------- User state ----------
  $scope.tokens = 5;
  $scope.profileProgress = 0;

  // ==============================
  // LOGGED-IN USER
  // ==============================
  $scope.currentUser = {
    name: "User",
    email: "",
    initial: "U",
  };

  var savedUser = localStorage.getItem("skillsync_user");

  if (savedUser) {
    try {
      var userData = JSON.parse(savedUser);

      $scope.currentUser.name = userData.name || "User";
      $scope.currentUser.email = userData.email || "";

      // First letter of person's name
      $scope.currentUser.initial = $scope.currentUser.name
        .charAt(0)
        .toUpperCase();

      // Use saved token balance
      $scope.tokens = userData.freeTokens || 5;
    } catch (error) {
      console.error("Error reading user data:", error);
    }
  }

  $scope.sidebarOpen = false;
  $scope.profileOpen = false;

  // =====================================================
  // PROFILE COMPLETION FROM RESUME PROFILE
  // =====================================================

  $scope.loadProfileCompletion = function () {
    $http
      .get("/api/resume")
      .then(function (res) {
        if (res.data) {
          var resume = res.data;

          var score = 0;

          // Personal Information - 20%
          if (
            resume.personalInfo &&
            resume.personalInfo.fullName &&
            resume.personalInfo.email
          ) {
            score += 20;
          }

          // Education - 15%
          if (resume.education && resume.education.length > 0) {
            score += 15;
          }

          // Skills - 20%
          if (
            resume.skills &&
            ((resume.skills.technical && resume.skills.technical.length > 0) ||
              (resume.skills.tools && resume.skills.tools.length > 0))
          ) {
            score += 20;
          }

          // Experience - 15%
          if (resume.experience && resume.experience.length > 0) {
            score += 15;
          }

          // Projects - 15%
          if (resume.projects && resume.projects.length > 0) {
            score += 15;
          }

          // Certifications - 10%
          if (resume.certifications && resume.certifications.length > 0) {
            score += 10;
          }

          // Achievements - 5%
          if (resume.achievements && resume.achievements.length > 0) {
            score += 5;
          }

          $scope.profileProgress = score;
        } else {
          $scope.profileProgress = 0;
        }
      })
      .catch(function (err) {
        console.error("Error loading profile completion:", err);

        $scope.profileProgress = 0;
      });
  };

  // Load profile completion when dashboard opens
  $scope.loadProfileCompletion();

  // Real token balance from the user's wallet (same source as Wallet page)
  $http.get("/api/wallet").then(function (res) {
    if (res.data && res.data.success) {
      $scope.tokens = res.data.wallet.balance;
    }
  });

  // ---------- Popular skills shown on the dashboard home page ----------
  $scope.popularSkills = [
    { name: "Python", icon: "🐍", students: 128 },
    { name: "HTML & CSS", icon: "🌐", students: 96 },
    { name: "Figma", icon: "🎨", students: 74 },
    { name: "Artificial Intelligence", icon: "🤖", students: 61 },
    { name: "React", icon: "⚛️", students: 88 },
    { name: "Java", icon: "☕", students: 53 },
    { name: "C++", icon: "💻", students: 47 },
  ];

  // ---------- Sidebar toggle (mobile) ----------
  $scope.toggleSidebar = function () {
    $scope.sidebarOpen = !$scope.sidebarOpen;
  };

  // ---------- Profile dropdown ----------
  $scope.toggleProfileMenu = function () {
    $scope.profileOpen = !$scope.profileOpen;
  };

  // ---------- Navigation helpers ----------
  $scope.goToLearn = function () {
    window.location.href = "learnSkills.html";
  };

  $scope.goToTeach = function () {
    window.location.href = "teachSkills.html";
  };

  $scope.goToTeam = function () {
    window.location.href = "findTeam.html";
  };

  $scope.goToProfile = function () {
    window.location.href = "buildResume.html";
  };

  $scope.goToProjects = function () {
    window.location.href = "projects.html";
  };

  $scope.learnSkill = function (skill) {
    window.location.href =
      "learnSkills.html?skill=" + encodeURIComponent(skill.name);
  };

  // ---------- Sign out ----------
  $scope.logout = function () {
    localStorage.removeItem("skillsync_token");
    localStorage.removeItem("skillsync_user");

    window.location.href = "index.html";
  };

  // Close the profile dropdown when clicking outside of it
  document.addEventListener("click", function (event) {
    var menu = document.querySelector(".profile-menu");
    if (menu && !menu.contains(event.target)) {
      $scope.$apply(function () {
        $scope.profileOpen = false;
      });
    }
  });
});
