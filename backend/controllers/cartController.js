// cartController.js: Controller for shared table cart with atomic updates and allergy checks
import crypto from 'crypto';
import mongoose from 'mongoose';
import MenuItem from '../models/MenuItem.js';
import TableSession from '../models/TableSession.js';
import {
  CART_LIMITS,
  isValidCartItemId,
  validateAddInput,
  validateDecreaseInput,
  canEditLine,
  newCartLine,
} from '../utils/cartRules.js';
import { buildCartView } from '../utils/cartView.js';
import { checkItemSafety } from '../utils/allergyFilter.js';
import { realtime } from '../utils/realtime.js';

/**
 * Loads a fresh lean TableSession and MenuItem documents to build the personal cart view.
 *
 * @param {string|mongoose.Types.ObjectId} sessionId
 * @param {string} viewerId
 * @param {string|mongoose.Types.ObjectId} restaurantId
 * @returns {Promise<{ cart?: object, version?: number, status?: number, error?: object }>}
 */
const loadCartView = async (sessionId, viewerId, restaurantId) => {
  const freshSession = await TableSession.findById(sessionId).lean();
  if (!freshSession || freshSession.status !== 'open') {
    return {
      status: 401,
      error: { message: 'This table session has ended', code: 'SESSION_CLOSED' },
    };
  }
  const freshParticipant = (freshSession.participants || []).find(
    (p) => p && p.id === viewerId
  );
  if (!freshParticipant || freshParticipant.status !== 'approved') {
    return {
      status: 401,
      error: { message: 'You have been removed from this table', code: 'PARTICIPANT_REMOVED' },
    };
  }

  const itemIds = (freshSession.cart || []).map((l) => l.itemId);
  const items = await MenuItem.find({
    _id: { $in: itemIds },
    restaurantId,
  }).lean();

  const cart = buildCartView({
    session: freshSession,
    items,
    viewer: freshParticipant,
  });

  return { cart, version: freshSession.cartVersion };
};

/**
 * GET /api/sessions/cart
 * Returns personal view of shared table cart.
 */
export const getCart = async (req, res, next) => {
  try {
    const result = await loadCartView(
      req.guest.sessionId,
      req.guest.participant.id,
      req.guest.restaurantId
    );
    if (result.error) {
      return res.status(result.status).json(result.error);
    }
    return res.status(200).json({ cart: result.cart });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/sessions/cart/items
 * Adds dish quantity to shared cart with atomic allergy check and line/quantity limits.
 */
export const addItem = async (req, res, next) => {
  try {
    const validation = validateAddInput(req.body);
    if (!validation.ok) {
      return res.status(400).json({
        message: validation.message,
        code: 'INVALID_INPUT',
      });
    }

    const { menuItemId, quantity } = validation;
    const itemObjectId = new mongoose.Types.ObjectId(menuItemId);
    const MAX_ATTEMPTS = 3;
    let writeDone = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS && !writeDone; attempt++) {
      // a. Use session and participant that guestAuth loaded on first attempt, re-read on retry
      let session = req.guest.session;
      let me = req.guest.participant;
      if (attempt > 0) {
        session = await TableSession.findById(req.guest.sessionId).lean();
        if (!session || session.status !== 'open') {
          return res.status(401).json({
            message: 'This table session has ended',
            code: 'SESSION_CLOSED',
          });
        }
        me = (session.participants || []).find((p) => p && p.id === req.guest.participant.id);
        if (!me || me.status !== 'approved') {
          return res.status(401).json({
            message: 'You have been removed from this table',
            code: 'PARTICIPANT_REMOVED',
          });
        }
      }

      // b. Find the dish (must be available and belong to this restaurant)
      const dish = await MenuItem.findOne({
        _id: itemObjectId,
        restaurantId: session.restaurantId,
        available: true,
      }).lean();
      if (!dish) {
        return res.status(404).json({
          message: 'This dish is not available',
          code: 'ITEM_NOT_FOUND',
        });
      }

      // c. Check item safety for this guest
      const safety = checkItemSafety(me.allergies, dish);
      if (safety.safe !== true) {
        return res.status(409).json({
          message: 'This dish is not suitable for you',
          code: 'NOT_SAFE',
          reason: safety.reason,
          clashes: safety.clashes || [],
        });
      }

      // d. Guard pinning session status, participant status, declared allergies
      const baseGuard = {
        _id: session._id,
        status: 'open',
        participants: {
          $elemMatch: {
            id: me.id,
            status: 'approved',
            allergiesDeclared: true,
            allergies: me.allergies,
          },
        },
      };

      // e. Increase existing line
      const incFilter = {
        ...baseGuard,
        cart: {
          $elemMatch: {
            itemId: itemObjectId,
            addedBy: me.id,
            isSurprise: { $ne: true },
            qty: { $lte: CART_LIMITS.maxQuantity - quantity },
          },
        },
      };
      const incUpdate = {
        $inc: {
          'cart.$[line].qty': quantity,
          cartVersion: 1,
        },
      };
      const incOptions = {
        arrayFilters: [
          {
            'line.itemId': itemObjectId,
            'line.addedBy': me.id,
            'line.isSurprise': { $ne: true },
          },
        ],
      };

      const incResult = await TableSession.updateOne(incFilter, incUpdate, incOptions);
      if (incResult.matchedCount > 0) {
        writeDone = true;
        break;
      }

      // f. Otherwise create the line
      const pushFilter = {
        ...baseGuard,
        [`cart.${CART_LIMITS.maxLines - 1}`]: { $exists: false },
        cart: {
          $not: {
            $elemMatch: {
              itemId: itemObjectId,
              addedBy: me.id,
              isSurprise: { $ne: true },
            },
          },
        },
      };
      const lineToPush = newCartLine({
        cartItemId: crypto.randomUUID(),
        itemId: menuItemId,
        quantity,
        addedBy: me.id,
      });
      lineToPush.itemId = itemObjectId;

      const pushUpdate = {
        $push: { cart: lineToPush },
        $inc: { cartVersion: 1 },
      };

      const pushResult = await TableSession.updateOne(pushFilter, pushUpdate);
      if (pushResult.matchedCount > 0) {
        writeDone = true;
        break;
      }

      // g. Neither matched: re-read session and decide
      const fresh = await TableSession.findById(session._id).lean();
      if (!fresh || fresh.status !== 'open') {
        return res.status(401).json({
          message: 'This table session has ended',
          code: 'SESSION_CLOSED',
        });
      }
      const freshMe = (fresh.participants || []).find((p) => p && p.id === me.id);
      if (!freshMe || freshMe.status !== 'approved') {
        return res.status(401).json({
          message: 'You have been removed from this table',
          code: 'PARTICIPANT_REMOVED',
        });
      }

      const existingLine = (fresh.cart || []).find(
        (l) => l && String(l.itemId) === String(itemObjectId) && l.addedBy === me.id && l.isSurprise !== true
      );
      if (existingLine && existingLine.qty + quantity > CART_LIMITS.maxQuantity) {
        return res.status(409).json({
          message: `Quantity cannot exceed ${CART_LIMITS.maxQuantity}`,
          code: 'QTY_LIMIT',
        });
      }
      if (!existingLine && (fresh.cart || []).length >= CART_LIMITS.maxLines) {
        return res.status(409).json({
          message: `Cart cannot exceed ${CART_LIMITS.maxLines} lines`,
          code: 'CART_FULL',
        });
      }
      // Otherwise retry up to 3 times
    }

    if (!writeDone) {
      return res.status(503).json({
        message: 'Please try again in a moment',
        code: 'TRY_AGAIN',
      });
    }

    const viewResult = await loadCartView(
      req.guest.sessionId,
      req.guest.participant.id,
      req.guest.restaurantId
    );
    if (viewResult.error) {
      return res.status(viewResult.status).json(viewResult.error);
    }

    realtime.cartChanged(req.guest.sessionId, viewResult.version);
    return res.status(200).json({ cart: viewResult.cart });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/sessions/cart/items/:cartItemId
 * Decreases line quantity by 1 atomically (minimum quantity is 1).
 */
export const decreaseItem = async (req, res, next) => {
  try {
    const { cartItemId } = req.params;
    if (!isValidCartItemId(cartItemId)) {
      return res.status(400).json({
        message: 'Invalid cartItemId',
        code: 'INVALID_INPUT',
      });
    }

    const validation = validateDecreaseInput(req.body);
    if (!validation.ok) {
      return res.status(400).json({
        message: validation.message,
        code: 'INVALID_INPUT',
      });
    }

    const MAX_ATTEMPTS = 3;
    let writeDone = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS && !writeDone; attempt++) {
      let session = req.guest.session;
      let me = req.guest.participant;
      if (attempt > 0) {
        session = await TableSession.findById(req.guest.sessionId).lean();
        if (!session || session.status !== 'open') {
          return res.status(401).json({
            message: 'This table session has ended',
            code: 'SESSION_CLOSED',
          });
        }
        me = (session.participants || []).find((p) => p && p.id === req.guest.participant.id);
        if (!me || me.status !== 'approved') {
          return res.status(401).json({
            message: 'You have been removed from this table',
            code: 'PARTICIPANT_REMOVED',
          });
        }
      }

      const isHost = me.role === 'host';
      const patchFilter = {
        _id: session._id,
        status: 'open',
        participants: {
          $elemMatch: {
            id: me.id,
            status: 'approved',
          },
        },
        cart: {
          $elemMatch: {
            cartItemId,
            isSurprise: { $ne: true },
            qty: { $gt: 1 },
            ...(isHost ? {} : { addedBy: me.id }),
          },
        },
      };

      const patchUpdate = {
        $inc: {
          'cart.$[line].qty': -1,
          cartVersion: 1,
        },
      };
      const patchOptions = {
        arrayFilters: [{ 'line.cartItemId': cartItemId }],
      };

      const result = await TableSession.updateOne(patchFilter, patchUpdate, patchOptions);
      if (result.matchedCount > 0) {
        writeDone = true;
        break;
      }

      // Not matched: re-read and decide
      const fresh = await TableSession.findById(session._id).lean();
      if (!fresh || fresh.status !== 'open') {
        return res.status(401).json({
          message: 'This table session has ended',
          code: 'SESSION_CLOSED',
        });
      }
      const freshMe = (fresh.participants || []).find((p) => p && p.id === me.id);
      if (!freshMe || freshMe.status !== 'approved') {
        return res.status(401).json({
          message: 'You have been removed from this table',
          code: 'PARTICIPANT_REMOVED',
        });
      }

      const line = (fresh.cart || []).find((l) => l && l.cartItemId === cartItemId);
      if (!line || !canEditLine(freshMe, line) || line.isSurprise === true) {
        return res.status(404).json({
          message: 'Cart item not found',
          code: 'CART_ITEM_NOT_FOUND',
        });
      }
      if (line.qty <= 1) {
        return res.status(409).json({
          message: 'Use remove to take the last one off',
          code: 'MIN_QTY',
        });
      }
      // Otherwise retry up to 3 times
    }

    if (!writeDone) {
      return res.status(503).json({
        message: 'Please try again in a moment',
        code: 'TRY_AGAIN',
      });
    }

    const viewResult = await loadCartView(
      req.guest.sessionId,
      req.guest.participant.id,
      req.guest.restaurantId
    );
    if (viewResult.error) {
      return res.status(viewResult.status).json(viewResult.error);
    }

    realtime.cartChanged(req.guest.sessionId, viewResult.version);
    return res.status(200).json({ cart: viewResult.cart });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/sessions/cart/items/:cartItemId
 * Removes a cart line atomically.
 */
export const removeItem = async (req, res, next) => {
  try {
    const { cartItemId } = req.params;
    if (!isValidCartItemId(cartItemId)) {
      return res.status(400).json({
        message: 'Invalid cartItemId',
        code: 'INVALID_INPUT',
      });
    }

    const MAX_ATTEMPTS = 3;
    let writeDone = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS && !writeDone; attempt++) {
      let session = req.guest.session;
      let me = req.guest.participant;
      if (attempt > 0) {
        session = await TableSession.findById(req.guest.sessionId).lean();
        if (!session || session.status !== 'open') {
          return res.status(401).json({
            message: 'This table session has ended',
            code: 'SESSION_CLOSED',
          });
        }
        me = (session.participants || []).find((p) => p && p.id === req.guest.participant.id);
        if (!me || me.status !== 'approved') {
          return res.status(401).json({
            message: 'You have been removed from this table',
            code: 'PARTICIPANT_REMOVED',
          });
        }
      }

      const isHost = me.role === 'host';
      const deleteFilter = {
        _id: session._id,
        status: 'open',
        participants: {
          $elemMatch: {
            id: me.id,
            status: 'approved',
          },
        },
        cart: {
          $elemMatch: {
            cartItemId,
            isSurprise: { $ne: true },
            ...(isHost ? {} : { addedBy: me.id }),
          },
        },
      };

      const deleteUpdate = {
        $pull: { cart: { cartItemId } },
        $inc: { cartVersion: 1 },
      };

      const result = await TableSession.updateOne(deleteFilter, deleteUpdate);
      if (result.matchedCount > 0) {
        writeDone = true;
        break;
      }

      // Not matched: re-read and decide
      const fresh = await TableSession.findById(session._id).lean();
      if (!fresh || fresh.status !== 'open') {
        return res.status(401).json({
          message: 'This table session has ended',
          code: 'SESSION_CLOSED',
        });
      }
      const freshMe = (fresh.participants || []).find((p) => p && p.id === me.id);
      if (!freshMe || freshMe.status !== 'approved') {
        return res.status(401).json({
          message: 'You have been removed from this table',
          code: 'PARTICIPANT_REMOVED',
        });
      }

      const line = (fresh.cart || []).find((l) => l && l.cartItemId === cartItemId);
      if (!line || !canEditLine(freshMe, line) || line.isSurprise === true) {
        return res.status(404).json({
          message: 'Cart item not found',
          code: 'CART_ITEM_NOT_FOUND',
        });
      }
      // Otherwise retry up to 3 times
    }

    if (!writeDone) {
      return res.status(503).json({
        message: 'Please try again in a moment',
        code: 'TRY_AGAIN',
      });
    }

    const viewResult = await loadCartView(
      req.guest.sessionId,
      req.guest.participant.id,
      req.guest.restaurantId
    );
    if (viewResult.error) {
      return res.status(viewResult.status).json(viewResult.error);
    }

    realtime.cartChanged(req.guest.sessionId, viewResult.version);
    return res.status(200).json({ cart: viewResult.cart });
  } catch (err) {
    next(err);
  }
};
