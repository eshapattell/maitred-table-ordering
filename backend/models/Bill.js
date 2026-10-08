// Bill.js: Mongoose model for dining bill splitting and payment tracking in maitred
import mongoose from 'mongoose';

// Subdocument for an individual guest's portion of the bill
const billShareSchema = new mongoose.Schema(
  {
    // String participant ID of the guest
    participantId: {
      type: String,
      required: [true, 'Participant ID is required'],
    },
    // Amount allocated to this guest (minimum 0)
    amount: {
      type: Number,
      required: [true, 'Share amount is required'],
      min: [0, 'Share amount cannot be negative'],
    },
    // Payment settlement status (marked as paid in person/cash)
    paid: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false } // Subdocuments carry participantId and do not need Mongoose _id
);

const billSchema = new mongoose.Schema(
  {
    // Reference to the table session this bill settles
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TableSession',
      required: [true, 'Session ID is required'],
    },
    // How the bill was divided: equal split, by ordered items, or custom shares
    splitMode: {
      type: String,
      required: [true, 'Split mode is required'],
      enum: {
        values: ['equal', 'item', 'custom'],
        message: '{VALUE} is not a valid split mode',
      },
    },
    // Total aggregate bill amount before/after splitting (minimum 0)
    total: {
      type: Number,
      required: [true, 'Total bill amount is required'],
      min: [0, 'Total bill cannot be negative'],
    },
    // Per-guest breakdown of amounts owed
    shares: {
      type: [billShareSchema],
      default: [],
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt timestamps
  }
);

// Index to query the bill associated with a table session
billSchema.index({ sessionId: 1 });

const Bill = mongoose.model('Bill', billSchema);
export default Bill;
