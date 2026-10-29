app.controller("HeaderController", function ($scope, $rootScope, $http, $interval, $window, $q) {

    // Default user
    $scope.currentUser = {
        name: "User",
        email: "",
        initial: "U"
    };

    // Get logged-in user
    var savedUser = localStorage.getItem("skillsync_user");

    if (savedUser) {

        try {

            var userData = JSON.parse(savedUser);

            $scope.currentUser.name = userData.name || "User";
            $scope.currentUser.email = userData.email || "";

            // First letter of name
            $scope.currentUser.initial =
                $scope.currentUser.name
                    .charAt(0)
                    .toUpperCase();

        } catch (error) {

            console.error("Error loading user:", error);

        }
    }

    // ==========================================
    // TOKEN BALANCE (shown in the header on EVERY page)
    // Read from the wallet itself, so no page controller has to provide it.
    // The last value is cached per user so the number doesn't flash on page changes.
    // ==========================================

    var CACHE_KEY = "skillsync_tokens";

    function cachedBalance() {
        try {
            var c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
            if (c && c.who === $scope.currentUser.email && typeof c.balance === "number") {
                return c.balance;
            }
        } catch (e) {}
        return null;
    }

    // null = not known yet (shows a dash instead of a wrong number)
    $scope.headerTokens = cachedBalance();

    function loadBalance() {
        if (!localStorage.getItem("skillsync_token")) return $q.resolve();

        return $http.get("/api/wallet").then(function (res) {
            if (res.data && res.data.success) {
                $scope.headerTokens = res.data.wallet.balance;
                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({
                        who: $scope.currentUser.email,
                        balance: $scope.headerTokens
                    }));
                } catch (e) {}
            }
        }).catch(function () { /* keep showing the last known value */ });
    }

    // Profile dropdown
    $scope.profileOpen = false;

    $scope.toggleProfileMenu = function () {
        $scope.profileOpen = !$scope.profileOpen;
        if ($scope.profileOpen) $scope.notif.open = false;
    };

    // Logout
    $scope.logout = function () {

        localStorage.removeItem("skillsync_token");
        localStorage.removeItem("skillsync_user");
        localStorage.removeItem(CACHE_KEY);

        window.location.href = "index.html";
    };


    // ==========================================
    // NOTIFICATIONS (the bell)
    //   - connection requests other students sent ME (Accept / Decline / View profile)
    //   - "X accepted your request" for requests I sent
    // ==========================================

    var API = "/api/teammates";
    var POLL_MS = 30 * 1000;

    $scope.notif = {
        open: false,
        loaded: false,
        loading: false,
        unread: 0,
        requests: [],
        accepted: [],
        busy: null,   // id of the request being accepted / declined
        error: "",
        message: ""   // small confirmation line, e.g. "You're now connected with Neha"
    };

    function loadNotifications() {
        if (!localStorage.getItem("skillsync_token")) return $q.resolve();

        $scope.notif.loading = true;

        return $http
            .get(API + "/notifications")
            .then(function (res) {
                var n = $scope.notif;
                n.requests = res.data.requests || [];
                n.accepted = res.data.accepted || [];
                n.unread = res.data.unread || 0;
                n.error = "";
                n.loaded = true;
            })
            .catch(function (err) {
                // 401 is handled globally (redirect to login); don't nag about it
                if (err.status !== 401) {
                    $scope.notif.error = "Couldn't load notifications.";
                }
            })
            .finally(function () {
                $scope.notif.loading = false;
            });
    }

    // Opening the bell clears the "accepted" part of the badge
    function markSeen() {
        var hasUnseen = $scope.notif.accepted.some(function (a) { return a.unseen; });
        if (!hasUnseen) return;

        $http.post(API + "/notifications/seen", {}).then(function () {
            $scope.notif.unread = $scope.notif.requests.length;
        });
    }

    $scope.toggleNotifications = function ($event) {
        if ($event) $event.stopPropagation();

        var n = $scope.notif;
        n.open = !n.open;
        n.message = "";

        if (n.open) {
            $scope.profileOpen = false;
            loadNotifications().then(markSeen);
        }
    };

    $scope.closeNotifications = function () {
        $scope.notif.open = false;
    };

    function respond(n, action) {
        if ($scope.notif.busy) return;

        $scope.notif.busy = n.id;
        $scope.notif.error = "";

        $http
            .post(API + "/requests/" + n.id + "/" + action, {})
            .then(function () {
                var list = $scope.notif.requests;
                list.splice(list.indexOf(n), 1);
                $scope.notif.unread = Math.max(0, $scope.notif.unread - 1);
                $scope.notif.message =
                    action === "accept"
                        ? "You're now connected with " + n.from.name + "."
                        : "Request from " + n.from.name + " declined.";

                // Let the page behind the bell (Find Teammates / Profile) refresh its buttons
                $rootScope.$broadcast("connections:changed");
            })
            .catch(function (err) {
                if (err.status === 404) {
                    // already handled elsewhere, so just refresh the list
                    loadNotifications();
                } else if (err.status !== 401) {
                    $scope.notif.error = (err.data && err.data.message) || "Something went wrong.";
                }
            })
            .finally(function () {
                $scope.notif.busy = null;
            });
    }

    $scope.acceptRequest = function (n) { respond(n, "accept"); };
    $scope.declineRequest = function (n) { respond(n, "decline"); };

    // "5 min ago", "2 h ago", "3 d ago"
    $scope.timeAgo = function (date) {
        if (!date) return "";
        var secs = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
        if (secs < 60) return "just now";
        if (secs < 3600) return Math.floor(secs / 60) + " min ago";
        if (secs < 86400) return Math.floor(secs / 3600) + " h ago";
        if (secs < 86400 * 30) return Math.floor(secs / 86400) + " d ago";
        return new Date(date).toLocaleDateString();
    };

    // Close the panels when clicking elsewhere or pressing Esc
    function onDocumentClick(e) {
        var inside = e.target.closest && e.target.closest(".notif-wrap, .profile-menu");
        if (!inside && ($scope.notif.open || $scope.profileOpen)) {
            $scope.$applyAsync(function () {
                $scope.notif.open = false;
                $scope.profileOpen = false;
            });
        }
    }

    function onKeydown(e) {
        if (e.key === "Escape" && $scope.notif.open) {
            $scope.$applyAsync(function () { $scope.notif.open = false; });
        }
    }

    $window.document.addEventListener("click", onDocumentClick);
    $window.document.addEventListener("keydown", onKeydown);

    // First load + keep the badge fresh (not while the tab is hidden)
    loadNotifications();
    loadBalance();

    // Tokens can arrive while the page is open (a learner joined my session),
    // so refresh the balance together with the notifications.
    var timer = $interval(function () {
        if (!$window.document.hidden) {
            loadNotifications();
            loadBalance();
        }
    }, POLL_MS);

    // Refresh when the person comes back to the tab, or the page changed a connection
    function onVisible() {
        if (!$window.document.hidden) $scope.$applyAsync(function () { loadNotifications(); loadBalance(); });
    }
    $window.document.addEventListener("visibilitychange", onVisible);
    $scope.$on("connections:changed", function () { loadNotifications(); });

    // Any page that moves tokens (joining a session...) announces it:
    //   $rootScope.$broadcast("wallet:changed")
    $scope.$on("wallet:changed", function () { loadBalance(); });

    $scope.$on("$destroy", function () {
        $interval.cancel(timer);
        $window.document.removeEventListener("click", onDocumentClick);
        $window.document.removeEventListener("keydown", onKeydown);
        $window.document.removeEventListener("visibilitychange", onVisible);
    });

});
