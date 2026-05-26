const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const locationSchema = new Schema({
    // Basic Info
    name: {
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
    type: {
        type: String,
        enum: ['country', 'state', 'city', 'community', 'sub-community', 'landmark', 'other'],
        default: 'community'
    },
    parent: { type: Schema.Types.ObjectId, ref: 'Location' },
    // Hierarchy
    hierarchy: [{
        type: Schema.Types.ObjectId,
        ref: 'Location'
    }],
    // Coordinates
    coordinates: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number],
            index: '2dsphere'
        }
    },
    // Bounding box for searches
    boundingBox: {
        type: {
            type: String,
            enum: ['Polygon']
        },
        coordinates: [[[Number]]]
    },
    // Display
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    // SEO
    metaTitle: String,
    metaDescription: String,
    // Statistics
    stats: {
        totalProperties: { type: Number, default: 0 },
        totalAgents: { type: Number, default: 0 },
        totalAgencies: { type: Number, default: 0 },
        averagePrice: Number,
        averageRent: Number
    },
    // Images
    coverImage: String,
    gallery: [String],
    // Tags
    tags: [String],
    // Metadata
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes
locationSchema.index({ slug: 1 }, { unique: true });
locationSchema.index({ type: 1, isActive: 1 });
locationSchema.index({ parent: 1 });
locationSchema.index({ 'coordinates.coordinates': '2dsphere' });

const Location = model('Location', locationSchema);
module.exports = Location;

