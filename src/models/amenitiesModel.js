const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const amenitiesSchema = new Schema({
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
    category: {
        type: String,
        enum: ['basic', 'safety', 'outdoor', 'indoor', 'luxury', 'other'],
        default: 'basic'
    },
    icon: String,
    image: String,
    description: { type: String, maxlength: 500 },
    // Display
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    // Usage Statistics
    usageCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes
amenitiesSchema.index({ name: 1 }, { unique: true });
amenitiesSchema.index({ slug: 1 }, { unique: true });
amenitiesSchema.index({ isActive: 1, displayOrder: 1 });
amenitiesSchema.index({ category: 1 });

const Amenities = model('Amenities', amenitiesSchema);
module.exports = Amenities;

