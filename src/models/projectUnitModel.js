const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const projectUnitSchema = new Schema({

    project: {
        type: Schema.Types.ObjectId,
        ref: 'Newprojects',
        required: true
    },
    // Optional — only if project hasBuildings: true
    building: {
        type: Schema.Types.ObjectId,
        ref: 'ProjectBuilding',
        default: null
    },
    layout: {
        type: Schema.Types.ObjectId,
        ref: 'ProjectLayout',
        required: true
    },
    propertyType: {
        type: Schema.Types.ObjectId,
        ref: 'PropertyType',
        required: true
    },

    // Unique unit identifier
    unitId: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    unitNumber: {
        type: String,
        trim: true
    },
    floor: {
        type: Number,
        default: null
    },

    // ─── Global Status ────────────────────────────────
    status: {
        type: String,
        enum: [
            'available',
            'reserved',
            'in-progress',
            'follow-up',
            'pre-close',
            'closed'
        ],
        default: 'available'
    },
    statusUpdatedAt: Date,
    statusUpdatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Agents',
        default: null
    },
    statusUpdatedByAgency: {
        type: Schema.Types.ObjectId,
        ref: 'Agencies',
        default: null
    },
    statusExpiresAt: {
        type: Date,
        default: null
    },
    statusExpiryNotificationSent: {
        type: Boolean,
        default: false
    },

    // Private note — in-progress only
    statusNote: {
        type: String,
        default: null
    },
    statusNoteVisibleTo: {
        agent: {
            type: Schema.Types.ObjectId,
            ref: 'Agents',
            default: null
        },
        agency: {
            type: Schema.Types.ObjectId,
            ref: 'Agencies',
            default: null
        }
    },

    // ─── Status History ───────────────────────────────
    statusHistory: [{
        status: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: Schema.Types.ObjectId, ref: 'Agents' },
        agency: { type: Schema.Types.ObjectId, ref: 'Agencies' },
        note: String,
        expiresAt: Date
    }],

    // ─── All Agents Assigned to This Unit ─────────────
    // Across ALL agencies
    assignedAgents: [{
        agent: { type: Schema.Types.ObjectId, ref: 'Agents' },
        agency: { type: Schema.Types.ObjectId, ref: 'Agencies' },
        addedAt: { type: Date, default: Date.now }
    }],

    // Round Robin pointer for unit-specific inquiries
    unitRoundRobinPointer: {
        type: Number,
        default: 0
    },

    // ─── Sale Info (PreClose → Closed) ────────────────
    saleInfo: {
        closedAmount: Number,
        closedDate: Date,
        closedBy: {
            type: Schema.Types.ObjectId,
            ref: 'Agents',
            default: null
        },
        closedByAgency: {
            type: Schema.Types.ObjectId,
            ref: 'Agencies',
            default: null
        },
        customerName: String,
        customerEmail: String,
        customerPhone: String,
        documents: [String]
    },

    // ─── Agency Approval ──────────────────────────────
    agencyApproval: {
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending'
        },
        reviewedBy: {
            type: Schema.Types.ObjectId,
            ref: 'Agencies',
            default: null
        },
        reviewedAt: Date,
        rejectedReason: String
    },

    isActive: { type: Boolean, default: true }

}, { timestamps: true });

projectUnitSchema.index({ project: 1, status: 1 });
projectUnitSchema.index({ project: 1, building: 1, layout: 1 });
projectUnitSchema.index({ layout: 1, status: 1 });
projectUnitSchema.index({ unitId: 1 }, { unique: true });
projectUnitSchema.index({ status: 1, statusExpiresAt: 1 });
projectUnitSchema.index({ 'agencyApproval.status': 1 });
projectUnitSchema.index({ 'assignedAgents.agent': 1 });
projectUnitSchema.index({ 'assignedAgents.agency': 1 });

const ProjectUnit = model('ProjectUnit', projectUnitSchema);
module.exports = ProjectUnit;

