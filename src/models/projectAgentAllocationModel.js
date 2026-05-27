const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const projectAgentAllocationSchema = new Schema({

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
    agent: {
        type: Schema.Types.ObjectId,
        ref: 'Agents',
        required: true
    },
    allocatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Agencies',
        required: true
    },

    // Units allocated to this agent
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
        enum: ['active', 'reallocated', 'cancelled'],
        default: 'active'
    },

    // Reallocation audit
    reallocatedTo: {
        type: Schema.Types.ObjectId,
        ref: 'Agents',
        default: null
    },
    reallocatedAt: { type: Date, default: null },
    reallocatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Agencies',
        default: null
    },
    reallocatedReason: { type: String, default: null },

    allocatedAt: { type: Date, default: Date.now }

}, { timestamps: true });

projectAgentAllocationSchema.index({ project: 1, agent: 1 });
projectAgentAllocationSchema.index({ project: 1, agency: 1 });
projectAgentAllocationSchema.index({ agent: 1, status: 1 });
projectAgentAllocationSchema.index({ agency: 1, status: 1 });

const ProjectAgentAllocation = model('ProjectAgentAllocation', projectAgentAllocationSchema);
module.exports = ProjectAgentAllocation;
