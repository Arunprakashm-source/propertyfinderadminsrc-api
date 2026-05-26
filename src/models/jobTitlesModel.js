const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const jobTitlesSchema = new Schema({
    title: { type: String, required: true, trim: true }, // e.g., Sales Agent
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

jobTitlesSchema.index({ title: 1 }, { unique: true });

const JobTitles = model('JobTitles', jobTitlesSchema);
module.exports = JobTitles;

