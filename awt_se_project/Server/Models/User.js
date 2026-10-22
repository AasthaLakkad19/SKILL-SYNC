const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"]
        },

        password: {
            type: String,
            required: true,
            minlength: 6,
            select: false
        },

        freeTokens: {
            type: Number,
            default: 5
        },

        skills: {
            type: [String],
            default: []
        },

        rememberMe: {
            type: Boolean,
            default: false
        },

        lastLogin: {
            type: Date,
            default: null
        },

        isActive: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);


// ==========================================
// HASH PASSWORD
// ==========================================

userSchema.pre("save", async function () {

    // Don't hash if password hasn't changed
    if (!this.isModified("password")) {
        return;
    }

    const salt = await bcrypt.genSalt(10);

    this.password = await bcrypt.hash(
        this.password,
        salt
    );
});


// ==========================================
// CHECK PASSWORD
// ==========================================

userSchema.methods.matchPassword = async function (enteredPassword) {

    return await bcrypt.compare(
        enteredPassword,
        this.password
    );

};


module.exports = mongoose.model("User", userSchema);