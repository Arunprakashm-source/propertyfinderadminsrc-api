const mongoose = require('mongoose');

const { Schema, model } = mongoose;

const calculatorSnapshotSchema = new Schema(
  {
    purchasePrice: Number,
    residencyStatus: String,
    downPayment: Number,
    downPaymentPct: Number,
    loanAmount: Number,
    loanPeriod: Number,
    interestRate: Number,
    monthlyPayment: Number,
    totalInterest: Number,
  },
  { _id: false },
);

const mortgageQuoteSchema = new Schema(
  {
    // Loan details (Step 1)
    loanType: {
      type: String,
      enum: ['buy', 'refinance'],
      required: true,
    },
    residencyStatus: {
      type: String,
      enum: ['uae-national', 'uae-resident', 'non-resident'],
      required: true,
    },
    buyingProcess: {
      type: String,
      enum: ['found-property', 'looking-for-property', 'just-exploring'],
    },
    propertyPrice: {
      type: Number,
    },

    // Employment (Step 2)
    employmentStatus: {
      type: String,
      enum: ['salaried', 'self-employed'],
      required: true,
    },
    monthlySalary: {
      type: Number,
    },

    // Contact (Step 3)
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    countryCode: {
      type: String,
      default: '+971',
    },
    mobileNumber: {
      type: String,
      required: true,
      trim: true,
    },

    // Calculator snapshot (optional, saved for reference)
    calculatorSnapshot: {
      type: calculatorSnapshotSchema,
    },

    // Status
    status: {
      type: String,
      enum: ['new', 'contacted', 'closed'],
      default: 'new',
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

const MortgageQuote = model('MortgageQuote', mortgageQuoteSchema);

module.exports = MortgageQuote;

