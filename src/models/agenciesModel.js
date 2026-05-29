const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const agenciesSchema = new Schema({
    // Basic Information
    agencyName: {
        type: String,
        required: false,
        trim: true
    },
    email: {
        type: String,
        required: false,
        unique: true,
        lowercase: true,
        trim: true
    },
    phoneNumber: {
        type: String,
        required: false,
        trim: true
    },
    phoneCode: {
        type: String,
        trim: true,
        default: null
    },
    phoneNumberWithoutCode: {
        type: String,
        trim: true,
        default: null
    },
    password: { type: String, required: false },
    profilePicture: { type: String, default: "profileless.png" },

    // Registration Details
    orn: {
        type: String,
        required: false,
        unique: true,
        trim: true
    }, // Office Registration Number
    address: {
        street: String,
        city: String,
        state: String,
        country: String,
        zipCode: String,
        fullAddress: String
    },
    nationality: { type: Schema.Types.ObjectId, ref: 'Countries' },
    registrationDocuments: [String], // URLs to uploaded documents

    // Verification
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    isPhoneVerified: { type: Boolean, default: false },
    phoneVerificationOTP: String,
    phoneVerificationExpires: Date,
    isVerified: { type: Boolean, default: false },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    verifiedAt: Date,
    verificationNotes: String,

    // Company Information
    foundedYear: { type: Number },
    description: { type: String, maxlength: 5000 },
    website: String,

    // Statistics
    statistics: {
        totalActiveListings: { type: Number, default: 0 },
        totalInactiveListings: { type: Number, default: 0 },
        totalAgents: { type: Number, default: 0 },
        totalSuperAgents: { type: Number, default: 0 },
        totalRevenueSales: { type: Number, default: 0 },
        totalRevenueRent: { type: Number, default: 0 },
        thisMonthRevenueSales: { type: Number, default: 0 },
        thisMonthRevenueRent: { type: Number, default: 0 },
        totalLeads: { type: Number, default: 0 },
        thisMonthLeads: { type: Number, default: 0 },
        totalDeals: { type: Number, default: 0 },
        thisMonthDeals: { type: Number, default: 0 }
    },

    // Listings by Status
    listingsCountByStatus: {
        active: { type: Number, default: 0 },
        inactive: { type: Number, default: 0 },
        sold: { type: Number, default: 0 },
        rented: { type: Number, default: 0 }
    },

    // Location-based listings
    listingsByLocation: [{
        location: { type: Schema.Types.ObjectId, ref: 'Location' },
        locationName: String,
        count: Number,
        lastUpdated: Date
    }],

    // Awards
    awards: [{
        title: String,
        description: String,
        awardedBy: String,
        year: Number,
        image: String,
        addedAt: { type: Date, default: Date.now }
    }],

    // About Us
    aboutUs: { type: String, maxlength: 5000 },

    // Ratings
    ratings: {
        average: { type: Number, default: 0, min: 0, max: 5 },
        totalCount: { type: Number, default: 0 }
    },

    // Preferences
    preferences: {
        currency: { type: String, default: 'AED' },
        language: { type: String, default: 'en' },
        notificationSettings: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: false },
            push: { type: Boolean, default: true }
        },
        savedSearches: { type: Boolean, default: true }
    },

    // Subscription Details
    subscription: {
        plan: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
        planTitle: String,
        amount: Number,
        currency: { type: String, default: 'AED' },
        validity: Number, // in days
        startDate: Date,
        expiryDate: Date,
        isActive: { type: Boolean, default: false },
        autoRenew: { type: Boolean, default: false },
        features: {
            maxListings: Number,
            maxAgents: Number,
            maxFeaturedListings: Number
        }
    },

    // Payment History
    paymentHistory: [{
        plan: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
        planTitle: String,
        amount: Number,
        currency: { type: String, default: 'AED' },
        paymentDate: Date,
        paymentMethod: String,
        transactionId: String,
        status: { type: String, enum: ['success', 'failed', 'pending', 'refunded'] },
        invoice: String, // URL to invoice
        notes: String
    }],

    // Agent Invitations History
    agentInvitations: [{
        agentEmail: String,
        agentName: String,
        agentType: { type: String, enum: ['agent', 'superagent'] },
        invitationToken: String,
        status: { type: String, enum: ['pending', 'accepted', 'expired'] },
        sentAt: Date,
        acceptedAt: Date,
        expiresAt: Date
    }],

    // Account Status
    isActive: { type: Boolean, default: true },
    deactivatedAt: Date,
    deactivatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    deactivationReason: String,

    // Invitation Status (from Admin)
    invitationStatus: {
        type: String,
        enum: ['pending', 'accepted', 'expired', 'declined'],
        default: 'pending'
    },
    invitationToken: String,
    invitationSentAt: Date,
    invitationExpiry: Date,
    invitationAcceptedAt: Date,

    // Password Reset
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    passwordResetOTPHash: String,
    passwordResetOTPExpires: Date,
    passwordResetEligibleUntil: Date,

    // Session
    access_token: String,
    token_expires_at: Date,
    refresh_token: String,
    refresh_token_expires_at: Date,
    lastLogin: Date,
    lastActiveAt: Date,

    // Firebase Cloud Messaging — one entry per device/session (web / android / ios)
    fcmTokens: [{
        token: { type: String, required: true, trim: true },
        platform: {
            type: String,
            enum: ['web', 'android', 'ios'],
            required: true
        },
        deviceId: { type: String, trim: true, default: null },
        deviceModel: { type: String, trim: true, default: null },
        deviceVersion: { type: String, trim: true, default: null },
        isActive: { type: Boolean, default: true },
        lastSeenAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now }
    }],

    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes
agenciesSchema.index({ isActive: 1, isVerified: 1 });
agenciesSchema.index({ 'subscription.expiryDate': 1 });
agenciesSchema.index({ createdAt: -1 });
agenciesSchema.index({ 'fcmTokens.token': 1 });

// Text index for search
agenciesSchema.index({
    agencyName: 'text',
    description: 'text'
});

const Agencies = model('Agencies', agenciesSchema);
module.exports = Agencies;