const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const reportsSchema = new Schema({
    // Reporter
    reportedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Reported Item
    reportType: {
        type: String,
        enum: ['property', 'agent', 'agency', 'user', 'review', 'project'],
        required: true
    },
    reportedItem: {
        type: Schema.Types.ObjectId,
        required: true,
        refPath: 'reportType'
    },
    // Report Details
    userType: {
        type: String,
        required: true
    }, // From dropdown in frontend (e.g., "buyer", "renter", "agent")
    reason: {
        type: String,
        required: true
    }, // From dropdown (e.g., "fraud", "inappropriate content", "spam")
    description: {
        type: String,
        maxlength: 2000
    },
    // Evidence
    attachments: [String], // URLs to screenshots or documents
    // Status
    status: {
        type: String,
        enum: ['pending', 'under-review', 'reviewed', 'resolved', 'rejected', 'escalated'],
        default: 'pending'
    },
    // Priority
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    // Admin Action
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    reviewNotes: String,
    reviewedAt: Date,
    actionTaken: String, // Description of what action was taken
    // Resolution
    resolution: {
        status: String,
        notes: String,
        resolvedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
        resolvedAt: Date
    },
    // Internal Notes
    internalNotes: [{
        note: String,
        addedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
        addedAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
reportsSchema.index({ reportedBy: 1 });
reportsSchema.index({ reportType: 1, reportedItem: 1 });
reportsSchema.index({ status: 1, priority: -1 });
reportsSchema.index({ createdAt: -1 });


const Reports = model('Reports', reportsSchema);
module.exports = Reports;