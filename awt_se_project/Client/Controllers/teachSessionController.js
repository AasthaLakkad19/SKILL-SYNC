(function () {
  "use strict";

  var app = angular.module("skillSyncApp");

  // <video ss-video-play="onPlay()">  -> runs when playback starts
  app.directive("ssVideoPlay", function () {
    return {
      restrict: "A",
      link: function (scope, el, attrs) {
        el.on("play", function () {
          scope.$applyAsync(function () { scope.$eval(attrs.ssVideoPlay); });
        });
      },
    };
  });

  app.controller("TeachSessionController", [
    "$scope", "$rootScope", "$http", "$interval", "$timeout", "$window",
    function ($scope, $rootScope, $http, $interval, $timeout, $window) {
      var API = "/api/teach";
      var HOST = "host";
      var sessionId = new URLSearchParams($window.location.search).get("id");

      $scope.sidebarOpen = false;
      $scope.toggleSidebar = function () { $scope.sidebarOpen = !$scope.sidebarOpen; };

      $scope.loading = true;
      $scope.error = "";
      $scope.s = null;
      $scope.isOwner = false;
      $scope.tokens = 0;
      $scope.busy = false;

      var toastPromise = null;
      function toast(message) {
        $scope.toastMessage = message;
        if (toastPromise) $timeout.cancel(toastPromise);
        toastPromise = $timeout(function () { $scope.toastMessage = ""; }, 4000);
      }
      function errText(err, fallback) {
        return (err && err.data && err.data.message) || fallback || "Something went wrong. Please try again.";
      }
      function isUnauthorized(err) { return err && err.status === 401; }

      $scope.formatBytes = function (n) {
        n = Number(n) || 0;
        if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
        return Math.max(1, Math.round(n / 1024)) + " KB";
      };
      $scope.modeIcon = function (mode) {
        return {
          "Live online": "📡", "In person on campus": "📍", "Recorded mini lesson": "🎬",
          "Pair programming": "👩‍💻", "Quiz / practice session": "🧠",
        }[mode] || "🎓";
      };

      // ------------------------------------------------------------
      // Load
      // ------------------------------------------------------------
      function applySession(session) {
        $scope.s = session;
        $scope.isOwner = !!session.isOwner;
      }

      function load() {
        if (!sessionId) {
          $scope.loading = false;
          $scope.error = "No session selected.";
          return;
        }
        $http.get(API + "/view/" + encodeURIComponent(sessionId))
          .then(function (r) {
            applySession(r.data.session);
            if ($scope.isOwner && r.data.session.mode === "Quiz / practice session") loadAttempts();
          })
          .catch(function (err) {
            if (isUnauthorized(err)) return;
            $scope.error = err.status === 404 ? "This session doesn't exist or was removed." : errText(err, "Couldn't load this session.");
          })
          .finally(function () { $scope.loading = false; });

        $http.get("/api/wallet").then(function (r) {
          if (r.data && r.data.success) $scope.tokens = r.data.wallet.balance;
        }).catch(function () {});
      }
      load();

      $scope.copyLink = function () {
        var url = $window.location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () { toast("Link copied. Share it with a classmate!"); },
            function () { toast(url); });
        } else {
          toast(url);
        }
      };

      // ------------------------------------------------------------
      // Owner: complete + results
      // ------------------------------------------------------------
      $scope.completeSession = function () {
        if (!$scope.s.canComplete) {
          toast("Tokens are awarded once a student has taken part. Share the link first.");
          return;
        }
        if ($scope.s.live && $scope.s.live.isLive && !$window.confirm("This ends the live class for everyone. Continue?")) return;
        $scope.busy = true;
        $http.patch(API + "/sessions/" + $scope.s.id + "/complete")
          .then(function (r) {
            toast(r.data.message);
            r.data.session.isOwner = true;
            applySession(r.data.session);
            if (typeof r.data.balance === "number") $scope.tokens = r.data.balance;
            teardownLive();
            $scope.live.state = "idle";
          })
          .catch(function (err) { if (!isUnauthorized(err)) toast(errText(err, "Couldn't complete the session.")); })
          .finally(function () { $scope.busy = false; });
      };

      $scope.attemptsData = null;
      function loadAttempts() {
        $http.get(API + "/sessions/" + sessionId + "/attempts")
          .then(function (r) { $scope.attemptsData = r.data; })
          .catch(function () {});
      }
      $scope.refreshAttempts = loadAttempts;

      // ------------------------------------------------------------
      // In person / pair programming / recorded: "I'm taking part"
      // ------------------------------------------------------------
      function markJoined() {
        if ($scope.isOwner || !$scope.s || $scope.s.joined || $scope.s.status === "completed") return;
        $scope.s.joined = true; // optimistic, the call is idempotent
        $http.post(API + "/view/" + $scope.s.id + "/join").catch(function () { $scope.s.joined = false; });
      }
      // Locked content is only sent by the server after the learner joined (and paid)
      $scope.canSee = function () {
        return !!($scope.isOwner || ($scope.s && $scope.s.joined));
      };

      $scope.joinError = "";

      $scope.joinSession = function () {
        if ($scope.busy) return;
        $scope.busy = true;
        $scope.joinError = "";
        $http.post(API + "/view/" + $scope.s.id + "/join")
          .then(function (r) {
            toast(r.data.charged
              ? "You're in! " + r.data.charged + " tokens went to the teacher."
              : "You're in!");
            $rootScope.$broadcast("wallet:changed"); // header + wallet page refresh the balance
            // reload so the unlocked content (video, quiz, links...) arrives
            return $http.get(API + "/view/" + encodeURIComponent($scope.s.id)).then(function (v) {
              applySession(v.data.session);
            });
          })
          .catch(function (err) {
            if (isUnauthorized(err)) return;
            $scope.joinError = errText(err, "Couldn't join. You have not been charged.");
          })
          .finally(function () { $scope.busy = false; });
      };
      $scope.onVideoPlay = markJoined;

      // ------------------------------------------------------------
      // Quiz
      // ------------------------------------------------------------
      $scope.quiz = { answers: [], result: null, submitting: false, active: false };

      $scope.startQuiz = function () {
        $scope.quiz = { answers: [], result: null, submitting: false, active: true };
      };
      $scope.pick = function (qi, oi) {
        if ($scope.quiz.result) return;
        $scope.quiz.answers[qi] = oi;
      };
      $scope.answeredCount = function () {
        var n = 0;
        for (var i = 0; i < $scope.quiz.answers.length; i++) if (typeof $scope.quiz.answers[i] === "number") n++;
        return n;
      };
      $scope.submitQuiz = function () {
        var total = $scope.s.details.quizCount;
        var answers = [];
        for (var i = 0; i < total; i++) {
          var a = $scope.quiz.answers[i];
          if (typeof a !== "number") { toast("Answer every question before submitting."); return; }
          answers.push(a);
        }
        $scope.quiz.submitting = true;
        $http.post(API + "/view/" + $scope.s.id + "/quiz", { answers: answers })
          .then(function (r) {
            $scope.quiz.result = r.data;
            if (r.data.saved) {
              var best = $scope.s.myBest;
              $scope.s.myBest = {
                score: best ? Math.max(best.score, r.data.score) : r.data.score,
                total: r.data.total,
                attempts: (best ? best.attempts : 0) + 1,
              };
              $scope.s.joined = true;
            }
            if ($scope.isOwner) loadAttempts();
          })
          .catch(function (err) { if (!isUnauthorized(err)) toast(errText(err, "Couldn't check your answers.")); })
          .finally(function () { $scope.quiz.submitting = false; });
      };
      $scope.optionClass = function (qi, oi) {
        var res = $scope.quiz.result && $scope.quiz.result.results[qi];
        var picked = $scope.quiz.answers[qi] === oi;
        if (!res) return { picked: picked };
        return { correct: oi === res.correctIndex, wrong: picked && oi !== res.correctIndex, picked: picked };
      };
      $scope.scoreMessage = function () {
        var p = $scope.quiz.result ? $scope.quiz.result.percent : 0;
        if (p === 100) return "Perfect score! 🎉";
        if (p >= 70) return "Great job!";
        if (p >= 40) return "Good effort. Review the explanations and try again.";
        return "Keep practising. You can retry as many times as you like.";
      };

      // ------------------------------------------------------------
      // LIVE VIDEO (WebRTC; the server only relays offers/answers/candidates)
      // ------------------------------------------------------------
      $scope.live = { state: "idle", role: null, viewers: 0, message: "", sharing: false, micOn: true, camOn: true, hostOnline: true, needsTap: false };

      var L = {
        running: false, peerId: null, ice: [], lastSeq: 0, pollTimer: null,
        pcs: {}, pending: {}, localStream: null, camTrack: null, screenStream: null,
        viewerPc: null, remoteStream: null,
      };

      function videoEl() { return document.getElementById("liveVideo"); }
      function setLive(state, message) {
        $scope.live.state = state;
        $scope.live.message = message || "";
      }
      function rtcSupported() {
        return !!($window.RTCPeerConnection && navigator.mediaDevices);
      }

      // ---- shared signalling plumbing ----
      function signal(to, type, data) {
        return $http.post(API + "/live/" + sessionId + "/signal", { peerId: L.peerId, to: to, type: type, data: data })
          .catch(function (err) {
            if (err && err.data && err.data.live === false) serverSaysEnded();
          });
      }
      function startPolling() {
        L.running = true;
        L.lastSeq = 0;
        schedulePoll();
      }
      function schedulePoll() {
        if (!L.running) return;
        L.pollTimer = $timeout(poll, 1000);
      }
      function poll() {
        L.pollTimer = null;
        if (!L.running) return;
        $http.get(API + "/live/" + sessionId + "/poll", { params: { peerId: L.peerId, since: L.lastSeq } })
          .then(function (r) { handlePoll(r.data); })
          .catch(function (err) {
            if (err && err.data && err.data.rejoin && L.running) {
              teardownLive();
              setLive("ended", "You were disconnected from the class. Press Join to come back.");
            }
          })
          .finally(function () { schedulePoll(); });
      }
      function handlePoll(data) {
        if (!L.running) return;
        if (!data.live) { serverSaysEnded(); return; }

        (data.messages || []).forEach(function (m) {
          if (m.seq <= L.lastSeq) return;
          L.lastSeq = m.seq;
          if ($scope.live.role === "host") hostOnSignal(m); else viewerOnSignal(m);
        });

        $scope.live.viewers = data.viewers || 0;
        if ($scope.live.role === "host") {
          syncHostPeers(data.peers || []);
        } else {
          $scope.live.hostOnline = data.hostOnline !== false;
        }
      }
      function serverSaysEnded() {
        var wasHost = $scope.live.role === "host";
        teardownLive();
        if ($scope.s) $scope.s.live = { isLive: false, viewers: 0 };
        setLive("ended", wasHost ? "The live class has ended." : "The teacher ended the live class.");
      }

      function addCandidate(pc, peerKey, candidate) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          pc.addIceCandidate(candidate).catch(function () {});
        } else {
          (L.pending[peerKey] = L.pending[peerKey] || []).push(candidate);
        }
      }
      function flushCandidates(pc, peerKey) {
        (L.pending[peerKey] || []).forEach(function (c) { pc.addIceCandidate(c).catch(function () {}); });
        delete L.pending[peerKey];
      }

      // ---- HOST ----
      $scope.goLive = function () {
        if (!rtcSupported() || !navigator.mediaDevices.getUserMedia) {
          setLive("error", "Live video needs a modern browser opened on https:// (or http://localhost).");
          return;
        }
        $scope.live.role = "host";
        setLive("starting", "Opening your camera and microphone...");

        navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true })
          .then(function (stream) {
            L.localStream = stream;
            L.camTrack = stream.getVideoTracks()[0];
            var el = videoEl();
            if (el) { el.srcObject = stream; el.muted = true; el.play().catch(function () {}); }
            return $http.post(API + "/sessions/" + sessionId + "/live/start");
          })
          .then(function (r) {
            L.peerId = r.data.peerId;
            L.ice = r.data.iceServers;
            $scope.live.micOn = true;
            $scope.live.camOn = true;
            $scope.live.sharing = false;
            $scope.s.live = { isLive: true, viewers: r.data.viewers || 0 };
            setLive("live", "");
            startPolling();
          })
          .catch(function (err) {
            releaseMedia();
            if (isUnauthorized(err)) return;
            if (err && err.data && err.data.message) setLive("error", err.data.message);
            else setLive("error", "Couldn't open your camera/microphone. Allow access in the browser and try again.");
          });
      };

      function outVideoTrack() { return L.screenStream ? L.screenStream.getVideoTracks()[0] : L.camTrack; }

      function syncHostPeers(peers) {
        var ids = {};
        peers.forEach(function (p) {
          ids[p.peerId] = true;
          if (!L.pcs[p.peerId]) createHostPeer(p.peerId);
        });
        Object.keys(L.pcs).forEach(function (id) {
          if (!ids[id]) closeHostPeer(id);
        });
      }

      function createHostPeer(peerId) {
        var pc = new RTCPeerConnection({ iceServers: L.ice });
        L.pcs[peerId] = pc;

        L.localStream.getAudioTracks().forEach(function (t) { pc.addTrack(t, L.localStream); });
        var v = outVideoTrack();
        if (v) pc.addTrack(v, L.localStream);

        pc.onicecandidate = function (e) {
          if (e.candidate) signal(peerId, "candidate", e.candidate.toJSON());
        };
        pc.createOffer()
          .then(function (offer) { return pc.setLocalDescription(offer); })
          .then(function () {
            return signal(peerId, "offer", { type: pc.localDescription.type, sdp: pc.localDescription.sdp });
          })
          .catch(function () { closeHostPeer(peerId); });
      }
      function closeHostPeer(peerId) {
        var pc = L.pcs[peerId];
        if (pc) { try { pc.close(); } catch (e) { /* already closed */ } }
        delete L.pcs[peerId];
        delete L.pending[peerId];
      }
      function hostOnSignal(m) {
        var pc = L.pcs[m.from];
        if (!pc) return;
        if (m.type === "answer") {
          pc.setRemoteDescription(m.data).then(function () { flushCandidates(pc, m.from); }).catch(function () {});
        } else if (m.type === "candidate") {
          addCandidate(pc, m.from, m.data);
        }
      }

      function replaceVideoTrack(track) {
        Object.keys(L.pcs).forEach(function (id) {
          var sender = L.pcs[id].getSenders().filter(function (s) { return s.track && s.track.kind === "video"; })[0];
          if (sender && track) sender.replaceTrack(track).catch(function () {});
        });
      }
      function showPreview(track) {
        var el = videoEl();
        if (!el) return;
        var tracks = L.localStream.getAudioTracks().concat(track ? [track] : []);
        el.srcObject = new MediaStream(tracks);
        el.muted = true;
        el.play().catch(function () {});
      }

      $scope.toggleScreen = function () {
        if ($scope.live.sharing) { stopScreen(); return; }
        if (!navigator.mediaDevices.getDisplayMedia) {
          toast("Screen sharing isn't supported in this browser.");
          return;
        }
        navigator.mediaDevices.getDisplayMedia({ video: true })
          .then(function (stream) {
            L.screenStream = stream;
            var track = stream.getVideoTracks()[0];
            track.onended = function () { $scope.$applyAsync(stopScreen); };
            replaceVideoTrack(track);
            showPreview(track);
            $scope.live.sharing = true;
          })
          .catch(function () { /* the teacher cancelled the picker */ });
      };
      function stopScreen() {
        if (L.screenStream) {
          L.screenStream.getTracks().forEach(function (t) { t.onended = null; t.stop(); });
          L.screenStream = null;
        }
        if (L.camTrack) { replaceVideoTrack(L.camTrack); showPreview(L.camTrack); }
        $scope.live.sharing = false;
      }
      $scope.toggleMic = function () {
        $scope.live.micOn = !$scope.live.micOn;
        if (L.localStream) L.localStream.getAudioTracks().forEach(function (t) { t.enabled = $scope.live.micOn; });
      };
      $scope.toggleCam = function () {
        $scope.live.camOn = !$scope.live.camOn;
        if (L.camTrack) L.camTrack.enabled = $scope.live.camOn;
      };

      $scope.endLive = function () {
        $http.post(API + "/sessions/" + sessionId + "/live/stop")
          .catch(function () {})
          .finally(function () {
            teardownLive();
            if ($scope.s) $scope.s.live = { isLive: false, viewers: 0 };
            setLive("ended", "You ended the live class. Learners who joined count towards your tokens.");
            load();
          });
      };

      // ---- VIEWER ----
      $scope.joinLive = function () {
        if (!rtcSupported()) {
          setLive("error", "Your browser can't play live video. Try a recent Chrome, Edge, Firefox or Safari.");
          return;
        }
        $scope.live.role = "viewer";
        setLive("joining", "Connecting to the class...");
        $http.post(API + "/view/" + sessionId + "/live/join")
          .then(function (r) {
            L.peerId = r.data.peerId;
            L.ice = r.data.iceServers;
            $scope.s.joined = true;
            startPolling();
          })
          .catch(function (err) {
            if (isUnauthorized(err)) return;
            setLive("error", errText(err, "Couldn't join the live class."));
            refreshStatus();
          });
      };

      function viewerOnSignal(m) {
        if (m.type === "offer") {
          if (L.viewerPc) { try { L.viewerPc.close(); } catch (e) { /* ignore */ } }
          L.remoteStream = null;
          var pc = new RTCPeerConnection({ iceServers: L.ice });
          L.viewerPc = pc;

          pc.ontrack = function (e) {
            var el = videoEl();
            if (!el) return;
            if (!L.remoteStream) {
              L.remoteStream = e.streams && e.streams[0] ? e.streams[0] : new MediaStream();
              if (!(e.streams && e.streams[0])) L.remoteStream.addTrack(e.track);
              el.srcObject = L.remoteStream;
            } else if (L.remoteStream.getTracks().indexOf(e.track) === -1) {
              L.remoteStream.addTrack(e.track);
            }
            el.muted = false;
            el.play().then(function () { $scope.$applyAsync(function () { $scope.live.needsTap = false; }); },
              function () { $scope.$applyAsync(function () { $scope.live.needsTap = true; }); });
            $scope.$applyAsync(function () { setLive("watching", ""); });
          };
          pc.onicecandidate = function (e) {
            if (e.candidate) signal(HOST, "candidate", e.candidate.toJSON());
          };
          pc.onconnectionstatechange = function () {
            $scope.$applyAsync(function () {
              if (L.viewerPc !== pc) return;
              if (pc.connectionState === "failed") {
                setLive("error", "The video connection failed. This can happen on strict school or mobile networks. Press Rejoin to try again.");
              }
            });
          };

          pc.setRemoteDescription(m.data)
            .then(function () { flushCandidates(pc, "host"); return pc.createAnswer(); })
            .then(function (answer) { return pc.setLocalDescription(answer); })
            .then(function () { return signal(HOST, "answer", { type: pc.localDescription.type, sdp: pc.localDescription.sdp }); })
            .catch(function () { setLive("error", "Couldn't start the video. Press Rejoin to try again."); });
        } else if (m.type === "candidate" && L.viewerPc) {
          addCandidate(L.viewerPc, "host", m.data);
        }
      }

      $scope.tapToPlay = function () {
        var el = videoEl();
        if (el) { el.muted = false; el.play(); $scope.live.needsTap = false; }
      };

      $scope.leaveLive = function () {
        if (L.peerId && L.peerId !== HOST) {
          $http.post(API + "/live/" + sessionId + "/leave", { peerId: L.peerId }).catch(function () {});
        }
        teardownLive();
        setLive("idle", "");
        refreshStatus();
      };
      $scope.rejoinLive = function () {
        teardownLive();
        setLive("idle", "");
        $scope.joinLive();
      };

      // ---- cleanup ----
      function releaseMedia() {
        [L.localStream, L.screenStream].forEach(function (st) {
          if (st) st.getTracks().forEach(function (t) { t.onended = null; t.stop(); });
        });
        L.localStream = null; L.camTrack = null; L.screenStream = null;
      }
      function teardownLive() {
        L.running = false;
        if (L.pollTimer) { $timeout.cancel(L.pollTimer); L.pollTimer = null; }
        Object.keys(L.pcs).forEach(closeHostPeer);
        if (L.viewerPc) { try { L.viewerPc.close(); } catch (e) { /* ignore */ } L.viewerPc = null; }
        L.remoteStream = null;
        L.pending = {};
        L.peerId = null;
        releaseMedia();
        var el = videoEl();
        if (el) el.srcObject = null;
        $scope.live.sharing = false;
        $scope.live.viewers = 0;
        $scope.live.needsTap = false;
      }

      // While nobody is in the room, check every few seconds whether the class went live
      function refreshStatus() {
        if (!sessionId) return;
        $http.get(API + "/view/" + encodeURIComponent(sessionId)).then(function (r) {
          if (!$scope.s) return;
          $scope.s.live = r.data.session.live;
          $scope.s.participantCount = r.data.session.participantCount;
          $scope.s.canComplete = r.data.session.canComplete;
          $scope.s.status = r.data.session.status;
        }).catch(function () {});
      }
      var statusTimer = $interval(function () {
        var st = $scope.live.state;
        var inRoom = st === "live" || st === "starting" || st === "joining" || st === "watching";
        if (!inRoom && $scope.s && $scope.s.status !== "completed") refreshStatus();
      }, 5000);

      $window.addEventListener("beforeunload", function () {
        // closes camera + connections; the server ends the class if the teacher doesn't come back
        releaseMedia();
      });
      $scope.$on("$destroy", function () {
        teardownLive();
        $interval.cancel(statusTimer);
        if (toastPromise) $timeout.cancel(toastPromise);
      });
    },
  ]);
})();
