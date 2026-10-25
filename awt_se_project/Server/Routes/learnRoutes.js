const express = require("express");
const router = express.Router();
const { protect } = require("../Middleware/auth");
const c = require("../controllers/learnController");

// Every learn route needs a logged-in user
router.use(protect);

// Catalog
router.get("/skills", c.listSkills);
router.get("/skills/:skillId", c.getSkill);
router.post("/skills/:skillId/reviews", c.addReview);
router.get("/recommended", c.recommended);

// The logged-in user's learning data (tokens, enrollments, saved ids)
router.get("/me", c.getMyLearning);

// Learning flow
router.post("/enroll", c.enroll);
router.post("/enrollments/:skillId/progress", c.addProgress);
router.post("/enrollments/:skillId/complete", c.completeSkill);

// Save for later
router.put("/saved/:skillId", c.saveSkill);
router.delete("/saved/:skillId", c.unsaveSkill);

module.exports = router;
