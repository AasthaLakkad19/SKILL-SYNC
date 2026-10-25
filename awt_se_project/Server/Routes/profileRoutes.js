const express = require("express");
const router = express.Router();
const { protect } = require("../Middleware/auth");
const profileController = require("../controllers/profileController");

router.use(protect);

router.get("/me", profileController.getMyProfile);

module.exports = router;
