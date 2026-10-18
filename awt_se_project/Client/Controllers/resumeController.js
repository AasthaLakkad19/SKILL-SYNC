app.controller("ResumeController", function ($scope, $http, $timeout) {
  $scope.resume = {
    personalInfo: {},
    education: [],
    skills: { technical: [], soft: [], tools: [] },
    experience: [],
    projects: [],
    certifications: [],
    achievements: [],
  };

  $scope.newSkill = { technical: "", soft: "", tools: "" };
  $scope.completion = 0;
  $scope.saving = false;
  $scope.showResume = false;
  $scope.template = "modern";

  // Dashboard UI state
  $scope.sidebarOpen = false;
  $scope.profileOpen = false;
  $scope.tokens = 5;
  $scope.searchText = "";

  $scope.toggleSidebar = function () {
    $scope.sidebarOpen = !$scope.sidebarOpen;
  };

  $scope.toggleProfileMenu = function () {
    $scope.profileOpen = !$scope.profileOpen;
  };

  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest(".profile-menu")) {
      $scope.$applyAsync(function () {
        $scope.profileOpen = false;
      });
    }
  });

  $scope.$watch("sidebarOpen", function (open) {
    document.body.style.overflow = open ? "hidden" : "";
  });

  $scope.logout = function () {
    if (confirm("Sign out of SkillSync?")) {
      window.location.href = "index.html";
    }
  };

  // Clear Resume
  $scope.clearResume = function () {
    const confirmClear = confirm(
      "Are you sure you want to clear the entire resume?\nThis action cannot be undone.",
    );

    if (!confirmClear) return;

    $scope.resume = {
      personalInfo: {
        fullName: "",
        email: "",
        phone: "",
        location: "",
        linkedin: "",
        github: "",
        bio: "",
        photo: "",
      },
      education: [],
      skills: {
        technical: [],
        soft: [],
        tools: [],
      },
      experience: [],
      projects: [],
      certifications: [],
      achievements: [],
    };

    $scope.newSkill = {
      technical: "",
      soft: "",
      tools: "",
    };

    $scope.completion = 0;
    $scope.template = "modern";

    $http
      .delete("http://localhost:3000/api/resume?userId=demo-user")
      .then(function () {
        alert("Resume cleared successfully!");
      })
      .catch(function (err) {
        console.error("Error clearing resume from database:", err);
        alert(
          "Resume cleared from form, but there was an issue deleting from database.",
        );
      });
  };

  // Load Resume
  $scope.loadResume = function () {
    $http
      .get("/api/resume?userId=demo-user")
      .then(function (res) {
        if (res.data) {
          $scope.resume = angular.merge($scope.resume, res.data);
          $scope.calculateCompletion();
        }
      })
      .catch(function (err) {
        console.error("Error loading resume:", err);
      });
  };

  $scope.loadResume();

  // Calculate Resume Completion
  $scope.calculateCompletion = function () {
    let score = 0;
    const r = $scope.resume;

    if (r.personalInfo.fullName && r.personalInfo.email) score += 20;

    if (r.education && r.education.length) score += 15;

    if (
      (r.skills.technical && r.skills.technical.length) ||
      (r.skills.tools && r.skills.tools.length)
    )
      score += 20;

    if (r.experience && r.experience.length) score += 15;

    if (r.projects && r.projects.length) score += 15;

    if (r.certifications && r.certifications.length) score += 10;

    if (r.achievements && r.achievements.length) score += 5;

    $scope.completion = score;
  };

  $scope.$watch(
    "resume",
    function () {
      $scope.calculateCompletion();
    },
    true,
  );

  // Education
  $scope.addEducation = function () {
    $scope.resume.education.push({
      degree: "",
      college: "",
      year: "",
      score: "",
    });
  };

  $scope.removeEducation = function (i) {
    $scope.resume.education.splice(i, 1);
  };

  // Experience
  $scope.addExperience = function () {
    $scope.resume.experience.push({
      company: "",
      position: "",
      duration: "",
      description: "",
    });
  };

  $scope.removeExperience = function (i) {
    $scope.resume.experience.splice(i, 1);
  };

  // Projects
  $scope.addProject = function () {
    $scope.resume.projects.push({
      name: "",
      technologies: "",
      description: "",
      link: "",
    });
  };

  $scope.removeProject = function (i) {
    $scope.resume.projects.splice(i, 1);
  };

  // Certifications
  $scope.addCertification = function () {
    $scope.resume.certifications.push({
      name: "",
      organization: "",
      date: "",
      link: "",
    });
  };

  $scope.removeCertification = function (i) {
    $scope.resume.certifications.splice(i, 1);
  };

  // Achievements
  $scope.addAchievement = function () {
    $scope.resume.achievements.push("");
  };

  $scope.removeAchievement = function (i) {
    $scope.resume.achievements.splice(i, 1);
  };

  // Skills
  $scope.addSkill = function (type) {
    const val = $scope.newSkill[type];

    if (val && val.trim()) {
      $scope.resume.skills[type].push(val.trim());
      $scope.newSkill[type] = "";
    }
  };

  $scope.removeSkill = function (type, index) {
    $scope.resume.skills[type].splice(index, 1);
  };
  // ===== Validation helpers =====
  $scope.isValidName = function (val) {
    return /^[A-Za-z\s\.\-]{2,60}$/.test(val || "");
  };

  $scope.isValidEmail = function (val) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val || "");
  };

  $scope.isValidPhone = function (val) {
    return /^[\d\s\+\-\(\)]{7,18}$/.test(val || "");
  };

  $scope.isValidUrl = function (val) {
    if (!val) return true;
    try {
      new URL(val);
      return true;
    } catch (e) {
      return false;
    }
  };

  // Block non-phone characters while typing
  $scope.restrictPhone = function (e) {
    const allowed = /[\d\s\+\-\(\)]/;
    if (
      !allowed.test(e.key) &&
      e.key !== "Backspace" &&
      e.key !== "Delete" &&
      e.key !== "Tab"
    ) {
      e.preventDefault();
    }
  };

  // Optional: validate before saving
  $scope.validateResume = function () {
    const r = $scope.resume.personalInfo;
    if (!r.fullName || !r.email) {
      alert("Full Name and Email are required.");
      return false;
    }
    if (r.fullName && !$scope.isValidName(r.fullName)) {
      alert("Full Name can only contain letters, spaces, dots and hyphens.");
      return false;
    }
    if (r.email && !$scope.isValidEmail(r.email)) {
      alert("Please enter a valid email address.");
      return false;
    }
    if (r.phone && !$scope.isValidPhone(r.phone)) {
      alert("Phone number can only contain digits, spaces, +, -, ( ).");
      return false;
    }
    if (r.linkedin && !$scope.isValidUrl(r.linkedin)) {
      alert("LinkedIn must be a valid URL (start with https://).");
      return false;
    }
    if (r.github && !$scope.isValidUrl(r.github)) {
      alert("GitHub must be a valid URL (start with https://).");
      return false;
    }
    return true;
  };
  // Photo
  $scope.triggerPhotoUpload = function () {
    document.getElementById("photoInput").click();
  };

  $scope.uploadPhoto = function (event) {
    const file = event.target.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (e) {
      $scope.$apply(function () {
        $scope.resume.personalInfo.photo = e.target.result;
      });
    };

    reader.readAsDataURL(file);
  };

  // Save Resume
  $scope.saveResume = function () {
    if (!$scope.validateResume()) return;

    $scope.saving = true;
    const dataToSend = angular.copy($scope.resume);
    dataToSend.userId = "demo-user";

    $http
      .post("/api/resume", dataToSend)
      .then(function (res) {
        alert("Resume saved successfully!");
      })
      .catch(function (err) {
        alert("Error saving resume");
        console.error(err);
      })
      .finally(function () {
        $scope.saving = false;
      });
  };

  // Also fix the bottom button which currently calls the non-existent saveProfile()
  $scope.saveProfile = $scope.saveResume;

  // Resume Preview
  $scope.previewResume = function () {
    $scope.showResume = true;
  };

  $scope.closeResume = function (e) {
    if (e.target.classList.contains("modal-overlay")) {
      $scope.showResume = false;
    }
  };

  // Download PDF
  // ================= PDF DOWNLOAD =================

  $scope.downloadPDF = function () {
    console.log("Download PDF clicked");

    var element = document.getElementById("resume-paper");

    if (!element) {
      alert("Resume preview not found.");
      console.error("resume-paper element not found");
      return;
    }

    if (typeof html2pdf === "undefined") {
      alert("PDF library is not loaded.");
      console.error("html2pdf is undefined");
      return;
    }

    var fullName = "Resume";

    if (
      $scope.resume &&
      $scope.resume.personalInfo &&
      $scope.resume.personalInfo.fullName
    ) {
      fullName = $scope.resume.personalInfo.fullName
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, "_");
    }

    console.log("Starting PDF generation...");

    var options = {
      margin: 0,
      filename: fullName + "_SkillSync.pdf",

      image: {
        type: "jpeg",
        quality: 0.98,
      },

      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: true,
      },

      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: "portrait",
      },

      pagebreak: {
        mode: ["css", "legacy"],
      },
    };

    html2pdf()
      .set(options)
      .from(element)
      .save()
      .then(function () {
        console.log("PDF downloaded successfully.");
      })
      .catch(function (error) {
        console.error("PDF generation error:", error);
        alert("PDF generation failed. Check the browser console.");
      });
  };
  // Active section for side-nav highlight (scroll-spy)
  $scope.activeSection = "personal";

  // Scroll to section AND mark it active
  $scope.scrollTo = function (id) {
    $scope.activeSection = id;
    var el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  // Scroll-spy: update activeSection while user scrolls
  (function initScrollSpy() {
    var sectionIds = [
      "personal",
      "education",
      "skills",
      "experience",
      "projects",
      "certifications",
      "achievements",
    ];

    function onScroll() {
      var scrollPos =
        window.scrollY ||
        window.pageYOffset ||
        document.documentElement.scrollTop;
      var offset = 140; // account for sticky header
      var current = sectionIds[0];

      for (var i = 0; i < sectionIds.length; i++) {
        var el = document.getElementById(sectionIds[i]);
        if (el) {
          var top = el.getBoundingClientRect().top + scrollPos - offset;
          if (scrollPos >= top) {
            current = sectionIds[i];
          }
        }
      }

      if ($scope.activeSection !== current) {
        $scope.$applyAsync(function () {
          $scope.activeSection = current;
        });
      }
    }

    var ticking = false;
    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          window.requestAnimationFrame(function () {
            onScroll();
            ticking = false;
          });
          ticking = true;
        }
      },
      { passive: true },
    );

    setTimeout(onScroll, 300);
  })();
});
