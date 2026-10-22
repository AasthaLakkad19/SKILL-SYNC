const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");

// Load .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;


// ==========================================
// MIDDLEWARE
// ==========================================

app.use(cors());

app.use(express.json({ limit: "10mb" }));

app.use(express.urlencoded({
    extended: true
}));


// ==========================================
// MONGODB ATLAS CONNECTION
// ==========================================

mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
        console.log("✅ MongoDB Atlas Connected Successfully");
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



app.use("/api/wallet", walletRoutes);


// Resume
app.use("/api/resume", resumeRoutes);

// Achievements
app.use("/api/achievements", achievementRoutes);

// Authentication
app.use("/api/auth", authRoutes);


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

app.listen(PORT, () => {

    console.log("");
    console.log("🚀 SkillSync Server is running");
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`📄 Profile  → http://localhost:${PORT}/profile`);
    console.log(`🏠 Dashboard → http://localhost:${PORT}/home`);
    console.log(`🔐 Auth API  → http://localhost:${PORT}/api/auth`);
    console.log("");

});