const Achievement = require("../Models/Achievement");
const UserAchievement = require("../Models/UserAchievement");

// Catalog entry + this user's own progress (defaults to 0 / locked).
function merge(catalogDoc, progress) {
  const a = catalogDoc.toObject ? catalogDoc.toObject() : { ...catalogDoc };
  return {
    ...a,
    current: progress ? progress.current : 0,
    unlocked: progress ? progress.unlocked : false,
    earnedDate: progress ? progress.earnedDate : null
  };
}

async function getUserAchievements(userId) {
  const [catalog, progress] = await Promise.all([
    Achievement.find().sort({ id: 1 }),
    UserAchievement.find({ userId: String(userId) })
  ]);
  const byId = new Map(progress.map((p) => [p.achievementId, p]));
  return catalog.map((a) => merge(a, byId.get(a.id)));
}

function formatDate(date) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return String(date.getDate()).padStart(2, "0") + " " + months[date.getMonth()] + " " + date.getFullYear();
}

// Server-side version of the achievements page's recordActivity(): adds
// `amount` to every still-locked achievement of the category and unlocks the
// ones that reach their target. Used when a teaching session is completed.
async function recordActivity(userId, category, amount = 1) {
  userId = String(userId);
  const catalog = await Achievement.find({ category });

  for (const a of catalog) {
    const progress =
      (await UserAchievement.findOne({ userId, achievementId: a.id })) ||
      new UserAchievement({ userId, achievementId: a.id });

    if (progress.unlocked) continue;

    progress.current = Math.min((progress.current || 0) + amount, a.target);
    if (progress.current >= a.target) {
      progress.unlocked = true;
      if (!progress.earnedDate) progress.earnedDate = formatDate(new Date());
    }
    await progress.save();
  }
}

module.exports = { merge, getUserAchievements, formatDate, recordActivity };
