const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const usersSchema = new Schema({
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
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    phoneNumber: {
        type: String,
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
    password: { type: String }, // Hashed password (optional for social login)
    profilePicture: { type: String, default: "profileless.png" }, // Stored uploads path (e.g., profile-pictures/name.webp)
    // Country
    country: {
        type: Schema.Types.ObjectId,
        ref: 'Countries'
    },
    // Authentication
    authProvider: {
        type: String,
        enum: ['email', 'google', 'apple', 'phone'],
        default: 'email'
    },
    emailVerificationExpires: Date,
    phoneVerificationExpires: Date,
    access_token: String,
    refresh_token: String,
    token_expires_at: Date,
    refresh_token_expires_at: Date,
    passwordResetOTPHash: String,
    passwordResetOTPExpires: Date,
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    // Location
    location: {
        city: String,
        state: String,
        country: String,
        coordinates: {
            type: {
                type: String,
                enum: ['Point']
            },
            coordinates: {
                type: [Number]
            }
        }
    },

    // Saved Properties (Liked/Favorited)
    savedProperties: [{
        property: { type: Schema.Types.ObjectId, ref: 'Properties' },
        savedAt: { type: Date, default: Date.now }
    }],

    // Search Alerts
    searchAlerts: [{
        alertName: { type: String, trim: true },
        alertType: {
            type: Schema.Types.ObjectId,
            ref: 'ListingType'
        },
        searchCriteria: {
            location: String,
            propertyType: { type: Schema.Types.ObjectId, ref: 'PropertyType' },
            bedrooms: Number,
            bathrooms: Number,
            priceRange: {
                min: Number,
                max: Number
            },
            amenities: [{ type: Schema.Types.ObjectId, ref: 'Amenities' }],
            furnished: { type: String, enum: ['fully', 'partially', 'unfurnished', 'any'] },
            completionStatus: { type: String, enum: ['off-plan', 'ready', 'all'] },
            petFriendly: Boolean,
            waterfront: Boolean
        },
        frequency: {
            type: String,
            // enum: ['hourly', 'daily', 'every-3-days', 'weekly', 'off'],
            default: 'off'
        },
        isActive: { type: Boolean, default: true },
        lastSentAt: Date,
        createdAt: { type: Date, default: Date.now }
    }],

    // Contacted Items (Properties/Projects)
    contactedProperties: [{
        property: { type: Schema.Types.ObjectId, ref: 'Properties' },
        project: { type: Schema.Types.ObjectId, ref: 'Newprojects' },
        agent: { type: Schema.Types.ObjectId, ref: 'Agents' },
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

    // Firebase Cloud Messaging — one entry per device/session (web / android / ios)
    fcmTokens: [{
        token: { type: String, required: true, trim: true },
        platform: {
            type: String,
            enum: ['web', 'android', 'ios'],
            required: true
        },
        deviceId: { type: String, trim: true ,default: null},
        deviceModel: { type: String, trim: true ,default: null},
        deviceVersion: { type: String, trim: true ,default: null},
        isActive: { type: Boolean, default: true },
        lastSeenAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now }
    }],

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
usersSchema.index({ email: 1 });
usersSchema.index({ 'location.coordinates': '2dsphere' });
usersSchema.index({ isActive: 1, isBanned: 1 });
usersSchema.index({ createdAt: -1 });
usersSchema.index({ 'fcmTokens.token': 1 });

// Virtual for full name
usersSchema.virtual('fullName').get(function () {
    return `${this.firstName} ${this.lastName}`;
});

// Method to check if account is locked
usersSchema.methods.isLocked = function () {
    return !!(this.lockUntil && this.lockUntil > Date.now());
};

const Users = model('Users', usersSchema);
module.exports = Users;