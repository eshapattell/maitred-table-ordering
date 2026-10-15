// kitchenRoutes.js: Staff kitchen board routes and item status management in maitred
import express from 'express';
import { protect, requireRole } from '../middleware/authMiddleware.js';
import {
  getActiveOrders,
  updateOrderItemStatus,
} from '../controllers/kitchenController.js';

const router = express.Router();

// Staff authentication and role enforcement (owner and kitchen only)
router.use(protect);
router.use(requireRole('owner', 'kitchen'));

router.get('/', getActiveOrders);
router.patch('/:orderId/items/:orderItemId/status', updateOrderItemStatus);

export default router;
