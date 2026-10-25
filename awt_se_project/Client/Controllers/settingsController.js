app.controller('SettingsController', function ($scope, $timeout, $window, $http) {

    // ==============================
    // API CONFIG
    // ==============================
    var API = '/api';
    function authConfig() {
        return { headers: { Authorization: 'Bearer ' + localStorage.getItem('skillsync_token') } };
    }
    function errMsg(err, fallback) {
        return (err && err.data && err.data.message) || fallback || 'Something went wrong';
    }
    function handleAuthError(err) {
        if (err && err.status === 401) { $window.location.href = 'login.html'; return true; }
        return false;
    }

    // ==============================
    // HEADER
    // ==============================
    $scope.sidebarOpen = false;
    $scope.profileOpen = false;
    $scope.tokens = 5;
    $scope.searchText = "";

    // ==============================
    // SETTINGS (defaults until server responds)
    // ==============================
    $scope.settings = {
        profileVisibility: "everyone",
        emailNotifications: true, skillMatchNotifications: true, messageNotifications: true,
        projectNotifications: true, tokenNotifications: false,
        profileView: "everyone", showEmail: false, showPhone: false, twoFactor: false,
        theme: window.SkillSyncTheme ? window.SkillSyncTheme.current() : "system",
        autoTokenUse: true, tokenConfirmation: false, projectTokenUse: true,
        allowConnections: true, allowProjects: true, allowNewMessages: false
    };
    $scope.tokenBalance = 0;

    // ==============================
    // LOAD FROM SERVER
    // ==============================
    var loaded = false;
    var lastSaved = null;

    $http.get(API + '/settings', authConfig()).then(function (res) {
        angular.extend($scope.settings, res.data.settings);
        $scope.tokenBalance = res.data.tokenBalance;
        if (window.SkillSyncTheme) window.SkillSyncTheme.apply($scope.settings.theme);
        lastSaved = angular.copy($scope.settings);
        $timeout(function () { loaded = true; });
    }, function (err) {
        if (!handleAuthError(err)) $scope.showToast(errMsg(err, 'Could not load settings'));
    });

    // ==============================
    // AUTO-SAVE (debounced, sends only changed keys)
    // ==============================
    var saveTimer = null;

    $scope.$watch('settings', function (n) {
        if (!loaded) return;
        $timeout.cancel(saveTimer);
        saveTimer = $timeout(function () {
            var diff = {};
            angular.forEach(n, function (v, k) {
                if (!angular.equals(v, lastSaved[k])) diff[k] = v;
            });
            if (!Object.keys(diff).length) return;

            $http.put(API + '/settings', diff, authConfig()).then(function () {
                lastSaved = angular.copy(n);
                if (diff.theme === undefined) $scope.showToast('Settings saved');
            }, function (err) {
                if (handleAuthError(err)) return;
                $scope.showToast(errMsg(err, 'Could not save settings'));
            });
        }, 600);
    }, true);

    // ==============================
    // SETTINGS NAVIGATION + SCROLL SPY
    // ==============================
    $scope.activeSection = "account";
    var sections = ["account", "notifications", "privacy", "appearance", "tokens", "communication", "help", "about"];

    $scope.selectSection = function (section) {
        $scope.activeSection = section;
        var el = document.getElementById(section);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    function updateActiveSection() {
        var scrollPos = $window.pageYOffset || document.documentElement.scrollTop;
        var current = sections[0];
        for (var i = 0; i < sections.length; i++) {
            var el = document.getElementById(sections[i]);
            if (el && scrollPos >= el.offsetTop - 140) current = sections[i];
        }
        if ($scope.activeSection !== current) {
            $scope.$applyAsync(function () { $scope.activeSection = current; });
        }
    }
    angular.element($window).on("scroll", updateActiveSection);
    $timeout(updateActiveSection, 100);
    $scope.$on("$destroy", function () { angular.element($window).off("scroll", updateActiveSection); });

    // ==============================
    // SIDEBAR / PROFILE MENU
    // ==============================
    $scope.toggleSidebar = function () { $scope.sidebarOpen = !$scope.sidebarOpen; };
    $scope.toggleProfileMenu = function () { $scope.profileOpen = !$scope.profileOpen; };

    // ==============================
    // MODAL
    // ==============================
    $scope.modal = null;
    $scope.openModal = function (name) { $scope.modal = name; };
    $scope.closeModal = function () { $scope.modal = null; };

    // ==============================
    // CHANGE EMAIL
    // ==============================
    $scope.newEmail = "";
    $scope.saveEmail = function () {
        if (!$scope.newEmail) return $scope.showToast("Please enter a new email address");
        $http.put(API + '/account/email', { email: $scope.newEmail }, authConfig()).then(function (res) {
            $scope.showToast(res.data.message);
            $scope.newEmail = "";
            $scope.closeModal();
        }, function (err) { $scope.showToast(errMsg(err)); });
    };

    // ==============================
    // CHANGE PASSWORD
    // ==============================
    $scope.password = { current: "", newPassword: "", confirmPassword: "" };
    $scope.savePassword = function () {
        var p = $scope.password;
        if (!p.current || !p.newPassword || !p.confirmPassword)
            return $scope.showToast("Please fill all password fields");
        if (p.newPassword !== p.confirmPassword)
            return $scope.showToast("Passwords do not match");

        $http.put(API + '/account/password',
            { current: p.current, newPassword: p.newPassword }, authConfig()
        ).then(function (res) {
            $scope.showToast(res.data.message);
            $scope.password = { current: "", newPassword: "", confirmPassword: "" };
            $scope.closeModal();
        }, function (err) { $scope.showToast(errMsg(err)); });
    };

    // ==============================
    // DELETE ACCOUNT
    // ==============================
    $scope.confirmDelete = function () {
        $http.delete(API + '/account', authConfig()).then(function () {
            localStorage.removeItem('skillsync_token');
            localStorage.removeItem('skillsync_user');
            $scope.closeModal();
            $scope.showToast("Account deleted");
            $timeout(function () { $window.location.href = 'login.html'; }, 1200);
        }, function (err) { $scope.showToast(errMsg(err)); });
    };

    // ==============================
    // TOKEN HISTORY / LOGIN ACTIVITY
    // ==============================
    $scope.loginActivity = [];

    // Token history lives on the Skill Wallet page
    $scope.goToWallet = function () {
        $window.location.href = 'wallet.html';
    };

    $scope.loadLoginActivity = function () {
        $http.get(API + '/login-activity', authConfig()).then(function (res) {
            $scope.loginActivity = res.data.activity;
            $scope.openModal('activityModal');
        }, function (err) { $scope.showToast(errMsg(err)); });
    };

    // ==============================
    // SUPPORT FORMS (report a problem / contact support)
    // ==============================
    $scope.support = { subject: "", message: "" };
    $scope.sending = false;

    $scope.submitSupport = function (type) {
        var f = $scope.support;
        if (!f.subject || !f.message) return $scope.showToast("Please fill in subject and message");
        $scope.sending = true;
        $http.post(API + '/support', { type: type, subject: f.subject, message: f.message }, authConfig())
            .then(function (res) {
                $scope.showToast(res.data.message);
                $scope.support = { subject: "", message: "" };
                $scope.closeModal();
            }, function (err) {
                if (!handleAuthError(err)) $scope.showToast(errMsg(err));
            })
            .finally(function () { $scope.sending = false; });
    };

    // ==============================
    // FAQ ACCORDION + INFO CONTENT
    // ==============================
    $scope.faqs = [
        { q: "What are Skill Tokens?", a: "Skill Tokens (ST) are the currency of SkillSync. Every new user gets 5 free tokens. You earn tokens by teaching skills and spend them to learn from other students." },
        { q: "How do I earn more tokens?", a: "Teach a skill, share knowledge with peers, complete achievements and help on projects. Earned tokens appear in your Skill Wallet instantly." },
        { q: "How do I learn a new skill?", a: "Open Learn Skills, search or browse recommended mentors, check the token cost and send a request to learn. Tokens are spent once the mentor accepts." },
        { q: "How do I find project teammates?", a: "Go to Find Teammates, filter by skill or interest and send a request. You can also create a project in My Projects and invite collaborators." },
        { q: "Can I change who sees my profile?", a: "Yes. Under Settings → Privacy & Security you can choose Everyone, SkillSync Users or Only Connections, and hide your email or phone number." },
        { q: "How do I change my email or password?", a: "Settings → Account → Change Email / Change Password. For a password change you need to enter your current password." },
        { q: "How do I switch to dark mode?", a: "Settings → Appearance → choose Light, Dark or System Default. Your choice is saved to your account." },
        { q: "Can I delete my account?", a: "Yes, from Settings → Account → Delete Account. This permanently removes your profile, wallet, resume and settings and cannot be undone." }
    ];
    $scope.openFaq = -1;
    $scope.toggleFaq = function (i) { $scope.openFaq = ($scope.openFaq === i) ? -1 : i; };

    $scope.guides = [
        { icon: "fa-rocket", title: "Getting started", text: "Create your profile, add the skills you know and the skills you want to learn. You start with 5 free Skill Tokens." },
        { icon: "fa-book-open", title: "Learning & teaching", text: "Learn Skills lets you request sessions from peers. Teach Skills lets you share what you know and earn tokens." },
        { icon: "fa-coins", title: "Skill Wallet", text: "Track your balance, earnings and spending. Open the wallet any time from the sidebar." },
        { icon: "fa-users", title: "Teams & projects", text: "Find teammates, manage your projects, track progress and add GitHub or live demo links." },
        { icon: "fa-file-lines", title: "Resume builder", text: "Turn your skills, projects and achievements into a resume from Build Resume." },
        { icon: "fa-shield-halved", title: "Account safety", text: "Use a strong password, review your login activity, and keep email/phone hidden unless you need them public." }
    ];

    // ==============================
    // APPEARANCE / THEME (dark mode)
    // ==============================
    document.documentElement.classList.add('theme-ready');
    $scope.changeTheme = function () {
        var theme = $scope.settings.theme;
        window.SkillSyncTheme.apply(theme);   // instant, also persisted in localStorage
        $scope.showToast(theme.charAt(0).toUpperCase() + theme.slice(1) + " mode selected");
        // server save happens through the $watch above
    };

    // ==============================
    // TOAST
    // ==============================
    $scope.toastVisible = false;
    $scope.toastMessage = "";
    var toastTimer;
    $scope.showToast = function (message) {
        $scope.toastMessage = message;
        $scope.toastVisible = true;
        $timeout.cancel(toastTimer);
        toastTimer = $timeout(function () { $scope.toastVisible = false; }, 2500);
    };

    // ==============================
    // LOGOUT
    // ==============================
    $scope.logout = function () {
        $scope.profileOpen = false;
        $scope.showToast("Signing out...");
        localStorage.removeItem('skillsync_token');
        localStorage.removeItem('skillsync_user');
        $timeout(function () { window.location.href = "login.html"; }, 1000);
    };
});