angular.module("skillSyncApp").controller("ProjectsController", [
  "$scope",
  "$timeout",
  "$http",
  "$q",
  "$window",
  function ($scope, $timeout, $http, $q, $window) {
    var API = "/api/projects";

    /* ---------- Layout (needed by the shared header) ---------- */
    $scope.sidebarOpen = false;
    $scope.toggleSidebar = function () {
      $scope.sidebarOpen = !$scope.sidebarOpen;
    };

    /* ---------- State ---------- */
    $scope.search = { text: "" };
    $scope.statusFilter = "all";
    $scope.sortBy = "-updated";

    $scope.detail = null; // project shown in the details modal
    $scope.formOpen = false; // create / edit modal
    $scope.editing = null; // project being edited (null = creating)
    $scope.form = {};
    $scope.toDelete = null;
    $scope.newMember = { name: "", role: "" };
    $scope.toast = "";
    $scope.loaded = false;
    $scope.saving = false; // blocks double submits

    $scope.projects = [];
    $scope.collaborators = [];

    /* ---------- HTTP helpers ---------- */
    function authConfig() {
      return {
        headers: { Authorization: "Bearer " + localStorage.getItem("skillsync_token") },
      };
    }

    function showToast(msg) {
      $scope.toast = msg;
      $timeout(function () {
        $scope.toast = "";
      }, 2500);
    }

    function handleError(err) {
      if (err.status === 401) {
        $window.location.href = "login.html";
        return;
      }
      showToast((err.data && err.data.message) || "Something went wrong. Please try again.");
    }

    // Copy the server's version into an existing object so open modals
    // (which point at the same object) update in place.
    function applyServerProject(target, fresh) {
      angular.extend(target, fresh);
      return target;
    }

    /* ---------- Load ---------- */
    function loadAll() {
      return $q
        .all([
          $http.get(API, authConfig()),
          $http.get(API + "/collaborators", authConfig()),
        ])
        .then(function (r) {
          $scope.projects = r[0].data.projects;
          $scope.collaborators = r[1].data.collaborators;
        })
        .catch(handleError)
        .finally(function () {
          $scope.loaded = true;
        });
    }
    loadAll();

    /* ---------- Helpers used by the view ---------- */
    $scope.statusLabel = function (s) {
      return (
        { "not-started": "Not started", "in-progress": "In progress", completed: "Completed" }[s] || s
      );
    };

    $scope.progress = function (p) {
      if (!p || !p.milestones || !p.milestones.length) {
        return p && p.status === "completed" ? 100 : 0;
      }
      var done = p.milestones.filter(function (m) {
        return m.done;
      }).length;
      return Math.round((done / p.milestones.length) * 100);
    };

    $scope.countByStatus = function (s) {
      return $scope.projects.filter(function (p) {
        return p.status === s;
      }).length;
    };

    $scope.totalTeammates = function () {
      var names = {};
      $scope.projects.forEach(function (p) {
        p.team.forEach(function (m) {
          if (m.name !== "You") names[m.name] = true;
        });
      });
      return Object.keys(names).length;
    };

    // filter used by: projects | filter:projectFilter
    $scope.projectFilter = function (p) {
      if ($scope.statusFilter !== "all" && p.status !== $scope.statusFilter) {
        return false;
      }
      var q = ($scope.search.text || "").toLowerCase().trim();
      if (!q) return true;
      return (
        p.title.toLowerCase().indexOf(q) !== -1 ||
        p.tech.join(" ").toLowerCase().indexOf(q) !== -1
      );
    };

    /* ---------- Details modal ---------- */
    $scope.openDetails = function (p) {
      $scope.detail = p;
      $scope.newMember = { name: "", role: "" };
    };
    $scope.closeDetails = function () {
      $scope.detail = null;
    };

    // Ticking a milestone: update the UI instantly, then save. The server
    // returns the real progress/status, which replaces the optimistic values.
    $scope.milestoneChanged = function (p) {
      var pct = $scope.progress(p);
      if (pct === 100) p.status = "completed";
      else if (pct > 0) p.status = "in-progress";
      p.progress = pct;

      var states = p.milestones.map(function (m) {
        return { id: m.id, done: !!m.done };
      });

      $http
        .patch(API + "/" + p.id + "/milestones", { milestones: states }, authConfig())
        .then(function (res) {
          applyServerProject(p, res.data.project);
        })
        .catch(function (err) {
          handleError(err);
          loadAll(); // undo the optimistic change
        });
    };

    $scope.addMember = function (p) {
      var name = ($scope.newMember.name || "").trim();
      if (!name || $scope.saving) return;

      $scope.saving = true;
      $http
        .post(API + "/" + p.id + "/team", { name: name, role: $scope.newMember.role }, authConfig())
        .then(function (res) {
          applyServerProject(p, res.data.project);
          $scope.newMember = { name: "", role: "" };
          showToast(res.data.message);
        })
        .catch(handleError)
        .finally(function () {
          $scope.saving = false;
        });
    };

    $scope.removeMember = function (p, index) {
      var member = p.team[index];
      if (!member) return;

      $http
        .delete(API + "/" + p.id + "/team/" + member.id, authConfig())
        .then(function (res) {
          applyServerProject(p, res.data.project);
          showToast(res.data.message);
        })
        .catch(handleError);
    };

    /* ---------- Create / edit ---------- */
    function blankForm() {
      return {
        title: "",
        description: "",
        techText: "",
        github: "",
        demo: "",
        status: "not-started",
        milestones: [{ title: "", done: false }],
      };
    }

    $scope.openCreate = function () {
      $scope.editing = null;
      $scope.form = blankForm();
      $scope.formOpen = true;
    };

    $scope.openEdit = function (p) {
      $scope.editing = p;
      $scope.form = {
        title: p.title,
        description: p.description,
        techText: p.tech.join(", "),
        github: p.github,
        demo: p.demo,
        status: p.status,
        milestones: angular.copy(p.milestones),
      };
      $scope.formOpen = true;
    };

    $scope.closeForm = function () {
      $scope.formOpen = false;
      $scope.editing = null;
    };

    $scope.saveProject = function (formCtrl) {
      if (formCtrl.$invalid || $scope.saving) return;

      var data = {
        title: $scope.form.title.trim(),
        description: $scope.form.description.trim(),
        tech: ($scope.form.techText || "")
          .split(",")
          .map(function (t) {
            return t.trim();
          })
          .filter(Boolean),
        github: $scope.form.github || "",
        demo: $scope.form.demo || "",
        status: $scope.form.status,
        milestones: $scope.form.milestones.filter(function (m) {
          return m.title && m.title.trim();
        }),
      };

      var editing = $scope.editing;
      var request = editing
        ? $http.put(API + "/" + editing.id, data, authConfig())
        : $http.post(API, data, authConfig());

      $scope.saving = true;
      request
        .then(function (res) {
          if (editing) applyServerProject(editing, res.data.project);
          else $scope.projects.unshift(res.data.project);
          showToast(res.data.message);
          $scope.closeForm();
        })
        .catch(handleError)
        .finally(function () {
          $scope.saving = false;
        });
    };

    /* ---------- Delete ---------- */
    $scope.askDelete = function (p) {
      $scope.toDelete = p;
    };
    $scope.confirmDelete = function () {
      var p = $scope.toDelete;
      if (!p) return;

      $http
        .delete(API + "/" + p.id, authConfig())
        .then(function (res) {
          var i = $scope.projects.indexOf(p);
          if (i > -1) $scope.projects.splice(i, 1);
          $scope.toDelete = null;
          showToast(res.data.message);
        })
        .catch(function (err) {
          $scope.toDelete = null;
          handleError(err);
        });
    };

    /* ---------- Collaborators ---------- */
    // Invite / cancel invite. Goes to your most recently updated open project.
    $scope.toggleInvite = function (c) {
      var url = API + "/collaborators/" + c.id + "/invite";
      var request = c.invited
        ? $http.delete(url, authConfig())
        : $http.put(url, {}, authConfig());

      request
        .then(function (res) {
          c.invited = res.data.invited;
          showToast(res.data.message);
        })
        .catch(handleError);
    };
  },
]);
