const Skill = require("../Models/Skill");
const Enrollment = require("../Models/Enrollment");
const SavedSkill = require("../Models/SavedSkill");
const Wallet = require("../Models/Wallet");
const { seedSkillsIfEmpty } = require("../seed/skillsData");

const PROGRESS_STEP = 20;

// ------------------------------------------------------------
// helpers
// ------------------------------------------------------------

// Wallets are keyed by the logged-in user's id (same as settingsController)
const uid = (req) => String(req.user._id);

const SORTS = {
  "-rating": (a, b) => b.rating - a.rating,
  rating: (a, b) => a.rating - b.rating,
  "-learners": (a, b) => b.learners - a.learners,
  learners: (a, b) => a.learners - b.learners,
  tokens: (a, b) => a.tokens - b.tokens,
  "-tokens": (a, b) => b.tokens - a.tokens,
  name: (a, b) => a.name.localeCompare(b.name)
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function formatDate(date) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(date.getDate()).padStart(2, "0")} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Gets the user's wallet, creating it with the 5-token welcome bonus if missing
async function ensureWallet(userId) {
  let wallet = await Wallet.findOne({ userId });
  if (wallet) return wallet;

  try {
    wallet = await Wallet.create({
      userId,
      balance: 5,
      totalEarned: 5,
      totalSpent: 0,
      transactions: [
        { type: "earn", title: "Welcome Bonus", category: "Bonus", amount: 5, date: formatDate(new Date()) }
      ]
    });
  } catch (err) {
    if (err.code !== 11000) throw err; // created by a parallel request
    wallet = await Wallet.findOne({ userId });
  }
  return wallet;
}

const serverError = (res, label, err) => {
  console.error(label, err);
  res.status(500).json({ message: "Server error" });
};

// ------------------------------------------------------------
// CATALOG
// ------------------------------------------------------------

// GET /api/learn/skills?q=py&category=Programming&sort=-rating
exports.listSkills = async (req, res) => {
  try {
    await seedSkillsIfEmpty();

    const { q = "", category = "All", sort = "-rating" } = req.query;
    const filter = { isActive: true };
    if (category !== "All") filter.category = String(category);

    const query = String(q).trim();
    if (query) {
      const rx = new RegExp(escapeRegex(query), "i");
      filter.$or = [{ name: rx }, { category: rx }, { "teachers.name": rx }];
    }

    const docs = await Skill.find(filter);
    const skills = docs.map((d) => d.toClient()).sort(SORTS[sort] || SORTS["-rating"]);

    res.json({ skills });
  } catch (err) {
    serverError("LIST SKILLS ERROR:", err);
  }
};

// GET /api/learn/skills/:skillId
exports.getSkill = async (req, res) => {
  try {
    const skill = await Skill.findOne({ skillId: Number(req.params.skillId), isActive: true });
    if (!skill) return res.status(404).json({ message: "Skill not found" });
    res.json({ skill: skill.toClient() });
  } catch (err) {
    serverError("GET SKILL ERROR:", err);
  }
};

// GET /api/learn/recommended   (skills the user is not currently learning)
exports.recommended = async (req, res) => {
  try {
    await seedSkillsIfEmpty();

    const active = await Enrollment.find({ userId: uid(req), status: "learning" }).select("skillId");
    const activeIds = active.map((e) => e.skillId);

    const docs = await Skill.find({ isActive: true, skillId: { $nin: activeIds } });
    const skills = docs
      .map((d) => d.toClient())
      .sort(SORTS["-rating"])
      .slice(0, 3);

    res.json({ skills });
  } catch (err) {
    serverError("RECOMMENDED ERROR:", err);
  }
};

// ------------------------------------------------------------
// MY LEARNING (tokens + enrollments + saved)  – one call on page load
// ------------------------------------------------------------

// GET /api/learn/me
exports.getMyLearning = async (req, res) => {
  try {
    const userId = uid(req);
    const [wallet, enrollments, saved] = await Promise.all([
      ensureWallet(userId),
      Enrollment.find({ userId }).sort({ createdAt: 1 }),
      SavedSkill.find({ userId }).select("skillId")
    ]);

    res.json({
      tokens: wallet.balance,
      myLearning: enrollments.map((e) => e.toClient()),
      savedIds: saved.map((s) => s.skillId)
    });
  } catch (err) {
    serverError("GET MY LEARNING ERROR:", err);
  }
};

// ------------------------------------------------------------
// ENROL  (spend tokens + create enrollment)
// ------------------------------------------------------------

// POST /api/learn/enroll   { skillId, teacherName }
exports.enroll = async (req, res) => {
  try {
    const userId = uid(req);
    const skillId = Number(req.body.skillId);
    const teacherName = String(req.body.teacherName || "").trim();

    if (!Number.isInteger(skillId) || !teacherName) {
      return res.status(400).json({ message: "skillId and teacherName are required" });
    }

    const skill = await Skill.findOne({ skillId, isActive: true });
    if (!skill) return res.status(404).json({ message: "Skill not found" });

    const teacher = skill.teachers.find((t) => t.name === teacherName);
    if (!teacher) return res.status(400).json({ message: "Teacher not available for this skill" });

    await ensureWallet(userId);

    // 1) Create the enrollment first. The partial unique index rejects a
    //    second active enrollment, so double-clicks can never charge twice.
    let enrollment;
    try {
      enrollment = await Enrollment.create({
        userId,
        skillId,
        name: skill.name,
        icon: skill.icon,
        teacher: teacher.name,
        tokensSpent: skill.tokens
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ message: `You are already learning ${skill.name}` });
      }
      throw err;
    }

    // 2) Charge the wallet atomically: only succeeds if balance >= cost.
    const wallet = await Wallet.findOneAndUpdate(
      { userId, balance: { $gte: skill.tokens } },
      {
        $inc: { balance: -skill.tokens, totalSpent: skill.tokens },
        $push: {
          transactions: {
            type: "spend",
            title: `${skill.name} with ${teacher.name}`,
            category: "Learning",
            amount: skill.tokens,
            date: formatDate(new Date())
          }
        }
      },
      { new: true }
    );

    // 3) Not enough tokens -> undo the enrollment
    if (!wallet) {
      await Enrollment.deleteOne({ _id: enrollment._id });
      return res.status(402).json({ message: `You need ${skill.tokens} tokens to learn ${skill.name}.` });
    }

    await Skill.updateOne({ skillId }, { $inc: { learners: 1 } });

    res.status(201).json({
      message: `Request sent to ${teacher.name}. ${skill.tokens} tokens spent.`,
      tokens: wallet.balance,
      enrollment: enrollment.toClient()
    });
  } catch (err) {
    serverError("ENROLL ERROR:", err);
  }
};

// ------------------------------------------------------------
// PROGRESS / COMPLETE
// ------------------------------------------------------------

// POST /api/learn/enrollments/:skillId/progress
exports.addProgress = async (req, res) => {
  try {
    const enrollment = await Enrollment.findOne({
      userId: uid(req),
      skillId: Number(req.params.skillId),
      status: "learning"
    });
    if (!enrollment) return res.status(404).json({ message: "Active enrollment not found" });

    enrollment.progress = Math.min(100, enrollment.progress + PROGRESS_STEP);
    await enrollment.save();

    res.json({
      enrollment: enrollment.toClient(),
      allLessonsDone: enrollment.progress === 100
    });
  } catch (err) {
    serverError("ADD PROGRESS ERROR:", err);
  }
};

// POST /api/learn/enrollments/:skillId/complete
exports.completeSkill = async (req, res) => {
  try {
    const enrollment = await Enrollment.findOne({
      userId: uid(req),
      skillId: Number(req.params.skillId),
      status: "learning"
    });
    if (!enrollment) return res.status(404).json({ message: "Active enrollment not found" });

    if (enrollment.progress < 100) {
      return res.status(400).json({ message: `Finish all lessons before completing ${enrollment.name}.` });
    }

    enrollment.status = "completed";
    enrollment.completedAt = new Date();
    await enrollment.save();

    res.json({
      message: `${enrollment.name} completed. Nice work!`,
      enrollment: enrollment.toClient()
    });
  } catch (err) {
    serverError("COMPLETE SKILL ERROR:", err);
  }
};

// ------------------------------------------------------------
// SAVED (save for later)
// ------------------------------------------------------------

// PUT /api/learn/saved/:skillId
exports.saveSkill = async (req, res) => {
  try {
    const skillId = Number(req.params.skillId);
    const skill = await Skill.findOne({ skillId, isActive: true });
    if (!skill) return res.status(404).json({ message: "Skill not found" });

    await SavedSkill.updateOne(
      { userId: uid(req), skillId },
      { $setOnInsert: { userId: uid(req), skillId } },
      { upsert: true }
    );

    res.json({ message: `${skill.name} saved for later.` });
  } catch (err) {
    serverError("SAVE SKILL ERROR:", err);
  }
};

// DELETE /api/learn/saved/:skillId
exports.unsaveSkill = async (req, res) => {
  try {
    const skillId = Number(req.params.skillId);
    const skill = await Skill.findOne({ skillId });
    await SavedSkill.deleteOne({ userId: uid(req), skillId });
    res.json({ message: `${skill ? skill.name : "Skill"} removed from saved.` });
  } catch (err) {
    serverError("UNSAVE SKILL ERROR:", err);
  }
};

// ------------------------------------------------------------
// REVIEWS  (only after completing the skill, one per user)
// ------------------------------------------------------------

// POST /api/learn/skills/:skillId/reviews   { rating: 1-5, text }
exports.addReview = async (req, res) => {
  try {
    const userId = uid(req);
    const skillId = Number(req.params.skillId);
    const rating = Number(req.body.rating);
    const text = String(req.body.text || "").trim();

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be a whole number from 1 to 5" });
    }
    if (!text || text.length > 500) {
      return res.status(400).json({ message: "Review text is required (max 500 characters)" });
    }

    const completed = await Enrollment.exists({ userId, skillId, status: "completed" });
    if (!completed) {
      return res.status(403).json({ message: "Complete this skill before reviewing it" });
    }

    const skill = await Skill.findOne({ skillId });
    if (!skill) return res.status(404).json({ message: "Skill not found" });

    // "Riya Mehta" -> "Riya M."
    const parts = String(req.user.name || "Student").trim().split(/\s+/);
    const by = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];

    const existing = skill.reviews.find((r) => r.userId === userId);
    if (existing) {
      existing.rating = rating;
      existing.text = text;
      existing.by = by;
    } else {
      skill.reviews.push({ userId, by, rating, text });
    }
    await skill.save();

    res.status(existing ? 200 : 201).json({ skill: skill.toClient() });
  } catch (err) {
    serverError("ADD REVIEW ERROR:", err);
  }
};
