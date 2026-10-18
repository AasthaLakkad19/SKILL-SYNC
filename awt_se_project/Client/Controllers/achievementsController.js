/* ============================================================
   SkillSync - Achievements Controller
   ============================================================ */

app.controller("AchievementsController", function ($scope, $http) {

    // =========================
    // UI STATE
    // =========================

    $scope.categories = [
        "All",
        "Learning",
        "Teaching",
        "Collaboration",
        "Community"
    ];

    $scope.selectedCategory = "All";
    $scope.sidebarOpen = false;

    $scope.sections = [
        {
            name: "Learning",
            emoji: "📚",
            blurb: "Skills you pick up"
        },
        {
            name: "Teaching",
            emoji: "🎓",
            blurb: "Skills you pass on"
        },
        {
            name: "Collaboration",
            emoji: "🤝",
            blurb: "Projects you build together"
        },
        {
            name: "Community",
            emoji: "💬",
            blurb: "People you connect with"
        }
    ];


    // =========================
    // ACHIEVEMENT DATA
    // =========================

    $scope.achievements = [];

    $scope.groups = {};


    // =========================
    // LOAD ACHIEVEMENTS
    // =========================

    $scope.loadAchievements = function () {

        $http.get("/api/achievements")
            .then(function (response) {

                if (response.data.success) {

                    $scope.achievements =
                        response.data.achievements;

                    $scope.buildGroups();

                    console.log(
                        "Achievements loaded:",
                        $scope.achievements
                    );
                }

            })
            .catch(function (error) {

                console.error(
                    "Failed to load achievements:",
                    error
                );

            });
    };


    // =========================
    // UPDATE ACHIEVEMENT PROGRESS
    // =========================

    $scope.updateProgress = function (achievementId, current) {

        $http.put(
            "/api/achievements/" +
            achievementId +
            "/progress",
            {
                current: current
            }
        )
        .then(function (response) {

            if (response.data.success) {

                // Replace old achievement
                // with updated MongoDB data

                var updated =
                    response.data.achievement;

                var index =
                    $scope.achievements.findIndex(
                        function (item) {
                            return item.id === updated.id;
                        }
                    );

                if (index !== -1) {

                    $scope.achievements[index] =
                        updated;

                }

                $scope.buildGroups();

                console.log(
                    "Achievement updated:",
                    updated
                );

            }

        })
        .catch(function (error) {

            console.error(
                "Failed to update achievement:",
                error
            );

        });
    };


    // =========================
    // AUTOMATIC PROGRESS UPDATE
    // =========================

    /*
       Call this function whenever
       a user completes an activity.

       Example:

       $scope.recordActivity(
           "Learning",
           1
       );
    */

    $scope.recordActivity = function (
        category,
        amount
    ) {

        angular.forEach(
            $scope.achievements,
            function (achievement) {

                if (
                    achievement.category === category &&
                    !achievement.unlocked
                ) {

                    var newCurrent =
                        achievement.current + amount;

                    $scope.updateProgress(
                        achievement.id,
                        newCurrent
                    );
                }

            }
        );
    };


    // =========================
    // EXAMPLE ACTIVITY FUNCTIONS
    // =========================

    // Call after user learns a skill
    $scope.skillLearned = function () {

        $scope.recordActivity(
            "Learning",
            1
        );
    };


    // Call after user teaches a skill
    $scope.skillTaught = function () {

        $scope.recordActivity(
            "Teaching",
            1
        );
    };


    // Call after user joins a project
    $scope.projectJoined = function () {

        $scope.recordActivity(
            "Collaboration",
            1
        );
    };


    // Call after user connects with another student
    $scope.studentConnected = function () {

        $scope.recordActivity(
            "Community",
            1
        );
    };


    // =========================
    // GROUP ACHIEVEMENTS
    // =========================

    $scope.buildGroups = function () {

        $scope.groups = {};

        angular.forEach(
            $scope.sections,
            function (section) {

                $scope.groups[section.name] = [];

            }
        );

        angular.forEach(
            $scope.achievements,
            function (item) {

                if (!$scope.groups[item.category]) {

                    $scope.groups[item.category] = [];

                }

                $scope.groups[item.category].push(item);

            }
        );
    };


    // =========================
    // GET BY CATEGORY
    // =========================

    $scope.getByCategory = function (category) {

        return $scope.groups[category] || [];

    };


    // =========================
    // CATEGORY FILTER
    // =========================

    $scope.setCategory = function (category) {

        $scope.selectedCategory = category;

    };


    $scope.isActiveCategory = function (category) {

        return $scope.selectedCategory === category;

    };


    $scope.isSectionVisible = function (category) {

        if (
            $scope.selectedCategory !== "All" &&
            $scope.selectedCategory !== category
        ) {

            return false;

        }

        return $scope.getByCategory(category).length > 0;

    };


    // =========================
    // COUNTS
    // =========================

    $scope.totalCount = function () {

        return $scope.achievements.length;

    };


    $scope.unlockedCount = function () {

        var count = 0;

        angular.forEach(
            $scope.achievements,
            function (item) {

                if (item.unlocked === true) {

                    count++;

                }

            }
        );

        return count;

    };


    $scope.lockedCount = function () {

        return (
            $scope.totalCount() -
            $scope.unlockedCount()
        );

    };


    // =========================
    // COMPLETION
    // =========================

    $scope.completionPercent = function () {

        if ($scope.totalCount() === 0) {

            return 0;

        }

        return Math.round(
            (
                $scope.unlockedCount() /
                $scope.totalCount()
            ) * 100
        );

    };


    // =========================
    // PROGRESS
    // =========================

    $scope.getProgress = function (item) {

        if (
            !item ||
            !item.target ||
            item.target <= 0
        ) {

            return 0;

        }

        var percent =
            (item.current / item.target) * 100;

        return Math.min(
            100,
            Math.round(percent)
        );

    };


    $scope.getProgressWidth = function (item) {

        return $scope.getProgress(item) + "%";

    };


    // =========================
    // REMAINING TEXT
    // =========================

    $scope.getRemainingText = function (item) {

        var remaining =
            item.target - item.current;

        if (remaining <= 0) {

            return "Ready to unlock";

        }

        return (
            remaining +
            " more " +
            item.unit +
            " to unlock"
        );

    };


    // =========================
    // LATEST ACHIEVEMENT
    // =========================

    var MONTHS = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec"
    ];


    function parseDate(text) {

        if (!text) {

            return null;

        }

        var parts =
            text.split(" ");

        var month =
            MONTHS.indexOf(parts[1]);

        if (month === -1) {

            return null;

        }

        return new Date(
            parseInt(parts[2], 10),
            month,
            parseInt(parts[0], 10)
        );

    }


    $scope.getLatestAchievement =
        function () {

            var latest = null;
            var latestTime = -1;

            angular.forEach(
                $scope.achievements,
                function (item) {

                    if (!item.unlocked) {

                        return;

                    }

                    var date =
                        parseDate(item.earnedDate);

                    var time =
                        date
                            ? date.getTime()
                            : 0;

                    if (
                        time > latestTime ||
                        (
                            time === latestTime &&
                            latest &&
                            item.id > latest.id
                        )
                    ) {

                        latest = item;

                        latestTime = time;

                    }

                }
            );

            return latest;

        };


    // =========================
    // VISIBLE COUNT
    // =========================

    $scope.visibleCount = function () {

        var count = 0;

        angular.forEach(
            $scope.sections,
            function (section) {

                if (
                    $scope.isSectionVisible(
                        section.name
                    )
                ) {

                    count +=
                        $scope.getByCategory(
                            section.name
                        ).length;

                }

            }
        );

        return count;

    };


    // =========================
    // SIDEBAR
    // =========================

    $scope.toggleSidebar = function () {

        $scope.sidebarOpen =
            !$scope.sidebarOpen;

    };


    // =========================
    // INITIALIZE
    // =========================

    $scope.loadAchievements();

});