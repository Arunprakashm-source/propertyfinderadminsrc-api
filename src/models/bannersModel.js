const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const PLACEMENTS = [
  'home-page',
  'search-page',
  'listing-page',
  'agent-page',
  'agency-page',
  'project-page',
];

const bannerSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    image: { type: String, required: true, trim: true },
    mobileImage: { type: String, default: '', trim: true },
    link: { type: String, default: '', trim: true },
    linkText: { type: String, default: 'Explore more', trim: true },
    placement: {
      type: String,
      enum: PLACEMENTS,
      required: true,
    },
    position: {
      type: String,
      enum: ['top', 'middle', 'bottom', 'sidebar'],
      default: 'top',
    },
    displayOrder: { type: Number, default: 0 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    ctr: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

bannerSchema.index({ placement: 1, isActive: 1, displayOrder: 1 });
bannerSchema.index({ startDate: 1, endDate: 1 });

module.exports = model('Banner', bannerSchema);
module.exports.PLACEMENTS = PLACEMENTS;
