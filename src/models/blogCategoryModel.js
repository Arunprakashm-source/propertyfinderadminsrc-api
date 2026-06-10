const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const blogSubcategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    displayOrder: { type: Number, default: 0 },
  },
  { _id: true }
);

const blogCategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    subcategories: { type: [blogSubcategorySchema], default: [] },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

blogCategorySchema.index({ isActive: 1, displayOrder: 1 });

module.exports = model('BlogCategory', blogCategorySchema);
