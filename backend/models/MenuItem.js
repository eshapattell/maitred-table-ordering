// MenuItem.js: Mongoose model for culinary dishes in maitred
import mongoose from 'mongoose';

const menuItemSchema = new mongoose.Schema(
  {
    // Restaurant offering this dish
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: [true, 'Restaurant ID is required'],
    },
    // Dish name as displayed on the luxury menu card
    name: {
      type: String,
      required: [true, 'Dish name is required'],
      trim: true,
    },
    // Detailed culinary description and ingredients
    description: {
      type: String,
      trim: true,
      default: '',
    },
    // Item price in restaurant currency (minimum 0)
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    // Menu category (e.g. Starters, Mains, Desserts, Beverages)
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
    },
    // Vegetarian flag
    isVeg: {
      type: Boolean,
      required: [true, 'Vegetarian flag is required'],
      default: false,
    },
    // Normalized list of allergens (e.g. gluten, dairy, nuts) for deterministic safety filtering
    allergens: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    // Heat level from 1 (mild) to 5 (extra fiery); optional but restricted to 1-5 range
    spiceLevel: {
      type: Number,
      min: [1, 'Spice level must be at least 1'],
      max: [5, 'Spice level cannot exceed 5'],
    },
    // Flavour profiles (e.g. rich, citrusy, umami, smoky) used for palate matching
    flavourTags: [
      {
        type: String,
        trim: true,
      },
    ],
    // Culinary origin or tradition (e.g. French, Japanese, Italian)
    cuisine: {
      type: String,
      trim: true,
    },
    // Course type (e.g. Appetizer, Entree, Dessert)
    course: {
      type: String,
      trim: true,
    },
    // Serving size description (e.g. "Serves 1-2", "250g")
    portionSize: {
      type: String,
      trim: true,
    },
    // Estimated kitchen preparation time in minutes
    prepMinutes: {
      type: Number,
      min: [0, 'Preparation minutes cannot be negative'],
    },
    // Availability flag (can be temporarily disabled by kitchen/owner if out of stock)
    available: {
      type: Boolean,
      default: true,
    },
    // Safety flag indicating allergen information has been explicitly reviewed and verified by staff
    allergensConfirmed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt timestamps
  }
);

// Compound index to quickly fetch all currently available dishes for a restaurant
menuItemSchema.index({ restaurantId: 1, available: 1 });

const MenuItem = mongoose.model('MenuItem', menuItemSchema);
export default MenuItem;
