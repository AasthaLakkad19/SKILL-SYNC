const Profile = require("../Models/Profile");
const Resume = require("../Models/Resume");
const Wallet = require("../Models/Wallet");
const { getUserAchievements } = require("../utils/achievementUtils");

// Helper (same as walletController)
function formatDate(date) {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  return (
    String(date.getDate()).padStart(2, "0") +
    " " +
    months[date.getMonth()] +
    " " +
    date.getFullYear()
  );
}

// Map FontAwesome class → emoji for Profile page
function getAchievementIcon(icon) {
  if (!icon) return "🏆";
  if (icon.startsWith("fa-") || icon.includes("fa-")) {
    // common mappings
    if (icon.includes("trophy")) return "🏆";
    if (icon.includes("star")) return "⭐";
    if (icon.includes("medal")) return "🥇";
    if (icon.includes("book")) return "📚";
    if (icon.includes("graduation") || icon.includes("user-graduate")) return "🎓";
    if (icon.includes("users") || icon.includes("handshake")) return "🤝";
    if (icon.includes("comments") || icon.includes("comment")) return "💬";
    if (icon.includes("fire")) return "🔥";
    if (icon.includes("rocket")) return "🚀";
    if (icon.includes("lightbulb")) return "💡";
    return "🏆"; // default
  }
  return icon; // already an emoji
}

// ============================================================
// GET MY PROFILE
// ============================================================
exports.getMyProfile = async (req, res) => {
  try {
    const userId = String(req.user._id);

    // ========================================================
    // 1. GET RESUME
    // ========================================================
    const resume = await Resume.findOne({ userId }).lean();

    // ========================================================
    // 2. GET PROFILE
    // ========================================================
    let profile = await Profile.findOne({ userId }).lean();

    if (!profile) {
      profile = {
        userId,
        verified: false,
        availability: "available",
        availabilityLabel: "Available for collaboration",
        availabilityNote: "Open to teaching sessions and project collaboration.",
        reviews: [],
        stats: { rating: 0 }
      };
    }

    // ========================================================
    // 3. GET OR CREATE WALLET   ← FIXED
    // ========================================================
    let wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      wallet = await Wallet.create({
        userId: userId,
        balance: 5,
        totalEarned: 5,
        totalSpent: 0,
        transactions: [
          {
            type: "earn",
            title: "Welcome Bonus",
            category: "Bonus",
            amount: 5,
            date: formatDate(new Date())
          }
        ]
      });
    }

    // convert to plain object
    wallet = wallet.toObject ? wallet.toObject() : wallet;

    // ========================================================
    // 4. GET ACHIEVEMENTS (unlocked only)
    // ========================================================
    const achievements = (await getUserAchievements(userId))
      .filter((a) => a.unlocked)
      .reverse();

    // ========================================================
    // RESUME DATA
    // ========================================================
    const resumeData = resume || {
      personalInfo: {},
      education: [],
      skills: { technical: [], soft: [], tools: [] },
      experience: [],
      projects: [],
      certifications: [],
      achievements: []
    };

    const personalInfo = resumeData.personalInfo || {};

    // ========================================================
    // NAME
    // ========================================================
    const name = personalInfo.fullName || "New User";
    const initial = name.charAt(0).toUpperCase();

    // ========================================================
    // EDUCATION
    // ========================================================
    let education = {
      degree: "",
      school: "",
      years: "",
      detail: ""
    };

    if (resumeData.education && resumeData.education.length > 0) {
      const edu = resumeData.education[0];
      education = {
        degree: edu.degree || "",
        school: edu.college || "",
        years: edu.year || "",
        detail: edu.score ? "Score: " + edu.score : ""
      };
    }

    // ========================================================
    // SKILLS
    // ========================================================
    const technicalSkills = resumeData.skills?.technical || [];
    const softSkills = resumeData.skills?.soft || [];
    const tools = resumeData.skills?.tools || [];

    const allSkills = [];

    technicalSkills.forEach(function (skill) {
      allSkills.push({
        name: skill,
        icon: "💻",
        level: 80,
        levelBand: "advanced",
        levelLabel: "Advanced"
      });
    });

    softSkills.forEach(function (skill) {
      allSkills.push({
        name: skill,
        icon: "🤝",
        level: 75,
        levelBand: "advanced",
        levelLabel: "Advanced"
      });
    });

    tools.forEach(function (skill) {
      allSkills.push({
        name: skill,
        icon: "🛠️",
        level: 70,
        levelBand: "intermediate",
        levelLabel: "Intermediate"
      });
    });

    // ========================================================
    // PROJECTS
    // ========================================================
    const projects = (resumeData.projects || []).map(function (project) {
      return {
        title: project.name || "Untitled Project",
        icon: "📁",
        description: project.description || "",
        tags: project.technologies
          ? project.technologies
              .split(",")
              .map(function (tag) {
                return tag.trim();
              })
              .filter(Boolean)
          : [],
        role: "Project Member",
        year: "",
        status: "completed",
        statusLabel: "Completed",
        link: project.link || ""
      };
    });

    // ========================================================
    // ACHIEVEMENTS (with emoji icons)
    // ========================================================
    const profileAchievements = achievements.map(function (achievement) {
      return {
        title: achievement.title,
        icon: getAchievementIcon(achievement.icon),
        date: achievement.earnedDate || "",
        description: achievement.description || "",
        category: achievement.category || "",
        bg: "linear-gradient(135deg, #ede9fe, #ddd6fe)"
      };
    });

    // ========================================================
    // SOCIAL LINKS
    // ========================================================
    const socialLinks = [];

    if (personalInfo.github) {
      socialLinks.push({
        label: "GitHub",
        icon: "⌥",
        url: personalInfo.github
      });
    }

    if (personalInfo.linkedin) {
      socialLinks.push({
        label: "LinkedIn",
        icon: "in",
        url: personalInfo.linkedin
      });
    }

    // ========================================================
    // WALLET DATA
    // ========================================================
    const tokenSummary = {
      balance: wallet.balance || 0,
      earned: wallet.totalEarned || 0,
      spent: wallet.totalSpent || 0
    };

    // ========================================================
    // PROFILE STATISTICS
    // ========================================================
    const oldStats = profile.stats || {};

    const stats = {
      skills: allSkills.length,
      projects: projects.length,
      achievements: profileAchievements.length,
      rating: oldStats.rating || 0,
      publicTokens: wallet.balance || 0
    };

    // ========================================================
    // FINAL PROFILE
    // ========================================================
    const finalProfile = {
      userId: userId,

      // FROM RESUME
      name: name,
      initial: initial,
      photoUrl: personalInfo.photo || null,
      headline: personalInfo.bio || "",
      bio: personalInfo.bio || "",
      location: personalInfo.location || "",
      education: education,
      socialLinks: socialLinks,
      skills: allSkills,
      projects: projects,

      // FROM ACHIEVEMENT PAGE
      achievements: profileAchievements,

      // FROM WALLET PAGE
      tokenSummary: tokenSummary,

      // PROFILE-SPECIFIC
      verified: profile.verified || false,
      availability: profile.availability || "available",
      availabilityLabel: profile.availabilityLabel || "Available for collaboration",
      availabilityNote: profile.availabilityNote || "",
      reviews: profile.reviews || [],

      // COMBINED STATS
      stats: stats
    };

    // ========================================================
    // RESPONSE
    // ========================================================
    res.status(200).json({
      success: true,
      profile: finalProfile
    });
  } catch (error) {
    console.error("Get profile error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load profile",
      error: error.message
    });
  }
};