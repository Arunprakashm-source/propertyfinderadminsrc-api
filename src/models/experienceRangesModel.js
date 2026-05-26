const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const experienceRangesSchema = new Schema({
    label: { type: String, required: true, trim: true }, // e.g., "0-1 years"
    minYears: { type: Number, default: 0 },
    maxYears: { type: Number }, // null/undefined for open-ended
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

experienceRangesSchema.index({ label: 1 }, { unique: true });
experienceRangesSchema.index({ sortOrder: 1 });

const ExperienceRanges = model('ExperienceRanges', experienceRangesSchema);
module.exports = ExperienceRanges;

