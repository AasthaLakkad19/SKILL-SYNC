app.controller("SignupController", function ($scope, $http, $timeout) {

    // ==============================
    // USER DATA
    // ==============================
    $scope.user = {
        name: "",
        email: "",
        password: "",
        confirmPassword: ""
    };

    // ==============================
    // PAGE DATA
    // ==============================
    $scope.freeTokens = 5;
    $scope.passwordVisible = false;
    $scope.passwordInputType = "password";
    $scope.isLoading = false;
    $scope.signupButtonText = "Create Account";
    $scope.errorMessage = "";

    // ==============================
    // SHOW / HIDE PASSWORD
    // ==============================
    $scope.togglePassword = function () {
        $scope.passwordVisible = !$scope.passwordVisible;
        $scope.passwordInputType = $scope.passwordVisible ? "text" : "password";
    };

    // ==============================
    // SIGN UP
    // ==============================
    $scope.signup = function () {

        if ($scope.isLoading) return;

        // Basic validation
        if (!$scope.user.name || !$scope.user.email || !$scope.user.password) {
            $scope.errorMessage = "Please fill in all fields.";
            return;
        }

        if ($scope.user.password !== $scope.user.confirmPassword) {
            $scope.errorMessage = "Passwords do not match.";
            return;
        }

        if ($scope.user.password.length < 6) {
            $scope.errorMessage = "Password must be at least 6 characters.";
            return;
        }

        $scope.isLoading = true;
        $scope.signupButtonText = "Creating Account...";
        $scope.errorMessage = "";

        $http.post("http://localhost:3000/api/auth/register", {
            name: $scope.user.name,
            email: $scope.user.email,
            password: $scope.user.password
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

            $scope.signupButtonText = "Welcome!";
            $scope.freeTokens = response.data.freeTokens;

            // Redirect after success
            $timeout(function () {
                window.location.href = "/home";   // change path if needed
            }, 800);

        })
        .catch(function (error) {
            $scope.isLoading = false;
            $scope.signupButtonText = "Create Account";
            $scope.errorMessage = error.data?.message || "Something went wrong. Please try again.";
        });
    };


    // ==============================
    // GOOGLE SIGNUP (placeholder)
    // ==============================
    $scope.googleSignup = function () {
        alert("Google Signup will be connected later.");
    };

});