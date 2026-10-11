// sessionController.js: Table session lifecycle, phone join, guest approval, allergies and menu
import crypto from 'crypto';
import mongoose from 'mongoose';
import Table from '../models/Table.js';
import TableSession from '../models/TableSession.js';
import MenuItem from '../models/MenuItem.js';
import { normalisePhone, maskPhone } from '../utils/phone.js';
import {
  SESSION_LIMITS,
  isPendingExpired,
  decideJoin,
  sanitiseNickname,
  selfParticipant,
  staffParticipant,
  pickNewHost,
  visibleParticipantsFor,
} from '../utils/sessionRules.js';
import { generateGuestToken } from '../utils/generateToken.js';
import {
  KNOWN_ALLERGENS,
  normaliseAllergen,
  normaliseAllergies,
  checkItemSafety,
} from '../utils/allergyFilter.js';
import { publicMenuItem } from './menuController.js';

/**
 * Closes an active table session atomically and erases all guest phone numbers.
 * Safe to call twice (returns false if the session was already closed or not found).
 *
 * Viva note / Data protection: Erasing phone numbers when a session ends satisfies
 * data minimization under India's DPDP Act: numbers exist in the database only while
 * the table is actively occupied.
 *
 * @param {string|mongoose.Types.ObjectId} sessionId
 * @param {string} reason - One of 'reset', 'rejected', 'timeout', 'table-removed'
 * @param {Date} [now=new Date()]
 * @returns {Promise<boolean>} True if a session was closed, false otherwise
 */
export const closeSession = async (sessionId, reason, now = new Date()) => {
  const result = await TableSession.updateOne(
    { _id: sessionId, status: 'open' },
    {
      $set: {
        status: 'closed',
        closedAt: now,
        closedReason: reason,
        'participants.$[].phone': null,
      },
    }
  );
  return result.modifiedCount > 0;
};

/**
 * Public join endpoint: guest scans table QR, provides mobile number and nickname.
 * First guest becomes host; subsequent guests wait as pending until approved.
 */
export const joinSession = async (req, res, next) => {
  try {
    const { restaurantId, tableNumber, qrToken, phone, nickname } = req.body || {};

    if (!restaurantId || !mongoose.isObjectIdOrHexString(restaurantId)) {
      return res.status(400).json({ message: 'Invalid restaurantId', code: 'INVALID_INPUT' });
    }
    if (typeof tableNumber !== 'number' || !Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > 500) {
      return res.status(400).json({ message: 'Invalid tableNumber', code: 'INVALID_INPUT' });
    }
    if (typeof qrToken !== 'string' || !/^[0-9a-f]{32}$/.test(qrToken)) {
      return res.status(400).json({ message: 'Invalid qrToken', code: 'INVALID_INPUT' });
    }
    const normalisedPhone = normalisePhone(phone);
    if (!normalisedPhone) {
      return res.status(400).json({ message: 'Please enter a valid Indian mobile number', code: 'INVALID_INPUT' });
    }
    const cleanedNickname = sanitiseNickname(nickname);
    if (!cleanedNickname) {
      return res.status(400).json({ message: 'Invalid nickname', code: 'INVALID_INPUT' });
    }

    const table = await Table.findOne({ restaurantId, number: tableNumber, qrToken }).lean();
    if (!table) {
      return res.status(404).json({ message: 'This table link is not valid', code: 'TABLE_NOT_FOUND' });
    }

    const phoneActiveElsewhere = await TableSession.exists({
      status: 'open',
      'participants.phone': normalisedPhone,
      tableId: { $ne: table._id },
    });
    if (phoneActiveElsewhere) {
      return res.status(409).json({
        code: 'PHONE_ACTIVE_ELSEWHERE',
        message: 'This number is already seated at another table',
      });
    }

    // Viva note: decide and write, looking at fresh data each time. If another request changes
    // the table between our read and our write, our conditional write matches nothing or hits a
    // unique index. We then simply look again (at most 3 times) instead of guessing.
    const MAX_ATTEMPTS = 3;
    let joined = null; // { sessionId, participant }
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !joined; attempt++) {
      const now = new Date();
      const session = await TableSession.findOne({ tableId: table._id, status: 'open' }).lean();
      const decision = decideJoin({ session, now, phone: normalisedPhone });

      if (decision.outcome === 'already-joined') {
        return res.status(409).json({
          code: 'ALREADY_JOINED',
          message: 'This number has already joined this table. Ask the host or staff to remove the old entry.',
        });
      }
      if (decision.outcome === 'full') {
        return res.status(409).json({ code: 'TABLE_FULL', message: 'This table is full' });
      }

      if (decision.outcome === 'create' || decision.outcome === 'replace-idle') {
        if (decision.outcome === 'replace-idle') {
          await closeSession(session._id, 'timeout', now);
        }
        const host = {
          id: crypto.randomUUID(),
          nickname: cleanedNickname,
          phone: normalisedPhone,
          role: 'host',
          status: 'approved',
          allergiesDeclared: false,
          joinedAt: now,
        };
        try {
          const created = await TableSession.create({
            tableId: table._id,
            restaurantId: table.restaurantId,
            status: 'open',
            hostId: host.id,
            lastActivityAt: now,
            participants: [host],
          });
          joined = { sessionId: created._id, participant: host };
        } catch (err) {
          if (err && err.code === 11000 && err.keyPattern && err.keyPattern['participants.phone']) {
            return res.status(409).json({
              code: 'PHONE_ACTIVE_ELSEWHERE',
              message: 'This number is already seated at another table',
            });
          }
          if (err && err.code === 11000 && err.keyPattern && err.keyPattern.tableId) {
            continue; // someone created the session a moment earlier: decide again
          }
          return next(err);
        }
      } else {
        // outcome "pending"
        if (decision.expiredIds && decision.expiredIds.length > 0) {
          await TableSession.updateOne(
            { _id: session._id, status: 'open' },
            { $pull: { participants: { id: { $in: decision.expiredIds }, status: 'pending' } } }
          );
        }
        const guest = {
          id: crypto.randomUUID(),
          nickname: cleanedNickname,
          phone: normalisedPhone,
          role: 'guest',
          status: 'pending',
          allergiesDeclared: false,
          joinedAt: now,
        };
        let update;
        try {
          update = await TableSession.updateOne(
            {
              _id: session._id,
              status: 'open',
              'participants.phone': { $ne: normalisedPhone },
              $expr: { $lt: [{ $size: '$participants' }, SESSION_LIMITS.maxParticipants] },
            },
            { $push: { participants: guest }, $set: { lastActivityAt: now } }
          );
        } catch (err) {
          if (err && err.code === 11000 && err.keyPattern && err.keyPattern['participants.phone']) {
            return res.status(409).json({
              code: 'PHONE_ACTIVE_ELSEWHERE',
              message: 'This number is already seated at another table',
            });
          }
          return next(err);
        }
        if (update.matchedCount > 0) {
          joined = { sessionId: session._id, participant: guest };
        }
        // otherwise the session changed under us (closed, full, or this number just appeared): decide again
      }
    }

    if (!joined) {
      return res.status(503).json({ message: 'Please try again in a moment', code: 'TRY_AGAIN' });
    }

    // Join-side half of the table-delete race fix
    const tableStillExists = await Table.exists({ _id: table._id });
    if (!tableStillExists) {
      await closeSession(joined.sessionId, 'table-removed', new Date());
      return res.status(404).json({ message: 'This table link is not valid', code: 'TABLE_NOT_FOUND' });
    }

    const token = generateGuestToken({
      sessionId: String(joined.sessionId),
      participantId: String(joined.participant.id),
    });
    return res.status(201).json({
      token,
      participant: selfParticipant(joined.participant),
      session: { id: String(joined.sessionId), tableNumber: table.number, status: 'open' },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Returns current table session details, self status, approved diners, and pending requests.
 */
export const getMySession = async (req, res, next) => {
  try {
    const table = await Table.findById(req.guest.tableId).select('number').lean();
    const visible = visibleParticipantsFor(
      req.guest.session,
      req.guest.participant.id,
      new Date()
    );

    res.status(200).json({
      session: {
        id: req.guest.sessionId,
        tableNumber: table ? table.number : null,
        status: req.guest.session.status,
      },
      me: selfParticipant(req.guest.participant),
      participants: visible.approved,
      pending: visible.pending,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Sets dietary allergens for the authenticated guest and marks allergiesDeclared as true.
 */
export const declareAllergies = async (req, res, next) => {
  try {
    const { allergies } = req.body || {};

    if (!allergies || !Array.isArray(allergies)) {
      return res.status(400).json({
        message: 'Allergies must be an array',
        code: 'INVALID_INPUT',
      });
    }

    if (allergies.length > 10) {
      return res.status(400).json({
        message: 'Cannot specify more than 10 allergies',
        code: 'INVALID_INPUT',
      });
    }

    for (let i = 0; i < allergies.length; i++) {
      const item = allergies[i];
      if (typeof item !== 'string') {
        return res.status(400).json({
          message: 'Allergy entries must be strings',
          code: 'INVALID_INPUT',
        });
      }
      const norm = normaliseAllergen(item);
      if (!KNOWN_ALLERGENS.includes(norm)) {
        return res.status(400).json({
          message: 'Unknown allergen',
          code: 'INVALID_INPUT',
        });
      }
    }

    const storedAllergies = normaliseAllergies(allergies);

    const updateResult = await TableSession.updateOne(
      { _id: req.guest.sessionId, status: 'open' },
      {
        $set: {
          'participants.$[p].allergies': storedAllergies,
          'participants.$[p].allergiesDeclared': true,
        },
      },
      { arrayFilters: [{ 'p.id': req.guest.participant.id }] }
    );

    if (updateResult.matchedCount === 0) {
      return res.status(401).json({
        message: 'This table session has ended',
        code: 'SESSION_CLOSED',
      });
    }

    const updatedParticipant = {
      ...req.guest.participant,
      allergies: storedAllergies,
      allergiesDeclared: true,
    };

    res.status(200).json({
      me: selfParticipant(updatedParticipant),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Returns available dishes for the restaurant with server-evaluated allergy safety flags.
 */
export const getGuestMenu = async (req, res, next) => {
  try {
    const items = await MenuItem.find({
      restaurantId: req.guest.restaurantId,
      available: true,
    })
      .sort({ category: 1, name: 1 })
      .lean();

    // Viva note: The browser must display exactly this server-computed safety flag
    // and must never evaluate allergy safety on the client side.
    const guestAllergies = req.guest.participant.allergies || [];
    const processedItems = items.map((item) => {
      const safety = checkItemSafety(guestAllergies, item);
      return {
        ...publicMenuItem(item),
        safe: safety.safe,
        clashes: safety.clashes,
        reason: safety.reason,
      };
    });

    res.status(200).json({ items: processedItems });
  } catch (err) {
    next(err);
  }
};

/**
 * Approves a pending participant request to join the table.
 */
export const approveGuest = async (req, res, next) => {
  try {
    const { participantId } = req.params;

    const target = (req.guest.session.participants || []).find(
      (p) => p && p.id === participantId
    );
    if (!target || target.status !== 'pending' || isPendingExpired(target, new Date())) {
      return res.status(404).json({
        message: 'No such request',
        code: 'NOT_FOUND',
      });
    }

    const result = await TableSession.updateOne(
      { _id: req.guest.sessionId, status: 'open' },
      { $set: { 'participants.$[p].status': 'approved' } },
      { arrayFilters: [{ 'p.id': participantId, 'p.status': 'pending' }] }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        message: 'No such request',
        code: 'NOT_FOUND',
      });
    }

    const updatedSession = await TableSession.findById(req.guest.sessionId).lean();
    const table = await Table.findById(req.guest.tableId).select('number').lean();
    const visible = visibleParticipantsFor(
      updatedSession,
      req.guest.participant.id,
      new Date()
    );

    res.status(200).json({
      session: {
        id: req.guest.sessionId,
        tableNumber: table ? table.number : null,
        status: updatedSession.status,
      },
      me: selfParticipant(req.guest.participant),
      participants: visible.approved,
      pending: visible.pending,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Rejects and removes a pending participant request from the table session.
 */
export const rejectGuest = async (req, res, next) => {
  try {
    const { participantId } = req.params;

    const result = await TableSession.updateOne(
      {
        _id: req.guest.sessionId,
        status: 'open',
        participants: { $elemMatch: { id: participantId, status: 'pending' } },
      },
      { $pull: { participants: { id: participantId, status: 'pending' } } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        message: 'No such request',
        code: 'NOT_FOUND',
      });
    }

    const updatedSession = await TableSession.findById(req.guest.sessionId).lean();
    const table = await Table.findById(req.guest.tableId).select('number').lean();
    const visible = visibleParticipantsFor(
      updatedSession,
      req.guest.participant.id,
      new Date()
    );

    res.status(200).json({
      session: {
        id: req.guest.sessionId,
        tableNumber: table ? table.number : null,
        status: updatedSession.status,
      },
      me: selfParticipant(req.guest.participant),
      participants: visible.approved,
      pending: visible.pending,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Helper: formats a table session document for staff view.
 * Excludes expired pending requests and masks all phone numbers.
 *
 * @param {object} session
 * @param {number|null} tableNumber
 * @param {Date} [now=new Date()]
 * @returns {object}
 */
export const formatStaffSession = (session, tableNumber, now = new Date()) => {
  const lastTime = session.lastActivityAt
    ? new Date(session.lastActivityAt).getTime()
    : new Date(session.createdAt).getTime();
  const idleMs = Number.isFinite(lastTime) ? Math.max(0, now.getTime() - lastTime) : 0;
  const idleMinutes = Math.floor(idleMs / (60 * 1000));

  const liveParticipants = (session.participants || []).filter((p) => {
    if (!p || typeof p !== 'object') return false;
    if (p.status === 'approved') return true;
    if (p.status === 'pending' && !isPendingExpired(p, now)) return true;
    return false;
  });

  const pendingParticipants = liveParticipants.filter((p) => p.status === 'pending');
  const hostParticipant =
    liveParticipants.find((p) => p.id === session.hostId && p.role === 'host') ||
    liveParticipants.find((p) => p.role === 'host' && p.status === 'approved');

  return {
    id: String(session._id),
    tableNumber: typeof tableNumber === 'number' ? tableNumber : null,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    idleMinutes,
    participantCount: liveParticipants.length,
    pendingCount: pendingParticipants.length,
    host: hostParticipant
      ? { nickname: hostParticipant.nickname, maskedPhone: maskPhone(hostParticipant.phone) }
      : null,
    participants: liveParticipants.map(staffParticipant),
  };
};

/**
 * GET /api/sessions/staff/active
 * Lists all open sessions for the authenticated staff user's restaurant, sorted by table number.
 */
export const getActiveStaffSessions = async (req, res, next) => {
  try {
    const restaurantId = req.user.restaurantId;

    // One query for the sessions, one query for the table numbers
    const sessions = await TableSession.find({
      restaurantId,
      status: 'open',
    }).lean();

    const tableIds = sessions.map((s) => s.tableId);
    const tables = await Table.find({
      _id: { $in: tableIds },
      restaurantId,
    })
      .select('_id number')
      .lean();

    const tableMap = new Map(tables.map((t) => [String(t._id), t.number]));
    const now = new Date();

    const formattedSessions = sessions
      .map((session) => {
        const tableNumber = tableMap.get(String(session.tableId)) ?? null;
        return formatStaffSession(session, tableNumber, now);
      })
      .sort((a, b) => (a.tableNumber ?? 0) - (b.tableNumber ?? 0));

    res.status(200).json({ sessions: formattedSessions });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/sessions/staff/:sessionId/close
 * Resets or rejects an open table session, freeing the table and erasing guest phone numbers.
 */
export const closeStaffSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { reason } = req.body || {};

    if (!mongoose.isObjectIdOrHexString(sessionId)) {
      return res.status(404).json({ message: 'Session not found', code: 'NOT_FOUND' });
    }

    if (typeof reason !== 'string' || (reason !== 'reset' && reason !== 'rejected')) {
      return res.status(400).json({ message: 'Invalid reason', code: 'INVALID_INPUT' });
    }

    const session = await TableSession.findOne({
      _id: sessionId,
      restaurantId: req.user.restaurantId,
      status: 'open',
    }).lean();

    if (!session) {
      return res.status(404).json({ message: 'Session not found', code: 'NOT_FOUND' });
    }

    const closed = await closeSession(session._id, reason);
    if (!closed) {
      return res.status(404).json({ message: 'Session not found', code: 'NOT_FOUND' });
    }

    if (reason === 'reset') {
      return res.status(200).json({ message: 'Table reset' });
    }
    return res.status(200).json({ message: 'Session rejected' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/sessions/staff/:sessionId/participants/:participantId/approve
 * Approves a pending participant request even if the host is away.
 */
export const approveStaffParticipant = async (req, res, next) => {
  try {
    const { sessionId, participantId } = req.params;

    if (!mongoose.isObjectIdOrHexString(sessionId)) {
      return res.status(404).json({ message: 'Session not found', code: 'NOT_FOUND' });
    }

    const session = await TableSession.findOne({
      _id: sessionId,
      restaurantId: req.user.restaurantId,
      status: 'open',
    }).lean();

    if (!session) {
      return res.status(404).json({ message: 'Session not found', code: 'NOT_FOUND' });
    }

    const target = (session.participants || []).find((p) => p && p.id === participantId);
    if (!target || target.status !== 'pending' || isPendingExpired(target, new Date())) {
      return res.status(404).json({ message: 'No such request', code: 'NOT_FOUND' });
    }

    const result = await TableSession.updateOne(
      { _id: session._id, restaurantId: req.user.restaurantId, status: 'open' },
      { $set: { 'participants.$[p].status': 'approved' } },
      { arrayFilters: [{ 'p.id': participantId, 'p.status': 'pending' }] }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: 'No such request', code: 'NOT_FOUND' });
    }

    const updated = await TableSession.findById(session._id).lean();
    const table = await Table.findById(updated.tableId).select('number').lean();
    const tableNumber = table ? table.number : null;

    res.status(200).json(formatStaffSession(updated, tableNumber));
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/sessions/staff/:sessionId/participants/:participantId/remove
 * Removes any participant (pending, approved, or host) from the session.
 */
export const removeStaffParticipant = async (req, res, next) => {
  try {
    const { sessionId, participantId } = req.params;

    if (!mongoose.isObjectIdOrHexString(sessionId)) {
      return res.status(404).json({ message: 'Session not found', code: 'NOT_FOUND' });
    }

    // a. Read the open session scoped to the restaurant; participant must exist in it
    const session = await TableSession.findOne({
      _id: sessionId,
      restaurantId: req.user.restaurantId,
      status: 'open',
    }).lean();

    if (!session) {
      return res.status(404).json({ message: 'Session not found', code: 'NOT_FOUND' });
    }

    const target = (session.participants || []).find((p) => p && p.id === participantId);
    if (!target) {
      return res.status(404).json({ message: 'Participant not found', code: 'NOT_FOUND' });
    }

    // b. Pull participant from array; matchedCount 0 is 404
    const pullResult = await TableSession.updateOne(
      {
        _id: session._id,
        restaurantId: req.user.restaurantId,
        status: 'open',
        'participants.id': participantId,
      },
      { $pull: { participants: { id: participantId } } }
    );

    if (pullResult.matchedCount === 0) {
      return res.status(404).json({ message: 'Participant not found', code: 'NOT_FOUND' });
    }

    // c. If removed person was host, promote longest-seated approved guest
    // Viva note: A $pull and a positional $set on the same array cannot be combined in one update,
    // which is why promoting a new host is done as a second step.
    // Include arrayFilters ONLY in an update that uses $[h]; MongoDB rejects an unused array filter.
    const wasHost = target.role === 'host' || session.hostId === participantId;
    if (wasHost) {
      const newHostId = pickNewHost(session.participants, participantId);
      if (newHostId !== null) {
        const promoteResult = await TableSession.updateOne(
          { _id: session._id, restaurantId: req.user.restaurantId, status: 'open' },
          { $set: { hostId: newHostId, 'participants.$[h].role': 'host' } },
          { arrayFilters: [{ 'h.id': newHostId, 'h.status': 'approved' }] }
        );
        if (promoteResult.matchedCount === 0) {
          return res.status(404).json({ message: 'Session not found', code: 'NOT_FOUND' });
        }
      }
    }

    // d. Read the session again. If no APPROVED participant is left, closeSession with 'reset'.
    // Viva note: A session nobody can run (empty or only waiting guests without a host) must
    // not keep a table locked; the next guest to scan becomes host of a fresh one.
    const reread = await TableSession.findById(session._id).lean();
    const hasApproved = reread && (reread.participants || []).some((p) => p && p.status === 'approved');
    if (!hasApproved) {
      await closeSession(session._id, 'reset');
    }

    res.status(200).json({ message: 'Removed' });
  } catch (err) {
    next(err);
  }
};

/**
 * Closes open sessions idle for longer than SESSION_LIMITS.idleMinutes.
 * Logs nothing and returns the number of sessions actually closed.
 *
 * @param {Date} [now=new Date()]
 * @returns {Promise<number>}
 */
export const closeIdleSessions = async (now = new Date()) => {
  const cutoff = new Date(now.getTime() - SESSION_LIMITS.idleMinutes * 60 * 1000);
  const idleSessions = await TableSession.find({
    status: 'open',
    lastActivityAt: { $lt: cutoff },
  })
    .select('_id')
    .lean();

  let closedCount = 0;
  for (const session of idleSessions) {
    const closed = await closeSession(session._id, 'timeout', now);
    if (closed) {
      closedCount += 1;
    }
  }
  return closedCount;
};

/**
 * Starts a recurring background interval that sweeps and closes idle sessions.
 * Returns the unref'd timer object.
 *
 * @param {{ intervalMs?: number, run?: Function }} [options={}]
 * @returns {NodeJS.Timeout}
 */
export const startIdleSweeper = ({
  intervalMs = 10 * 60 * 1000,
  run = closeIdleSessions,
} = {}) => {
  const timer = setInterval(async () => {
    try {
      const closed = await run();
      if (closed > 0) {
        console.error(`[maitred] closed ${closed} idle table session(s)`);
      }
    } catch {
      // Swallows errors so a single database hiccup never stops the sweeper
    }
  }, intervalMs);

  if (timer && typeof timer.unref === 'function') {
    timer.unref();
  }
  return timer;
};
