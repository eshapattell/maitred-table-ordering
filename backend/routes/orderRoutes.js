// orderRoutes.js: Routes for dining table order placement and cancellation by host
import express from 'express';
import {
  guestAuth,
  requireAllergiesDeclared,
  requireHost,
} from '../middleware/sessionMiddleware.js';
import {
  placeOrder,
  getPlacedOrders,
  cancelOrderItem,
  listTableOrders,
} from '../controllers/orderController.js';

const router = express.Router();

// Every order route requires an authenticated guest with declared allergies
router.use(guestAuth());
router.use(requireAllergiesDeclared);

router.get('/', listTableOrders);

router.use(requireHost);

router.post('/', placeOrder);
router.get('/placed', getPlacedOrders);
router.post('/:orderId/items/:orderItemId/cancel', cancelOrderItem);

export default router;
