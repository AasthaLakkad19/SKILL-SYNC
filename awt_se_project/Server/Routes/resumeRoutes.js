const express = require("express");
const router = express.Router();
const { protect } = require("../Middleware/auth");
const resumeController = require("../controllers/resumeController");

router.use(protect);

router.get("/", resumeController.getResume);
router.post("/", resumeController.saveResume);
router.put("/", resumeController.saveResume);
router.delete("/", resumeController.deleteResume);

module.exports = router;
