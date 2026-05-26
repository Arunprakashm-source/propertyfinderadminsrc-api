const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const propertiesSchema = new Schema({
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
        type: Schema.Types.ObjectId,
        ref: 'ListingType',
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
        ref: 'Agents',
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
        ref: 'Amenities'
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
        changedBy: { type: Schema.Types.ObjectId, ref: 'Agents' },
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
        // coordinates: {
        //     type: { type: String, enum: ['Point'], default: 'Point' },
        //     coordinates: [Number] // [longitude, latitude]
        // },
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
    isActive: {
        type: Boolean,
        default: true
    },
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
        default: 'unfurnished',
        required: false
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
        user: { type: Schema.Types.ObjectId, ref: 'Users' },
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
        dealClosedBy: { type: Schema.Types.ObjectId, ref: 'Agents' },
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
    lastModifiedBy: { type: Schema.Types.ObjectId, ref: 'Agents' },
    deactivatedAt: Date,
    deactivatedBy: { type: Schema.Types.ObjectId, ref: 'Agents' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
propertiesSchema.index({ 'location.coordinates': '2dsphere' });
propertiesSchema.index({ listingType: 1, status: 1 });
propertiesSchema.index({ agent: 1, status: 1 });
propertiesSchema.index({ agency: 1, status: 1 });
propertiesSchema.index({ developer: 1 });
propertiesSchema.index({ propertyType: 1, listingType: 1 });
propertiesSchema.index({ price: 1, listingType: 1 });
propertiesSchema.index({ bedrooms: 1, bathrooms: 1 });
propertiesSchema.index({ isFeatured: 1, status: 1 });
propertiesSchema.index({ slug: 1 }, { unique: true });
propertiesSchema.index({ publishedAt: -1 });
propertiesSchema.index({ views: -1 });
// Text index for search
propertiesSchema.index({
    title: 'text',
    description: 'text',
    'location.fullAddress': 'text',
    'location.city': 'text'
});
// Compound indexes for common queries
propertiesSchema.index({ listingType: 1, 'location.city': 1, price: 1 });
propertiesSchema.index({ status: 1, isFeatured: -1, publishedAt: -1 });
propertiesSchema.index({ isActive: 1, status: 1 });

const Properties = model('Properties', propertiesSchema);
module.exports = Properties;