const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../Models/User");

const router = express.Router();

// Generate JWT
const generateToken = (id) => {
    return jwt.sign(
        { id },
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRE || "7d"
        }
    );
};


// ==========================================
// REGISTER
// POST /api/auth/register
// ==========================================

router.post("/register", async (req, res) => {

    try {

        const { name, email, password } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Please fill in all fields"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must be at least 6 characters"
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Check existing user
        const existingUser = await User.findOne({
            email: normalizedEmail
        });

        if (existingUser) {
            return res.status(400).json({
                message: "User already exists with this email"
            });
        }

        // Create user
        const user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password: password
        });

        // Response
        res.status(201).json({
            success: true,
            _id: user._id,
            name: user.name,
            email: user.email,
            freeTokens: user.freeTokens,
            token: generateToken(user._id)
        });

    } catch (error) {

        console.error("REGISTER ERROR:", error);

        res.status(500).json({
            success: false,
            message: error.message || "Server error"
        });
    }
});


// ==========================================
// LOGIN
// POST /api/auth/login
// ==========================================

router.post("/login", async (req, res) => {

    try {

        const { email, password, remember } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Password has select:false
        const user = await User
            .findOne({ email: normalizedEmail })
            .select("+password");

        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const passwordMatch = await user.matchPassword(password);

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        if (!user.isActive) {
            return res.status(403).json({
                message: "Account is deactivated"
            });
        }

        user.lastLogin = new Date();
        user.rememberMe = !!remember;

        await user.save();

        res.json({
            success: true,
            _id: user._id,
            name: user.name,
            email: user.email,
            freeTokens: user.freeTokens,
            token: generateToken(user._id)
        });

    } catch (error) {

        console.error("LOGIN ERROR:", error);

        res.status(500).json({
            success: false,
            message: error.message || "Server error"
        });
    }
});

module.exports = router;