const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const legalDocumentSchema = new Schema(
  {
    countryCode: { type: String, required: true, uppercase: true, trim: true },
    pageType: { type: String, enum: ['terms', 'privacy'], default: 'terms', required: true },
    categoryName: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    content: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

legalDocumentSchema.index({ countryCode: 1, pageType: 1, isActive: 1, displayOrder: 1 });
legalDocumentSchema.index({ countryCode: 1, pageType: 1, slug: 1 }, { unique: true });

module.exports = model('LegalDocument', legalDocumentSchema);
