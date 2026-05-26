const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const newProjectsSchema = new Schema({
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
        ref: 'Developers',
        required: true
    },
    // Project Type
    projectType: {
        type: String,
        enum: ['off-plan', 'ready'],
        default: 'off-plan'
    },
    // Listing Type
    listingType: {
        type: Schema.Types.ObjectId,
        ref: 'ListingType'
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
        type: { type: String }, // e.g., "10/40/50"
        description: String,
        breakdown: [{
            stage: String, // e.g., "Down Payment", "During Construction"
            percentage: Number,
            amount: Number,
            dueDate: String
        }]
    },
    hasPostHandoverPayment: { type: Boolean, default: false },
    postHandoverDetails: {
        duration: String, // e.g., "3 years"
        percentage: Number
    },
    // Timeline
    projectAnnouncement: Date, // Project announcement date
    bookingOpen: Date, // Booking open date
    constructionStarted: Date, // Construction start date
    launchDate: Date,
    deliveryDate: Date,
    expectedCompletionDate: Date,
    completionStatus: {
        type: String,
        enum: ['off-plan', 'ready'],
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
        ref: 'Amenities'
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
        ref: 'Agents'
    },
    contactAgency: {
        type: Schema.Types.ObjectId,
        ref: 'Agencies'
    },
    // Authorized Agencies (for developer projects)
    authorizedAgencies: [{
        type: Schema.Types.ObjectId,
        ref: 'Agencies'
    }],
    // Government Fees (percentage)
    governmentFees: Number,
    // About Project (additional description)
    aboutProject: String,
    // FAQs
    faqs: [{
        question: {
            type: String,
            required: true,
            trim: true
        },
        answer: {
            type: String,
            required: true,
            trim: true
        },
        order: {
            type: Number,
            default: 0
        },
        createdAt: {
            type: Date,
            default: Date.now
        },
        updatedAt: {
            type: Date,
            default: Date.now
        }
    }],
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
        user: { type: Schema.Types.ObjectId, ref: 'Users' },
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
newProjectsSchema.index({ 'location.coordinates': '2dsphere' });
newProjectsSchema.index({ developer: 1, isActive: 1 });
newProjectsSchema.index({ projectType: 1, completionStatus: 1 });
newProjectsSchema.index({ deliveryDate: 1 });
newProjectsSchema.index({ 'launchPrice.startingFrom': 1 });
newProjectsSchema.index({ isFeatured: 1, isActive: 1 });
newProjectsSchema.index({ slug: 1 }, { unique: true });
newProjectsSchema.index({ publishedAt: -1 });
// Text index for search
newProjectsSchema.index({
    projectName: 'text',
    description: 'text',
    'location.city': 'text'
});

const Newprojects = model('Newprojects', newProjectsSchema);
module.exports = Newprojects;