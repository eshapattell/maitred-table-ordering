// sessionRules.js: the pure rules for table sessions in maitred (no database, no network).
//
// A session belongs to the people seated at one table. The first guest who joins becomes the
// host. Everyone else waits as "pending" until the host (or staff) approves them. These
// functions only DECIDE what should happen; the controller then does it with atomic database
// operations.

import { maskPhone } from './phone.js';

export const SESSION_LIMITS = Object.freeze({
  idleMinutes: 240, // a table with no activity for 4 hours can be claimed again
  pendingMinutes: 10, // a request to join that nobody approves expires after 10 minutes
  maxParticipants: 12,
  nicknameMaxLength: 30,
});

const MINUTE = 60 * 1000;

const toTime = (value) => {
  const time =
    value instanceof Date
      ? value.getTime()
      : typeof value === 'string' || typeof value === 'number'
        ? new Date(value).getTime()
        : NaN;
  return Number.isFinite(time) ? time : NaN;
};

const participantsOf = (session) =>
  session && Array.isArray(session.participants) ? session.participants.filter((p) => p && typeof p === 'object') : [];

/** True when the session has had no activity for longer than the idle limit. */
export const isSessionIdle = (session, now = new Date()) => {
  const last = toTime(session?.lastActivityAt);
  const time = Number.isNaN(last) ? toTime(session?.createdAt) : last;
  if (Number.isNaN(time)) {
    return false; // no usable date: keep the table locked rather than let anyone claim it
  }
  return toTime(now) - time > SESSION_LIMITS.idleMinutes * MINUTE;
};

/** True for a pending request that has waited longer than the limit (or has no usable date). */
export const isPendingExpired = (participant, now = new Date()) => {
  if (!participant || participant.status !== 'pending') {
    return false;
  }
  const joined = toTime(participant.joinedAt);
  if (Number.isNaN(joined)) {
    return true; // fail closed: an undated request must not stay forever
  }
  return toTime(now) - joined > SESSION_LIMITS.pendingMinutes * MINUTE;
};

/** How many people take up a seat: everyone except requests that have expired. */
export const countedParticipants = (session, now = new Date()) =>
  participantsOf(session).filter((p) => !isPendingExpired(p, now)).length;

/**
 * Decides what a join attempt (with an already-normalised phone) should do.
 * outcome is one of:
 *   "create"       no open session: start a new one with this guest as host
 *   "replace-idle" the open session is idle: close it (reason "timeout"), then create
 *   "already-joined"  this number is already in the session
 *   "full"         no seat left
 *   "pending"      add the guest as pending
 * For every outcome except "create", expiredIds lists expired requests to remove first.
 */
export const decideJoin = ({ session, now = new Date(), phone } = {}) => {
  if (typeof phone !== 'string' || !/^\+91[6-9]\d{9}$/.test(phone)) {
    throw new Error('decideJoin needs a normalised phone number');
  }
  if (!session || session.status !== 'open') {
    return { outcome: 'create' };
  }
  if (isSessionIdle(session, now)) {
    return { outcome: 'replace-idle' };
  }
  const participants = participantsOf(session);
  const expiredIds = participants.filter((p) => isPendingExpired(p, now)).map((p) => p.id);
  const existing = participants.find((p) => p.phone === phone);
  if (existing && !isPendingExpired(existing, now)) {
    return { outcome: 'already-joined', status: existing.status, expiredIds };
  }
  if (countedParticipants(session, now) >= SESSION_LIMITS.maxParticipants) {
    return { outcome: 'full', expiredIds };
  }
  return { outcome: 'pending', expiredIds };
};

/** Only the approved host of an open session may approve or reject guests. */
export const canManageGuests = (session, participantId) => {
  if (!session || session.status !== 'open') {
    return false;
  }
  const person = participantsOf(session).find((p) => p.id === participantId);
  return Boolean(person && person.role === 'host' && person.status === 'approved');
};

/** When the host is removed, the longest-seated approved guest becomes host (or null). */
export const pickNewHost = (participants, excludeId) => {
  const candidates = (Array.isArray(participants) ? participants : [])
    .filter((p) => p && p.status === 'approved' && p.id !== excludeId)
    .map((p, index) => ({ id: p.id, time: toTime(p.joinedAt), index }))
    .sort((a, b) => {
      const ta = Number.isNaN(a.time) ? Infinity : a.time;
      const tb = Number.isNaN(b.time) ? Infinity : b.time;
      return ta - tb || a.index - b.index;
    });
  return candidates.length > 0 ? candidates[0].id : null;
};

/** A nickname for the cart ("added by Ravi"): letters from any language, digits, spaces . ' - */
export const sanitiseNickname = (input) => {
  if (typeof input !== 'string') {
    return null;
  }
  const cleaned = input.normalize('NFC').replace(/\s+/g, ' ').trim();
  const length = [...cleaned].length;
  if (length < 1 || length > SESSION_LIMITS.nicknameMaxLength) {
    return null;
  }
  // \p{M} matters: Hindi and Gujarati vowel signs are combining marks, not letters.
  if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N} .'\-]*$/u.test(cleaned)) {
    return null;
  }
  return cleaned;
};

/** What other guests may see about someone: never the phone number. */
export const publicParticipant = (p) => ({ id: p.id, nickname: p.nickname, role: p.role, status: p.status });

/** What staff see: the same plus a masked number. */
export const staffParticipant = (p) => ({ ...publicParticipant(p), maskedPhone: maskPhone(p.phone) });

/** What a guest sees about themself. */
export const selfParticipant = (p) => ({
  ...publicParticipant(p),
  allergiesDeclared: Boolean(p.allergiesDeclared),
  maskedPhone: maskPhone(p.phone),
});

/**
 * The people a guest may see. A pending guest sees nobody. An approved guest sees the approved
 * people. The host also sees the requests that are waiting (and have not expired).
 */
export const visibleParticipantsFor = (session, viewerId, now = new Date()) => {
  const list = participantsOf(session);
  const me = list.find((p) => p.id === viewerId);
  if (!me || me.status !== 'approved') {
    return { approved: [], pending: [] };
  }
  const approved = list.filter((p) => p.status === 'approved').map(publicParticipant);
  const pending = canManageGuests(session, viewerId)
    ? list.filter((p) => p.status === 'pending' && !isPendingExpired(p, now)).map(publicParticipant)
    : [];
  return { approved, pending };
};
