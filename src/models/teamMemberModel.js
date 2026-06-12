const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const teamMemberSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    jobTitle: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },
    profileImage: { type: String, default: '', trim: true },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

teamMemberSchema.index({ isActive: 1, displayOrder: 1 });
teamMemberSchema.index({ fullName: 1 });
teamMemberSchema.index({ createdAt: -1 });

module.exports = model('TeamMember', teamMemberSchema);
