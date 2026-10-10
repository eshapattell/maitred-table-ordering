// sessionController.js: Table session lifecycle, phone join, guest approval, allergies and menu
import crypto from 'crypto';
import mongoose from 'mongoose';
import Table from '../models/Table.js';
import TableSession from '../models/TableSession.js';
import MenuItem from '../models/MenuItem.js';
import { normalisePhone } from '../utils/phone.js';
import {
  SESSION_LIMITS,
  isPendingExpired,
  countedParticipants,
  decideJoin,
  sanitiseNickname,
  selfParticipant,
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

    if (
      typeof tableNumber !== 'number' ||
      !Number.isInteger(tableNumber) ||
      tableNumber < 1 ||
      tableNumber > 500
    ) {
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

    const table = await Table.findOne({
      restaurantId,
      number: tableNumber,
      qrToken,
    }).lean();

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

    let session = await TableSession.findOne({
      tableId: table._id,
      status: 'open',
    }).lean();

    const now = new Date();
    let decision = decideJoin({ session, now, phone: normalisedPhone });

    if (decision.outcome === 'replace-idle') {
      await closeSession(session._id, 'timeout', now);
      session = null;
      decision = { outcome: 'create' };
    }

    let createdSessionId = null;
    let participantResult = null;

    if (decision.outcome === 'already-joined') {
      return res.status(409).json({
        code: 'ALREADY_JOINED',
        message: 'This number has already joined this table. Ask the host or staff to remove the old entry.',
      });
    }

    if (decision.outcome === 'full') {
      return res.status(409).json({
        code: 'TABLE_FULL',
        message: 'This table is full',
      });
    }

    if (decision.outcome === 'create') {
      const participantId = crypto.randomUUID();
      const hostParticipant = {
        id: participantId,
        nickname: cleanedNickname,
        phone: normalisedPhone,
        role: 'host',
        status: 'approved',
        allergiesDeclared: false,
        joinedAt: now,
      };

      try {
        const createdSession = await TableSession.create({
          tableId: table._id,
          restaurantId: table.restaurantId,
          status: 'open',
          hostId: participantId,
          lastActivityAt: now,
          participants: [hostParticipant],
        });
        createdSessionId = createdSession._id;
        participantResult = hostParticipant;
      } catch (err) {
        if (err && err.code === 11000) {
          if (err.keyPattern && err.keyPattern['participants.phone']) {
            return res.status(409).json({
              code: 'PHONE_ACTIVE_ELSEWHERE',
              message: 'This number is already seated at another table',
            });
          }
          if (err.keyPattern && err.keyPattern.tableId) {
            // Someone created the session a moment earlier, reload and handle once as a normal join
            session = await TableSession.findOne({ tableId: table._id, status: 'open' }).lean();
            decision = decideJoin({ session, now, phone: normalisedPhone });
          } else {
            return next(err);
          }
        } else {
          return next(err);
        }
      }
    }

    if (!createdSessionId) {
      if (decision.outcome === 'already-joined') {
        return res.status(409).json({
          code: 'ALREADY_JOINED',
          message: 'This number has already joined this table. Ask the host or staff to remove the old entry.',
        });
      }

      if (decision.outcome === 'full') {
        return res.status(409).json({
          code: 'TABLE_FULL',
          message: 'This table is full',
        });
      }

      if (decision.outcome === 'pending') {
        if (decision.expiredIds && decision.expiredIds.length > 0) {
          await TableSession.updateOne(
            { _id: session._id, status: 'open' },
            { $pull: { participants: { id: { $in: decision.expiredIds }, status: 'pending' } } }
          );
        }

        const participantId = crypto.randomUUID();
        const pendingParticipant = {
          id: participantId,
          nickname: cleanedNickname,
          phone: normalisedPhone,
          role: 'guest',
          status: 'pending',
          allergiesDeclared: false,
          joinedAt: now,
        };

        let updateResult;
        try {
          updateResult = await TableSession.updateOne(
            {
              _id: session._id,
              status: 'open',
              'participants.phone': { $ne: normalisedPhone },
              $expr: { $lt: [{ $size: '$participants' }, SESSION_LIMITS.maxParticipants] },
            },
            {
              $push: { participants: pendingParticipant },
              $set: { lastActivityAt: now },
            }
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

        if (updateResult.matchedCount === 0) {
          const reread = await TableSession.findById(session._id).lean();
          if (!reread || reread.status !== 'open') {
            const newHostId = crypto.randomUUID();
            const newHost = {
              id: newHostId,
              nickname: cleanedNickname,
              phone: normalisedPhone,
              role: 'host',
              status: 'approved',
              allergiesDeclared: false,
              joinedAt: now,
            };
            try {
              const freshSession = await TableSession.create({
                tableId: table._id,
                restaurantId: table.restaurantId,
                status: 'open',
                hostId: newHostId,
                lastActivityAt: now,
                participants: [newHost],
              });
              createdSessionId = freshSession._id;
              participantResult = newHost;
            } catch (createErr) {
              if (createErr && createErr.code === 11000 && createErr.keyPattern && createErr.keyPattern['participants.phone']) {
                return res.status(409).json({
                  code: 'PHONE_ACTIVE_ELSEWHERE',
                  message: 'This number is already seated at another table',
                });
              }
              return next(createErr);
            }
          } else if (
            (reread.participants || []).some(
              (p) => p && p.phone === normalisedPhone && !isPendingExpired(p, now)
            )
          ) {
            return res.status(409).json({
              code: 'ALREADY_JOINED',
              message: 'This number has already joined this table. Ask the host or staff to remove the old entry.',
            });
          } else if (countedParticipants(reread, now) >= SESSION_LIMITS.maxParticipants) {
            return res.status(409).json({
              code: 'TABLE_FULL',
              message: 'This table is full',
            });
          } else {
            return next(new Error('Conditional join update failed unexpectedly'));
          }
        } else {
          createdSessionId = session._id;
          participantResult = pendingParticipant;
        }
      }
    }

    // Join-side half of table delete race fix
    const tableStillExists = await Table.exists({ _id: table._id });
    if (!tableStillExists) {
      if (createdSessionId) {
        await closeSession(createdSessionId, 'table-removed', now);
      }
      return res.status(404).json({
        message: 'This table link is not valid',
        code: 'TABLE_NOT_FOUND',
      });
    }

    const token = generateGuestToken({
      sessionId: String(createdSessionId),
      participantId: String(participantResult.id),
    });

    return res.status(201).json({
      token,
      participant: selfParticipant(participantResult),
      session: {
        id: String(createdSessionId),
        tableNumber: table.number,
        status: 'open',
      },
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

    await TableSession.updateOne(
      { _id: req.guest.sessionId, status: 'open' },
      {
        $set: {
          'participants.$[p].allergies': storedAllergies,
          'participants.$[p].allergiesDeclared': true,
        },
      },
      { arrayFilters: [{ 'p.id': req.guest.participant.id }] }
    );

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
