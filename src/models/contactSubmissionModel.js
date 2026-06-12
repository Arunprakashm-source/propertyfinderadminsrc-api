const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const contactSubmissionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },
    subject: { type: String, default: '', trim: true },
    comments: { type: String, default: '', trim: true },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

contactSubmissionSchema.index({ submittedAt: -1 });
contactSubmissionSchema.index({ email: 1, submittedAt: -1 });

module.exports = model('ContactSubmission', contactSubmissionSchema);
