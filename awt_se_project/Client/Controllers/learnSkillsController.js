angular.module("skillSyncApp").controller("LearnSkillsController", [
  "$scope",
  "$timeout",
  "$filter",
  function ($scope, $timeout, $filter) {
    /* ---------- Page state ---------- */
    $scope.sidebarOpen = false;
    $scope.tab = "learning";
    $scope.selected = null;
    $scope.chosenTeacher = null;
    $scope.toast = "";

    $scope.categories = ["All", "Programming", "Design", "Data", "Career"];
    $scope.filters = { query: "", category: "All", sort: "-rating" };

    /* ---------- Tokens ----------
       Reads the same value the rest of the app can write.
       Replace this with your wallet/auth service when it is ready. */
    function loadTokens() {
      try {
        var saved = localStorage.getItem("skillTokens");
        return saved !== null ? Number(saved) : 5;
      } catch (e) {
        return 5;
      }
    }
    function saveTokens(value) {
      try {
        localStorage.setItem("skillTokens", String(value));
      } catch (e) {}
    }
    $scope.tokens = loadTokens();

    /* ---------- Skill catalog (sample data) ---------- */
    var skills = [
      {
        id: 1,
        name: "Python",
        icon: "🐍",
        category: "Programming",
        level: "Beginner",
        tokens: 2,
        duration: "4 weeks",
        learners: 128,
        short: "Variables, loops, functions and small scripts you can actually run.",
        description:
          "Start from zero and write real Python. Each session is a short, hands-on task so you finish with scripts you can reuse in your own projects.",
        topics: ["Variables and data types", "Loops and conditions", "Functions", "Lists and dictionaries", "File handling"],
        teachers: [
          { name: "Aarav Shah", bio: "3rd year CSE, Python tutor", rating: 4.8, sessions: 42 },
          { name: "Diya Patel", bio: "Data science club member", rating: 4.6, sessions: 27 }
        ],
        reviews: [
          { by: "Riya M.", rating: 5, text: "Clear examples and patient with questions." },
          { by: "Kabir S.", rating: 4, text: "Good pace. I would like more practice problems." }
        ]
      },
      {
        id: 2,
        name: "Java",
        icon: "☕",
        category: "Programming",
        level: "Intermediate",
        tokens: 3,
        duration: "5 weeks",
        learners: 96,
        short: "Object-oriented programming, collections and exception handling.",
        description:
          "Build a solid base in object-oriented Java with classes, interfaces and collections, then apply it in a small console project.",
        topics: ["Classes and objects", "Inheritance and interfaces", "Collections framework", "Exceptions", "Mini project"],
        teachers: [
          { name: "Meet Desai", bio: "Final year, Java developer intern", rating: 4.7, sessions: 35 }
        ],
        reviews: [
          { by: "Nisha T.", rating: 5, text: "The mini project made everything click." },
          { by: "Om P.", rating: 4, text: "Detailed explanations of OOP concepts." }
        ]
      },
      {
        id: 3,
        name: "Figma",
        icon: "🎨",
        category: "Design",
        level: "Beginner",
        tokens: 2,
        duration: "3 weeks",
        learners: 84,
        short: "Frames, components and prototypes for your first app design.",
        description:
          "Learn to design screens in Figma, build reusable components and link them into a clickable prototype.",
        topics: ["Frames and layout", "Auto layout", "Components and variants", "Prototyping", "Handoff to developers"],
        teachers: [
          { name: "Anika Joshi", bio: "UI/UX design club lead", rating: 4.9, sessions: 51 },
          { name: "Yash Mehta", bio: "Freelance designer", rating: 4.5, sessions: 19 }
        ],
        reviews: [
          { by: "Sara K.", rating: 5, text: "Finished my portfolio mockup in two sessions." },
          { by: "Dev R.", rating: 5, text: "Great tips on spacing and typography." }
        ]
      },
      {
        id: 4,
        name: "React",
        icon: "⚛️",
        category: "Programming",
        level: "Intermediate",
        tokens: 3,
        duration: "6 weeks",
        learners: 110,
        short: "Components, props, state and hooks by building a small app.",
        description:
          "Learn how React thinks about UI. You build a small app step by step and learn component design, state and hooks along the way.",
        topics: ["JSX and components", "Props and state", "Hooks", "Routing", "Fetching data"],
        teachers: [
          { name: "Kunal Rana", bio: "Full-stack developer, hackathon winner", rating: 4.8, sessions: 38 }
        ],
        reviews: [
          { by: "Jiya B.", rating: 5, text: "Hooks finally make sense." },
          { by: "Arjun V.", rating: 4, text: "Fast paced but worth it." }
        ]
      },
      {
        id: 5,
        name: "SQL & Databases",
        icon: "🗄️",
        category: "Data",
        level: "Beginner",
        tokens: 2,
        duration: "3 weeks",
        learners: 72,
        short: "Write queries, join tables and design a simple schema.",
        description:
          "Understand how data is stored and retrieved. You will practise SELECT, JOIN and GROUP BY on real sample datasets.",
        topics: ["SELECT and filtering", "Joins", "Aggregations", "Schema design", "Indexes basics"],
        teachers: [
          { name: "Pooja Nair", bio: "DBMS teaching assistant", rating: 4.6, sessions: 24 }
        ],
        reviews: [
          { by: "Harsh L.", rating: 5, text: "Joins explained in a way I could remember." },
          { by: "Tanvi A.", rating: 4, text: "Helpful practice datasets." }
        ]
      },
      {
        id: 6,
        name: "Resume & Interviews",
        icon: "📄",
        category: "Career",
        level: "Beginner",
        tokens: 1,
        duration: "1 week",
        learners: 140,
        short: "Shape your resume and practise common interview questions.",
        description:
          "Turn your projects and skills into a clear one-page resume, then run mock interviews with feedback.",
        topics: ["Resume structure", "Describing projects", "Common questions", "Mock interview", "Feedback and follow-up"],
        teachers: [
          { name: "Ishita Rao", bio: "Placement cell volunteer", rating: 4.9, sessions: 60 },
          { name: "Rohan Kapoor", bio: "Interned at two startups", rating: 4.4, sessions: 15 }
        ],
        reviews: [
          { by: "Mira D.", rating: 5, text: "My resume went from two pages to one strong page." },
          { by: "Zain H.", rating: 5, text: "The mock interview calmed my nerves." }
        ]
      }
    ];

    // average rating from teacher ratings
    skills.forEach(function (s) {
      var total = s.teachers.reduce(function (sum, t) { return sum + t.rating; }, 0);
      s.rating = total / s.teachers.length;
    });
    $scope.skills = skills;

    /* ---------- My learning / saved ---------- */
    $scope.myLearning = [
      { skillId: 4, name: "React", icon: "⚛️", teacher: "Kunal Rana", progress: 40, status: "learning" }
    ];
    $scope.savedIds = [];

    /* ---------- Helpers ---------- */
    function notify(message) {
      $scope.toast = message;
      $timeout(function () { $scope.toast = ""; }, 3000);
    }

    $scope.recommended = function () {
      // Replace with the interests from the user's profile when available
      return skills
        .filter(function (s) { return !$scope.isEnrolled(s); })
        .slice(0, 3);
    };

    $scope.visibleSkills = function () {
      var q = ($scope.filters.query || "").toLowerCase().trim();
      var list = skills.filter(function (s) {
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
      var i = $scope.savedIds.indexOf(skill.id);
      if (i === -1) {
        $scope.savedIds.push(skill.id);
        notify(skill.name + " saved for later.");
      } else {
        $scope.savedIds.splice(i, 1);
        notify(skill.name + " removed from saved.");
      }
    };
    $scope.savedSkills = function () {
      return skills.filter(function (s) { return $scope.isSaved(s); });
    };

    /* ---------- Learning flow ---------- */
    $scope.isEnrolled = function (skill) {
      return $scope.myLearning.some(function (m) {
        return m.skillId === skill.id && m.status === "learning";
      });
    };

    $scope.requestToLearn = function () {
      var s = $scope.selected;
      if (!s || !$scope.chosenTeacher) return;
      if ($scope.tokens < s.tokens) {
        notify("You need " + s.tokens + " tokens to learn " + s.name + ".");
        return;
      }
      if ($scope.isEnrolled(s)) return;

      $scope.tokens -= s.tokens;
      saveTokens($scope.tokens);

      $scope.myLearning.push({
        skillId: s.id,
        name: s.name,
        icon: s.icon,
        teacher: $scope.chosenTeacher.name,
        progress: 0,
        status: "learning"
      });

      notify("Request sent to " + $scope.chosenTeacher.name + ". " + s.tokens + " tokens spent.");
      $scope.tab = "learning";
      $scope.closeSkill();
    };

    $scope.addProgress = function (item) {
      item.progress = Math.min(100, item.progress + 20);
      if (item.progress === 100) notify("All lessons done. You can complete this skill.");
    };

    $scope.completeSkill = function (item) {
      if (item.progress < 100) {
        notify("Finish all lessons before completing " + item.name + ".");
        return;
      }
      item.status = "completed";
      $scope.tab = "completed";
      notify(item.name + " completed. Nice work!");
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