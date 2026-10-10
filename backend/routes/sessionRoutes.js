// sessionRoutes.js: Router mounting endpoints for table session operations
import express from 'express';
import {
  joinSession,
  getMySession,
  declareAllergies,
  getGuestMenu,
  approveGuest,
  rejectGuest,
} from '../controllers/sessionController.js';
import {
  guestAuth,
  requireHost,
  requireAllergiesDeclared,
} from '../middleware/sessionMiddleware.js';

const router = express.Router();

router.post('/join', joinSession);
router.get('/me', guestAuth({ allowPending: true }), getMySession);
router.post('/allergies', guestAuth(), declareAllergies);
router.get('/menu', guestAuth(), requireAllergiesDeclared, getGuestMenu);
router.post('/participants/:participantId/approve', guestAuth(), requireHost, approveGuest);
router.post('/participants/:participantId/reject', guestAuth(), requireHost, rejectGuest);

export default router;
