const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const subscriptionPlansSchema = new Schema({
    planTitle: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        maxlength: 1000
    },
    // Pricing
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'AED' },
    discountedAmount: { type: Number, min: 0 },
    // Duration
    validity: { type: Number, required: true }, // in days
    // Features
    features: [{
        feature: String,
        isIncluded: { type: Boolean, default: true },
        description: String
    }],
    // Limits
    limits: {
        maxListings: { type: Number, default: -1 }, // -1 = unlimited
        maxAgents: { type: Number, default: -1 },
        maxFeaturedListings: { type: Number, default: 0 },
        maxSuperAgents: { type: Number, default: 0 },
        canAccessAnalytics: { type: Boolean, default: false },
        canAccessPrioritySupport: { type: Boolean, default: false }
    },
    // Plan Type
    planType: {
        type: String,
        enum: ['free-trial', 'basic', 'standard', 'premium', 'enterprise'],
        default: 'basic'
    },
    // Display
    isActive: { type: Boolean, default: true },
    isVisible: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    isPopular: { type: Boolean, default: false },
    isRecommended: { type: Boolean, default: false },
    // Trial
    trialDays: { type: Number, default: 0 },
    // Metadata
    color: String, // For UI display
    icon: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
subscriptionPlansSchema.index({ isActive: 1, isVisible: 1, displayOrder: 1 });
subscriptionPlansSchema.index({ planType: 1 });

const Subscriptionplans = model('Subscriptionplans', subscriptionPlansSchema);
module.exports = Subscriptionplans;