const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const activityLogSchema = new Schema({
    // Actor (Who performed the action)
    actor: {
        actorType: {
            type: String,
            enum: ['user', 'agent', 'agency', 'developer', 'admin', 'system'],
            required: true
        },
        actorId: {
            type: Schema.Types.ObjectId,
            required: true,
            refPath: 'actor.actorType'
        }
    },
    // Action
    action: {
        type: String,
        required: true,
        enum: [
            'create', 'read', 'update', 'delete',
            'login', 'logout', 'register',
            'approve', 'reject', 'verify',
            'deactivate', 'activate',
            'upload', 'download',
            'send', 'receive',
            'other'
        ]
    },
    // Resource (What was acted upon)
    resource: {
        resourceType: {
            type: String,
            enum: ['property', 'agent', 'agency', 'user', 'inquiry', 'project', 'review', 'report', 'deal', 'setting', 'other'],
            required: true
        },
        resourceId: Schema.Types.ObjectId
    },
    // Description
    description: { type: String, required: true },
    // Changes (for update actions)
    changes: {
        before: Schema.Types.Mixed,
        after: Schema.Types.Mixed
    },
    // Request Details
    requestDetails: {
        ipAddress: String,
        userAgent: String,
        device: String,
        browser: String,
        os: String,
        location: String
    },
    // Status
    status: {
        type: String,
        enum: ['success', 'failed', 'pending'],
        default: 'success'
    },
    // Error (if failed)
    error: {
        message: String,
        code: String,
        stack: String
    },
    // Metadata
    metadata: Schema.Types.Mixed,
    timestamp: { type: Date, default: Date.now, required: true }
}, { timestamps: false }); // We use 'timestamp' field instead

// Indexes
activityLogSchema.index({ 'actor.actorType': 1, 'actor.actorId': 1, timestamp: -1 });
activityLogSchema.index({ 'resource.resourceType': 1, 'resource.resourceId': 1 });
activityLogSchema.index({ action: 1, timestamp: -1 });
activityLogSchema.index({ timestamp: -1 });
// TTL Index - Auto-delete logs older than 1 year
activityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 });

const ActivityLog = model('ActivityLog', activityLogSchema);
module.exports = ActivityLog;

