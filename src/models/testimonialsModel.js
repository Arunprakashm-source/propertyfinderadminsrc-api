const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const testimonialSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    title: String, // e.g., "CEO", "Home Buyer"
    company: String,
    image: String, // URL to client photo
    videoUrl: String, // Optional video testimonial
    content: {
        type: String,
        required: true,
        maxlength: 2000
    },
    rating: {
        type: Number,
        min: 1,
        max: 5
    },
    // Association
    associatedProperty: { type: Schema.Types.ObjectId, ref: 'Property' },
    associatedAgent: { type: Schema.Types.ObjectId, ref: 'Agent' },
    associatedAgency: { type: Schema.Types.ObjectId, ref: 'Agency' },
    // Display Settings
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    // Source
    source: {
        type: String,
        enum: ['web', 'email', 'social', 'manual', 'other'],
        default: 'web'
    },
    // Metadata
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });

// Indexes
testimonialSchema.index({ isActive: 1, displayOrder: 1 });
testimonialSchema.index({ isFeatured: 1 });
testimonialSchema.index({ rating: -1 });

const Testimonial = model('Testimonial', testimonialSchema);
module.exports = Testimonial;

