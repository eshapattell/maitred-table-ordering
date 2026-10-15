// realtime.js: Live notification plumbing for Socket.io
import { LIVE_EVENTS, roomFor, cartPing } from './liveRules.js';
import { KITCHEN_NAMESPACE, ORDER_EVENTS, kitchenRoomFor } from './orderRules.js';

let currentIo = null;

export const realtime = {
  init(io) {
    currentIo = io;
  },

  sessionChanged(sessionId) {
    if (!currentIo) return;
    const room = roomFor(sessionId);
    if (!room) return;
    try {
      currentIo.to(room).emit(LIVE_EVENTS.SESSION_CHANGED, {});
    } catch {
      // Silent no-op: failure to notify must never fail a request and must log nothing
    }
  },

  cartChanged(sessionId, version) {
    if (!currentIo) return;
    const room = roomFor(sessionId);
    if (!room) return;
    try {
      currentIo.to(room).emit(LIVE_EVENTS.CART_CHANGED, cartPing({ cartVersion: version }));
    } catch {
      // Silent no-op: failure to notify must never fail a request and must log nothing
    }
  },

  ordersChanged(restaurantId) {
    if (!currentIo) return;
    const room = kitchenRoomFor(restaurantId);
    if (!room) return;
    try {
      currentIo.of(KITCHEN_NAMESPACE).to(room).emit(ORDER_EVENTS.ORDERS_CHANGED, {});
    } catch {
      // Silent no-op: failure to notify must never fail a request and must log nothing
    }
  },
};
