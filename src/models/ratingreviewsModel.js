const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const ratingReviewsSchema = new Schema({
    // Rating Target (Agent or Agency)
    targetType: {
        type: String,
        enum: ['agent', 'agency', 'developer'],
        required: true
    },
    targetId: {
        type: Schema.Types.ObjectId,
        required: true,
        refPath: 'targetType'
    },
    // Reviewer
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Rating & Review
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    review: { type: String, maxlength: 1000 },
    title: { type: String, maxlength: 200 },
    // Rating Categories (optional detailed ratings)
    categories: {
        communication: { type: Number, min: 1, max: 5 },
        professionalism: { type: Number, min: 1, max: 5 },
        marketKnowledge: { type: Number, min: 1, max: 5 },
        responseTime: { type: Number, min: 1, max: 5 }
    },
    // Related Property (optional)
    property: {
        type: Schema.Types.ObjectId,
        ref: 'Property'
    },
    // Related Inquiry/Deal
    inquiry: {
        type: Schema.Types.ObjectId,
        ref: 'Inquiry'
    },
    // Response from Agent/Agency
    response: {
        text: String,
        respondedBy: { type: Schema.Types.ObjectId, refPath: 'targetType' },
        respondedAt: Date
    },
    // Helpful Votes
    helpfulVotes: { type: Number, default: 0 },
    unhelpfulVotes: { type: Number, default: 0 },
    // Status
    isApproved: { type: Boolean, default: false },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    approvedAt: Date,
    isVisible: { type: Boolean, default: true },
    isFlagged: { type: Boolean, default: false },
    flagReason: String,
    // Verification
    isVerifiedPurchase: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
// Indexes
ratingReviewsSchema.index({ targetType: 1, targetId: 1 });
ratingReviewsSchema.index({ user: 1 });
ratingReviewsSchema.index({ rating: 1 });
ratingReviewsSchema.index({ isApproved: 1, isVisible: 1 });
ratingReviewsSchema.index({ createdAt: -1 });
// Compound index
ratingReviewsSchema.index({ targetType: 1, targetId: 1, isApproved: 1, isVisible: 1 });


const Ratingreviews = model('Ratingreviews', ratingReviewsSchema);
module.exports = Ratingreviews;