const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const blogCommentSchema = new Schema(
  {
    post: { type: Schema.Types.ObjectId, ref: 'BlogPost', required: true, index: true },
    parent: { type: Schema.Types.ObjectId, ref: 'BlogComment', default: null, index: true },
    authorName: { type: String, required: true, trim: true },
    user: { type: Schema.Types.ObjectId, ref: 'Users', default: null },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    likes: { type: Number, default: 0 },
    dislikes: { type: Number, default: 0 },
    reactions: [
      {
        guestKey: { type: String, default: '' },
        user: { type: Schema.Types.ObjectId, ref: 'Users', default: null },
        reaction: { type: String, enum: ['like', 'dislike'] },
      },
    ],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

blogCommentSchema.index({ post: 1, parent: 1, createdAt: -1 });

module.exports = model('BlogComment', blogCommentSchema);
