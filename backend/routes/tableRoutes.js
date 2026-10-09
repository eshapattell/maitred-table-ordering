// tableRoutes.js: Dining table management and QR routes for maitred
import express from 'express';
import {
  getTables,
  createTable,
  getTableQR,
  deleteTable,
} from '../controllers/tableController.js';
import { protect, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

// All table management routes require an authenticated owner account
router.use(protect, requireRole('owner'));

router.get('/', getTables);
router.post('/', createTable);
router.get('/:tableId/qr', getTableQR);
router.delete('/:tableId', deleteTable);

export default router;
