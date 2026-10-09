// restaurantRoutes.js: Public dining establishment routes for maitred
import express from 'express';
import { getRestaurantById } from '../controllers/restaurantController.js';

const router = express.Router();

// Public endpoint for restaurant lookup by ID
router.get('/:restaurantId', getRestaurantById);

export default router;
