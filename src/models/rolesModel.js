const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const roleSchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    displayName: {
        type: String,
        required: true,
        trim: true
    },
    description: { type: String, maxlength: 500 },
    permissions: [String],
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes
roleSchema.index({ name: 1 }, { unique: true });
roleSchema.index({ isActive: 1 });

const Role = model('Role', roleSchema);
module.exports = Role;

