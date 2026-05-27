const mongoose = require('mongoose');
const { Schema, model } = mongoose;

/**
 * Denormalized city index for public search filters — built from inline listing locations
 * (properties / projects do not reference the legacy Location model).
 * Counts are best-effort increments on create / publish (not decremented on unpublish/delete).
 */
const listingSearchCitySchema = new Schema(
  {
    cityKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    propertyCount: { type: Number, default: 0, min: 0 },
    projectCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

listingSearchCitySchema.index({ displayName: 1 });

const ListingSearchCity = model('ListingSearchCity', listingSearchCitySchema);
module.exports = ListingSearchCity;
