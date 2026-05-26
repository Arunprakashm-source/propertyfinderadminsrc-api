const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const propertyAllocationSchema = new Schema({
    agency: { 
      type: Schema.Types.ObjectId, 
      ref: 'Agencies',
      required: true 
    },
    agent: { 
      type: Schema.Types.ObjectId, 
      ref: 'Agents',
      required: true 
    },
    
    // Allocation Type - to distinguish between project and regular property
    allocationType: {
      type: String,
      enum: ['project', 'regular-property'],
      default: 'regular-property'
    },
    
    // For regular properties
    title: { type: String, required: true },
    document: { type: String, required: true }, // URL to PDF/DOC
    documentType: { type: String, enum: ['pdf', 'doc', 'docx', 'other'] },
    
    // Property Hints/Details
    propertyDetails: {
      location: String,
      propertyType: String,
      estimatedPrice: Number,
      description: String
    },
    
    // For projects (from developers)
    project: { type: Schema.Types.ObjectId, ref: 'Newprojects' },
    
    // Status
    status: {
      type: String,
      enum: ['pending', 'in-progress', 'completed', 'cancelled'],
      default: 'pending'
    },
    
    // Completion Details
    completedProperty: { type: Schema.Types.ObjectId, ref: 'Properties' },
    listingLink: String,
    completedAt: Date,
    completionNotes: String,
    
    // Timeline
    sentAt: { type: Date, default: Date.now },
    startedAt: Date, // When agent marks as in-progress
    deadline: Date,
    
    // Notes
    agencyNotes: String,
    agentNotes: [{
      note: String,
      addedAt: { type: Date, default: Date.now }
    }],
    
    // Extension Request
    extensionRequested: {
      requested: { type: Boolean, default: false },
      reason: String,
      requestedAt: Date,
      approved: Boolean,
      approvedAt: Date,
      newDeadline: Date
    },
    
    // Tracking
    viewedAt: Date,
    viewedByAgent: { type: Boolean, default: false },
    
    createdAt: { type: Date, default: Date.now }
  }, { timestamps: true });
// Indexes
propertyAllocationSchema.index({ agency: 1, agent: 1 });
propertyAllocationSchema.index({ agent: 1, status: 1 });
propertyAllocationSchema.index({ status: 1, sentAt: -1 });


const PropertyAllocation = model('PropertyAllocation', propertyAllocationSchema);
module.exports = PropertyAllocation;