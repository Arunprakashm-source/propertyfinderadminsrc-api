const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const newProjectsSchema = new Schema({

    // ─── Core Info ────────────────────────────────────────
    projectName: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        trim: true,
    },
    description: {
        type: String,
        maxlength: 5000
    },
    aboutProject: {
        type: String,
        maxlength: 5000
    },

    // ─── Developer ────────────────────────────────────────
    developer: {
        type: Schema.Types.ObjectId,
        ref: 'Developers',
        required: true
    },

    // ─── Project Classification ───────────────────────────
    projectType: {
        type: String,
        enum: ['off-plan', 'ready'],
        required: true
    },
    completionStatus: {
        type: String,
        enum: ['off-plan', 'under-construction', 'ready'],
        default: 'off-plan'
    },
    constructionProgress: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },

    // ─── Pricing (cached — auto-computed from ProjectLayout) ──
    launchPrice: {
        startingFrom: Number,
        currency: { type: String, default: 'AED' }
    },
    governmentFees: {
        type: Number,
        default: 0
    }, // percentage

    // ─── Payment Plans ────────────────────────────────────
    paymentPlans: [{
        planName: String,  // "Option 1", "Option 2"
        downPayment: {
            percentage: Number,
            amount: Number
        },
        duringConstruction: {
            percentage: Number,
            amount: Number,
            installments: [{
                percentage: Number,
                date: Date,
                amount: Number
            }]
        },
        onHandover: {
            percentage: Number,
            amount: Number
        }
    }],
    hasPostHandoverPayment: {
        type: Boolean,
        default: false
    },
    postHandoverDetails: {
        duration: String,    // e.g. "3 years"
        percentage: Number
    },

    // ─── Timeline / Progress ──────────────────────────────
    progressStatus: {
        type: String,
        enum: ['project-announced', 'booking-open', 'construction-started', 'finished'],
        default: null
    },
    projectAnnouncement: Date,
    bookingOpen: Date,
    constructionStarted: Date,
    launchDate: Date,
    deliveryDate: Date,
    expectedCompletionDate: Date,

    // ─── Location ─────────────────────────────────────────
    location: {
        address: String,
        city: String,
        zone: String,
        googlePlaceId: String,
        coordinates: {
            type: { type: String, enum: ['Point'] },  // no default — only set when valid [lng, lat] provided (avoids 2dsphere "Can't extract geo keys")
            coordinates: [Number]  // [longitude, latitude]
        }
    },

    // ─── Media ────────────────────────────────────────────
    images: [{
        url: String,
        isPrimary: { type: Boolean, default: false },
        order: { type: Number, default: 0 },
        caption: String,
        uploadedAt: { type: Date, default: Date.now }
    }],
    masterPlan: [String],      // masterplan image URLs
    brochure: String,          // PDF URL only
    virtualTour360: String,
    videoTour: String,

    // ─── Amenities ────────────────────────────────────────
    amenities: [{
        type: Schema.Types.ObjectId,
        ref: 'Amenities'
    }],

    // ─── DLD Registration ─────────────────────────────────
    isDldRegistered: {
        type: Boolean,
        default: false
    },
    dldRegistrationNumber: String,
    registrationDetails: {
        permitNumber: String,
        permitUrl: String,
        issuedDate: Date,
        expiryDate: Date
    },

    // ─── Unit Counts (cached — auto-updated from ProjectUnit) ─
    totalUnits: { type: Number, default: 0 },
    availableUnits: { type: Number, default: 0 },
    soldUnits: { type: Number, default: 0 },
    reservedUnits: { type: Number, default: 0 },

    // ─── Cached Filters (auto-computed from ProjectBuilding/Layout) ─
    // These are updated automatically when buildings/layouts are added
    propertyTypes: [{
        type: Schema.Types.ObjectId,
        ref: 'PropertyType'
    }],
    bedroomOptions: [Number],  // e.g. [1, 2, 3, 4]

    // ─── Authorized Agencies ──────────────────────────────
    // Populated when developer assigns agencies (triggers publish)
    authorizedAgencies: [{
        type: Schema.Types.ObjectId,
        ref: 'Agencies'
    }],

    // ─── FAQs ─────────────────────────────────────────────
    faqs: [{
        question: { type: String, required: true, trim: true },
        answer: { type: String, required: true, trim: true },
        order: { type: Number, default: 0 },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now }
    }],

    // ─── Publish Status ───────────────────────────────────
    publishStatus: {
        type: String,
        enum: ['draft', 'unpublished', 'published', 'soldout'],
        default: 'draft'
    },
    publishedAt: Date,

    // ─── Verification (by Admin) ──────────────────────────
    isVerified: { type: Boolean, default: false },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    verifiedAt: Date,

    // ─── Visibility ───────────────────────────────────────
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    featuredUntil: Date,

    // ─── Engagement Counters ──────────────────────────────
    views: { type: Number, default: 0 },
    inquiries: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },

    // ─── SEO ──────────────────────────────────────────────
    metaTitle: String,
    metaDescription: String,
    metaKeywords: [String],

    // ─── Soft Delete / Audit ──────────────────────────────
    lastModifiedAt: Date,
    lastModifiedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Developers'
    }

}, { timestamps: true });

// ─── Indexes ──────────────────────────────────────────────
newProjectsSchema.index({ 'location.coordinates': '2dsphere' });
newProjectsSchema.index({ developer: 1, isActive: 1 });
newProjectsSchema.index({ projectType: 1, completionStatus: 1 });
newProjectsSchema.index({ publishStatus: 1, isActive: 1 });
newProjectsSchema.index({ deliveryDate: 1 });
newProjectsSchema.index({ 'launchPrice.startingFrom': 1 });
newProjectsSchema.index({ isFeatured: 1, publishStatus: 1 });
newProjectsSchema.index({ slug: 1 }, { unique: true, sparse: true });
newProjectsSchema.index({ publishedAt: -1 });
newProjectsSchema.index({ developer: 1, publishStatus: 1 });
newProjectsSchema.index({
    projectName: 'text',
    description: 'text',
    'location.city': 'text',
    'location.zone': 'text'
});

const Newprojects = model('Newprojects', newProjectsSchema);
module.exports = Newprojects;