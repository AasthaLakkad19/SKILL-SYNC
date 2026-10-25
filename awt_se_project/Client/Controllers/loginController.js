app.controller("LoginController", function ($scope, $http, $timeout) {

    // ==============================
    // USER DATA
    // ==============================
    $scope.user = {
        email: "",
        password: "",
        remember: false
    };

    // ==============================
    // PAGE DATA
    // ==============================
    $scope.freeTokens = 5;
    $scope.passwordVisible = false;
    $scope.passwordInputType = "password";
    $scope.isLoading = false;
    $scope.loginButtonText = "Log In";
    $scope.errorMessage = "";   // new

    // ==============================
    // SHOW / HIDE PASSWORD
    // ==============================
    $scope.togglePassword = function () {
        $scope.passwordVisible = !$scope.passwordVisible;
        $scope.passwordInputType = $scope.passwordVisible ? "text" : "password";
    };

    // ==============================
    // LOGIN (now real API call)
    // ==============================
    $scope.login = function () {
        if ($scope.isLoading) return;

        if (!$scope.user.email || !$scope.user.password) {
            $scope.errorMessage = "Please fill in all fields.";
            return;
        }

        $scope.isLoading = true;
        $scope.loginButtonText = "Signing In...";
        $scope.errorMessage = "";

        $http.post("/api/auth/login", {
            email: $scope.user.email,
            password: $scope.user.password,
            remember: $scope.user.remember
        })
        .then(function (response) {
            // Save token & user data
            localStorage.setItem("skillsync_token", response.data.token);
            localStorage.setItem("skillsync_user", JSON.stringify({
                _id: response.data._id,
                email: response.data.email,
                name: response.data.name,
                freeTokens: response.data.freeTokens
            }));

            $scope.loginButtonText = "Welcome!";
            $scope.freeTokens = response.data.freeTokens;

            $timeout(function () {
                window.location.href = "/home";
            }, 700);
        })
        .catch(function (error) {
            $scope.isLoading = false;
            $scope.loginButtonText = "Log In";
            $scope.errorMessage = error.data?.message || "Login failed. Please try again.";
        });
    };

    // ==============================
    // GOOGLE LOGIN (placeholder)
    // ==============================
    $scope.googleLogin = function () {
        alert("Google Login will be connected later.");
    };
});