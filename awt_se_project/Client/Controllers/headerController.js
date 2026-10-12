app.controller("HeaderController", function ($scope) {

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

    // Profile dropdown
    $scope.profileOpen = false;

    $scope.toggleProfileMenu = function () {
        $scope.profileOpen = !$scope.profileOpen;
    };

    // Logout
    $scope.logout = function () {

        localStorage.removeItem("skillsync_token");
        localStorage.removeItem("skillsync_user");

        window.location.href = "index.html";
    };

});