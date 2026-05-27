const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const leadAssignmentSchema = new Schema({

    project: {
        type: Schema.Types.ObjectId,
        ref: 'Newprojects',
        required: true
    },
    method: {
        type: String,
        enum: ['first-come-first-serve', 'round-robin'],
        default: 'round-robin'
    },
    // Changed from project level to layout level
    layout: {
        type: Schema.Types.ObjectId,
        ref: 'ProjectLayout',
        required: true
    },

    // Level 1: Agency Queue (rotate between agencies)
    agencyQueue: [{
        agency: {
            type: Schema.Types.ObjectId,
            ref: 'Agencies'
        },

        // Level 2: Agent Queue within this agency
        agentQueue: [{
            agent: {
                type: Schema.Types.ObjectId,
                ref: 'Agents'
            },
            addedAt: { type: Date, default: Date.now }
        }],

        // Tracks which agent is next within this agency
        agentPointer: { type: Number, default: 0 },

        addedAt: { type: Date, default: Date.now }
    }],

    // Tracks which agency is next
    agencyPointer: { type: Number, default: 0 },

    // Total inquiries received (for tracking)
    totalInquiries: {
        type: Number,
        default: 0
    }

}, { timestamps: true });

// One config per (project, layout)
leadAssignmentSchema.index({ project: 1, layout: 1 }, { unique: true });

const LeadAssignment = model('LeadAssignment', leadAssignmentSchema);
module.exports = LeadAssignment;