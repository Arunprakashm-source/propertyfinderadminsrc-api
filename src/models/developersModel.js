const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const developersSchema = new Schema({
    // Basic Information
    name: {
        type: String,
        required: true,
        trim: true
    },
    logo: { type: String }, // Profile picture/logo
    profilePicture: { type: String }, // Alias for UI profile photo
    foundedYear: { type: Number },
    shortDescription: { type: String, maxlength: 1000 },
    longDescription: { type: String, maxlength: 5000 },
    description: { type: String, maxlength: 5000 },

    // Contact Information
    email: {
        type: String,
        unique: true,
        lowercase: true,
        trim: true
    },
    phoneNumber: {
        type: String,
        trim: true
    },
    website: { type: String },
    password: { type: String },

    // Address
    address: {
        street: String,
        city: String,
        state: String,
        country: String,
        zipCode: String,
        fullAddress: String
    },
    registrationDocuments: [String], // URLs to uploaded office-related documents

    // Verification
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    isPhoneVerified: { type: Boolean, default: false },
    phoneVerificationOTP: String,
    phoneVerificationExpires: Date,
    invitationStatus: {
        type: String,
        enum: ['pending', 'accepted', 'expired'],
        default: 'pending'
    },
    invitationToken: String,
    invitationSentAt: Date,
    invitationExpiry: Date,
    invitationAcceptedAt: Date,

    // Statistics
    totalProjects: { type: Number, default: 0 },
    completedProjects: { type: Number, default: 0 },
    ongoingProjects: { type: Number, default: 0 },
    offPlanProjects: { type: Number, default: 0 },

    // Projects by Location
    projectsByLocation: [{
        location: { type: Schema.Types.ObjectId, ref: 'Location' },
        locationName: String,
        count: Number
    }],

    // Awards & Recognition
    awards: [{
        title: String,
        description: String,
        awardedBy: String,
        year: Number,
        image: String,
        addedAt: { type: Date, default: Date.now }
    }],

    // Social Media
    socialLinks: {
        linkedin: String,
        facebook: String,
        instagram: String,
        twitter: String,
        website: String
    },

    // Ratings
    ratings: {
        average: { type: Number, default: 0, min: 0, max: 5 },
        totalCount: { type: Number, default: 0 }
    },

    // Featured
    isFeatured: { type: Boolean, default: false },
    featuredUntil: Date,

    // SEO
    slug: { type: String, unique: true },
    metaTitle: String,
    metaDescription: String,

    // Status
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    verifiedAt: Date,

    // Session
    access_token: String,
    token_expires_at: Date,
    refresh_token: String,
    refresh_token_expires_at: Date,
    lastLogin: Date,
    lastActiveAt: Date,

    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes
developersSchema.index({ name: 1 });
developersSchema.index({ isActive: 1, isVerified: 1 });
developersSchema.index({ totalProjects: -1 });

// Text index for search
developersSchema.index({
    name: 'text',
    description: 'text'
});

const Developers = model('Developers', developersSchema);
module.exports = Developers;