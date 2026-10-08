// TableSession.js: Mongoose model for active dining sessions and shared live cart in maitred
import mongoose from 'mongoose';

// Participant subdocument representing a diner at the table
const participantSchema = new mongoose.Schema(
  {
    // Server-generated unique string UUID (crypto.randomUUID())
    id: {
      type: String,
      required: [true, 'Participant ID is required'],
    },
    // Guest nickname (e.g. "Alice", "Bob") for identifying who added each item
    nickname: {
      type: String,
      required: [true, 'Nickname is required'],
      trim: true,
      maxlength: [30, 'Nickname cannot exceed 30 characters'],
    },
    // List of declared allergens for this guest (checked against dish ingredients)
    allergies: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    // Guest taste preferences from Carte Blanche palate quiz
    tasteProfile: {
      diet: { type: String, trim: true },
      spice: { type: Number, min: 1, max: 5 },
      flavours: [{ type: String, trim: true }],
      cuisines: [{ type: String, trim: true }],
      appetite: { type: String, trim: true },
      budget: { type: Number, min: 0 },
      dislikes: [{ type: String, trim: true }],
    },
  },
  { _id: false } // Disable default Mongoose _id so participant.id is the single source of truth
);

// Cart item subdocument in the shared live table cart
const cartItemSchema = new mongoose.Schema(
  {
    // Unique string UUID identifying this item row in the live cart
    cartItemId: {
      type: String,
      required: [true, 'Cart item ID is required'],
    },
    // Reference to the selected dish.
    // IMPORTANT: For isSurprise items, itemId is server-only and must never be sent to a guest client.
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MenuItem',
      required: [true, 'Item ID is required'],
    },
    // Quantity of this dish in the cart (minimum 1, integer)
    qty: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} must be an integer',
      },
    },
    // String participant ID of the guest who added this item
    addedBy: {
      type: String,
      required: [true, 'AddedBy participant ID is required'],
    },
    // Optional special preparation instructions (e.g. "extra crispy")
    note: {
      type: String,
      trim: true,
    },
    // Flag indicating this is a mystery dish chosen by Carte Blanche
    isSurprise: {
      type: Boolean,
      default: false,
    },
    // Optional spending limit ceiling for surprise dish selection
    budgetCap: {
      type: Number,
      min: [0, 'Budget cap cannot be negative'],
    },
    // String participant ID for whom the surprise dish is intended
    surpriseFor: {
      type: String,
    },
  },
  { _id: false } // Disable default Mongoose _id so cartItemId is the single source of truth
);

const tableSessionSchema = new mongoose.Schema(
  {
    // The dining table associated with this session
    tableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Table',
      required: [true, 'Table ID is required'],
    },
    // Restaurant ID for tenant scoping
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: [true, 'Restaurant ID is required'],
    },
    // Status of table dining session: 'open' while active, 'closed' once final bill is settled
    status: {
      type: String,
      required: [true, 'Session status is required'],
      enum: {
        values: ['open', 'closed'],
        message: '{VALUE} is not a valid session status',
      },
      default: 'open',
    },
    // Array of guests currently joined to this table session
    participants: {
      type: [participantSchema],
      default: [],
    },
    // Shared live cart shared by all guests at this table
    cart: {
      type: [cartItemSchema],
      default: [],
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt timestamps
  }
);

// Compound index on tableId and status for general lookup queries
tableSessionSchema.index({ tableId: 1, status: 1 });

// Partial unique index: ensure a table can only have one "open" session at any given time.
// Why: two phones scanning the QR code at the same moment must not create two carts.
tableSessionSchema.index(
  { tableId: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
);

const TableSession = mongoose.model('TableSession', tableSessionSchema);
export default TableSession;
