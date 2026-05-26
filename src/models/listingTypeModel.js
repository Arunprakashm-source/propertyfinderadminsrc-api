const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const listingTypeSchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    transaction: {
        type: String,
        enum: ['buy', 'rent'],
        required: true
    },
    category: {
        type: String,
        enum: ['residential', 'commercial', 'other'],
        default: 'residential'
    },
    description: { type: String, maxlength: 500 },
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes
listingTypeSchema.index({ name: 1 }, { unique: true });
listingTypeSchema.index({ slug: 1 }, { unique: true });
listingTypeSchema.index({ isActive: 1, displayOrder: 1 });
listingTypeSchema.index({ transaction: 1, category: 1 });

const ListingType = model('ListingType', listingTypeSchema);

module.exports = ListingType;

