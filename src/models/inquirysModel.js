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
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        name: { type: String, required: true },
        email: { type: String, required: true },
        phoneNumber: { type: String, required: true }
    },
    // Property Information (for property inquiries)
    property: {
        type: Schema.Types.ObjectId,
        ref: 'Property',
        required: function() { return this.inquiryCategory === 'property'; }
    },
    // Project Information (for project inquiries)
    project: {
        type: Schema.Types.ObjectId,
        ref: 'Newprojects',
        required: function() { return this.inquiryCategory === 'project'; }
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
        ref: 'Agent',
        required: true
    },
    agency: {
        type: Schema.Types.ObjectId,
        ref: 'Agency',
        required: true
    },
    // Developer (optional reference for project inquiries)
    developer: {
        type: Schema.Types.ObjectId,
        ref: 'Developers',
        required: false
    },
    // Inquiry Details
    inquiryType: {
        type: String,
        enum: ['call', 'email', 'whatsapp'],
        required: true,
        validate: {
            validator: function(value) {
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
            enum: ['Agent', 'Developers'],
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
            enum: ['Agent', 'Developers'],
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
            enum: ['Agent', 'Developers'],
            required: false
        }
    }],
    // Deal Closure (if applicable)
    dealClosed: {
        isClosed: { type: Boolean, default: false },
        dealType: { type: String, enum: ['sale', 'rent'] },
        dealAmount: Number,
        commission: Number,
        closedDate: Date,
        closedBy: { 
            type: Schema.Types.ObjectId, 
            refPath: 'dealClosed.closedByModel' 
        },
        closedByModel: {
            type: String,
            enum: ['Agent', 'Developers'],
            required: false
        },
        notes: String
    },
    // Source Tracking
    source: {
        type: String,
        enum: ['property-listing', 'project-listing', 'agent-profile', 'agency-profile', 'developer-profile', 'search-results', 'direct'],
        default: function() {
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

const Inquirys = model('Inquirys', inquirysSchema);
module.exports = Inquirys;