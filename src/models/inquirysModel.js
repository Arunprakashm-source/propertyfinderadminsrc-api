const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const inquirysSchema = new Schema({
    // Inquiry Category - distinguishes between property and project inquiries
    inquiryCategory: {
        type: String,
        enum: ['property', 'project'],
        required: true,
        default: 'property'
    },
    // Customer Information
    customer: {
        userId: { type: Schema.Types.ObjectId, ref: 'Users' },
        name: { type: String, required: true },
        email: { type: String, required: true },
        phoneNumber: { type: String, required: true }
    },
    // Property Information (for property inquiries)
    property: {
        type: Schema.Types.ObjectId,
        ref: 'Properties',
        required: function () { return this.inquiryCategory === 'property'; }
    },
    // Project Information (for project inquiries)
    project: {
        type: Schema.Types.ObjectId,
        ref: 'Newprojects',
        required: function () { return this.inquiryCategory === 'project'; }
    },
    // Optional unit reference for project inquiries (when linked to a specific unit)
    unit: {
        type: Schema.Types.ObjectId,
        ref: 'ProjectUnit',
        required: false
    },
    // Layout reference for project inquiries (used for round-robin lead assignment)
    layout: {
        type: Schema.Types.ObjectId,
        ref: 'ProjectLayout',
        required: false
    },
    propertyTitle: String, // Denormalized for quick access (works for both property and project)
    projectTitle: String, // Denormalized for quick access (for projects)
    propertyType: String,
    listingType: {
        type: Schema.Types.ObjectId,
        ref: 'ListingType'
    },
    // Agent/Agency (required for all inquiries - agents manage all inquiries)
    agent: {
        type: Schema.Types.ObjectId,
        ref: 'Agents',
        required: true
    },
    agency: {
        type: Schema.Types.ObjectId,
        ref: 'Agencies',
        required: true
    },
    // Developer (optional reference for project inquiries)
    developer: {
        type: Schema.Types.ObjectId,
        ref: 'Developers',
        required: false
    },

    // Lead assignment
    assignedTo: { type: Schema.Types.ObjectId, ref: 'Agents' },
    assignedAt: { type: Date, default: Date.now },
    assignmentMethod: { type: String, enum: ['first-come-first-serve', 'round-robin'], default: 'round-robin' },
    assignedViaRoundRobin: { type: Boolean, default: false },


    // Inquiry Details
    inquiryType: {
        type: String,
        enum: ['call', 'email', 'whatsapp'],
        required: true,
        validate: {
            validator: function (value) {
                // Project inquiries can only be whatsapp
                if (this.inquiryCategory === 'project' && value !== 'whatsapp') {
                    return false;
                }
                return true;
            },
            message: 'Project inquiries can only be of type "whatsapp"'
        }
    },
    message: { type: String },
    // Status Management
    status: {
        type: String,
        enum: ['new', 'attended', 'closed'],
        default: 'new'
    },
    // Extended status for project leads
    projectLeadStatus: { type: String, enum: ['available', 'reserved', 'in-progress', 'follow-up', 'pre-close', 'closed'], default: 'available' },
    // When the current projectLeadStatus auto-expires
    statusExpiresAt: { type: Date, default: null },
    // Status Tracking
    statusHistory: [{
        status: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: {
            type: Schema.Types.ObjectId,
            refPath: 'statusHistory.changedByModel'
        },
        changedByModel: {
            type: String,
            enum: ['Agents', 'Developers'],
            required: false
        },
        notes: String
    }],
    // Response Time Tracking
    responseTime: {
        firstResponseAt: Date,
        responseMinutes: Number // Time taken to first respond
    },
    // Notes (Agent/Developer can add notes)
    notes: [{
        note: String,
        addedBy: {
            type: Schema.Types.ObjectId,
            refPath: 'notes.addedByModel'
        },
        addedByModel: {
            type: String,
            enum: ['Agents', 'Developers'],
            required: false
        },
        addedAt: { type: Date, default: Date.now },
        isPrivate: { type: Boolean, default: false }
    }],
    // Follow-up Reminders
    followUpReminders: [{
        reminderDate: Date,
        reminderNote: String,
        isCompleted: { type: Boolean, default: false },
        completedAt: Date,
        createdBy: {
            type: Schema.Types.ObjectId,
            refPath: 'followUpReminders.createdByModel'
        },
        createdByModel: {
            type: String,
            enum: ['Agents', 'Developers'],
            required: false
        }
    }],
    // Deal approval flow for project leads
    dealApproval: {
        isWaiting: { type: Boolean, default: false },
        dealAmount: Number,
        currency: { type: String, default: 'AED' },
        document: {
            url: String,
            filename: String,
            uploadedAt: Date
        },
        submittedAt: Date,
        approvedAt: Date,
        declinedAt: Date,
        declinedReason: String,
        notes: String
    },
    // Deal Closure (if applicable)
    dealClosed: {
        isClosed      : { type: Boolean, default: false },
        dealClosureRef: {
            type: Schema.Types.ObjectId,
            ref : 'DealClosure'
        },
        // Keep these 3 for quick list display
        // without populating DealClosure every time
        dealType  : { type: String, enum: ['sale', 'rent'] },
        dealAmount: Number,
        closedDate: Date
    },
    // Source Tracking
    source: {
        type: String,
        enum: ['property-listing', 'project-listing', 'agent-profile', 'agency-profile', 'developer-profile', 'search-results', 'direct'],
        default: function () {
            return this.inquiryCategory === 'project' ? 'project-listing' : 'property-listing';
        }
    },
    pageUrl: String,
    // Priority
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    // Timestamps
    inquiredAt: { type: Date, default: Date.now },
    attendedAt: Date,
    closedAt: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
inquirysSchema.index({ inquiryCategory: 1 });
inquirysSchema.index({ agent: 1, status: 1 });
inquirysSchema.index({ agency: 1, status: 1 });
inquirysSchema.index({ developer: 1, status: 1 });
inquirysSchema.index({ property: 1 });
inquirysSchema.index({ project: 1 });
inquirysSchema.index({ 'customer.userId': 1 });
inquirysSchema.index({ status: 1, inquiredAt: -1 });
inquirysSchema.index({ inquiredAt: -1 });
// Compound indexes for dashboard queries
inquirysSchema.index({ agent: 1, status: 1, inquiredAt: -1 });
inquirysSchema.index({ developer: 1, status: 1, inquiredAt: -1 });
inquirysSchema.index({ inquiryCategory: 1, status: 1, inquiredAt: -1 });
inquirysSchema.index({ agent: 1, inquiryCategory: 1, status: 1 });
inquirysSchema.index({ agency: 1, 'dealApproval.isWaiting': 1 });
inquirysSchema.index({ agency: 1, projectLeadStatus: 1 });
inquirysSchema.index({ statusExpiresAt: 1 });

const Inquirys = model('Inquirys', inquirysSchema);
module.exports = Inquirys;