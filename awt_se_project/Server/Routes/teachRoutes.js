const express = require("express");
const router = express.Router();

const { protect } = require("../Middleware/auth");
const teach = require("../controllers/teachController");
const upload = require("../controllers/teachUploadController");
const live = require("../controllers/teachLiveController");

router.use(protect);

// ---- page data ----
router.get("/options", teach.getOptions);
router.get("/stats", teach.getStats);

// ---- teacher: my sessions ----
router
    .route("/sessions")
    .get(teach.getSessions)
    .post(teach.createSession);

router
    .route("/sessions/:id")
    .get(teach.getSession)
    .put(teach.updateSession)
    .delete(teach.deleteSession);

router.patch("/sessions/:id/complete", teach.completeSession);
router.get("/sessions/:id/attempts", teach.getAttempts);

// ---- teacher: upload a recorded lesson (raw video body) ----
router.post("/upload", upload.uploadVideo);

// ---- teacher: SkillSync live video ----
router.post("/sessions/:id/live/start", live.startLive);
router.post("/sessions/:id/live/stop", live.stopLive);

// ---- learners: browse + open + take part ----
router.get("/discover", teach.discover);
router.get("/view/:id", teach.viewSession);
router.post("/view/:id/join", teach.joinSession);
router.post("/view/:id/quiz", teach.submitQuiz);
router.post("/view/:id/live/join", live.joinLive);

// ---- live signalling (host + learners) ----
router.get("/live/:id/poll", live.poll);
router.post("/live/:id/signal", live.signal);
router.post("/live/:id/leave", live.leave);

module.exports = router;
