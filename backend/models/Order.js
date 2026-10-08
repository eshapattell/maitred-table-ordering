// Order.js: Mongoose model for dining orders sent to the kitchen in maitred
import mongoose from 'mongoose';

// Subdocument for individual items within an order ticket
const orderItemSchema = new mongoose.Schema(
  {
    // Reference to original menu item.
    // IMPORTANT: For isSurprise items, itemId is server-only and must never be sent to a guest client until served and revealed.
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MenuItem',
      required: [true, 'Item ID is required'],
    },
    // Snapshotted dish name so subsequent menu updates don't alter historical orders.
    // IMPORTANT: For isSurprise items, name is server-only and must never be sent to a guest client until served and revealed.
    name: {
      type: String,
      required: [true, 'Dish name is required'],
    },
    // Snapshotted unit price at time of order creation (minimum 0)
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    // Ordered quantity (minimum 1, integer)
    qty: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} must be an integer',
      },
    },
    // String participant ID of the guest who ordered this dish
    orderedBy: {
      type: String,
      required: [true, 'OrderedBy participant ID is required'],
    },
    // Allergy warning tags to alert the kitchen crew during preparation
    allergyFlags: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    // Indicates if this was a mystery Carte Blanche dish
    isSurprise: {
      type: Boolean,
      default: false,
    },
    // Indicates whether the surprise dish identity has been revealed to the diner after serving
    revealed: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false } // Subdocuments carry custom identifiers and do not need Mongoose _id
);

const orderSchema = new mongoose.Schema(
  {
    // The dining session this order belongs to
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TableSession',
      required: [true, 'Session ID is required'],
    },
    // Restaurant ID for tenant scoping
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: [true, 'Restaurant ID is required'],
    },
    // The table number where food should be delivered
    tableNumber: {
      type: Number,
      required: [true, 'Table number is required'],
    },
    // Array of snapshotted items in this order ticket
    items: {
      type: [orderItemSchema],
      required: [true, 'Order items are required'],
      validate: {
        validator: (val) => Array.isArray(val) && val.length > 0,
        message: 'Order must contain at least one item',
      },
    },
    // Kitchen order lifecycle: placed -> preparing -> ready -> served
    status: {
      type: String,
      required: [true, 'Order status is required'],
      enum: {
        values: ['placed', 'preparing', 'ready', 'served'],
        message: '{VALUE} is not a valid order status',
      },
      default: 'placed',
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt timestamps
  }
);

// Index to query active orders for a session and track order progression
orderSchema.index({ sessionId: 1, status: 1 });

const Order = mongoose.model('Order', orderSchema);
export default Order;
