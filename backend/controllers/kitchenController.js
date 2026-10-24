// kitchenController.js: Kitchen order board and item status management in maitred
import Order from '../models/Order.js';
import {
  ACTIVE_STATUSES,
  isActiveOrder,
  kitchenOrderView,
  validateStatusInput,
  canMoveStatus,
  isValidOrderId,
  isValidOrderItemId,
  ITEM_STATUSES,
} from '../utils/orderRules.js';
import { realtime } from '../utils/realtime.js';

/**
 * GET /api/orders
 * Reads every active order in the caller's restaurant, maps with kitchenOrderView, and returns 200 { orders }.
 */
export const getActiveOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({
      restaurantId: req.user.restaurantId,
      'items.status': { $in: ACTIVE_STATUSES },
    })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();

    const activeOrders = orders.filter(isActiveOrder).map(kitchenOrderView);

    return res.status(200).json({ orders: activeOrders });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/orders/:orderId/items/:orderItemId/status
 * Moves a dish forward one step or cancels it while placed.
 */
export const updateOrderItemStatus = async (req, res, next) => {
  try {
    const { orderId, orderItemId } = req.params;
    if (!isValidOrderId(orderId) || !isValidOrderItemId(orderItemId)) {
      return res.status(400).json({
        message: 'Invalid order ID or item ID',
        code: 'INVALID_INPUT',
      });
    }

    const validation = validateStatusInput(req.body);
    if (!validation.ok) {
      return res.status(400).json({
        message: validation.message,
        code: 'INVALID_INPUT',
      });
    }
    const targetStatus = validation.status;

    // Allowed starting statuses per pure rules
    const allowedFrom = ITEM_STATUSES.filter((from) => canMoveStatus(from, targetStatus));

    const MAX_ATTEMPTS = 3;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const updateResult = await Order.updateOne(
        {
          _id: orderId,
          restaurantId: req.user.restaurantId,
          items: {
            $elemMatch: {
              orderItemId,
              status: { $in: allowedFrom },
            },
          },
        },
        {
          $set: { 'items.$[it].status': targetStatus },
        },
        {
          arrayFilters: [
            {
              'it.orderItemId': orderItemId,
              'it.status': { $in: allowedFrom },
            },
          ],
        }
      );

      if (updateResult.matchedCount === 1) {
        realtime.ordersChanged(req.user.restaurantId);
        const reloaded = await Order.findById(orderId).lean();
        if (targetStatus === 'cancelled' && reloaded?.sessionId) {
          realtime.sessionChanged(reloaded.sessionId);
        }
        return res.status(200).json({ order: kitchenOrderView(reloaded) });
      }

      // Read order to determine reason for mismatch
      const order = await Order.findOne({
        _id: orderId,
        restaurantId: req.user.restaurantId,
      }).lean();

      if (!order) {
        return res.status(404).json({
          message: 'Order not found',
          code: 'ORDER_NOT_FOUND',
        });
      }

      const item = (order.items || []).find((i) => i && i.orderItemId === orderItemId);
      if (!item) {
        return res.status(404).json({
          message: 'Order not found',
          code: 'ORDER_NOT_FOUND',
        });
      }

      if (!canMoveStatus(item.status, targetStatus)) {
        return res.status(409).json({
          message: `This dish cannot move from ${item.status} to ${targetStatus}`,
          code: 'INVALID_MOVE',
          current: item.status,
        });
      }

      // Otherwise retry (matchedCount was 0 despite status being in allowedFrom)
    }

    return res.status(503).json({
      message: 'Please try again',
      code: 'TRY_AGAIN',
    });
  } catch (err) {
    next(err);
  }
};
