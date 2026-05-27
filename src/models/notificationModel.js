const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const notificationSchema = new Schema({
    // Recipient
    recipient: {
        recipientType: {
            type: String,
            enum: ['user', 'agent', 'agency', 'developer', 'admin'],
            required: true
        },
        recipientId: {
            type: Schema.Types.ObjectId,
            required: true,
            refPath: 'recipient.recipientType'
        }
    },
    // Notification Content
    title: {
        type: String,
        required: true,
        maxlength: 200
    },
    message: {
        type: String,
        required: true,
        maxlength: 1000
    },
    // Notification Type
    notificationType: {
        type: String,
        enum: ['inquiry', 'alert', 'property-update', 'deal-closed', 'message', 'review', 'system', 'promotion', 'reminder', 'other'],
        default: 'other'
    },
    // Priority
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    // Related Item (optional)
    relatedItem: {
        itemType: {
            type: String,
            enum: ['property', 'inquiry', 'agent', 'agency', 'project', 'deal', 'review', 'report']
        },
        itemId: Schema.Types.ObjectId
    },
    // Action URL
    actionUrl: String,
    actionText: String,
    // Delivery Channels
    channels: {
        email: { type: Boolean, default: false },
        sms: { type: Boolean, default: false },
        push: { type: Boolean, default: false },
        inApp: { type: Boolean, default: true }
    },
    // Delivery Status
    deliveryStatus: {
        email: {
            sent: { type: Boolean, default: false },
            sentAt: Date,
            delivered: { type: Boolean, default: false },
            deliveredAt: Date,
            opened: { type: Boolean, default: false },
            openedAt: Date
        },
        sms: {
            sent: { type: Boolean, default: false },
            sentAt: Date,
            delivered: { type: Boolean, default: false },
            deliveredAt: Date
        },
        push: {
            sent: { type: Boolean, default: false },
            sentAt: Date,
            delivered: { type: Boolean, default: false },
            deliveredAt: Date,
            clicked: { type: Boolean, default: false },
            clickedAt: Date
        }
    },
    // Read Status
    isRead: { type: Boolean, default: false },
    readAt: Date,
    // Archive
    isArchived: { type: Boolean, default: false },
    archivedAt: Date,
    // Expiry
    expiresAt: Date,
    // Metadata
    metadata: Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
notificationSchema.index({ 'recipient.recipientType': 1, 'recipient.recipientId': 1 });
notificationSchema.index({ 'recipient.recipientId': 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ notificationType: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
// Compound index for common queries
notificationSchema.index({
    'recipient.recipientId': 1,
    isRead: 1,
    isArchived: 1,
    createdAt: -1
});

const Notification = model('Notification', notificationSchema);
module.exports = Notification;