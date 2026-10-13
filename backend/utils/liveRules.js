// liveRules.js: the pure rules for the live connection (no database, no network).
// FINAL drop-in (Task 10b). The connection carries NO data: it only tells a phone "something changed,
// please ask again". All real data travels through the normal authenticated routes, so permissions
// are enforced in one place only.
import { isSessionIdle, isPendingExpired } from './sessionRules.js';

export const LIVE_EVENTS = Object.freeze({
  SESSION_CHANGED: 'session:changed',
  CART_CHANGED: 'cart:changed',
});

// The room that everyone at one table session joins. Anything that is not a plain id gives null.
export const roomFor = (sessionId) => {
  const id = typeof sessionId === 'string' ? sessionId : sessionId && typeof sessionId.toString === 'function' ? sessionId.toString() : '';
  return /^[0-9a-f]{24}$/i.test(id) ? `session:${id.toLowerCase()}` : null;
};

// May this person's phone listen to this session? A seated (approved) guest and a still-waiting
// guest whose request has not expired may; anyone else, and every closed or idle session, may not.
export const socketAccess = (session, participantId, now = new Date()) => {
  if (!session || typeof session !== 'object') return { allowed: false, reason: 'closed' };
  if (session.status !== 'open') return { allowed: false, reason: 'closed' };
  if (isSessionIdle(session, now)) return { allowed: false, reason: 'idle' };
  const people = Array.isArray(session.participants) ? session.participants : [];
  const me = typeof participantId === 'string' && participantId !== '' ? people.find((p) => p && p.id === participantId) : undefined;
  if (!me) return { allowed: false, reason: 'not-seated' };
  if (me.status === 'approved') return { allowed: true, reason: 'ok' };
  if (me.status === 'pending' && !isPendingExpired(me, now)) return { allowed: true, reason: 'ok' };
  return { allowed: false, reason: me.status === 'pending' ? 'expired' : 'not-seated' };
};

// What a "cart changed" ping may contain: the version number and nothing else.
export const cartPing = (session) => ({
  version: Number.isInteger(session?.cartVersion) && session.cartVersion >= 0 ? session.cartVersion : 0,
});
