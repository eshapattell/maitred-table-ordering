// guestSocket.js: live connection authentication and room assignment for guests
import mongoose from 'mongoose';
import TableSession from '../models/TableSession.js';
import { verifyGuestToken } from '../utils/generateToken.js';
import { socketAccess, roomFor } from '../utils/liveRules.js';

export function registerGuestSocket(io) {
  io.use(async (socket, next) => {
    try {
      // 1. Read token from socket.handshake.auth?.token. If missing or not a non-empty string,
      // call next(new Error("unauthorised")).
      const token = socket.handshake?.auth?.token;
      if (!token || typeof token !== 'string' || token.trim() === '') {
        return next(new Error('unauthorised'));
      }

      // 2. verifyGuestToken(token).
      // If verify throws an Error whose message includes "JWT_SECRET_INVALID", log:
      //   console.error('[maitred] live connection refused: server misconfigured');
      //   and call next(new Error("unauthorised")).
      // If verify throws any other error (invalid signature, expired, malformed), call
      // next(new Error("unauthorised")).
      let payload;
      try {
        payload = verifyGuestToken(token);
      } catch (err) {
        if (
          err &&
          (err.code === 'JWT_SECRET_INVALID' ||
            (typeof err.message === 'string' &&
              (err.message.includes('JWT_SECRET_INVALID') || err.message.includes('JWT_SECRET'))))
        ) {
          console.error('[maitred] live connection refused: server misconfigured');
        }
        return next(new Error('unauthorised'));
      }

      // 3. The payload contains { sid, sub, role: "guest" }.
      // - check mongoose.isObjectIdOrHexString(sid). If not, call next(new Error("unauthorised")).
      // - check sub is a non-empty string. If not, call next(new Error("unauthorised")).
      const { sid, sub } = payload || {};
      if (!sid || !mongoose.isObjectIdOrHexString(sid)) {
        return next(new Error('unauthorised'));
      }
      if (!sub || typeof sub !== 'string' || sub.trim() === '') {
        return next(new Error('unauthorised'));
      }

      // 4. Load the session from the database lean:
      const session = await TableSession.findById(sid).lean();
      if (!session) {
        return next(new Error('unauthorised'));
      }

      // 5. Run socketAccess(session, sub, new Date()).
      // If allowed is false, call next(new Error("unauthorised")).
      const access = socketAccess(session, sub, new Date());
      if (!access || !access.allowed) {
        return next(new Error('unauthorised'));
      }

      // 6. Attach identifiers to socket data for debugging / logging:
      socket.data = socket.data || {};
      socket.data.sessionId = String(sid);
      socket.data.participantId = sub;

      // 7. Join the room:
      const room = roomFor(sid);
      if (!room) {
        return next(new Error('unauthorised'));
      }
      await socket.join(room);

      // 8. Call next() with no argument to allow the connection.
      return next();
    } catch {
      return next(new Error('unauthorised'));
    }
  });

  io.on('connection', (_socket) => {
    // The server NEVER listens for custom messages from clients on this socket.
    // If a client tries to emit anything, the server ignores it.
    // socket.io leaves rooms automatically on disconnect.
  });
}
