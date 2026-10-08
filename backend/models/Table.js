// Table.js: Mongoose model for dining tables in maitred
import mongoose from 'mongoose';

const tableSchema = new mongoose.Schema(
  {
    // Reference to the restaurant this table belongs to
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: [true, 'Restaurant ID is required'],
    },
    // The visual table number in the dining area (e.g. 1, 2, 10)
    number: {
      type: Number,
      required: [true, 'Table number is required'],
      min: [1, 'Table number must be at least 1'],
    },
    // Unique secure token encoded into the table's QR code for guest joins
    qrToken: {
      type: String,
      required: [true, 'QR token is required'],
      unique: true,
      trim: true,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt timestamps
  }
);

// Compound unique index: prevents duplicate table numbers within the same restaurant
tableSchema.index({ restaurantId: 1, number: 1 }, { unique: true });

const Table = mongoose.model('Table', tableSchema);
export default Table;
