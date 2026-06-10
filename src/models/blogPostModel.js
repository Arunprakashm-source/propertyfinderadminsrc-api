const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const blogPostSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    excerpt: { type: String, maxlength: 500, default: '' },
    content: { type: String, required: true, default: '' },
    featuredImage: { type: String, default: '' },
    categorySlug: { type: String, default: '', index: true },
    subcategorySlug: { type: String, default: '', index: true },
    tags: [{ type: String, trim: true }],
    authorName: { type: String, default: 'Admin', trim: true },
    authorAvatar: { type: String, default: '' },
    readingTime: { type: Number, default: 5, min: 1 },
    isFeatured: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    publishedAt: { type: Date },
    allowComments: { type: Boolean, default: true },
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    metaKeywords: { type: String, default: '' },
    relatedProperties: [{ type: Schema.Types.ObjectId, ref: 'Properties' }],
    views: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

blogPostSchema.index({ status: 1, publishedAt: -1 });
blogPostSchema.index({ isFeatured: 1, status: 1 });
blogPostSchema.index({ title: 'text', excerpt: 'text', content: 'text', tags: 'text' });

module.exports = model('BlogPost', blogPostSchema);
