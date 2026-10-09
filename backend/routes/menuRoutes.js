// menuRoutes.js: Culinary menu API routes for maitred
import express from 'express';
import {
  getPublicMenu,
  getStaffMenu,
  createMenuItem,
  updateMenuItem,
  confirmMenuItemAllergens,
  updateMenuItemAvailability,
} from '../controllers/menuController.js';
import { protect, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

// 1. Staff menu lookup (owner or kitchen): all items for authenticated user's restaurant
router.get('/', protect, requireRole('owner', 'kitchen'), getStaffMenu);

// 2. Owner menu creation: defaults available=true, allergensConfirmed=false
router.post('/', protect, requireRole('owner'), createMenuItem);

// 3. Owner partial update: modifies editable fields, resets confirmation on allergen change
router.patch('/:itemId', protect, requireRole('owner'), updateMenuItem);

// 4. Owner allergen confirmation: validates reviewed tags and marks allergensConfirmed=true
router.post(
  '/:itemId/confirm-allergens',
  protect,
  requireRole('owner'),
  confirmMenuItemAllergens
);

// 5. Staff availability toggle (owner or kitchen): toggles real-time item availability
router.patch(
  '/:itemId/availability',
  protect,
  requireRole('owner', 'kitchen'),
  updateMenuItemAvailability
);

// 6. Public guest menu lookup: only available items for specified restaurant
router.get('/:restaurantId', getPublicMenu);

// Viva note: There is deliberately NO delete route: items are hidden with available false
// so old orders, historical bills, and open carts keep working without referential breakdown.

export default router;
