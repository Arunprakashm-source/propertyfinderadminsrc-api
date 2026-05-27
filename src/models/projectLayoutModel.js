const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const projectLayoutSchema = new Schema({

    project: {
        type: Schema.Types.ObjectId,
        ref: 'Newprojects',
        required: true
    },
    building: {
        type: Schema.Types.ObjectId,
        ref: 'ProjectBuilding',
        default: null
    },
    propertyType: {
        type: Schema.Types.ObjectId,
        ref: 'PropertyType',
        required: true
    },

    // e.g. "Type A - 1BHK"
    layoutName: {
        type: String,
        required: true,
        trim: true
    },
    bedrooms: {
        type: Number,
        required: true,
        min: 0
    },
    bathrooms: {
        type: Number,
        required: true,
        min: 0
    },
    maidBedroom: { type: Boolean, default: false },
    areaSqft: {
        type: Number,
        required: true,
        min: 0
    },
    areaSqm:{
        type: Number,
        required: true,
        min: 0
    },
    // Starting price for this layout
    startingPrice: {
        amount: Number,
        currency: { type: String, default: 'AED' }
    },
    // Floor plan images for this layout
    floorPlans: [String], // image URLs

    // Total units under this layout
    // Auto-computed from ProjectUnit count
    totalUnits: { type: Number, default: 0 },
    availableUnits: { type: Number, default: 0 },
    reservedUnits: { type: Number, default: 0 },
    soldUnits: { type: Number, default: 0 },

    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

projectLayoutSchema.index({ project: 1, building: 1 });
projectLayoutSchema.index({ project: 1, bedrooms: 1 });
projectLayoutSchema.index({ building: 1, isActive: 1 });

const ProjectLayout = model('ProjectLayout', projectLayoutSchema);
module.exports = ProjectLayout;