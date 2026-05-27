const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const projectAgencyAllocationSchema = new Schema({

    project: {
        type: Schema.Types.ObjectId,
        ref: 'Newprojects',
        required: true
    },
    agency: {
        type: Schema.Types.ObjectId,
        ref: 'Agencies',
        required: true
    },
    allocatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Developers',
        required: true
    },

    // Units allocated to this agency
    units: [{
        type: Schema.Types.ObjectId,
        ref: 'ProjectUnit'
    }],

    // Summary per layout for quick display
    layoutSummary: [{
        layout: {
            type: Schema.Types.ObjectId,
            ref: 'ProjectLayout'
        },
        // Optional — null if project has no buildings
        building: {
            type: Schema.Types.ObjectId,
            ref: 'ProjectBuilding',
            default: null
        },
        propertyType: {
            type: Schema.Types.ObjectId,
            ref: 'PropertyType'
        },
        unitsCount: Number
    }],

    status: {
        type: String,
        enum: ['active', 'cancelled'],
        default: 'active'
    },
    cancelledAt: { type: Date, default: null },
    cancelledReason: { type: String, default: null },
    allocatedAt: { type: Date, default: Date.now }

}, { timestamps: true });

projectAgencyAllocationSchema.index({ project: 1, agency: 1 });
projectAgencyAllocationSchema.index({ agency: 1, status: 1 });
projectAgencyAllocationSchema.index({ project: 1, status: 1 });

const ProjectAgencyAllocation = model('ProjectAgencyAllocation', projectAgencyAllocationSchema);
module.exports = ProjectAgencyAllocation;