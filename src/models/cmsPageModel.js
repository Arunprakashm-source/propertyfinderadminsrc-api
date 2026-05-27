const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const cmsPageSchema = new Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    content: {
        type: String,
        required: true
    },
    excerpt: { type: String, maxlength: 500 },
    // Page Type
    pageType: {
        type: String,
        enum: ['help', 'terms', 'privacy', 'about', 'faq', 'contact', 'career', 'press', 'other'],
        default: 'other'
    },
    // Parent Page (for hierarchical structure)
    parentPage: { type: Schema.Types.ObjectId, ref: 'CmsPage' },
    // Template
    template: {
        type: String,
        enum: ['default', 'full-width', 'sidebar', 'custom'],
        default: 'default'
    },
    // SEO
    metaTitle: String,
    metaDescription: String,
    metaKeywords: [String],
    ogImage: String,
    // Display
    isActive: { type: Boolean, default: true },
    isPublished: { type: Boolean, default: false },
    publishedAt: Date,
    displayOrder: { type: Number, default: 0 },
    // Show in Menu
    showInFooter: { type: Boolean, default: false },
    showInHeader: { type: Boolean, default: false },
    // Custom Fields
    customFields: Schema.Types.Mixed,
    // Version Control
    version: { type: Number, default: 1 },
    previousVersions: [{
        version: Number,
        content: String,
        updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
        updatedAt: Date
    }],
    // User Management
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    lastModifiedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
cmsPageSchema.index({ slug: 1 }, { unique: true });
cmsPageSchema.index({ pageType: 1, isActive: 1 });
cmsPageSchema.index({ isPublished: 1, publishedAt: -1 });

const CmsPage = model('CmsPage', cmsPageSchema);
module.exports = CmsPage;