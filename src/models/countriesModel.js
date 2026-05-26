const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const countriesSchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    }, // ISO code (e.g., "AE", "US")
    phoneCode: {
        type: String,
        trim: true
    }, // e.g., "+971"
    flag: String, // URL or emoji
    currency: {
        code: String, // e.g., "AED"
        symbol: String // e.g., "د.إ"
    },
    // Display
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes
countriesSchema.index({ isActive: 1, displayOrder: 1 });

const Countries = model('Countries', countriesSchema);
module.exports = Countries;

