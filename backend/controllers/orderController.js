// orderController.js: Controller for placing table orders and managing placed items
import crypto from 'crypto';
import mongoose from 'mongoose';
import Table from '../models/Table.js';
import TableSession from '../models/TableSession.js';
import MenuItem from '../models/MenuItem.js';
import Order from '../models/Order.js';
import {
  isValidOrderId,
  isValidOrderItemId,
  validateExpectedVersion,
  classifyCartLines,
  placementSummary,
  freezeOrderItem,
  tableAllergiesOf,
  placedItemsOf,
} from '../utils/orderRules.js';
import { loadCartView } from './cartController.js';
import { realtime } from '../utils/realtime.js';
import { orderHistoryView } from '../utils/orderHistory.js';

class PlacementConflict extends Error {
  constructor() {
    super('PlacementConflict');
    this.name = 'PlacementConflict';
  }
}

/**
 * POST /api/sessions/orders
 * Places the table's order atomically: pulls ready lines from cart, creates Order, increments cartVersion.
 */
export const placeOrder = async (req, res, next) => {
  try {
    const versionValidation = validateExpectedVersion(req.body);
    if (!versionValidation.ok) {
      return res.status(400).json({
        message: versionValidation.message,
        code: 'INVALID_INPUT',
      });
    }
    const { expectedVersion } = versionValidation;

    // 4a. Read the session fresh
    const session = await TableSession.findById(req.guest.sessionId).lean();
    if (!session || session.status !== 'open') {
      return res.status(401).json({
        message: 'This table session has ended',
        code: 'SESSION_CLOSED',
      });
    }
    const host = (session.participants || []).find(
      (p) =>
        p &&
        p.id === req.guest.participant.id &&
        p.status === 'approved' &&
        p.role === 'host'
    );
    if (!host) {
      return res.status(401).json({
        message: 'You have been removed from this table',
        code: 'PARTICIPANT_REMOVED',
      });
    }

    // 4b. Version check
    if (session.cartVersion !== expectedVersion) {
      return res.status(409).json({
        message: 'The order just changed. Please check it and press Place order again',
        code: 'CART_CHANGED',
      });
    }

    // 4c. Load dishes without filtering on available or archived
    const cartItemIds = (session.cart || []).map((l) => l.itemId);
    const items = await MenuItem.find({
      _id: { $in: cartItemIds },
      restaurantId: session.restaurantId,
    }).lean();

    const { ready, left } = classifyCartLines({ session, items });

    // 4d. No ready lines
    if (ready.length === 0) {
      return res.status(409).json({
        message: 'Nothing in the cart can be ordered right now',
        code: 'NOTHING_TO_ORDER',
        left,
      });
    }

    // 4e. Table number
    const table = await Table.findById(session.tableId).select('number').lean();
    const tableNumber = table?.number ?? session.tableNumber ?? null;

    // 4f. Freeze order items and snapshot table allergies
    const frozenItems = ready.map((r) =>
      freezeOrderItem({ ...r, orderItemId: crypto.randomUUID() })
    );
    const tableAllergies = tableAllergiesOf(session);
    const readyCartItemIds = ready.map((r) => r.line.cartItemId);

    // 4g. One transaction so both writes happen or neither
    const s = await mongoose.startSession();
    try {
      await s.withTransaction(async () => {
        const updateResult = await TableSession.updateOne(
          {
            _id: session._id,
            status: 'open',
            cartVersion: expectedVersion,
            participants: {
              $elemMatch: {
                id: req.guest.participant.id,
                status: 'approved',
                role: 'host',
              },
            },
          },
          {
            $pull: {
              cart: { cartItemId: { $in: readyCartItemIds } },
            },
            $inc: { cartVersion: 1 },
          },
          { session: s }
        );

        if (updateResult.matchedCount !== 1) {
          throw new PlacementConflict();
        }

        await Order.create(
          [
            {
              sessionId: session._id,
              restaurantId: session.restaurantId,
              tableNumber,
              items: frozenItems,
              tableAllergies,
            },
          ],
          { session: s }
        );
      });
    } catch (err) {
      if (err instanceof PlacementConflict || err.name === 'PlacementConflict') {
        const conflictSession = await TableSession.findById(session._id).lean();
        if (!conflictSession || conflictSession.status !== 'open') {
          return res.status(401).json({
            message: 'This table session has ended',
            code: 'SESSION_CLOSED',
          });
        }
        const conflictHost = (conflictSession.participants || []).find(
          (p) =>
            p &&
            p.id === req.guest.participant.id &&
            p.status === 'approved' &&
            p.role === 'host'
        );
        if (!conflictHost) {
          return res.status(401).json({
            message: 'You have been removed from this table',
            code: 'PARTICIPANT_REMOVED',
          });
        }
        return res.status(409).json({
          message: 'The order just changed. Please check it and press Place order again',
          code: 'CART_CHANGED',
        });
      }
      return next(err);
    } finally {
      await s.endSession();
    }

    // 4h. Notifications and response
    const newCartVersion = expectedVersion + 1;
    realtime.cartChanged(req.guest.sessionId, newCartVersion);
    realtime.ordersChanged(session.restaurantId);

    const cartViewResult = await loadCartView(
      session._id,
      req.guest.participant.id,
      session.restaurantId
    );

    return res.status(201).json({
      placed: frozenItems.length,
      left,
      summary: placementSummary(left),
      cart: cartViewResult.cart,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/sessions/orders/placed
 * Returns placed dishes for this session that can still be cancelled.
 */
export const getPlacedOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({
      sessionId: req.guest.sessionId,
      'items.status': 'placed',
    })
      .sort({ createdAt: 1 })
      .lean();

    return res.status(200).json({ items: placedItemsOf(orders) });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/sessions/orders/:orderId/items/:orderItemId/cancel
 * Cancels a placed dish on behalf of the host.
 */
export const cancelOrderItem = async (req, res, next) => {
  try {
    const { orderId, orderItemId } = req.params;
    if (!isValidOrderId(orderId) || !isValidOrderItemId(orderItemId)) {
      return res.status(400).json({
        message: 'Invalid order ID or item ID',
        code: 'INVALID_INPUT',
      });
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const updateResult = await Order.updateOne(
        {
          _id: orderId,
          sessionId: req.guest.sessionId,
          items: { $elemMatch: { orderItemId, status: 'placed' } },
        },
        {
          $set: { 'items.$[it].status': 'cancelled' },
        },
        {
          arrayFilters: [{ 'it.orderItemId': orderItemId, 'it.status': 'placed' }],
        }
      );

      if (updateResult.matchedCount === 1) {
        realtime.ordersChanged(req.guest.restaurantId);
        realtime.sessionChanged(req.guest.sessionId);
        return res.status(200).json({ cancelled: true });
      }

      // Re-read order to determine reason for mismatch
      const order = await Order.findOne({
        _id: orderId,
        sessionId: req.guest.sessionId,
      }).lean();

      if (!order) {
        return res.status(404).json({
          message: 'Order item not found',
          code: 'ORDER_ITEM_NOT_FOUND',
        });
      }

      const item = (order.items || []).find((i) => i && i.orderItemId === orderItemId);
      if (!item) {
        return res.status(404).json({
          message: 'Order item not found',
          code: 'ORDER_ITEM_NOT_FOUND',
        });
      }

      if (item.status !== 'placed') {
        return res.status(409).json({
          message: 'The kitchen has already started this dish',
          code: 'ALREADY_STARTED',
        });
      }

      // Otherwise retry (matchedCount was 0 despite status === 'placed')
    }

    return res.status(503).json({
      message: 'Please try again',
      code: 'TRY_AGAIN',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/sessions/orders
 * Returns what has been ordered at the caller's table, mapped through orderHistoryView.
 */
export const listTableOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ sessionId: req.guest.sessionId })
      .sort({ createdAt: 1 })
      .lean();

    return res.status(200).json(orderHistoryView(orders));
  } catch (err) {
    next(err);
  }
};
