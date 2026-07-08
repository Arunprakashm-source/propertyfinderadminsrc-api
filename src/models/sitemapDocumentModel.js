const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const sitemapDocumentSchema = new Schema(
  {
    countryCode: { type: String, required: true, uppercase: true, trim: true },
    categoryName: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    content: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

sitemapDocumentSchema.index({ countryCode: 1, isActive: 1, displayOrder: 1 });
sitemapDocumentSchema.index({ countryCode: 1, slug: 1 }, { unique: true });

module.exports = model('SitemapDocument', sitemapDocumentSchema);
