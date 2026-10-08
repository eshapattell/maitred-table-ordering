// Restaurant.js: Mongoose model for dining establishment in maitred
import mongoose from 'mongoose';

const restaurantSchema = new mongoose.Schema(
  {
    // Name of the restaurant
    name: {
      type: String,
      required: [true, 'Restaurant name is required'],
      trim: true,
    },
    // Reference to the primary owner user; optional because the restaurant is created first during seeding
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt timestamps
  }
);

const Restaurant = mongoose.model('Restaurant', restaurantSchema);
export default Restaurant;
