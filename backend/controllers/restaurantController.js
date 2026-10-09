// restaurantController.js: Public dining establishment controller for maitred
import mongoose from 'mongoose';
import Restaurant from '../models/Restaurant.js';

/**
 * Public endpoint to fetch basic restaurant details (id and name only).
 * Validates restaurantId format before querying to avoid cast errors.
 */
export const getRestaurantById = async (req, res, next) => {
  try {
    const { restaurantId } = req.params;

    // Fail closed with 404 if the URL parameter is not a valid ObjectId
    if (!mongoose.isObjectIdOrHexString(restaurantId)) {
      return res.status(404).json({ message: 'Not found' });
    }

    const restaurant = await Restaurant.findById(restaurantId).lean();
    if (!restaurant) {
      return res.status(404).json({ message: 'Not found' });
    }

    // Whitelist only public fields; ownerId is strictly omitted
    res.status(200).json({
      restaurant: {
        id: String(restaurant._id),
        name: restaurant.name,
      },
    });
  } catch (err) {
    next(err);
  }
};
