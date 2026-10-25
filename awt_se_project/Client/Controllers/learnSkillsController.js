angular.module("skillSyncApp").controller("LearnSkillsController", [
  "$scope",
  "$timeout",
  "$filter",
  "$http",
  "$window",
  function ($scope, $timeout, $filter, $http, $window) {
    var API = "/api/learn";

    /* ---------- Page state ---------- */
    $scope.sidebarOpen = false;
    $scope.tab = "learning";
    $scope.selected = null;
    $scope.chosenTeacher = null;
    $scope.toast = "";
    $scope.loading = true;
    $scope.busy = false; // blocks double clicks while a request is running

    $scope.categories = ["All", "Programming", "Design", "Data", "Career"];
    $scope.filters = { query: "", category: "All", sort: "-rating" };

    $scope.tokens = 0;
    $scope.skills = [];
    $scope.myLearning = [];
    $scope.savedIds = [];
    $scope.recommendedSkills = [];

    /* ---------- HTTP helpers ---------- */
    function authConfig() {
      return {
        headers: { Authorization: "Bearer " + localStorage.getItem("skillsync_token") }
      };
    }

    function notify(message) {
      $scope.toast = message;
      $timeout(function () { $scope.toast = ""; }, 3000);
    }

    function handleError(err) {
      if (err.status === 401) {
        $window.location.href = "login.html";
        return;
      }
      notify((err.data && err.data.message) || "Something went wrong. Please try again.");
    }

    function findSkill(id) {
      return $scope.skills.filter(function (s) { return s.id === id; })[0];
    }

    function upsertSkill(updated) {
      for (var i = 0; i < $scope.skills.length; i++) {
        if ($scope.skills[i].id === updated.id) { $scope.skills[i] = updated; return; }
      }
    }

    /* ---------- Initial load ---------- */
    function loadPage() {
      $scope.loading = true;
      return Promise.all([
        $http.get(API + "/skills", authConfig()),
        $http.get(API + "/me", authConfig()),
        $http.get(API + "/recommended", authConfig())
      ])
        .then(function (r) {
          $scope.skills = r[0].data.skills;
          $scope.tokens = r[1].data.tokens;
          $scope.myLearning = r[1].data.myLearning;
          $scope.savedIds = r[1].data.savedIds;
          $scope.recommendedSkills = r[2].data.skills;
        })
        .catch(handleError)
        .finally(function () {
          $scope.loading = false;
          $scope.$applyAsync();
        });
    }
    loadPage();

    function refreshRecommended() {
      $http.get(API + "/recommended", authConfig()).then(function (r) {
        $scope.recommendedSkills = r.data.skills;
      });
    }

    /* ---------- Lists used by the page ---------- */
    $scope.recommended = function () {
      return $scope.recommendedSkills;
    };

    $scope.visibleSkills = function () {
      var q = ($scope.filters.query || "").toLowerCase().trim();
      var list = $scope.skills.filter(function (s) {
        var inCategory = $scope.filters.category === "All" || s.category === $scope.filters.category;
        var matches =
          !q ||
          s.name.toLowerCase().indexOf(q) !== -1 ||
          s.category.toLowerCase().indexOf(q) !== -1 ||
          s.teachers.some(function (t) { return t.name.toLowerCase().indexOf(q) !== -1; });
        return inCategory && matches;
      });
      return $filter("orderBy")(list, $scope.filters.sort);
    };

    $scope.resetFilters = function () {
      $scope.filters.query = "";
      $scope.filters.category = "All";
    };

    /* ---------- Skill details ---------- */
    $scope.openSkill = function (skill) {
      $scope.selected = skill;
      $scope.chosenTeacher = null;
    };
    $scope.closeSkill = function () {
      $scope.selected = null;
    };

    /* ---------- Saving ---------- */
    $scope.isSaved = function (skill) {
      return $scope.savedIds.indexOf(skill.id) !== -1;
    };

    $scope.toggleSave = function (skill) {
      var saved = $scope.isSaved(skill);
      var request = saved
        ? $http.delete(API + "/saved/" + skill.id, authConfig())
        : $http.put(API + "/saved/" + skill.id, {}, authConfig());

      request
        .then(function (res) {
          if (saved) $scope.savedIds.splice($scope.savedIds.indexOf(skill.id), 1);
          else $scope.savedIds.push(skill.id);
          notify(res.data.message);
        })
        .catch(handleError);
    };

    $scope.savedSkills = function () {
      return $scope.skills.filter(function (s) { return $scope.isSaved(s); });
    };

    /* ---------- Learning flow ---------- */
    $scope.isEnrolled = function (skill) {
      return $scope.myLearning.some(function (m) {
        return m.skillId === skill.id && m.status === "learning";
      });
    };

    $scope.requestToLearn = function () {
      var s = $scope.selected;
      if (!s || !$scope.chosenTeacher || $scope.busy) return;
      if ($scope.tokens < s.tokens) {
        notify("You need " + s.tokens + " tokens to learn " + s.name + ".");
        return;
      }
      if ($scope.isEnrolled(s)) return;

      $scope.busy = true;
      $http
        .post(API + "/enroll", { skillId: s.id, teacherName: $scope.chosenTeacher.name }, authConfig())
        .then(function (res) {
          $scope.tokens = res.data.tokens; // server is the source of truth
          $scope.myLearning.push(res.data.enrollment);
          s.learners += 1;
          notify(res.data.message);
          $scope.tab = "learning";
          $scope.closeSkill();
          refreshRecommended();
        })
        .catch(handleError)
        .finally(function () { $scope.busy = false; });
    };

    $scope.addProgress = function (item) {
      if (item.progress >= 100) return;
      $http
        .post(API + "/enrollments/" + item.skillId + "/progress", {}, authConfig())
        .then(function (res) {
          item.progress = res.data.enrollment.progress;
          if (res.data.allLessonsDone) notify("All lessons done. You can complete this skill.");
        })
        .catch(handleError);
    };

    $scope.completeSkill = function (item) {
      if (item.progress < 100) {
        notify("Finish all lessons before completing " + item.name + ".");
        return;
      }
      $http
        .post(API + "/enrollments/" + item.skillId + "/complete", {}, authConfig())
        .then(function (res) {
          item.status = "completed";
          $scope.tab = "completed";
          notify(res.data.message);
          refreshRecommended();
        })
        .catch(handleError);
    };

    /* Optional: call from a review form for completed skills */
    $scope.submitReview = function (item, rating, text) {
      return $http
        .post(API + "/skills/" + item.skillId + "/reviews", { rating: rating, text: text }, authConfig())
        .then(function (res) {
          upsertSkill(res.data.skill);
          notify("Thanks for your review!");
        })
        .catch(handleError);
    };

    $scope.countBy = function (status) {
      return $scope.myLearning.filter(function (m) { return m.status === status; }).length;
    };

    /* ---------- Navigation (used by header/sidebar if needed) ---------- */
    $scope.toggleSidebar = function () {
      $scope.sidebarOpen = !$scope.sidebarOpen;
    };
  }
]);
