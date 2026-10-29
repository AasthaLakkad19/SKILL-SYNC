const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");

// Load .env
dotenv.config();

if (!process.env.JWT_SECRET || !process.env.MONGODB_URI) {
    console.error("❌ Missing JWT_SECRET or MONGODB_URI. Copy .env.example to .env and fill it in.");
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;


// ==========================================
// MIDDLEWARE
// ==========================================

// Set CORS_ORIGIN (comma-separated) in .env to restrict allowed origins in production.
const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
    : true;
app.use(cors({ origin: corsOrigins }));

app.use(express.json({ limit: "10mb" }));

app.use(express.urlencoded({
    extended: true
}));


// ==========================================
// MONGODB ATLAS CONNECTION
// ==========================================

mongoose
    .connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log("✅ MongoDB Atlas Connected Successfully");

        // Live rooms live in memory, so after a restart nothing can still be "live"
        try {
            await require("./controllers/teachLiveController").resetStaleLive();
        } catch (error) {
            console.warn("Could not reset stale live sessions:", error.message);
        }
    })
    .catch((error) => {
        console.error("❌ MongoDB Connection Error:", error.message);
    });


// ==========================================
// ROUTES
// ==========================================

const resumeRoutes = require("./Routes/resumeRoutes");
const achievementRoutes = require("./Routes/achievementRoutes");
const authRoutes = require("./Routes/authRoutes");
const walletRoutes = require("./Routes/walletRoutes");
const profileRoutes = require("./Routes/profileRoutes");
const settingsRoutes = require("./Routes/settingsRoutes");
const projectRoutes = require("./Routes/projectRoutes");
const teammateRoutes = require("./Routes/teammateRoutes");
const teachRoutes = require("./Routes/teachRoutes");
app.use("/api/teach", teachRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/wallet", walletRoutes);

// Learn Skills (catalog, enroll, progress, saved, reviews)

// Projects (CRUD, milestones, team, collaborators, invites)
app.use("/api/projects", projectRoutes);

// Find Teammates (search, connect requests, connections)
app.use("/api/teammates", teammateRoutes);

// Resume
app.use("/api/resume", resumeRoutes);

// Achievements
app.use("/api/achievements", achievementRoutes);

// Authentication
app.use("/api/auth", authRoutes);

// Settings + account (GET/PUT /api/settings, /api/account/*,
// /api/tokens/history, /api/login-activity)
// NOTE: mounted at "/api" with router.use(protect), so keep it AFTER the
// specific /api/* routes above so it never intercepts them.
app.use("/api", settingsRoutes);


// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        message: "SkillSync API is running"
    });
});


// ==========================================
// UPLOADED LESSON VIDEOS  (Server/uploads/teach-videos)
// Range requests are supported, so <video> can seek.
// ==========================================

const { VIDEO_DIR, ensureVideoDir } = require("./utils/teachUploads");
ensureVideoDir();
app.use(
    "/uploads/teach-videos",
    express.static(VIDEO_DIR, {
        index: false,
        dotfiles: "deny",
        fallthrough: false,
        setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff")
    })
);


// ==========================================
// SERVE FRONTEND
// ==========================================

app.use(
    express.static(
        path.join(__dirname, "../Client")
    )
);


// ==========================================
// DEFAULT ROUTE
// ==========================================

app.get("/", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "../Client/Pages/index.html"
        )
    );
});


// ==========================================
// PROFILE PAGE
// ==========================================

app.get("/profile", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "../Client/Pages/buildResume.html"
        )
    );
});


// ==========================================
// DASHBOARD / HOME
// ==========================================

app.get("/home", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "../Client/Pages/firstLogin.html"
        )
    );
});


// ==========================================
// DYNAMIC HTML PAGES
// ==========================================

app.get("/:page.html", (req, res, next) => {

    const filePath = path.join(
        __dirname,
        "../Client/Pages",
        `${req.params.page}.html`
    );

    res.sendFile(filePath, (error) => {

        if (error) {
            next();
        }

    });

});


// ==========================================
// 404
// ==========================================

app.use((req, res) => {

    res.status(404).send("404 - Page Not Found");

});


// ==========================================
// START SERVER
// ==========================================

const server = app.listen(PORT, () => {

    console.log("");
    console.log("🚀 SkillSync Server is running");
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`📄 Profile  → http://localhost:${PORT}/profile`);
    console.log(`🏠 Dashboard → http://localhost:${PORT}/home`);
    console.log(`🔐 Auth API  → http://localhost:${PORT}/api/auth`);
    console.log(`⚙️  Settings → http://localhost:${PORT}/api/settings`);
    console.log("");

});

// Big lesson videos on slow connections can take longer than Node's default
// 5 minute request timeout. Allow up to 30 minutes.
server.requestTimeout = 30 * 60 * 1000;
