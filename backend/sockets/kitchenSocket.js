// kitchenSocket.js: live connection authentication and room assignment for kitchen/owner staff
import mongoose from 'mongoose';
import User from '../models/User.js';
import { verifyToken } from '../utils/generateToken.js';
import { KITCHEN_NAMESPACE, kitchenRoomFor, staffSocketAccess } from '../utils/orderRules.js';

export function registerKitchenSocket(io) {
  const kitchenNsp = io.of(KITCHEN_NAMESPACE);

  kitchenNsp.use(async (socket, next) => {
    try {
      const token = socket.handshake?.auth?.token;
      if (!token || typeof token !== 'string' || token.trim() === '') {
        return next(new Error('unauthorised'));
      }

      let payload;
      try {
        payload = verifyToken(token);
      } catch (err) {
        if (
          err &&
          (err.code === 'JWT_SECRET_INVALID' ||
            (typeof err.message === 'string' &&
              (err.message.includes('JWT_SECRET_INVALID') || err.message.includes('JWT_SECRET'))))
        ) {
          console.error('[maitred] kitchen connection refused: server misconfigured');
        }
        return next(new Error('unauthorised'));
      }

      const sub = payload?.sub;
      if (!sub || !mongoose.isObjectIdOrHexString(sub)) {
        return next(new Error('unauthorised'));
      }

      const user = await User.findById(sub).select('role restaurantId').lean();
      const access = staffSocketAccess(user);
      if (!access || !access.allowed) {
        return next(new Error('unauthorised'));
      }

      const room = kitchenRoomFor(user.restaurantId);
      if (!room) {
        return next(new Error('unauthorised'));
      }

      socket.data = socket.data || {};
      socket.data.userId = String(sub);
      socket.data.restaurantId = String(user.restaurantId);
      socket.data.role = user.role;

      await socket.join(room);
      return next();
    } catch {
      return next(new Error('unauthorised'));
    }
  });

  kitchenNsp.on('connection', (_socket) => {
    // Receive-only: register NO handler for anything a client sends
  });
}
