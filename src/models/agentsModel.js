const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const agentsSchema = new Schema({
    // Basic Information
    fullName: {
        type: String,
        required: false,
        trim: true
    },
    email: {
        type: String,
        required: false,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    phoneNumber: {
        type: String,
        required: false,
        trim: true
    },
    whatsappNumber: {
        type: String,
        trim: true
    },
    isWhatsappPrimary: { type: Boolean, default: false },
    password: { type: String, required: false },
    profilePicture: { type: String },

    // Agent Type
    agentType: {
        type: String,
        enum: ['agent', 'superagent'],
        default: 'agent'
    },

    // Professional Information
    specialization: { type: String }, // Job title
    experience: { type: Number }, // Years of experience
    experienceSince: { type: Date },
    brokerLicenseNumber: {
        type: String,
        required: false,
        trim: true
    }, // BRN/Dubai Broker License

    // Verification
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    isPhoneVerified: { type: Boolean, default: false },
    phoneVerificationOTP: String,
    phoneVerificationExpires: Date,
    isVerified: { type: Boolean, default: false }, // Overall verification badge
    verifiedAt: Date,
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },

    // Agency Relationship
    agency: {
        type: Schema.Types.ObjectId,
        ref: 'Agencies',
        required: true
    },
    position: { type: String }, // e.g., 'Manager', 'Senior Agent'

    // Performance Metrics
    ratings: {
        average: { type: Number, default: 0, min: 0, max: 5 },
        totalCount: { type: Number, default: 0 },
        breakdown: {
            fiveStar: { type: Number, default: 0 },
            fourStar: { type: Number, default: 0 },
            threeStar: { type: Number, default: 0 },
            twoStar: { type: Number, default: 0 },
            oneStar: { type: Number, default: 0 }
        }
    },
    responseTime: { type: String, default: 'within 24 hours' }, // e.g., "within 2 hours"

    // Statistics
    statistics: {
        totalRevenueSales: { type: Number, default: 0 },
        totalRevenueRent: { type: Number, default: 0 },
        activeListings: { type: Number, default: 0 },
        totalListings: { type: Number, default: 0 },
        totalRentProperties: { type: Number, default: 0 },
        totalSaleProperties: { type: Number, default: 0 },
        totalInquiries: { type: Number, default: 0 },
        newInquiries: { type: Number, default: 0 },
        dealsClosedSales: { type: Number, default: 0 },
        dealsClosedRent: { type: Number, default: 0 },
        totalDeals: { type: Number, default: 0 }
    },

    // Performance Tracking (Monthly)
    performanceMetrics: [{
        month: Date,
        revenue: {
            sales: Number,
            rent: Number,
            total: Number
        },
        deals: {
            sales: Number,
            rent: Number,
            total: Number
        },
        inquiries: Number,
        responseRate: Number // Percentage
    }],

    // Languages & Nationality
    languages: [{
        type: Schema.Types.ObjectId,
        ref: 'Languages'
    }],
    nationality: { type: Schema.Types.ObjectId, ref: 'Countries' },

    // Social Media & Links
    socialLinks: {
        linkedin: String,
        facebook: String,
        instagram: String,
        twitter: String
    },

    // About Me
    description: { type: String, maxlength: 2000 },
    aboutMe: { type: String, maxlength: 2000 },

    // Awards
    awards: [{
        title: String,
        description: String,
        awardedBy: String, // Company name or organization
        year: Number,
        image: String,
        addedAt: { type: Date, default: Date.now }
    }],

    // Track Records (Last 12 months)
    trackRecords: [{
        location: String,
        dealClosedDate: Date,
        dealType: { type: String, enum: ['rent', 'sale'] },
        propertyType: { type: Schema.Types.ObjectId, ref: 'PropertyType' },
        bedrooms: Number,
        dealAmount: Number,
        propertyId: { type: Schema.Types.ObjectId, ref: 'Property' },
        inquiryId: { type: Schema.Types.ObjectId, ref: 'Inquiry' }
    }],

    // Area of Expertise
    expertiseAreas: [{
        location: { type: Schema.Types.ObjectId, ref: 'Location' },
        locationName: String,
        totalDeals: { type: Number, default: 0 },
        rentDeals: { type: Number, default: 0 },
        saleDeals: { type: Number, default: 0 },
        averageRating: { type: Number, default: 0 },
        totalRevenue: { type: Number, default: 0 }
    }],

    // Allocated Properties from Agency
    allocatedProperties: [{
        type: Schema.Types.ObjectId,
        ref: 'PropertyAllocation'
    }],

    // Account Status
    isActive: { type: Boolean, default: true },
    deactivatedAt: Date,
    deactivatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    deactivationReason: String,

    // Invitation Status
    invitationStatus: {
        type: String,
        enum: ['pending', 'accepted', 'expired'],
        default: 'pending'
    },
    invitationToken: String,
    invitationSentAt: Date,
    invitationAcceptedAt: Date,

    // Password Reset
    resetPasswordToken: String,
    resetPasswordExpires: Date,

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
agentsSchema.index({ agency: 1, isActive: 1 });
agentsSchema.index({ agentType: 1, isActive: 1 });
agentsSchema.index({ brokerLicenseNumber: 1 });
agentsSchema.index({ nationality: 1, languages: 1 });
agentsSchema.index({ 'ratings.average': -1 });
agentsSchema.index({ createdAt: -1 });

// Text index for search
agentsSchema.index({
    fullName: 'text',
    specialization: 'text'
});

const Agents = model('Agents', agentsSchema);
module.exports = Agents;