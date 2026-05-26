// ============================================
// PROPERTY FINDER PROJECT - COMPLETE MONGODB SCHEMAS
// Version: 2.0 (Production Ready)
// ============================================

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ============================================
// 1. USER SCHEMA (Buyers/Renters)
// ============================================
const userSchema = new Schema({
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
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    phoneNumber: {
        type: String,
        trim: true
    },
    password: { type: String }, // Hashed password (optional for social login)
    profilePicture: { type: String }, // URL to profile image

    // Country
    country: {
        type: Schema.Types.ObjectId,
        ref: 'Country'
    },

    // Authentication
    authProvider: {
        type: String,
        enum: ['email', 'google', 'apple', 'phone'],
        default: 'email'
    },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    phoneVerificationOTP: String,
    phoneVerificationExpires: Date,

    // Location
    location: {
        city: String,
        state: String,
        country: String,
        coordinates: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: [Number] // [longitude, latitude]
        }
    },

    // Saved Properties (Liked/Favorited)
    savedProperties: [{
        property: { type: Schema.Types.ObjectId, ref: 'Property' },
        savedAt: { type: Date, default: Date.now }
    }],

    // Search Alerts
    searchAlerts: [{
        alertType: {
            type: String,
            enum: ['buy', 'rent', 'commercial-buy', 'commercial-rent', 'new-projects']
        },
        searchCriteria: {
            location: String,
            propertyType: [{ type: Schema.Types.ObjectId, ref: 'PropertyType' }],
            bedrooms: Number,
            bathrooms: Number,
            priceRange: {
                min: Number,
                max: Number
            },
            amenities: [{ type: Schema.Types.ObjectId, ref: 'Amenity' }],
            furnished: { type: String, enum: ['fully', 'partially', 'unfurnished', 'any'] },
            completionStatus: { type: String, enum: ['off-plan', 'ready', 'all'] },
            petFriendly: Boolean,
            waterfront: Boolean
        },
        frequency: {
            type: String,
            enum: ['hourly', 'daily', 'every-3-days'],
            default: 'daily'
        },
        isActive: { type: Boolean, default: true },
        lastSentAt: Date,
        createdAt: { type: Date, default: Date.now }
    }],

    // Contacted Properties
    contactedProperties: [{
        property: { type: Schema.Types.ObjectId, ref: 'Property' },
        agent: { type: Schema.Types.ObjectId, ref: 'Agent' },
        contactMethod: {
            type: String,
            enum: ['call', 'email', 'whatsapp']
        },
        contactedAt: { type: Date, default: Date.now },
        isReported: { type: Boolean, default: false },
        reportDetails: {
            userType: String,
            reason: String,
            description: String,
            reportedAt: Date
        }
    }],

    // Search & Activity History
    searchHistory: [{
        searchQuery: String,
        searchType: { type: String, enum: ['buy', 'rent', 'commercial-buy', 'commercial-rent', 'new-projects', 'agents', 'agencies', 'developers'] },
        filters: Schema.Types.Mixed,
        resultsCount: Number,
        timestamp: { type: Date, default: Date.now }
    }],

    recentSearches: [{
        query: String,
        type: String,
        timestamp: { type: Date, default: Date.now }
    }],

    // User Preferences
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

    // Account Status
    isActive: { type: Boolean, default: true },
    isBanned: { type: Boolean, default: false },
    bannedReason: String,
    bannedAt: Date,
    bannedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },

    // Session & Activity
    lastLogin: { type: Date },
    lastActiveAt: { type: Date },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date,

    // Password Reset
    resetPasswordToken: String,
    resetPasswordExpires: Date,

    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ 'location.coordinates': '2dsphere' });
userSchema.index({ isActive: 1, isBanned: 1 });
userSchema.index({ createdAt: -1 });

// Virtual for full name
userSchema.virtual('fullName').get(function () {
    return `${this.firstName} ${this.lastName}`;
});

// Method to check if account is locked
userSchema.methods.isLocked = function () {
    return !!(this.lockUntil && this.lockUntil > Date.now());
};

// ============================================
// 2. AGENT SCHEMA
// ============================================
const agentSchema = new Schema({
    // Basic Information
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    phoneNumber: {
        type: String,
        required: true,
        trim: true
    },
    whatsappNumber: {
        type: String,
        trim: true
    },
    password: { type: String, required: true },
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
        required: true,
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
        ref: 'Agency',
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
    languages: [String],
    nationality: { type: Schema.Types.ObjectId, ref: 'Countries' },

    // Social Media & Links
    socialLinks: {
        linkedin: String,
        facebook: String,
        instagram: String,
        twitter: String
    },

    // About Me
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
    lastLogin: Date,
    lastActiveAt: Date,

    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes
agentSchema.index({ email: 1 }, { unique: true });
agentSchema.index({ agency: 1, isActive: 1 });
agentSchema.index({ agentType: 1, isActive: 1 });
agentSchema.index({ brokerLicenseNumber: 1 });
agentSchema.index({ nationality: 1, languages: 1 });
agentSchema.index({ 'ratings.average': -1 });
agentSchema.index({ createdAt: -1 });
// Index for agent search by service needed (via properties listingType)
agentSchema.index({ isActive: 1, agentType: 1, 'ratings.average': -1 });
// Index for track records (last 12 months query)
agentSchema.index({ 'trackRecords.dealClosedDate': -1 });

// Text index for search
agentSchema.index({
    fullName: 'text',
    specialization: 'text'
});

// ============================================
// 3. AGENCY SCHEMA
// ============================================
const agencySchema = new Schema({
    // Basic Information
    agencyName: {
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
        required: true,
        trim: true
    },
    password: { type: String, required: true },
    profilePicture: { type: String },

    // Registration Details
    orn: {
        type: String,
        required: true,
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
    lastLogin: Date,
    lastActiveAt: Date,

    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes
agencySchema.index({ email: 1 }, { unique: true });
agencySchema.index({ orn: 1 }, { unique: true });
agencySchema.index({ isActive: 1, isVerified: 1 });
agencySchema.index({ 'subscription.expiryDate': 1 });
agencySchema.index({ createdAt: -1 });

// Text index for search
agencySchema.index({
    agencyName: 'text',
    description: 'text'
});

// ============================================
// 4. DEVELOPER SCHEMA
// ============================================
const developerSchema = new Schema({
    // Basic Information
    name: {
        type: String,
        required: true,
        trim: true
    },
    logo: { type: String }, // Profile picture/logo
    foundedYear: { type: Number },
    description: { type: String, maxlength: 5000 },

    // Contact Information
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    phoneNumber: {
        type: String,
        required: true,
        trim: true
    },
    website: { type: String },
    password: { type: String, required: true }, // For developer account login

    // Address
    address: {
        street: String,
        city: String,
        state: String,
        country: String,
        zipCode: String,
        fullAddress: String
    },

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

    // Authentication & Verification
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    isPhoneVerified: { type: Boolean, default: false },
    phoneVerificationOTP: String,
    phoneVerificationExpires: Date,
    isVerified: { type: Boolean, default: false },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    verifiedAt: Date,

    // Invitation Status (from Admin)
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

    // Session & Activity
    lastLogin: Date,
    lastActiveAt: Date,
    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date,

    // Status
    isActive: { type: Boolean, default: true },
    deactivatedAt: Date,
    deactivatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    deactivationReason: String,

    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes
developerSchema.index({ email: 1 }, { unique: true });
developerSchema.index({ name: 1 });
developerSchema.index({ slug: 1 }, { unique: true });
developerSchema.index({ isActive: 1, isVerified: 1 });
developerSchema.index({ totalProjects: -1 });
developerSchema.index({ invitationStatus: 1 });
developerSchema.index({ createdAt: -1 });

// Text index for search
developerSchema.index({
    name: 'text',
    description: 'text'
});

// Method to check if account is locked
developerSchema.methods.isLocked = function () {
    return !!(this.lockUntil && this.lockUntil > Date.now());
};

// ============================================
// 4.5. PARTNER SCHEMA (For "Know more about us" logos)
// ============================================
const partnerSchema = new Schema({
    // Partner Information
    name: {
        type: String,
        required: true,
        trim: true
    },
    logo: {
        type: String,
        required: true
    }, // URL to partner logo
    website: String,
    description: { type: String, maxlength: 500 },
    
    // Display Settings
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    
    // Category (optional grouping)
    category: {
        type: String,
        enum: ['partner', 'sponsor', 'client', 'affiliate', 'other'],
        default: 'partner'
    },
    
    // Metadata
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes
partnerSchema.index({ isActive: 1, displayOrder: 1 });
partnerSchema.index({ isFeatured: 1 });
partnerSchema.index({ category: 1 });

// ============================================
// 5. PROPERTY SCHEMA
// ============================================
const propertySchema = new Schema({
    // Basic Information
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    description: {
        type: String,
        maxlength: 5000
    },

    // Property Classification
    listingType: {
        type: String,
        enum: ['buy', 'rent', 'commercial-buy', 'commercial-rent'],
        required: true
    },
    propertyType: {
        type: Schema.Types.ObjectId,
        ref: 'PropertyType',
        required: true
    },

    // Agent/Agency/Developer Information
    agent: {
        type: Schema.Types.ObjectId,
        ref: 'Agent',
        required: true
    },
    agency: {
        type: Schema.Types.ObjectId,
        ref: 'Agency',
        required: true
    },
    developer: {
        type: Schema.Types.ObjectId,
        ref: 'Developer'
    },

    // Property Details
    bedrooms: { type: Number, required: true, min: 0 },
    maidBedroom: { type: Boolean, default: false },
    bathrooms: { type: Number, required: true, min: 0 },
    area: {
        sqm: { type: Number, required: true, min: 0 },
        sqft: { type: Number, min: 0 }
    },

    // Amenities
    amenities: [{
        type: Schema.Types.ObjectId,
        ref: 'Amenity'
    }],

    // Pricing
    price: {
        type: Number,
        required: true,
        min: 0
    },
    maintenanceFees: { type: Number, min: 0 }, // For rent
    serviceCharges: { type: Number, min: 0 }, // For rent
    currency: {
        type: String,
        default: 'AED'
    },

    // Price History (Track price changes)
    priceHistory: [{
        price: Number,
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: Schema.Types.ObjectId, ref: 'Agent' },
        reason: String
    }],

    // Media
    images: [{
        url: { type: String, required: true },
        isPrimary: { type: Boolean, default: false },
        order: { type: Number, default: 0 },
        caption: String,
        uploadedAt: { type: Date, default: Date.now }
    }],
    virtualTour360: { type: String }, // URL
    videoTour: { type: String }, // URL
    floorPlan: [String], // URLs

    // Location
    location: {
        fullAddress: String,
        city: String,
        zone: String,
        building: String,
        coordinates: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: [Number] // [longitude, latitude]
        },
        googlePlaceId: String,
        locationRef: { type: Schema.Types.ObjectId, ref: 'Location' }
    },

    // Legal & Regulatory
    dldPermitNumber: {
        type: String,
        required: true,
        trim: true
    },
    dldPermitUrl: { type: String },
    referenceId: { type: String }, // Created by developer for projects

    // Property Status
    status: {
        type: String,
        enum: ['active', 'inactive', 'sold', 'rented', 'pending'],
        default: 'active'
    },
    completionStatus: {
        type: String,
        enum: ['off-plan', 'ready'],
        default: 'ready'
    },
    furnishedStatus: {
        type: String,
        enum: ['fully', 'partially', 'unfurnished'],
        required: true
    },

    // Features
    isPetFriendly: { type: Boolean, default: false },
    isWaterfront: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    isSuperagentListing: { type: Boolean, default: false },

    // Featured Settings
    featured: {
        isFeatured: { type: Boolean, default: false },
        priority: { type: Number, default: 0 }, // Higher number = higher priority
        featuredUntil: Date,
        featuredBy: { type: Schema.Types.ObjectId, ref: 'Admin' }
    },

    // Engagement Metrics
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    inquiries: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },

    // View History (for analytics and recommendations)
    viewHistory: [{
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        viewedAt: { type: Date, default: Date.now },
        duration: Number, // seconds
        device: String,
        browser: String,
        ipAddress: String
    }],
    // Contact Tracking
    lastContactedAt: Date,
    contactCount: { type: Number, default: 0 },
    // Reports & Flags
    reportCount: { type: Number, default: 0 },
    isFlagged: { type: Boolean, default: false },
    flaggedReason: String,
    flaggedAt: Date,
    // Deal Information (if sold/rented)
    dealInfo: {
        dealType: { type: String, enum: ['sale', 'rent'] },
        dealAmount: Number,
        dealClosedDate: Date,
        dealClosedBy: { type: Schema.Types.ObjectId, ref: 'Agent' },
        customer: {
            name: String,
            email: String,
            phone: String
        }
    },
    // Allocated Property Reference
    allocationRef: {
        type: Schema.Types.ObjectId,
        ref: 'PropertyAllocation'
    },
    // SEO
    slug: { type: String, unique: true },
    metaTitle: String,
    metaDescription: String,
    metaKeywords: [String],
    // Timestamps
    publishedAt: Date,
    lastModifiedAt: { type: Date, default: Date.now },
    lastModifiedBy: { type: Schema.Types.ObjectId, ref: 'Agent' },
    deactivatedAt: Date,
    deactivatedBy: { type: Schema.Types.ObjectId, ref: 'Agent' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
propertySchema.index({ 'location.coordinates': '2dsphere' });
propertySchema.index({ listingType: 1, status: 1 });
propertySchema.index({ agent: 1, status: 1 });
propertySchema.index({ agency: 1, status: 1 });
propertySchema.index({ developer: 1 });
propertySchema.index({ propertyType: 1, listingType: 1 });
propertySchema.index({ price: 1, listingType: 1 });
propertySchema.index({ bedrooms: 1, bathrooms: 1 });
propertySchema.index({ isFeatured: 1, status: 1 });
propertySchema.index({ slug: 1 }, { unique: true });
propertySchema.index({ publishedAt: -1 });
propertySchema.index({ views: -1 });
// Text index for search
propertySchema.index({
    title: 'text',
    description: 'text',
    'location.fullAddress': 'text',
    'location.city': 'text'
});
// Compound indexes for common queries
propertySchema.index({ listingType: 1, 'location.city': 1, price: 1 });
propertySchema.index({ status: 1, isFeatured: -1, publishedAt: -1 });
// Index for recommended properties (location, price range, property type)
propertySchema.index({ 'location.city': 1, propertyType: 1, price: 1, status: 1 });
// Index for agent search by service type (listingType)
propertySchema.index({ agent: 1, listingType: 1, status: 1 });
// Index for reference ID (developer projects)
propertySchema.index({ referenceId: 1 });

// ============================================
// 6. NEW PROJECT SCHEMA (Off-Plan Projects)
// ============================================
const newProjectSchema = new Schema({
    // Basic Information
    projectName: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        maxlength: 5000
    },
    // Developer
    developer: {
        type: Schema.Types.ObjectId,
        ref: 'Developer',
        required: true
    },
    // Project Type
    projectType: {
        type: String,
        enum: ['off-plan', 'ready'],
        default: 'off-plan'
    },
    // Property Details
    propertyTypes: [{
        type: Schema.Types.ObjectId,
        ref: 'PropertyType'
    }],
    bedroomOptions: [Number], // e.g., [1, 2, 3, 4]
    // Unit Details
    unitDetails: [{
        unitType: String, // e.g., "1 Bedroom Apartment"
        propertyType: { type: Schema.Types.ObjectId, ref: 'PropertyType' },
        bedrooms: Number,
        bathrooms: Number,
        area: {
            sqm: Number,
            sqft: Number
        },
        price: {
            startingFrom: Number,
            currency: { type: String, default: 'AED' }
        },
        totalUnits: Number,
        availableUnits: Number,
        floorPlan: String
    }],
    // Pricing
    launchPrice: {
        startingFrom: Number,
        currency: { type: String, default: 'AED' }
    },
    paymentPlan: {
        type: String,
        description: String,
        breakdown: [{
            stage: String, // e.g., "Down Payment", "During Construction"
            percentage: Number,
            amount: Number,
            dueDate: String
        }]
    }, // e.g., "10/40/50"
    hasPostHandoverPayment: { type: Boolean, default: false },
    postHandoverDetails: {
        duration: String, // e.g., "3 years"
        percentage: Number
    },
    // Timeline
    launchDate: Date,
    deliveryDate: Date,
    expectedCompletionDate: Date,
    completionStatus: {
        type: String,
        enum: ['off-plan', 'ready', 'under-construction'],
        default: 'off-plan'
    },
    constructionProgress: { type: Number, min: 0, max: 100 }, // Percentage
    // Location
    location: {
        city: String,
        zone: String,
        address: String,
        coordinates: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: [Number]
        },
        locationRef: { type: Schema.Types.ObjectId, ref: 'Location' }
    },
    // Media
    images: [{
        url: String,
        isPrimary: Boolean,
        order: Number,
        caption: String,
        uploadedAt: { type: Date, default: Date.now }
    }],
    virtualTour360: String,
    videoTour: String,
    masterPlan: [String],
    brochure: String, // PDF URL
    projectPlan: String, // PDF URL
    // Amenities
    amenities: [{
        type: Schema.Types.ObjectId,
        ref: 'Amenity'
    }],
    // DLD Registration
    isDldRegistered: { type: Boolean, default: false },
    dldRegistrationNumber: String,
    registrationDetails: {
        permitNumber: String,
        permitUrl: String,
        issuedDate: Date,
        expiryDate: Date
    },
    // Units Available
    totalUnits: Number,
    availableUnits: Number,
    soldUnits: { type: Number, default: 0 },
    reservedUnits: { type: Number, default: 0 },
    // Agent Contact
    contactAgent: {
        type: Schema.Types.ObjectId,
        ref: 'Agent'
    },
    contactAgency: {
        type: Schema.Types.ObjectId,
        ref: 'Agency'
    },
    // Features
    isFeatured: { type: Boolean, default: false },
    featuredUntil: Date,
    // Engagement
    views: { type: Number, default: 0 },
    inquiries: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    // View History
    viewHistory: [{
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        viewedAt: { type: Date, default: Date.now }
    }],
    // SEO
    slug: { type: String, unique: true },
    metaTitle: String,
    metaDescription: String,
    metaKeywords: [String],
    // Status
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    verifiedAt: Date,
    // Timestamps
    publishedAt: Date,
    lastModifiedAt: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
newProjectSchema.index({ 'location.coordinates': '2dsphere' });
newProjectSchema.index({ developer: 1, isActive: 1 });
newProjectSchema.index({ projectType: 1, completionStatus: 1 });
newProjectSchema.index({ deliveryDate: 1 });
newProjectSchema.index({ 'launchPrice.startingFrom': 1 });
newProjectSchema.index({ isFeatured: 1, isActive: 1 });
newProjectSchema.index({ slug: 1 }, { unique: true });
newProjectSchema.index({ publishedAt: -1 });
// Text index for search
newProjectSchema.index({
    projectName: 'text',
    description: 'text',
    'location.city': 'text'
});
// Index for project search filters
newProjectSchema.index({ developer: 1, 'location.city': 1, isActive: 1 });
newProjectSchema.index({ completionStatus: 1, deliveryDate: 1 });
newProjectSchema.index({ isDldRegistered: 1, hasPostHandoverPayment: 1 });
newProjectSchema.index({ 'launchPrice.startingFrom': 1, deliveryDate: 1 });

// ============================================
// 7. INQUIRY/LEAD SCHEMA
// ============================================
const inquirySchema = new Schema({
    // Customer Information
    customer: {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        name: { type: String, required: true },
        email: { type: String, required: true },
        phoneNumber: { type: String, required: true }
    },
    // Property Information
    property: {
        type: Schema.Types.ObjectId,
        ref: 'Property',
        required: true
    },
    propertyTitle: String, // Denormalized for quick access
    propertyType: String,
    listingType: { type: String, enum: ['buy', 'rent', 'commercial-buy', 'commercial-rent'] },
    // Agent/Agency
    agent: {
        type: Schema.Types.ObjectId,
        ref: 'Agent',
        required: true
    },
    agency: {
        type: Schema.Types.ObjectId,
        ref: 'Agency',
        required: true
    },
    // Inquiry Details
    inquiryType: {
        type: String,
        enum: ['call', 'email', 'whatsapp'],
        required: true
    },
    message: { type: String },
    // Status Management
    status: {
        type: String,
        enum: ['new', 'attended', 'closed'],
        default: 'new'
    },
    // Status Tracking
    statusHistory: [{
        status: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: Schema.Types.ObjectId, ref: 'Agent' },
        notes: String
    }],
    // Response Time Tracking
    responseTime: {
        firstResponseAt: Date,
        responseMinutes: Number // Time taken to first respond
    },
    // Notes (Agent can add notes)
    notes: [{
        note: String,
        addedBy: { type: Schema.Types.ObjectId, ref: 'Agent' },
        addedAt: { type: Date, default: Date.now },
        isPrivate: { type: Boolean, default: false }
    }],
    // Follow-up Reminders
    followUpReminders: [{
        reminderDate: Date,
        reminderNote: String,
        isCompleted: { type: Boolean, default: false },
        completedAt: Date,
        createdBy: { type: Schema.Types.ObjectId, ref: 'Agent' }
    }],
    // Deal Closure (if applicable)
    dealClosed: {
        isClosed: { type: Boolean, default: false },
        dealType: { type: String, enum: ['sale', 'rent'] },
        dealAmount: Number,
        commission: Number,
        closedDate: Date,
        closedBy: { type: Schema.Types.ObjectId, ref: 'Agent' },
        notes: String
    },
    // Source Tracking
    source: {
        type: String,
        enum: ['property-listing', 'agent-profile', 'agency-profile', 'search-results', 'direct'],
        default: 'property-listing'
    },
    pageUrl: String,
    // Priority
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    // Timestamps
    inquiredAt: { type: Date, default: Date.now },
    attendedAt: Date,
    closedAt: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
inquirySchema.index({ agent: 1, status: 1 });
inquirySchema.index({ agency: 1, status: 1 });
inquirySchema.index({ property: 1 });
inquirySchema.index({ 'customer.userId': 1 });
inquirySchema.index({ status: 1, inquiredAt: -1 });
inquirySchema.index({ inquiredAt: -1 });
// Compound index for dashboard queries
inquirySchema.index({ agent: 1, status: 1, inquiredAt: -1 });

// ============================================
// 8. PROPERTY ALLOCATION SCHEMA
// ============================================
const propertyAllocationSchema = new Schema({
    agency: {
        type: Schema.Types.ObjectId,
        ref: 'Agency',
        required: true
    },
    agent: {
        type: Schema.Types.ObjectId,
        ref: 'Agent',
        required: true
    },
    // Document Details
    title: { type: String, required: true },
    document: { type: String, required: true }, // URL to .pdf or .doc
    documentType: { type: String, enum: ['pdf', 'doc', 'docx', 'other'] },
    // Property Details (optional metadata)
    propertyDetails: {
        location: String,
        propertyType: String,
        estimatedPrice: Number,
        description: String
    },
    // Status
    status: {
        type: String,
        enum: ['pending', 'in-progress', 'completed', 'cancelled'],
        default: 'pending'
    },
    // Completion Details
    listingLink: String,
    completedProperty: { type: Schema.Types.ObjectId, ref: 'Property' },
    completedAt: Date,
    completedNotes: String,
    // Deadline
    deadline: Date,
    // Notes
    agencyNotes: String,
    agentNotes: String,
    // Tracking
    viewedAt: Date,
    viewedByAgent: { type: Boolean, default: false },
    sentAt: { type: Date, default: Date.now },
    sentBy: { type: Schema.Types.ObjectId, ref: 'Admin' }, // Could be admin or agency user
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
propertyAllocationSchema.index({ agency: 1, agent: 1 });
propertyAllocationSchema.index({ agent: 1, status: 1 });
propertyAllocationSchema.index({ status: 1, sentAt: -1 });

// ============================================
// 9. RATING & REVIEW SCHEMA
// ============================================
const ratingReviewSchema = new Schema({
    // Rating Target (Agent or Agency)
    targetType: {
        type: String,
        enum: ['agent', 'agency', 'developer'],
        required: true
    },
    targetId: {
        type: Schema.Types.ObjectId,
        required: true,
        refPath: 'targetType'
    },
    // Reviewer
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Rating & Review
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    review: { type: String, maxlength: 1000 },
    title: { type: String, maxlength: 200 },
    // Rating Categories (optional detailed ratings)
    categories: {
        communication: { type: Number, min: 1, max: 5 },
        professionalism: { type: Number, min: 1, max: 5 },
        marketKnowledge: { type: Number, min: 1, max: 5 },
        responseTime: { type: Number, min: 1, max: 5 }
    },
    // Related Property (optional)
    property: {
        type: Schema.Types.ObjectId,
        ref: 'Property'
    },
    // Related Inquiry/Deal
    inquiry: {
        type: Schema.Types.ObjectId,
        ref: 'Inquiry'
    },
    // Response from Agent/Agency
    response: {
        text: String,
        respondedBy: { type: Schema.Types.ObjectId, refPath: 'targetType' },
        respondedAt: Date
    },
    // Helpful Votes
    helpfulVotes: { type: Number, default: 0 },
    unhelpfulVotes: { type: Number, default: 0 },
    // Status
    isApproved: { type: Boolean, default: false },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    approvedAt: Date,
    isVisible: { type: Boolean, default: true },
    isFlagged: { type: Boolean, default: false },
    flagReason: String,
    // Verification
    isVerifiedPurchase: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
ratingReviewSchema.index({ targetType: 1, targetId: 1 });
ratingReviewSchema.index({ user: 1 });
ratingReviewSchema.index({ rating: 1 });
ratingReviewSchema.index({ isApproved: 1, isVisible: 1 });
ratingReviewSchema.index({ createdAt: -1 });
// Compound index
ratingReviewSchema.index({ targetType: 1, targetId: 1, isApproved: 1, isVisible: 1 });

// ============================================
// 10. REPORT SCHEMA
// ============================================
const reportSchema = new Schema({
    // Reporter
    reportedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Reported Item
    reportType: {
        type: String,
        enum: ['property', 'agent', 'agency', 'user', 'review', 'project'],
        required: true
    },
    reportedItem: {
        type: Schema.Types.ObjectId,
        required: true,
        refPath: 'reportType'
    },
    // Report Details
    userType: {
        type: String,
        required: true
    }, // From dropdown in frontend (e.g., "buyer", "renter", "agent")
    reason: {
        type: String,
        required: true
    }, // From dropdown (e.g., "fraud", "inappropriate content", "spam")
    description: {
        type: String,
        maxlength: 2000
    },
    // Evidence
    attachments: [String], // URLs to screenshots or documents
    // Status
    status: {
        type: String,
        enum: ['pending', 'under-review', 'reviewed', 'resolved', 'rejected', 'escalated'],
        default: 'pending'
    },
    // Priority
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    // Admin Action
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    reviewNotes: String,
    reviewedAt: Date,
    actionTaken: String, // Description of what action was taken
    // Resolution
    resolution: {
        status: String,
        notes: String,
        resolvedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
        resolvedAt: Date
    },
    // Internal Notes
    internalNotes: [{
        note: String,
        addedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
        addedAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
reportSchema.index({ reportedBy: 1 });
reportSchema.index({ reportType: 1, reportedItem: 1 });
reportSchema.index({ status: 1, priority: -1 });
reportSchema.index({ createdAt: -1 });

// ============================================
// 11. SUBSCRIPTION PLAN SCHEMA
// ============================================
const subscriptionPlanSchema = new Schema({
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
subscriptionPlanSchema.index({ isActive: 1, isVisible: 1, displayOrder: 1 });
subscriptionPlanSchema.index({ planType: 1 });

// ============================================
// 12. PROPERTY TYPE SCHEMA
// ============================================
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
    // Category
    category: {
        type: String,
        enum: ['residential', 'commercial', 'land', 'other'],
        default: 'residential'
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

// ============================================
// 13. AMENITY SCHEMA
// ============================================
const amenitySchema = new Schema({
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
    // Category
    category: {
        type: String,
        enum: ['basic', 'luxury', 'outdoor', 'security', 'community', 'recreation', 'wellness', 'other'],
        default: 'basic'
    },
    // Display
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    isPopular: { type: Boolean, default: false },
    // Usage Statistics
    usageCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
amenitySchema.index({ name: 1 }, { unique: true });
amenitySchema.index({ slug: 1 }, { unique: true });
amenitySchema.index({ isActive: 1, displayOrder: 1 });
amenitySchema.index({ category: 1 });

// ============================================
// 14. COUNTRY SCHEMA
// ============================================
const countrySchema = new Schema({
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
countrySchema.index({ code: 1 }, { unique: true });
countrySchema.index({ isActive: 1, displayOrder: 1 });

// ============================================
// 15. BANNER SCHEMA
// ============================================
const bannerSchema = new Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: { type: String },
    image: { type: String, required: true },
    mobileImage: String, // Separate image for mobile
    link: String,
    linkText: String, // Call-to-action text
    // Placement
    placement: {
        type: String,
        enum: ['home-page', 'search-page', 'listing-page', 'agent-page', 'agency-page', 'project-page'],
        required: true
    },
    position: {
        type: String,
        enum: ['top', 'middle', 'bottom', 'sidebar'],
        default: 'top'
    },
    // Display Settings
    displayOrder: { type: Number, default: 0 },
    startDate: Date,
    endDate: Date,
    // Target Audience
    targetAudience: {
        userType: { type: String, enum: ['all', 'buyers', 'renters', 'agents', 'agencies'] },
        locations: [String]
    },
    // Status
    isActive: { type: Boolean, default: true },
    // Analytics
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    ctr: { type: Number, default: 0 }, // Click-through rate
    // Metadata
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
bannerSchema.index({ placement: 1, isActive: 1, displayOrder: 1 });
bannerSchema.index({ startDate: 1, endDate: 1 });

// ============================================
// 16. TESTIMONIAL SCHEMA
// ============================================
const testimonialSchema = new Schema({
    userName: {
        type: String,
        required: true,
        trim: true
    },
    userImage: String,
    userEmail: String,
    // Rating
    rating: {
        type: Number,
        min: 1,
        max: 5,
        required: true
    },
    // Testimonial Content
    testimonial: {
        type: String,
        required: true,
        maxlength: 1000
    },
    title: { type: String, maxlength: 200 },
    // User Details
    designation: String, // e.g., "Real Estate Investor"
    company: String,
    location: String,
    // Related Items
    relatedProperty: { type: Schema.Types.ObjectId, ref: 'Property' },
    relatedAgent: { type: Schema.Types.ObjectId, ref: 'Agent' },
    relatedAgency: { type: Schema.Types.ObjectId, ref: 'Agency' },
    // Source
    source: {
        type: String,
        enum: ['website', 'google', 'facebook', 'email', 'manual'],
        default: 'manual'
    },
    // Status
    isApproved: { type: Boolean, default: false },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    approvedAt: Date,
    isVisible: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    // Metadata
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
testimonialSchema.index({ isApproved: 1, isVisible: 1, displayOrder: 1 });
testimonialSchema.index({ rating: -1 });
testimonialSchema.index({ isFeatured: 1 });

// ============================================
// 17. CMS PAGE SCHEMA (Help Pages, T&C, etc.)
// ============================================
const cmsPageSchema = new Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    content: {
        type: String,
        required: true
    },
    excerpt: { type: String, maxlength: 500 },
    // Page Type
    pageType: {
        type: String,
        enum: ['help', 'terms', 'privacy', 'about', 'faq', 'contact', 'career', 'press', 'other'],
        default: 'other'
    },
    // Parent Page (for hierarchical structure)
    parentPage: { type: Schema.Types.ObjectId, ref: 'CmsPage' },
    // Template
    template: {
        type: String,
        enum: ['default', 'full-width', 'sidebar', 'custom'],
        default: 'default'
    },
    // SEO
    metaTitle: String,
    metaDescription: String,
    metaKeywords: [String],
    ogImage: String,
    // Display
    isActive: { type: Boolean, default: true },
    isPublished: { type: Boolean, default: false },
    publishedAt: Date,
    displayOrder: { type: Number, default: 0 },
    // Show in Menu
    showInFooter: { type: Boolean, default: false },
    showInHeader: { type: Boolean, default: false },
    // Custom Fields
    customFields: Schema.Types.Mixed,
    // Version Control
    version: { type: Number, default: 1 },
    previousVersions: [{
        version: Number,
        content: String,
        updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
        updatedAt: Date
    }],
    // User Management
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    lastModifiedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
cmsPageSchema.index({ slug: 1 }, { unique: true });
cmsPageSchema.index({ pageType: 1, isActive: 1 });
cmsPageSchema.index({ isPublished: 1, publishedAt: -1 });

// ============================================
// 18. ADMIN SCHEMA
// ============================================
const adminSchema = new Schema({
    name: {
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
    password: { type: String, required: true },
    profilePicture: String,
    phoneNumber: String,
    // Role & Privileges
    role: {
        type: Schema.Types.ObjectId,
        ref: 'Role',
        required: true
    },
    // Permissions (can override role permissions)
    permissions: [String], // Array of permission keys
    // Department
    department: {
        type: String,
        enum: ['admin', 'support', 'sales', 'marketing', 'content', 'technical', 'other']
    },
    // Status
    isActive: { type: Boolean, default: true },
    isSuperAdmin: { type: Boolean, default: false },
    // Two-Factor Authentication
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: String,
    // Session & Security
    lastLogin: Date,
    lastLoginIP: String,
    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date,
    // Password Reset
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    // Activity Tracking
    lastActiveAt: Date,
    // Metadata
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
adminSchema.index({ email: 1 }, { unique: true });
adminSchema.index({ role: 1, isActive: 1 });
adminSchema.index({ isSuperAdmin: 1 });

// ============================================
// 19. ROLE SCHEMA (For Admin Panel)
// ============================================
const roleSchema = new Schema({
    roleName: {
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
    description: { type: String, maxlength: 500 },
    // Permissions Structure
    permissions: [{
        module: {
            type: String,
            required: true
        }, // e.g., 'users', 'properties', 'agents', 'listings'
        actions: [{
            type: String,
            enum: ['create', 'read', 'update', 'delete', 'approve', 'export', 'import']
        }],
        scope: {
            type: String,
            enum: ['all', 'own', 'department', 'none'],
            default: 'all'
        }
    }],
    // Role Level
    level: {
        type: Number,
        default: 1
    }, // Higher number = more privileges
    // Status
    isActive: { type: Boolean, default: true },
    isSystemRole: { type: Boolean, default: false }, // Cannot be deleted
    // Metadata
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
roleSchema.index({ roleName: 1 }, { unique: true });
roleSchema.index({ slug: 1 }, { unique: true });
roleSchema.index({ isActive: 1, level: -1 });

// ============================================
// 20. SITE SETTINGS SCHEMA
// ============================================
const siteSettingsSchema = new Schema({
    // General Settings
    siteName: { type: String, default: 'Property Finder' },
    siteTagline: String,
    siteLogo: String,
    siteLogoDark: String, // For dark mode
    siteFavicon: String,
    siteDescription: String,
    // Contact Information
    contactEmail: String,
    contactPhone: String,
    contactAddress: String,
    supportEmail: String,
    supportPhone: String,
    whatsappNumber: String,
    // Social Media
    socialLinks: {
        facebook: String,
        twitter: String,
        instagram: String,
        linkedin: String,
        youtube: String,
        tiktok: String,
        pinterest: String
    },
    // App Links
    appLinks: {
        androidApp: String,
        iosApp: String,
        androidAppQR: String,
        iosAppQR: String
    },
    // Currency Settings
    defaultCurrency: { type: String, default: 'AED' },
    supportedCurrencies: [{
        code: String,
        symbol: String,
        exchangeRate: Number,
        isActive: Boolean
    }],
    // Language Settings
    defaultLanguage: { type: String, default: 'en' },
    supportedLanguages: [{
        code: String,
        name: String,
        isActive: Boolean
    }],
    // Email Settings
    emailSettings: {
        smtpHost: String,
        smtpPort: Number,
        smtpUser: String,
        smtpPassword: String,
        fromEmail: String,
        fromName: String,
        replyToEmail: String,
        useSSL: { type: Boolean, default: true }
    },
    // SMS Settings
    smsSettings: {
        provider: { type: String, enum: ['twilio', 'nexmo', 'aws-sns', 'other'] },
        apiKey: String,
        apiSecret: String,
        fromNumber: String,
        isEnabled: { type: Boolean, default: false }
    },
    // SEO Settings
    seoSettings: {
        defaultMetaTitle: String,
        defaultMetaDescription: String,
        defaultMetaKeywords: [String],
        ogImage: String,
        twitterImage: String,
        googleAnalyticsId: String,
        googleTagManagerId: String,
        facebookPixelId: String,
        linkedInInsightTag: String,
        bingWebmasterCode: String,
        googleSiteVerification: String
    },
    // Map Settings
    mapSettings: {
        googleMapsApiKey: String,
        mapProvider: { type: String, enum: ['google', 'mapbox', 'openstreetmap'], default: 'google' },
        defaultZoom: { type: Number, default: 12 },
        defaultCenter: {
            lat: { type: Number, default: 25.2048 }, // Dubai
            lng: { type: Number, default: 55.2708 }
        },
        mapStyle: String // Custom map style JSON
    },
    // Payment Gateway Settings
    paymentSettings: {
        stripePublicKey: String,
        stripeSecretKey: String,
        paypalClientId: String,
        paypalClientSecret: String,
        razorpayKeyId: String,
        razorpayKeySecret: String,
        isEnabled: { type: Boolean, default: false }
    },
    // Mortgage Calculator Settings
    mortgageSettings: {
        apiProvider: String,
        apiKey: String,
        defaultInterestRate: { type: Number, default: 4.5 },
        defaultLoanTerm: { type: Number, default: 25 }, // years
        isEnabled: { type: Boolean, default: true }
    },
    // Featured Listings Settings
    featuredSettings: {
        maxFeaturedProperties: { type: Number, default: 10 },
        featuredDuration: { type: Number, default: 30 }, // days
        featuredPrice: Number
    },
    // Maintenance Mode
    maintenanceMode: {
        enabled: { type: Boolean, default: false },
        message: String,
        allowedIPs: [String], // IPs that can access during maintenance
        startTime: Date,
        endTime: Date
    },
    // Feature Flags
    features: {
        enableUserRegistration: { type: Boolean, default: true },
        enableAgentRegistration: { type: Boolean, default: false },
        enableSocialLogin: { type: Boolean, default: true },
        enablePropertyReviews: { type: Boolean, default: true },
        enablePropertyReports: { type: Boolean, default: true },
        enableChatSupport: { type: Boolean, default: false },
        enableNewsletter: { type: Boolean, default: true },
        enableBlog: { type: Boolean, default: true }
    },
    // Notification Settings
    notificationSettings: {
        emailNotifications: { type: Boolean, default: true },
        smsNotifications: { type: Boolean, default: false },
        pushNotifications: { type: Boolean, default: true },
        inAppNotifications: { type: Boolean, default: true }
    },
    // Business Rules
    businessRules: {
        minPropertyPrice: { type: Number, default: 0 },
        maxPropertyPrice: Number,
        minPropertyArea: { type: Number, default: 0 },
        maxPropertyArea: Number,
        maxImagesPerProperty: { type: Number, default: 50 },
        maxVideoSize: { type: Number, default: 100 }, // MB
        propertyExpiryDays: { type: Number, default: 90 },
        autoRenewListings: { type: Boolean, default: false }
    },
    // Third-Party Integrations
    integrations: {
        whatsappAPI: {
            isEnabled: Boolean,
            apiKey: String,
            businessId: String
        },
        zapier: {
            isEnabled: Boolean,
            apiKey: String
        },
        mailchimp: {
            isEnabled: Boolean,
            apiKey: String,
            listId: String
        }
    },
    // Legal
    legalSettings: {
        termsUrl: String,
        privacyUrl: String,
        cookiePolicyUrl: String,
        copyrightText: String
    },
    // Metadata
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });
// Only one settings document should exist
siteSettingsSchema.index({ _id: 1 }, { unique: true });

// ============================================
// 21. LOCATION/CITY SCHEMA
// ============================================
const locationSchema = new Schema({
    cityName: {
        type: String,
        required: true,
        trim: true
    },
    state: String,
    country: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    // Geo Coordinates
    coordinates: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: [Number] // [longitude, latitude]
    },
    // Area Code
    areaCode: String,
    zipCode: String,
    // Area Insights
    areaInsights: {
        overview: String,
        demographics: String,
        infrastructure: String,
        amenities: String,
        transportation: String,
        schools: String,
        healthcare: String,
        shopping: String,
        entertainment: String,
        averagePrice: Number,
        priceRange: {
            min: Number,
            max: Number
        },
        pricePerSqm: Number,
        appreciation: Number, // Percentage per year
        rentalYield: Number // Percentage
    },
    // Statistics
    totalProperties: { type: Number, default: 0 },
    totalProjects: { type: Number, default: 0 },
    totalAgents: { type: Number, default: 0 },
    totalAgencies: { type: Number, default: 0 },
    // Property Breakdown
    propertyBreakdown: {
        forSale: { type: Number, default: 0 },
        forRent: { type: Number, default: 0 },
        commercial: { type: Number, default: 0 },
        offPlan: { type: Number, default: 0 }
    },
    // Media
    featuredImage: String,
    coverImage: String,
    galleryImages: [String],
    // Popular Landmarks
    landmarks: [{
        name: String,
        type: String,
        distance: String,
        coordinates: {
            lat: Number,
            lng: Number
        }
    }],
    // Nearby Locations
    nearbyLocations: [{
        type: Schema.Types.ObjectId,
        ref: 'Location'
    }],
    // Display
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    // SEO
    metaTitle: String,
    metaDescription: String,
    metaKeywords: [String],
    // Metadata
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    lastUpdatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
locationSchema.index({ coordinates: '2dsphere' });
locationSchema.index({ cityName: 1, country: 1 });
locationSchema.index({ slug: 1 }, { unique: true });
locationSchema.index({ isFeatured: 1, displayOrder: 1 });
// Text index for search
locationSchema.index({ cityName: 'text', state: 'text', country: 'text' });

// ============================================
// 22. NOTIFICATION SCHEMA
// ============================================
const notificationSchema = new Schema({
    // Recipient
    recipient: {
        recipientType: {
            type: String,
            enum: ['user', 'agent', 'agency', 'developer', 'admin'],
            required: true
        },
        recipientId: {
            type: Schema.Types.ObjectId,
            required: true,
            refPath: 'recipient.recipientType'
        }
    },
    // Notification Content
    title: {
        type: String,
        required: true,
        maxlength: 200
    },
    message: {
        type: String,
        required: true,
        maxlength: 1000
    },
    // Notification Type
    notificationType: {
        type: String,
        enum: ['inquiry', 'alert', 'property-update', 'deal-closed', 'message', 'review', 'system', 'promotion', 'reminder', 'other'],
        default: 'other'
    },
    // Priority
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    // Related Item (optional)
    relatedItem: {
        itemType: {
            type: String,
            enum: ['property', 'inquiry', 'agent', 'agency', 'project', 'deal', 'review', 'report']
        },
        itemId: Schema.Types.ObjectId
    },
    // Action URL
    actionUrl: String,
    actionText: String,
    // Delivery Channels
    channels: {
        email: { type: Boolean, default: false },
        sms: { type: Boolean, default: false },
        push: { type: Boolean, default: false },
        inApp: { type: Boolean, default: true }
    },
    // Delivery Status
    deliveryStatus: {
        email: {
            sent: { type: Boolean, default: false },
            sentAt: Date,
            delivered: { type: Boolean, default: false },
            deliveredAt: Date,
            opened: { type: Boolean, default: false },
            openedAt: Date
        },
        sms: {
            sent: { type: Boolean, default: false },
            sentAt: Date,
            delivered: { type: Boolean, default: false },
            deliveredAt: Date
        },
        push: {
            sent: { type: Boolean, default: false },
            sentAt: Date,
            delivered: { type: Boolean, default: false },
            deliveredAt: Date,
            clicked: { type: Boolean, default: false },
            clickedAt: Date
        }
    },
    // Read Status
    isRead: { type: Boolean, default: false },
    readAt: Date,
    // Archive
    isArchived: { type: Boolean, default: false },
    archivedAt: Date,
    // Expiry
    expiresAt: Date,
    // Metadata
    metadata: Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
notificationSchema.index({ 'recipient.recipientType': 1, 'recipient.recipientId': 1 });
notificationSchema.index({ 'recipient.recipientId': 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ notificationType: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
// Compound index for common queries
notificationSchema.index({
    'recipient.recipientId': 1,
    isRead: 1,
    isArchived: 1,
    createdAt: -1
});

// ============================================
// 23. PRICE INSIGHT SCHEMA
// ============================================
const priceInsightSchema = new Schema({
    location: {
        type: Schema.Types.ObjectId,
        ref: 'Location',
        required: true
    },
    propertyType: {
        type: Schema.Types.ObjectId,
        ref: 'PropertyType',
        required: true
    },
    transactionType: {
        type: String,
        enum: ['buy', 'rent'],
        required: true
    },
    // Time Period
    period: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
        default: 'monthly'
    },
    // Price Data
    priceData: [{
        date: { type: Date, required: true },
        averagePrice: Number,
        medianPrice: Number,
        minPrice: Number,
        maxPrice: Number,
        totalTransactions: Number,
        averagePricePerSqm: Number
    }],
    // Current Market Statistics
    currentStats: {
        averagePrice: Number,
        medianPrice: Number,
        pricePerSqm: Number,
        monthlyChange: Number, // Percentage
        quarterlyChange: Number, // Percentage
        yearlyChange: Number, // Percentage
        totalListings: Number,
        averageDaysOnMarket: Number
    },
    // Bedroom-specific data
    bedroomData: [{
        bedrooms: Number,
        averagePrice: Number,
        pricePerSqm: Number,
        totalListings: Number
    }],
    // Supply & Demand
    marketMetrics: {
        supply: Number, // Total available properties
        demand: Number, // Total inquiries/views
        occupancyRate: Number, // Percentage
        vacancyRate: Number, // Percentage
        absorptionRate: Number // Months to sell/rent all inventory
    },
    // Forecast (optional)
    forecast: [{
        date: Date,
        predictedPrice: Number,
        confidence: Number // Percentage
    }],
    // Data Source
    dataSource: {
        type: String,
        enum: ['internal', 'government', 'api', 'manual'],
        default: 'internal'
    },
    lastUpdated: { type: Date, default: Date.now },
    nextUpdateDue: Date,
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
priceInsightSchema.index({ location: 1, propertyType: 1, transactionType: 1 });
priceInsightSchema.index({ lastUpdated: -1 });

// ============================================
// 24. BLOG POST SCHEMA
// ============================================
const blogPostSchema = new Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    excerpt: { type: String, maxlength: 500 },
    content: {
        type: String,
        required: true
    },
    featuredImage: String,
    galleryImages: [String],
    // Author
    author: {
        type: Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
    },
    // Categories & Tags
    category: {
        type: String,
        enum: ['market-trends', 'buying-guides', 'selling-tips', 'investment', 'legal', 'lifestyle', 'news', 'other'],
        default: 'other'
    },
    tags: [String],
    // Related Content
    relatedPosts: [{
        type: Schema.Types.ObjectId,
        ref: 'BlogPost'
    }],
    relatedProperties: [{
        type: Schema.Types.ObjectId,
        ref: 'Property'
    }],
    relatedLocations: [{
        type: Schema.Types.ObjectId,
        ref: 'Location'
    }],
    // SEO
    metaTitle: String,
    metaDescription: String,
    metaKeywords: [String],
    ogImage: String,
    // Reading Time
    readingTime: { type: Number }, // In minutes
    // Engagement
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    // Featured
    isFeatured: { type: Boolean, default: false },
    featuredUntil: Date,
    // Status
    status: {
        type: String,
        enum: ['draft', 'published', 'scheduled', 'archived'],
        default: 'draft'
    },
    publishedAt: Date,
    scheduledFor: Date,
    // Comments Enabled
    allowComments: { type: Boolean, default: true },
    // Version Control
    version: { type: Number, default: 1 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
blogPostSchema.index({ slug: 1 }, { unique: true });
blogPostSchema.index({ status: 1, publishedAt: -1 });
blogPostSchema.index({ category: 1, status: 1 });
blogPostSchema.index({ author: 1 });
blogPostSchema.index({ views: -1 });
// Text index for search
blogPostSchema.index({
    title: 'text',
    content: 'text',
    excerpt: 'text',
    tags: 'text'
});

// ============================================
// 25. DEAL CLOSURE SCHEMA (NEW)
// ============================================
const dealClosureSchema = new Schema({
    // Property & Inquiry
    property: {
        type: Schema.Types.ObjectId,
        ref: 'Property',
        required: true
    },
    inquiry: {
        type: Schema.Types.ObjectId,
        ref: 'Inquiry',
        required: true
    },
    // Parties Involved
    agent: {
        type: Schema.Types.ObjectId,
        ref: 'Agent',
        required: true
    },
    agency: {
        type: Schema.Types.ObjectId,
        ref: 'Agency',
        required: true
    },
    customer: {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        name: { type: String, required: true },
        email: { type: String, required: true },
        phoneNumber: { type: String, required: true }
    },
    // Deal Details
    dealType: {
        type: String,
        enum: ['sale', 'rent'],
        required: true
    },
    dealAmount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: { type: String, default: 'AED' },
    // Commission
    commission: {
        amount: Number,
        percentage: Number,
        agentShare: Number,
        agencyShare: Number
    },
    // Contract Details
    contractDetails: {
        contractNumber: String,
        contractDate: Date,
        contractDocument: String, // URL
        startDate: Date,
        endDate: Date,
        renewalDate: Date
    },
    // Payment Details
    paymentDetails: {
        paymentMethod: String,
        paymentStatus: {
            type: String,
            enum: ['pending', 'partial', 'completed'],
            default: 'pending'
        },
        totalAmount: Number,
        paidAmount: { type: Number, default: 0 },
        pendingAmount: Number,
        paymentSchedule: [{
            dueDate: Date,
            amount: Number,
            isPaid: { type: Boolean, default: false },
            paidDate: Date,
            receiptNumber: String
        }]
    },
    // Closure Details
    closedDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    closedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Agent',
        required: true
    },
    // Verification
    isVerified: { type: Boolean, default: false },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    verifiedAt: Date,
    // Notes & Documents
    notes: String,
    documents: [{
        title: String,
        url: String,
        type: String,
        uploadedAt: { type: Date, default: Date.now }
    }],
    // Status
    status: {
        type: String,
        enum: ['pending-approval', 'approved', 'completed', 'cancelled', 'disputed'],
        default: 'pending-approval'
    },
    // Metadata
    metadata: Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
dealClosureSchema.index({ agent: 1, closedDate: -1 });
dealClosureSchema.index({ agency: 1, closedDate: -1 });
dealClosureSchema.index({ property: 1 });
dealClosureSchema.index({ dealType: 1, status: 1 });
dealClosureSchema.index({ closedDate: -1 });

// ============================================
// 26. ACTIVITY LOG SCHEMA (NEW - For Audit Trail)
// ============================================
const activityLogSchema = new Schema({
    // Actor (Who performed the action)
    actor: {
        actorType: {
            type: String,
            enum: ['user', 'agent', 'agency', 'developer', 'admin', 'system'],
            required: true
        },
        actorId: {
            type: Schema.Types.ObjectId,
            required: true,
            refPath: 'actor.actorType'
        }
    },
    // Action
    action: {
        type: String,
        required: true,
        enum: [
            'create', 'read', 'update', 'delete',
            'login', 'logout', 'register',
            'approve', 'reject', 'verify',
            'deactivate', 'activate',
            'upload', 'download',
            'send', 'receive',
            'other'
        ]
    },
    // Resource (What was acted upon)
    resource: {
        resourceType: {
            type: String,
            enum: ['property', 'agent', 'agency', 'user', 'inquiry', 'project', 'review', 'report', 'deal', 'setting', 'other'],
            required: true
        },
        resourceId: Schema.Types.ObjectId
    },
    // Description
    description: { type: String, required: true },
    // Changes (for update actions)
    changes: {
        before: Schema.Types.Mixed,
        after: Schema.Types.Mixed
    },
    // Request Details
    requestDetails: {
        ipAddress: String,
        userAgent: String,
        device: String,
        browser: String,
        os: String,
        location: String
    },
    // Status
    status: {
        type: String,
        enum: ['success', 'failed', 'pending'],
        default: 'success'
    },
    // Error (if failed)
    error: {
        message: String,
        code: String,
        stack: String
    },
    // Metadata
    metadata: Schema.Types.Mixed,
    timestamp: { type: Date, default: Date.now, required: true }
}, { timestamps: false }); // We use 'timestamp' field instead
// Indexes
activityLogSchema.index({ 'actor.actorType': 1, 'actor.actorId': 1, timestamp: -1 });
activityLogSchema.index({ 'resource.resourceType': 1, 'resource.resourceId': 1 });
activityLogSchema.index({ action: 1, timestamp: -1 });
activityLogSchema.index({ timestamp: -1 });
// TTL Index - Auto-delete logs older than 1 year
activityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 });

// ============================================
// 27. EMAIL TEMPLATE SCHEMA (NEW)
// ============================================
const emailTemplateSchema = new Schema({
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
    subject: {
        type: String,
        required: true
    },
    // Email Content
    htmlContent: { type: String, required: true },
    textContent: String,
    // Template Variables
    variables: [{
        key: String,
        description: String,
        defaultValue: String,
        isRequired: Boolean
    }],
    // Category
    category: {
        type: String,
        enum: [
            'welcome', 'verification', 'password-reset',
            'inquiry-notification', 'property-alert',
            'deal-closure', 'subscription', 'newsletter',
            'report', 'system', 'other'
        ],
        default: 'other'
    },
    // Trigger
    trigger: {
        type: String,
        enum: ['manual', 'automatic', 'scheduled'],
        default: 'automatic'
    },
    // Attachments
    defaultAttachments: [{
        name: String,
        url: String
    }],
    // Status
    isActive: { type: Boolean, default: true },
    // Usage Statistics
    sentCount: { type: Number, default: 0 },
    lastSentAt: Date,
    // Version
    version: { type: Number, default: 1 },
    // Metadata
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    lastModifiedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
emailTemplateSchema.index({ slug: 1 }, { unique: true });
emailTemplateSchema.index({ category: 1, isActive: 1 });

// ============================================
// 28. MORTGAGE CALCULATION SCHEMA (NEW)
// ============================================
const mortgageCalculationSchema = new Schema({
    // User
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    // Property (optional)
    property: { type: Schema.Types.ObjectId, ref: 'Property' },
    // Input Parameters
    parameters: {
        propertyPrice: { type: Number, required: true },
        downPaymentPercentage: { type: Number, required: true },
        downPaymentAmount: Number,
        loanAmount: Number,
        interestRate: { type: Number, required: true }, // Annual percentage
        loanTerm: { type: Number, required: true }, // In years
        propertyType: String,
        location: String
    },
    // Calculation Results
    results: {
        monthlyPayment: Number,
        totalPayment: Number,
        totalInterest: Number,
        amortizationSchedule: [{
            month: Number,
            payment: Number,
            principal: Number,
            interest: Number,
            balance: Number
        }]
    },
    // Additional Costs
    additionalCosts: {
        registrationFees: Number,
        valuationFees: Number,
        processingFees: Number,
        insurance: Number,
        maintenanceFees: Number,
        totalAdditionalCosts: Number
    },
    // Session
    sessionId: String,
    ipAddress: String,
    calculatedAt: { type: Date, default: Date.now }
}, { timestamps: false });
// Indexes
mortgageCalculationSchema.index({ user: 1, calculatedAt: -1 });
mortgageCalculationSchema.index({ property: 1 });
mortgageCalculationSchema.index({ calculatedAt: -1 });
// TTL Index - Auto-delete calculations older than 6 months
mortgageCalculationSchema.index({ calculatedAt: 1 }, { expireAfterSeconds: 15552000 });

// ============================================
// 29. SEARCH ANALYTICS SCHEMA (NEW)
// ============================================
const searchAnalyticsSchema = new Schema({
    // User (if logged in)
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    // Search Query
    searchQuery: String,
    searchType: {
        type: String,
        enum: ['buy', 'rent', 'commercial-buy', 'commercial-rent', 'new-projects', 'agents', 'agencies', 'developers'],
        required: true
    },
    // Filters Applied
    filters: {
        location: String,
        propertyType: [String],
        priceRange: {
            min: Number,
            max: Number
        },
        bedrooms: Number,
        bathrooms: Number,
        area: {
            min: Number,
            max: Number
        },
        amenities: [String],
        furnished: String,
        completionStatus: String,
        other: Schema.Types.Mixed
    },
    // Results
    resultsCount: { type: Number, default: 0 },
    resultsShown: { type: Number, default: 0 },
    // User Interaction
    interaction: {
        clickedResults: [{
            resultType: String,
            resultId: Schema.Types.ObjectId,
            position: Number, // Position in search results
            clickedAt: Date
        }],
        timeSpent: Number, // Seconds
        refinedSearch: Boolean,
        convertedToInquiry: Boolean
    },
    // Session Info
    sessionId: String,
    ipAddress: String,
    userAgent: String,
    device: String,
    // Location
    userLocation: {
        city: String,
        country: String,
        coordinates: {
            lat: Number,
            lng: Number
        }
    },
    // Source
    source: {
        type: String,
        enum: ['web', 'mobile-app', 'api'],
        default: 'web'
    },
    referrer: String,
    searchedAt: { type: Date, default: Date.now, required: true }
}, { timestamps: false });
// Indexes
searchAnalyticsSchema.index({ user: 1, searchedAt: -1 });
searchAnalyticsSchema.index({ searchType: 1, searchedAt: -1 });
searchAnalyticsSchema.index({ searchedAt: -1 });
searchAnalyticsSchema.index({ 'filters.location': 1, searchedAt: -1 });
// TTL Index - Auto-delete analytics older than 2 years
searchAnalyticsSchema.index({ searchedAt: 1 }, { expireAfterSeconds: 63072000 });
// Text index for search query analysis
searchAnalyticsSchema.index({ searchQuery: 'text' });

// ============================================
// MODEL EXPORTS
// ============================================
module.exports = {
    // Core User Models
    User: mongoose.model('User', userSchema),
    Agent: mongoose.model('Agent', agentSchema),
    Agency: mongoose.model('Agency', agencySchema),
    Developer: mongoose.model('Developer', developerSchema),
    Partner: mongoose.model('Partner', partnerSchema),
    // Property Models
    Property: mongoose.model('Property', propertySchema),
    NewProject: mongoose.model('NewProject', newProjectSchema),
    PropertyType: mongoose.model('PropertyType', propertyTypeSchema),
    Amenity: mongoose.model('Amenity', amenitySchema),
    // Transaction Models
    Inquiry: mongoose.model('Inquiry', inquirySchema),
    PropertyAllocation: mongoose.model('PropertyAllocation', propertyAllocationSchema),
    DealClosure: mongoose.model('DealClosure', dealClosureSchema),
    // Review & Report Models
    RatingReview: mongoose.model('RatingReview', ratingReviewSchema),
    Report: mongoose.model('Report', reportSchema),
    // Subscription & Payment
    SubscriptionPlan: mongoose.model('SubscriptionPlan', subscriptionPlanSchema),
    // Location & Insights
    Location: mongoose.model('Location', locationSchema),
    PriceInsight: mongoose.model('PriceInsight', priceInsightSchema),
    Country: mongoose.model('Country', countrySchema),
    // Content Management
    Banner: mongoose.model('Banner', bannerSchema),
    Testimonial: mongoose.model('Testimonial', testimonialSchema),
    CmsPage: mongoose.model('CmsPage', cmsPageSchema),
    BlogPost: mongoose.model('BlogPost', blogPostSchema),
    // Admin & System
    Admin: mongoose.model('Admin', adminSchema),
    Role: mongoose.model('Role', roleSchema),
    SiteSettings: mongoose.model('SiteSettings', siteSettingsSchema),
    // Communication
    Notification: mongoose.model('Notification', notificationSchema),
    EmailTemplate: mongoose.model('EmailTemplate', emailTemplateSchema),
    // Analytics & Tracking
    ActivityLog: mongoose.model('ActivityLog', activityLogSchema),
    SearchAnalytics: mongoose.model('SearchAnalytics', searchAnalyticsSchema),
    MortgageCalculation: mongoose.model('MortgageCalculation', mortgageCalculationSchema)
};