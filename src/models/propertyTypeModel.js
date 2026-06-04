const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const propertyTypeSchema = new Schema({
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
    icon: String,
    image: String,
    description: { type: String, maxlength: 500 },
    category: {
        type: String,
        trim: true,
        maxlength: 100,
        default: 'others'
    },
    // Display
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    // Statistics
    totalListings: { type: Number, default: 0 },
    // SEO
    metaTitle: String,
    metaDescription: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes
propertyTypeSchema.index({ name: 1 }, { unique: true });
propertyTypeSchema.index({ slug: 1 }, { unique: true });
propertyTypeSchema.index({ isActive: 1, displayOrder: 1 });
propertyTypeSchema.index({ category: 1 });

const PropertyType = model('PropertyType', propertyTypeSchema);
module.exports = PropertyType;

