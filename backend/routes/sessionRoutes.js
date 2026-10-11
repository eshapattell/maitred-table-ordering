// sessionRoutes.js: Router mounting endpoints for table session operations
import express from 'express';
import {
  joinSession,
  getMySession,
  declareAllergies,
  getGuestMenu,
  approveGuest,
  rejectGuest,
  getActiveStaffSessions,
  closeStaffSession,
  approveStaffParticipant,
  removeStaffParticipant,
} from '../controllers/sessionController.js';
import {
  guestAuth,
  requireHost,
  requireAllergiesDeclared,
} from '../middleware/sessionMiddleware.js';
import { protect, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

// Staff safeguard endpoints (owner and kitchen only, scoped by restaurantId)
router.get('/staff/active', protect, requireRole('owner', 'kitchen'), getActiveStaffSessions);
router.post('/staff/:sessionId/close', protect, requireRole('owner', 'kitchen'), closeStaffSession);
router.post('/staff/:sessionId/participants/:participantId/approve', protect, requireRole('owner', 'kitchen'), approveStaffParticipant);
router.post('/staff/:sessionId/participants/:participantId/remove', protect, requireRole('owner', 'kitchen'), removeStaffParticipant);

// Guest session endpoints
router.post('/join', joinSession);
router.get('/me', guestAuth({ allowPending: true }), getMySession);
router.post('/allergies', guestAuth(), declareAllergies);
router.get('/menu', guestAuth(), requireAllergiesDeclared, getGuestMenu);
router.post('/participants/:participantId/approve', guestAuth(), requireHost, approveGuest);
router.post('/participants/:participantId/reject', guestAuth(), requireHost, rejectGuest);

export default router;
