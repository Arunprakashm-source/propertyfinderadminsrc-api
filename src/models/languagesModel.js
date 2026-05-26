const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const languagesSchema = new Schema({
    name: { type: String, required: true, trim: true }, // e.g., English
    code: { type: String, trim: true, lowercase: true }, // e.g., en
    nativeName: { type: String, trim: true },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

languagesSchema.index({ name: 1 }, { unique: true });
languagesSchema.index({ code: 1 });

const Languages = model('Languages', languagesSchema);
module.exports = Languages;

