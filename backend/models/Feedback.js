// Feedback.js: Mongoose model for diner feedback on menu dishes in maitred
import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema(
  {
    // The menu item being evaluated
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MenuItem',
      required: [true, 'Item ID is required'],
    },
    // String participant ID of the guest who submitted feedback
    participantId: {
      type: String,
      required: [true, 'Participant ID is required'],
    },
    // Star rating score from 1 (lowest) to 5 (highest)
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} must be an integer',
      },
    },
    // Flag indicating whether this dish was ordered as a Carte Blanche surprise item
    wasSurprise: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt timestamps
  }
);

// Compound index to look up feedback for a specific dish
feedbackSchema.index({ itemId: 1 });

const Feedback = mongoose.model('Feedback', feedbackSchema);
export default Feedback;
