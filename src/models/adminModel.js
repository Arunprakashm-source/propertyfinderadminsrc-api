const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const adminSchema = new Schema({
    // Basic Information
    firstName: {
        type: String,
        required: true,
        trim: true
    },
    lastName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    phoneNumber: {
        type: String,
        trim: true
    },
    password: { type: String, required: true },
    avatar: String,

    // Roles & Permissions
    role: {
        type: Schema.Types.ObjectId,
        ref: 'Role',
        required: false
    },
    permissions: [String], // Granular permissions

    // Status
    isActive: { type: Boolean, default: true },
    isSuperAdmin: { type: Boolean, default: false },
    lastLogin: Date,
    lastActiveAt: Date,

    // Security
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    passwordResetOTPHash: String,
    passwordResetOTPExpires: Date,
    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date,

    // Metadata
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes
adminSchema.index({ role: 1 });
adminSchema.index({ isActive: 1 });
adminSchema.index({ createdAt: -1 });

const Admin = model('Admin', adminSchema);
module.exports = Admin;

