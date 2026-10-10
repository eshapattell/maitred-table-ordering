// sessionMiddleware.js: Guest token verification, role checks, and session lifecycle guards
import mongoose from 'mongoose';
import Table from '../models/Table.js';
import TableSession from '../models/TableSession.js';
import { verifyGuestToken } from '../utils/generateToken.js';
import {
  isSessionIdle,
  isPendingExpired,
  canManageGuests,
} from '../utils/sessionRules.js';
import { closeSession } from '../controllers/sessionController.js';

/**
 * Authenticates a guest dining at a table using a signed guest JWT token.
 * Validates session status, idle expiry, table existence, and participant status.
 *
 * @param {{ allowPending?: boolean }} [options={}]
 * @returns {import('express').RequestHandler}
 */
export const guestAuth = ({ allowPending = false } = {}) => {
  return async (req, res, next) => {
    try {
      // a. Require "Authorization: Bearer <token>", else 401 INVALID_TOKEN
      const authHeader = req.headers?.authorization;
      if (
        !authHeader ||
        typeof authHeader !== 'string' ||
        !authHeader.startsWith('Bearer ')
      ) {
        return res
          .status(401)
          .json({ message: 'Not authorised', code: 'INVALID_TOKEN' });
      }

      const token = authHeader.slice(7).trim();
      if (!token) {
        return res
          .status(401)
          .json({ message: 'Not authorised', code: 'INVALID_TOKEN' });
      }

      let payload;
      try {
        payload = verifyGuestToken(token);
      } catch (err) {
        if (err && err.code === 'JWT_SECRET_INVALID') {
          return next(err);
        }
        return res
          .status(401)
          .json({ message: 'Not authorised', code: 'INVALID_TOKEN' });
      }

      // b. payload.sid must pass isObjectIdOrHexString and payload.sub must be a non-empty string
      const { sid, sub } = payload || {};
      if (
        !sid ||
        !mongoose.isObjectIdOrHexString(sid) ||
        typeof sub !== 'string' ||
        sub.trim() === ''
      ) {
        return res
          .status(401)
          .json({ message: 'Not authorised', code: 'INVALID_TOKEN' });
      }

      // c. Load the session (lean). Missing or status not "open": 401 SESSION_CLOSED
      const session = await TableSession.findById(sid).lean();
      if (!session || session.status !== 'open') {
        return res
          .status(401)
          .json({ message: 'This table session has ended', code: 'SESSION_CLOSED' });
      }

      const now = new Date();

      // d. If isSessionIdle(session, now): closeSession(id, "timeout"), then 401 SESSION_CLOSED
      if (isSessionIdle(session, now)) {
        await closeSession(session._id, 'timeout', now);
        return res
          .status(401)
          .json({ message: 'This table session has ended', code: 'SESSION_CLOSED' });
      }

      // e. If Table.exists({ _id: session.tableId }) is null: closeSession(id, "table-removed"), then 401.
      // Viva note: this is the per-request half of the table-delete race fix.
      const tableExists = await Table.exists({ _id: session.tableId });
      if (!tableExists) {
        await closeSession(session._id, 'table-removed', now);
        return res
          .status(401)
          .json({ message: 'This table session has ended', code: 'SESSION_CLOSED' });
      }

      // f. Find the participant by payload.sub. None: 401 PARTICIPANT_REMOVED.
      const participant = (session.participants || []).find(
        (p) => p && p.id === sub
      );
      if (!participant) {
        return res.status(401).json({
          message: 'You are no longer part of this table',
          code: 'PARTICIPANT_REMOVED',
        });
      }

      if (participant.status === 'pending') {
        // Expired pending requests are removed and told PARTICIPANT_REMOVED
        if (isPendingExpired(participant, now)) {
          await TableSession.updateOne(
            { _id: session._id, status: 'open' },
            { $pull: { participants: { id: participant.id, status: 'pending' } } }
          );
          return res.status(401).json({
            message: 'You are no longer part of this table',
            code: 'PARTICIPANT_REMOVED',
          });
        }
        if (!allowPending) {
          return res.status(403).json({
            message: 'Waiting for approval',
            code: 'APPROVAL_PENDING',
          });
        }
      }

      // g. Touch the session: at most one write a minute
      const sixtySecondsAgo = new Date(now.getTime() - 60 * 1000);
      await TableSession.updateOne(
        { _id: session._id, lastActivityAt: { $lt: sixtySecondsAgo } },
        { $set: { lastActivityAt: now } }
      );

      // h. Set req.guest context
      req.guest = {
        sessionId: String(session._id),
        restaurantId: String(session.restaurantId),
        tableId: String(session.tableId),
        session,
        participant,
      };

      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Ensures that the authenticated participant is the approved host of the session.
 */
export const requireHost = (req, res, next) => {
  if (
    !req.guest ||
    !canManageGuests(req.guest.session, req.guest.participant?.id)
  ) {
    return res
      .status(403)
      .json({ message: 'Only the host can do this', code: 'NOT_HOST' });
  }
  next();
};

/**
 * Ensures that the authenticated participant has declared their allergies before ordering or viewing personalized menu.
 */
export const requireAllergiesDeclared = (req, res, next) => {
  // Viva note: "no answer" must never be read as "no allergies".
  if (!req.guest || req.guest.participant?.allergiesDeclared !== true) {
    return res.status(403).json({
      message: 'Please tell us about any allergies first',
      code: 'ALLERGIES_REQUIRED',
    });
  }
  next();
};
