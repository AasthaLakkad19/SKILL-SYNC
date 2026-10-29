(function () {
  "use strict";

  var app = angular.module("skillSyncApp");

  // <input type="file" ss-file-change="onPicked(files)">  (Angular has no ng-model for files)
  app.directive("ssFileChange", function () {
    return {
      restrict: "A",
      link: function (scope, el, attrs) {
        el.on("change", function () {
          var files = el[0].files;
          scope.$apply(function () {
            scope.$eval(attrs.ssFileChange, { files: files });
          });
          el[0].value = ""; // lets the same file be picked again
        });
      },
    };
  });

  app.controller("TeachSkillsController", [
    "$scope", "$http", "$interval", "$timeout", "$window",
    function ($scope, $http, $interval, $timeout, $window) {
      var API = "/api/teach";
      var RECORD_LIMIT_SECONDS = 600;

      // ------------------------------------------------------------
      // Page state
      // ------------------------------------------------------------
      $scope.sidebarOpen = false;
      $scope.toggleSidebar = function () { $scope.sidebarOpen = !$scope.sidebarOpen; };

      $scope.loading = true;
      $scope.loadError = "";
      $scope.saving = false;
      $scope.sessions = [];
      $scope.community = [];
      $scope.communityLoading = false;
      $scope.stats = { badges: {} };
      $scope.limits = { maxVideoMB: 200, requireLearnerToComplete: true, maxQuizQuestions: 10 };
      $scope.tokens = 0; // shown in the shared header

      // The 4 stat cards
      $scope.tokensEarned = 0;
      $scope.streak = 0;
      $scope.teachingLevel = "New Teacher";
      $scope.levelHint = "Your first lesson awaits";

      $scope.sessionFilter = "all";
      $scope.sessionFilters = [
        { value: "all", label: "All" },
        { value: "Live online", label: "Live" },
        { value: "In person on campus", label: "On campus" },
        { value: "Recorded mini lesson", label: "Recorded" },
        { value: "Pair programming", label: "Pair" },
        { value: "Quiz / practice session", label: "Quiz" },
      ];
      $scope.communityFilter = { q: "", mode: "all" };

      var timerPromise = null;
      var toastPromise = null;
      var communityPromise = null;

      // ------------------------------------------------------------
      // Helpers
      // ------------------------------------------------------------
      function showToast(message) {
        $scope.toastMessage = message;
        if (toastPromise) $timeout.cancel(toastPromise);
        toastPromise = $timeout(function () {
          $scope.toastMessage = "";
          toastPromise = null;
        }, 4000);
      }
      function errorText(err, fallback) {
        return (err && err.data && err.data.message) || fallback || "Something went wrong. Please try again.";
      }
      function fail(err, fallback) {
        // 401s are handled by the global interceptor (redirects to login)
        if (err && err.status === 401) return;
        showToast(errorText(err, fallback));
      }
      function isUrl(v) {
        return /^https?:\/\/\S+\.\S+/i.test(v || "");
      }
      $scope.formatBytes = function (n) {
        n = Number(n) || 0;
        if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
        return Math.max(1, Math.round(n / 1024)) + " KB";
      };

      // ------------------------------------------------------------
      // Load everything from the backend (so it is all still here after refresh)
      // ------------------------------------------------------------
      function applyStats(s) {
        $scope.stats = s;
        $scope.tokensEarned = s.tokensEarned;
        $scope.streak = s.streak;
        $scope.teachingLevel = s.teachingLevel;
        $scope.levelHint = s.levelHint;
      }
      function loadSessions() {
        return $http.get(API + "/sessions").then(function (r) { $scope.sessions = r.data.sessions; });
      }
      function loadStats() {
        return $http.get(API + "/stats").then(function (r) { applyStats(r.data); });
      }
      function loadWallet() {
        return $http.get("/api/wallet").then(function (r) {
          if (r.data && r.data.success) $scope.tokens = r.data.wallet.balance;
        });
      }
      $scope.loadCommunity = function () {
        $scope.communityLoading = true;
        var params = {};
        if ($scope.communityFilter.mode !== "all") params.mode = $scope.communityFilter.mode;
        if ($scope.communityFilter.q) params.q = $scope.communityFilter.q;
        return $http
          .get(API + "/discover", { params: params })
          .then(function (r) { $scope.community = r.data.sessions; })
          .catch(function (err) { fail(err, "Couldn't load community sessions."); })
          .finally(function () { $scope.communityLoading = false; });
      };

      function loadAll() {
        $scope.loading = true;
        $scope.loadError = "";
        $http.get(API + "/options").then(function (r) { $scope.limits = r.data; });
        return Promise.all([loadSessions(), loadStats()])
          .catch(function (err) {
            if (!(err && err.status === 401)) {
              $scope.loadError = errorText(err, "Couldn't load your teaching sessions.");
            }
          })
          .then(function () {
            $scope.loading = false;
            $scope.$applyAsync();
          });
      }
      loadAll();
      loadWallet().catch(function () {});
      $scope.loadCommunity();
      $scope.reload = loadAll;

      // keep the "Live now" badges fresh without a refresh
      communityPromise = $interval(function () {
        $scope.loadCommunity();
        loadSessions().catch(function () {});
      }, 30000);

      $scope.$on("$destroy", function () {
        stopTimer();
        stopRecordingTracks();
        if (toastPromise) $timeout.cancel(toastPromise);
        if (communityPromise) $interval.cancel(communityPromise);
      });

      // ------------------------------------------------------------
      // Create / edit form
      // ------------------------------------------------------------
      function emptyQuestion() {
        return { question: "", options: ["", "", "", ""], correctIndex: 0, explanation: "" };
      }
      function emptyForm() {
        return {
          level: "Beginner",
          mode: "Live online",
          duration: "30 minutes",
          reward: "3",
          activity: "Live demo + learner practice",
          details: { meetingLink: "", location: "", recordingUrl: "", repoLink: "", video: null, quiz: [] },
        };
      }
      $scope.newSession = emptyForm();
      $scope.editingId = null;

      $scope.onModeChange = function () {
        var d = $scope.newSession.details;
        if ($scope.newSession.mode === "Quiz / practice session" && !d.quiz.length) {
          d.quiz.push(emptyQuestion());
        }
      };

      // ---- quiz builder ----
      $scope.addQuestion = function () {
        var quiz = $scope.newSession.details.quiz;
        if (quiz.length >= $scope.limits.maxQuizQuestions) {
          showToast("A quiz can have up to " + $scope.limits.maxQuizQuestions + " questions.");
          return;
        }
        quiz.push(emptyQuestion());
      };
      $scope.removeQuestion = function (i) {
        var quiz = $scope.newSession.details.quiz;
        if (quiz.length > 1) quiz.splice(i, 1);
      };
      $scope.addOption = function (q) {
        if (q.options.length < 6) q.options.push("");
      };
      $scope.removeOption = function (q, i) {
        if (q.options.length <= 2) return;
        q.options.splice(i, 1);
        if (q.correctIndex === i) q.correctIndex = 0;
        else if (q.correctIndex > i) q.correctIndex -= 1;
      };

      // ---- video: choose a file or record with the camera ----
      $scope.uploadState = { active: false, percent: 0, name: "", error: "" };
      $scope.recorder = {
        supported: !!($window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        state: "idle", // idle | recording
        seconds: 0,
      };
      var mediaRecorder = null;
      var recordStream = null;
      var recordChunks = [];
      var recordTimer = null;
      var uploadXhr = null;

      function uploadVideo(file) {
        var us = $scope.uploadState;
        var maxBytes = $scope.limits.maxVideoMB * 1024 * 1024;
        if (file.size > maxBytes) {
          us.error = "That video is " + $scope.formatBytes(file.size) + ". The limit is " + $scope.limits.maxVideoMB + " MB.";
          return;
        }
        us.active = true;
        us.percent = 0;
        us.error = "";
        us.name = file.name;

        var xhr = new XMLHttpRequest();
        uploadXhr = xhr;
        xhr.open("POST", API + "/upload?name=" + encodeURIComponent(file.name));
        xhr.setRequestHeader("Authorization", "Bearer " + localStorage.getItem("skillsync_token"));
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

        xhr.upload.onprogress = function (e) {
          if (e.lengthComputable) {
            $scope.$applyAsync(function () { us.percent = Math.round((e.loaded / e.total) * 100); });
          }
        };
        xhr.onload = function () {
          var body = {};
          try { body = JSON.parse(xhr.responseText); } catch (e) { /* not json */ }
          $scope.$applyAsync(function () {
            us.active = false;
            if (xhr.status === 401) { $window.location.href = "login.html"; return; }
            if (xhr.status >= 200 && xhr.status < 300 && body.video) {
              $scope.newSession.details.video = body.video;
              showToast("Video uploaded. Publish your session to share it.");
            } else {
              us.error = body.message || "Upload failed. Please try again.";
            }
          });
        };
        xhr.onerror = function () {
          $scope.$applyAsync(function () {
            us.active = false;
            us.error = "Upload failed. Check your connection and try again.";
          });
        };
        xhr.onabort = function () {
          $scope.$applyAsync(function () { us.active = false; });
        };
        xhr.send(file);
      }

      $scope.onVideoPicked = function (files) {
        if (files && files[0]) uploadVideo(files[0]);
      };
      $scope.cancelUpload = function () {
        if (uploadXhr) uploadXhr.abort();
      };
      $scope.removeVideo = function () {
        // The file stays on disk until the session is saved or deleted; the server cleans it up then.
        $scope.newSession.details.video = null;
        $scope.uploadState.error = "";
      };

      function stopRecordingTracks() {
        if (recordTimer) { $interval.cancel(recordTimer); recordTimer = null; }
        if (recordStream) {
          recordStream.getTracks().forEach(function (t) { t.stop(); });
          recordStream = null;
        }
        var el = document.getElementById("recPreview");
        if (el) el.srcObject = null;
      }

      $scope.startRecording = function () {
        $scope.uploadState.error = "";
        navigator.mediaDevices
          .getUserMedia({ video: true, audio: true })
          .then(function (stream) {
            recordStream = stream;
            recordChunks = [];

            var types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
            var mime = types.filter(function (t) { return MediaRecorder.isTypeSupported(t); })[0];
            mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);

            mediaRecorder.ondataavailable = function (e) {
              if (e.data && e.data.size) recordChunks.push(e.data);
            };
            mediaRecorder.onstop = function () {
              var type = (mediaRecorder && mediaRecorder.mimeType) || "video/webm";
              var blob = new Blob(recordChunks, { type: type });
              stopRecordingTracks();
              $scope.$applyAsync(function () {
                $scope.recorder.state = "idle";
                if (!blob.size) { $scope.uploadState.error = "Nothing was recorded. Please try again."; return; }
                var ext = /mp4/.test(type) ? "mp4" : "webm";
                var file = new File([blob], "recorded-lesson." + ext, { type: type });
                uploadVideo(file);
              });
            };

            $scope.$applyAsync(function () {
              $scope.recorder.state = "recording";
              $scope.recorder.seconds = 0;
            });
            $timeout(function () {
              var el = document.getElementById("recPreview");
              if (el) { el.srcObject = stream; el.muted = true; el.play().catch(function () {}); }
            });

            mediaRecorder.start(1000);
            recordTimer = $interval(function () {
              $scope.recorder.seconds += 1;
              if ($scope.recorder.seconds >= RECORD_LIMIT_SECONDS) $scope.stopRecording();
            }, 1000);
          })
          .catch(function () {
            $scope.$applyAsync(function () {
              $scope.uploadState.error = "Couldn't open your camera/microphone. Allow access in the browser, or choose a video file instead.";
            });
          });
      };
      $scope.stopRecording = function () {
        if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
      };

      // ---- build + validate + save ----
      function buildDetails(f) {
        var d = f.details || {};
        switch (f.mode) {
          case "Live online":
            return { meetingLink: (d.meetingLink || "").trim() };
          case "In person on campus":
            return { location: (d.location || "").trim() };
          case "Recorded mini lesson":
            return { recordingUrl: (d.recordingUrl || "").trim(), video: d.video || undefined };
          case "Pair programming":
            return { repoLink: (d.repoLink || "").trim() };
          case "Quiz / practice session":
            return {
              quiz: (d.quiz || []).map(function (q) {
                return {
                  question: (q.question || "").trim(),
                  options: q.options.map(function (o) { return (o || "").trim(); }),
                  correctIndex: q.correctIndex,
                  explanation: (q.explanation || "").trim(),
                };
              }),
            };
        }
        return {};
      }

      // Friendly checks before calling the server (the server checks again)
      function checkDetails(f) {
        var d = buildDetails(f);
        if (f.mode === "Live online" && d.meetingLink && !isUrl(d.meetingLink)) return "The meeting link should start with https://";
        if (f.mode === "Pair programming" && d.repoLink && !isUrl(d.repoLink)) return "The repository link should start with https://";
        if (f.mode === "Recorded mini lesson") {
          if ($scope.uploadState.active) return "Please wait for the video upload to finish.";
          if (!d.video && !d.recordingUrl) return "Upload or record a video (or paste a link to your recording).";
          if (d.recordingUrl && !isUrl(d.recordingUrl)) return "The recording link should start with https://";
        }
        if (f.mode === "Quiz / practice session") {
          if (!d.quiz.length) return "Add at least one quiz question.";
          for (var i = 0; i < d.quiz.length; i++) {
            var q = d.quiz[i], n = i + 1;
            if (!q.question) return "Question " + n + ": type the question.";
            if (q.options.some(function (o) { return !o; })) return "Question " + n + ": fill in every option (or remove the empty ones).";
            var lower = q.options.map(function (o) { return o.toLowerCase(); });
            if (lower.filter(function (o, idx) { return lower.indexOf(o) !== idx; }).length) return "Question " + n + ": options must be different.";
          }
        }
        return "";
      }

      $scope.saveSession = function (form) {
        if ($scope.saving) return;
        if (form.$invalid) {
          showToast("Please complete the required fields before publishing.");
          return;
        }
        var f = $scope.newSession;
        var problem = checkDetails(f);
        if (problem) { showToast(problem); return; }

        var payload = {
          title: f.title, skill: f.skill, category: f.category, level: f.level, mode: f.mode,
          duration: f.duration, reward: Number(f.reward) || 3, description: f.description,
          activity: f.activity, details: buildDetails(f),
        };

        var editing = $scope.editingId;
        $scope.saving = true;
        var request = editing
          ? $http.put(API + "/sessions/" + editing, payload)
          : $http.post(API + "/sessions", payload);

        request
          .then(function (r) {
            showToast(editing ? "Session updated." : "Published! Open it from My teaching sessions to go live or share it.");
            resetForm(form);
            return Promise.all([loadSessions(), loadStats()]).then(function () { $scope.$applyAsync(); });
          })
          .catch(function (err) { fail(err, "Couldn't save your session."); })
          .finally(function () { $scope.saving = false; });
      };
      // keep the old name working for any template still using it
      $scope.createSession = $scope.saveSession;

      function resetForm(form) {
        $scope.newSession = emptyForm();
        $scope.editingId = null;
        $scope.uploadState = { active: false, percent: 0, name: "", error: "" };
        if (form) { form.$setPristine(); form.$setUntouched(); }
      }

      $scope.editSession = function (s) {
        if (s.status === "completed") return;
        var d = s.details || {};
        $scope.editingId = s.id;
        $scope.newSession = {
          title: s.title, skill: s.skill, category: s.category, level: s.level, mode: s.mode,
          duration: s.duration, reward: String(s.reward), description: s.description, activity: s.activity,
          details: {
            meetingLink: d.meetingLink || "",
            location: d.location || "",
            recordingUrl: d.recordingUrl || "",
            repoLink: d.repoLink || "",
            video: d.video || null,
            quiz: angular.copy(d.quiz || []).map(function (q) {
              q.explanation = q.explanation || "";
              return q;
            }),
          },
        };
        $scope.onModeChange();
        $timeout(function () {
          var el = document.getElementById("create-session");
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      };
      $scope.cancelEdit = function (form) { resetForm(form); };

      // ------------------------------------------------------------
      // My sessions
      // ------------------------------------------------------------
      $scope.filteredSessions = function () {
        if ($scope.sessionFilter === "all") return $scope.sessions;
        return $scope.sessions.filter(function (s) { return s.mode === $scope.sessionFilter; });
      };

      $scope.modeIcon = function (mode) {
        return {
          "Live online": "📡", "In person on campus": "📍", "Recorded mini lesson": "🎬",
          "Pair programming": "👩‍💻", "Quiz / practice session": "🧠",
        }[mode] || "🎓";
      };

      // one short line about the format-specific content
      $scope.formatSummary = function (s) {
        var d = s.details || {};
        switch (s.mode) {
          case "Live online": return d.meetingLink ? "Live room + backup link" : "SkillSync live room";
          case "In person on campus": return d.location ? "At " + d.location : "Campus session";
          case "Recorded mini lesson": return d.video ? "Video · " + $scope.formatBytes(d.video.size) : "Video link";
          case "Pair programming": return d.repoLink ? "Repo shared" : "Pair session";
          case "Quiz / practice session": return (d.quizCount || 0) + " question" + (d.quizCount === 1 ? "" : "s");
        }
        return "";
      };

      $scope.openSession = function (s) {
        $window.location.href = "teachSession.html?id=" + encodeURIComponent(s.id);
      };

      $scope.removeSession = function (s) {
        if (!$window.confirm("Delete \"" + s.title + "\"? Learner results and any uploaded video will be removed too.")) return;
        $http
          .delete(API + "/sessions/" + s.id)
          .then(function () {
            showToast("Teaching session removed.");
            if ($scope.editingId === s.id) resetForm();
            return Promise.all([loadSessions(), loadStats()]).then(function () { $scope.$applyAsync(); });
          })
          .catch(function (err) { fail(err, "Couldn't delete the session."); });
      };

      $scope.completeSession = function (s) {
        if (!s.canComplete) {
          showToast(
            $scope.limits.requireLearnerToComplete
              ? "You can complete a session once a student has joined. Share your session first."
              : "This session can't be completed yet."
          );
          return;
        }
        $http
          .patch(API + "/sessions/" + s.id + "/complete")
          .then(function (r) {
            showToast(r.data.message);
            return Promise.all([loadSessions(), loadStats()]).then(function () { $scope.$applyAsync(); });
          })
          .catch(function (err) { fail(err, "Couldn't complete the session."); });
      };

      // ------------------------------------------------------------
      // TeachQuest (practice tools - these are local, nothing is saved)
      // ------------------------------------------------------------
      $scope.quizOptions = [
        "Use as many difficult words as possible",
        "Explain clearly and include a relatable example",
        "Speak continuously without checking understanding",
      ];
      $scope.selectedQuiz = null;
      $scope.quizChecked = false;
      $scope.sprintStarted = false;
      $scope.sprintRunning = false;
      $scope.sprintSeconds = 180;
      $scope.sprintMessage = "Start the timer when you're ready to teach.";

      $scope.checkQuiz = function () {
        if ($scope.selectedQuiz === null || typeof $scope.selectedQuiz === "undefined") {
          showToast("Choose an answer first.");
          return;
        }
        $scope.quizChecked = true;
      };

      $scope.startSprint = function () {
        $scope.sprintStarted = true;
        if ($scope.sprintSeconds === 0) $scope.sprintSeconds = 180;
        $scope.sprintMessage = "Explain one idea, show an example, then ask one question.";
      };

      $scope.toggleSprint = function () {
        if ($scope.sprintRunning) {
          stopTimer();
          $scope.sprintRunning = false;
          $scope.sprintMessage = "Paused. Resume whenever you're ready.";
          return;
        }
        if ($scope.sprintSeconds <= 0) $scope.sprintSeconds = 180;
        $scope.sprintRunning = true;
        $scope.sprintMessage = "Your mini lesson is underway. Keep it simple and interactive!";
        timerPromise = $interval(function () {
          $scope.sprintSeconds -= 1;
          if ($scope.sprintSeconds <= 0) {
            $scope.sprintSeconds = 0;
            stopTimer();
            $scope.sprintRunning = false;
            $scope.sprintMessage = "Sprint complete! Finish with one quick question for your learner.";
          }
        }, 1000);
      };

      $scope.resetSprint = function () {
        stopTimer();
        $scope.sprintRunning = false;
        $scope.sprintStarted = true;
        $scope.sprintSeconds = 180;
        $scope.sprintMessage = "Timer reset. Ready for another skill sprint.";
      };

      function stopTimer() {
        if (timerPromise) {
          $interval.cancel(timerPromise);
          timerPromise = null;
        }
      }
    },
  ]);

  app.filter("secondsTime", function () {
    return function (seconds) {
      seconds = Math.max(0, Number(seconds) || 0);
      var minutes = Math.floor(seconds / 60);
      var remaining = seconds % 60;
      return String(minutes).padStart(2, "0") + ":" + String(remaining).padStart(2, "0");
    };
  });
})();
