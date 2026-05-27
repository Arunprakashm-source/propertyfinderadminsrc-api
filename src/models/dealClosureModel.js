const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const dealClosureSchema = new Schema({

    // ─── Category ─────────────────────────────────
    // Distinguish between property and project deals
    dealCategory: {
        type: String,
        enum: ['property', 'project'],
        required: true,
        default: 'property'
    },

    // ─── Property (for property deals) ────────────
    property: {
        type: Schema.Types.ObjectId,
        ref: 'Properties',
        // required only for property deals
        required: function() {
            return this.dealCategory === 'property'
        }
    },

    // ─── Project (for project deals) ──────────────
    project: {
        type: Schema.Types.ObjectId,
        ref: 'Newprojects',
        required: function() {
            return this.dealCategory === 'project'
        }
    },

    // Unit reference (project deals only)
    unit: {
        type: Schema.Types.ObjectId,
        ref: 'ProjectUnit',
        required: function() {
            return this.dealCategory === 'project'
        }
    },

    // Layout reference (project deals only)
    layout: {
        type: Schema.Types.ObjectId,
        ref: 'ProjectLayout',
        required: false
    },

    // ─── Inquiry ──────────────────────────────────
    inquiry: {
        type: Schema.Types.ObjectId,
        ref: 'Inquirys',
        required: false
    },

    // ─── Parties Involved ─────────────────────────
    agent: {
        type: Schema.Types.ObjectId,
        ref: 'Agents',
        required: true
    },
    agency: {
        type: Schema.Types.ObjectId,
        ref: 'Agencies',
        required: true
    },
    // Developer reference (project deals only)
    developer: {
        type: Schema.Types.ObjectId,
        ref: 'Developers',
        required: false
    },
    customer: {
        userId     : { type: Schema.Types.ObjectId, ref: 'Users' },
        name       : { type: String, required: true },
        email      : { type: String, required: true },
        phoneNumber: { type: String, required: true }
    },

    // ─── Deal Details ─────────────────────────────
    dealType: {
        type: String,
        enum: ['sale', 'rent'],
        required: true
    },
    dealAmount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: { type: String, default: 'AED' },

    // ─── Commission ───────────────────────────────
    commission: {
        amount     : Number,
        percentage : Number,
        agentShare : Number,
        agencyShare: Number
    },

    // ─── Contract Details ─────────────────────────
    contractDetails: {
        contractNumber  : String,
        contractDate    : Date,
        contractDocument: String, // URL
        startDate       : Date,
        endDate         : Date,
        renewalDate     : Date
    },

    // ─── Payment Details ──────────────────────────
    paymentDetails: {
        paymentMethod: String,
        paymentStatus: {
            type: String,
            enum: ['pending', 'partial', 'completed'],
            default: 'pending'
        },
        totalAmount  : Number,
        paidAmount   : { type: Number, default: 0 },
        pendingAmount: Number,
        paymentSchedule: [{
            dueDate      : Date,
            amount       : Number,
            isPaid       : { type: Boolean, default: false },
            paidDate     : Date,
            receiptNumber: String
        }]
    },

    // ─── Closure Details ──────────────────────────
    closedDate: {
        type    : Date,
        required: true,
        default : Date.now
    },
    closedBy: {
        type    : Schema.Types.ObjectId,
        ref     : 'Agents',
        required: true
    },

    // ─── Approval Flow ────────────────────────────
    // For project deals — agency approves agent submission
    approvalFlow: {
        submittedAt    : Date,
        submittedBy    : { type: Schema.Types.ObjectId, ref: 'Agents' },
        approvedAt     : Date,
        approvedBy     : { type: Schema.Types.ObjectId, ref: 'Agencies' },
        declinedAt     : Date,
        declinedBy     : { type: Schema.Types.ObjectId, ref: 'Agencies' },
        declinedReason : String
    },

    // ─── Verification (by Admin) ──────────────────
    isVerified: { type: Boolean, default: false },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    verifiedAt: Date,

    // ─── Notes & Documents ────────────────────────
    notes    : String,
    documents: [{
        title     : { type: String },
        url       : { type: String },
        // `type` is a reserved keyword in Mongoose schema declarations,
        // so we explicitly disambiguate it as a real field name.
        type      : { type: String },
        uploadedAt: { type: Date, default: Date.now }
    }],

    // ─── Status ───────────────────────────────────
    // property deal: pending-approval → approved → completed
    // project deal:  pending-approval → approved → completed
    status: {
        type: String,
        enum: [
            'pending-approval',
            'approved',
            'completed',
            'cancelled',
            'disputed'
        ],
        default: 'pending-approval'
    },

    metadata : Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }

}, { timestamps: true })

// ─── Indexes ──────────────────────────────────────
dealClosureSchema.index({ agent    : 1, closedDate: -1 })
dealClosureSchema.index({ agency   : 1, closedDate: -1 })
dealClosureSchema.index({ property : 1 })
dealClosureSchema.index({ project  : 1 })
dealClosureSchema.index({ unit     : 1 })
dealClosureSchema.index({ inquiry  : 1 })
dealClosureSchema.index({ dealType : 1, status: 1 })
dealClosureSchema.index({ closedDate: -1 })
dealClosureSchema.index({ dealCategory: 1, status: 1 })
dealClosureSchema.index({ agency: 1, dealCategory: 1, status: 1 })

// Export the actual Mongoose model so callers can use `DealClosure.create()`, etc.
const DealClosure = model('DealClosure', dealClosureSchema);
module.exports = DealClosure;