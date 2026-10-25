const Settings = require("../Models/Settings");
const User = require("../Models/User");
const Wallet = require("../Models/Wallet");
const Profile = require("../Models/Profile");
const Resume = require("../Models/Resume");
const Support = require("../Models/Support");

const PUBLIC_FIELDS = [
    ...Object.keys(Settings.ENUMS),
    ...Settings.BOOLEANS
];

// Get or lazily create the settings doc for a user
async function getOrCreate(userId) {
    return Settings.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId } },
        { new: true, upsert: true }
    );
}

function pickPublic(doc) {
    const out = {};
    PUBLIC_FIELDS.forEach((k) => (out[k] = doc[k]));
    return out;
}

// GET /api/settings
exports.getSettings = async (req, res) => {
    try {
        const settings = await getOrCreate(req.user._id);
        const wallet = await Wallet.findOne({ userId: String(req.user._id) });

        res.json({
            settings: pickPublic(settings),
            tokenBalance: wallet ? wallet.balance : req.user.freeTokens,
            email: req.user.email
        });
    } catch (err) {
        console.error("GET SETTINGS ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// PUT /api/settings  (partial update, whitelisted)
exports.updateSettings = async (req, res) => {
    try {
        const update = {};

        for (const [key, allowed] of Object.entries(Settings.ENUMS)) {
            if (req.body[key] !== undefined) {
                if (!allowed.includes(req.body[key]))
                    return res.status(400).json({ message: `Invalid value for ${key}` });
                update[key] = req.body[key];
            }
        }
        for (const key of Settings.BOOLEANS) {
            if (req.body[key] !== undefined) {
                if (typeof req.body[key] !== "boolean")
                    return res.status(400).json({ message: `${key} must be true or false` });
                update[key] = req.body[key];
            }
        }
        if (!Object.keys(update).length)
            return res.status(400).json({ message: "Nothing to update" });

        const settings = await Settings.findOneAndUpdate(
            { userId: req.user._id },
            { $set: update },
            { new: true, upsert: true }
        );
        res.json({ settings: pickPublic(settings) });
    } catch (err) {
        console.error("UPDATE SETTINGS ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// PUT /api/account/email
exports.changeEmail = async (req, res) => {
    try {
        const email = (req.body.email || "").trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email))
            return res.status(400).json({ message: "Enter a valid email address" });

        const taken = await User.findOne({ email, _id: { $ne: req.user._id } });
        if (taken) return res.status(409).json({ message: "That email is already in use" });

        await User.findByIdAndUpdate(req.user._id, { email });
        res.json({ message: "Email updated successfully", email });
    } catch (err) {
        console.error("CHANGE EMAIL ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// PUT /api/account/password
exports.changePassword = async (req, res) => {
    try {
        const { current, newPassword } = req.body;
        if (!current || !newPassword)
            return res.status(400).json({ message: "Fill all password fields" });
        if (newPassword.length < 8)
            return res.status(400).json({ message: "Password must be at least 8 characters" });

        const user = await User.findById(req.user._id).select("+password");
        if (!(await user.matchPassword(current)))
            return res.status(401).json({ message: "Current password is incorrect" });

        // User model's pre-save hook hashes it — do NOT hash here
        user.password = newPassword;
        await user.save();
        res.json({ message: "Password updated successfully" });
    } catch (err) {
        console.error("CHANGE PASSWORD ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// DELETE /api/account
exports.deleteAccount = async (req, res) => {
    try {
        const id = req.user._id;
        await Promise.all([
            Settings.deleteMany({ userId: id }),
            Wallet.deleteMany({ userId: String(id) }),
            Profile.deleteMany({ userId: id }),
            Resume.deleteMany({ userId: id }),
            Support.deleteMany({ userId: id })
        ]);
        await User.findByIdAndDelete(id);
        res.json({ message: "Account deleted" });
    } catch (err) {
        console.error("DELETE ACCOUNT ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// GET /api/tokens/history
exports.tokenHistory = async (req, res) => {
    try {
        const wallet = await Wallet.findOne({ userId: String(req.user._id) });
        const history = wallet ? [...wallet.transactions].reverse().slice(0, 100) : [];
        res.json({ history });
    } catch (err) {
        console.error("TOKEN HISTORY ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// GET /api/login-activity
exports.loginActivity = async (req, res) => {
    try {
        const settings = await getOrCreate(req.user._id);
        const activity = [...settings.loginActivity].reverse();
        res.json({ activity });
    } catch (err) {
        console.error("LOGIN ACTIVITY ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// POST /api/support   { type: "bug" | "contact", subject, message }
exports.createSupportTicket = async (req, res) => {
    try {
        const type = req.body.type;
        const subject = (req.body.subject || "").trim();
        const message = (req.body.message || "").trim();

        if (!["bug", "contact"].includes(type))
            return res.status(400).json({ message: "Invalid request type" });
        if (!subject || !message)
            return res.status(400).json({ message: "Please fill in subject and message" });
        if (message.length > 2000)
            return res.status(400).json({ message: "Message is too long (max 2000 characters)" });

        await Support.create({ userId: req.user._id, type, subject, message });
        res.status(201).json({
            message: type === "bug"
                ? "Thanks! Your report has been submitted."
                : "Message sent. Our team will get back to you soon."
        });
    } catch (err) {
        console.error("SUPPORT TICKET ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// Helper for authRoutes login: keeps the last 20 entries
exports.recordLogin = async (userId, req) => {
    try {
        await Settings.findOneAndUpdate(
            { userId },
            {
                $setOnInsert: { userId },
                $push: {
                    loginActivity: {
                        $each: [{ ip: req.ip, device: req.headers["user-agent"] || "Unknown" }],
                        $slice: -20
                    }
                }
            },
            { upsert: true }
        );
    } catch (err) {
        console.error("RECORD LOGIN ERROR:", err);
    }
};