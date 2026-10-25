// Run manually:  node seed/seedSkills.js        (adds missing skills)
//                node seed/seedSkills.js --reset (wipes the catalog first)
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const Skill = require("../Models/Skill");
const { SKILLS } = require("./skillsData");

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    if (process.argv.includes("--reset")) await Skill.deleteMany({});

    for (const s of SKILLS) {
      await Skill.updateOne({ skillId: s.skillId }, { $setOnInsert: s }, { upsert: true });
    }
    console.log("✅ Skills seeded");
  } catch (err) {
    console.error("❌ Seed failed:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
