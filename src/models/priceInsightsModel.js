const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const priceInsightSchema = new Schema({
    // Location
    location: {
        type: Schema.Types.ObjectId,
        ref: 'Location',
        required: true
    },
    locationName: String,
    // Property Type
    propertyType: {
        type: Schema.Types.ObjectId,
        ref: 'PropertyType',
        required: true
    },
    // Transaction Type
    transactionType: {
        type: String,
        enum: ['buy', 'rent', 'commercial-buy', 'commercial-rent'],
        required: true
    },
    // Timeframe
    period: {
        type: String,
        enum: ['monthly', 'quarterly', 'yearly'],
        default: 'monthly'
    },
    periodLabel: String, // e.g., "Jan 2024"
    periodStart: Date,
    periodEnd: Date,
    // Price Metrics
    averagePrice: Number,
    medianPrice: Number,
    minPrice: Number,
    maxPrice: Number,
    averagePricePerSqm: Number,
    // Volume Metrics
    totalTransactions: Number,
    totalListings: Number,
    soldListings: Number,
    rentedListings: Number,
    // Trend Data
    previousPeriod: {
        averagePrice: Number,
        medianPrice: Number,
        priceChange: Number, // Percentage
        volumeChange: Number, // Percentage
        listingsChange: Number // Percentage
    },
    // Growth Rates
    growthRates: {
        monthly: Number,
        quarterly: Number,
        yearly: Number
    },
    // Price Distribution
    priceDistribution: [{
        range: String, // e.g., "0-500k", "500k-1M"
        count: Number,
        percentage: Number
    }],
    // Bedroom-specific data
    bedroomBreakdown: [{
        bedrooms: Number,
        averagePrice: Number,
        medianPrice: Number,
        pricePerSqm: Number,
        totalListings: Number
    }],
    // Supply/Demand Indicators
    marketMetrics: {
        demand: Number, // views/inquiries
        supply: Number, // available listings
        absorptionRate: Number, // months of inventory
        daysOnMarket: Number
    },
    // Forecast
    forecast: [{
        period: String,
        predictedPrice: Number,
        confidence: Number // percentage
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

const PriceInsight = model('PriceInsight', priceInsightSchema);
module.exports = PriceInsight;

