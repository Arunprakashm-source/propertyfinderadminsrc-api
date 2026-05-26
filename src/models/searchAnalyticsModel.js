const mongoose = require('mongoose');
const { Schema, model } = mongoose;

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

const SearchAnalytics = model('SearchAnalytics', searchAnalyticsSchema);
module.exports = SearchAnalytics;

