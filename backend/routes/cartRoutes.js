// cartRoutes.js: Router for shared table cart endpoints
import express from 'express';
import { guestAuth, requireAllergiesDeclared } from '../middleware/sessionMiddleware.js';
import {
  getCart,
  addItem,
  decreaseItem,
  removeItem,
} from '../controllers/cartController.js';

const router = express.Router();

// Every cart route requires valid guest auth followed by declared allergies
router.use(guestAuth());
router.use(requireAllergiesDeclared);

router.get('/', getCart);
router.post('/items', addItem);
router.patch('/items/:cartItemId', decreaseItem);
router.delete('/items/:cartItemId', removeItem);

export default router;
