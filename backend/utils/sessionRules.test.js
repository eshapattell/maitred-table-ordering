// sessionRules.test.js: tests for the pure table-session rules (no database needed).
import {
  SESSION_LIMITS,
  isSessionIdle,
  isPendingExpired,
  countedParticipants,
  decideJoin,
  canManageGuests,
  pickNewHost,
  sanitiseNickname,
  publicParticipant,
  staffParticipant,
  selfParticipant,
  visibleParticipantsFor,
} from './sessionRules.js';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60 * 1000);
const phoneOf = (n) => `+91${String(9000000000 + n)}`;
const person = (n, extra = {}) => ({ id: `p${n}`, nickname: `Guest ${n}`, phone: phoneOf(n), role: 'guest', status: 'approved', joinedAt: minutesAgo(30), allergiesDeclared: false, ...extra });
const host = (n = 1, extra = {}) => person(n, { role: 'host', ...extra });
const session = (participants, extra = {}) => ({ status: 'open', lastActivityAt: minutesAgo(5), createdAt: minutesAgo(60), participants, ...extra });
const deepFreeze = (v) => { if (v && typeof v === 'object') { Object.values(v).forEach(deepFreeze); Object.freeze(v); } return v; };
const mulberry32 = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

describe('SESSION_LIMITS', () => {
  test('are frozen and have the agreed values', () => {
    expect(Object.isFrozen(SESSION_LIMITS)).toBe(true);
    expect(SESSION_LIMITS).toEqual({ idleMinutes: 240, pendingMinutes: 10, maxParticipants: 12, nicknameMaxLength: 30 });
  });
});

describe('isSessionIdle', () => {
  test('is idle only after more than 240 minutes without activity', () => {
    expect(isSessionIdle(session([], { lastActivityAt: minutesAgo(239) }), NOW)).toBe(false);
    expect(isSessionIdle(session([], { lastActivityAt: minutesAgo(240) }), NOW)).toBe(false);
    expect(isSessionIdle(session([], { lastActivityAt: minutesAgo(241) }), NOW)).toBe(true);
  });
  test('falls back to createdAt, accepts date strings, and never closes a session with no usable date', () => {
    expect(isSessionIdle({ lastActivityAt: undefined, createdAt: minutesAgo(500) }, NOW)).toBe(true);
    expect(isSessionIdle({ lastActivityAt: minutesAgo(500).toISOString() }, NOW)).toBe(true);
    expect(isSessionIdle({ lastActivityAt: 'not a date', createdAt: 'nope' }, NOW)).toBe(false);
    expect(isSessionIdle(null, NOW)).toBe(false);
    expect(isSessionIdle({}, NOW)).toBe(false);
  });
});

describe('isPendingExpired', () => {
  test('only pending requests older than 10 minutes expire', () => {
    expect(isPendingExpired(person(2, { status: 'pending', joinedAt: minutesAgo(9) }), NOW)).toBe(false);
    expect(isPendingExpired(person(2, { status: 'pending', joinedAt: minutesAgo(10) }), NOW)).toBe(false);
    expect(isPendingExpired(person(2, { status: 'pending', joinedAt: minutesAgo(11) }), NOW)).toBe(true);
  });
  test('approved people never expire, and a pending request with no date expires', () => {
    expect(isPendingExpired(person(2, { status: 'approved', joinedAt: minutesAgo(9999) }), NOW)).toBe(false);
    expect(isPendingExpired(person(2, { status: 'pending', joinedAt: undefined }), NOW)).toBe(true);
    expect(isPendingExpired(null, NOW)).toBe(false);
  });
});

describe('countedParticipants', () => {
  test('counts approved and live pending people but not expired requests', () => {
    const s = session([host(1), person(2), person(3, { status: 'pending', joinedAt: minutesAgo(3) }), person(4, { status: 'pending', joinedAt: minutesAgo(30) })]);
    expect(countedParticipants(s, NOW)).toBe(3);
  });
  test('handles a missing session or list', () => {
    expect(countedParticipants(null, NOW)).toBe(0);
    expect(countedParticipants({}, NOW)).toBe(0);
  });
});

describe('decideJoin', () => {
  const newPhone = phoneOf(99);
  test('no session, a closed session: create', () => {
    expect(decideJoin({ session: null, now: NOW, phone: newPhone })).toEqual({ outcome: 'create' });
    expect(decideJoin({ session: session([host(1)], { status: 'closed' }), now: NOW, phone: newPhone })).toEqual({ outcome: 'create' });
  });
  test('an idle open session is replaced', () => {
    expect(decideJoin({ session: session([host(1)], { lastActivityAt: minutesAgo(300) }), now: NOW, phone: newPhone })).toEqual({ outcome: 'replace-idle' });
  });
  test('a new number joins as pending', () => {
    expect(decideJoin({ session: session([host(1)]), now: NOW, phone: newPhone })).toEqual({ outcome: 'pending', expiredIds: [] });
  });
  test('the same number again is already joined, with its status', () => {
    const s = session([host(1), person(2, { status: 'pending', joinedAt: minutesAgo(2) })]);
    expect(decideJoin({ session: s, now: NOW, phone: phoneOf(1) })).toEqual({ outcome: 'already-joined', status: 'approved', expiredIds: [] });
    expect(decideJoin({ session: s, now: NOW, phone: phoneOf(2) })).toEqual({ outcome: 'already-joined', status: 'pending', expiredIds: [] });
  });
  test('an expired request can be made again, and expired requests are listed for removal', () => {
    const s = session([host(1), person(2, { status: 'pending', joinedAt: minutesAgo(30) }), person(3, { status: 'pending', joinedAt: minutesAgo(40) })]);
    expect(decideJoin({ session: s, now: NOW, phone: phoneOf(2) })).toEqual({ outcome: 'pending', expiredIds: ['p2', 'p3'] });
  });
  test('the table is full at 12 people, but expired requests do not take a seat', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => (i === 0 ? host(1) : person(i + 1)));
    expect(decideJoin({ session: session(twelve), now: NOW, phone: newPhone })).toEqual({ outcome: 'full', expiredIds: [] });
    const withExpired = [...twelve.slice(0, 11), person(12, { status: 'pending', joinedAt: minutesAgo(60) })];
    expect(decideJoin({ session: session(withExpired), now: NOW, phone: newPhone })).toEqual({ outcome: 'pending', expiredIds: ['p12'] });
  });
  test('refuses a phone that is not normalised', () => {
    for (const bad of [undefined, null, '9824079988', '+915824079988', 5]) {
      expect(() => decideJoin({ session: null, now: NOW, phone: bad })).toThrow();
    }
    expect(() => decideJoin()).toThrow();
  });
  test('does not change its input', () => {
    expect(() => decideJoin({ session: deepFreeze(session([host(1)])), now: NOW, phone: newPhone })).not.toThrow();
  });
  test('3000 random sessions agree with an independent version of the rules', () => {
    const rand = mulberry32(2026);
    for (let i = 0; i < 3000; i++) {
      const n = Math.floor(rand() * 15);
      const people = Array.from({ length: n }, (_, k) => {
        const pending = rand() < 0.4;
        return person(k + 1, { role: k === 0 ? 'host' : 'guest', status: pending ? 'pending' : 'approved', joinedAt: minutesAgo(Math.floor(rand() * 40)) });
      });
      const status = rand() < 0.15 ? 'closed' : 'open';
      const lastActivityAt = minutesAgo(rand() < 0.15 ? 241 + Math.floor(rand() * 500) : Math.floor(rand() * 200));
      const s = session(people, { status, lastActivityAt });
      const phone = phoneOf(1 + Math.floor(rand() * 18));
      const result = decideJoin({ session: s, now: NOW, phone });
      // independent oracle
      const expired = people.filter((p) => p.status === 'pending' && NOW - p.joinedAt > 10 * 60 * 1000);
      const alive = people.filter((p) => !expired.includes(p));
      const mine = people.find((p) => p.phone === phone);
      let expected;
      if (status !== 'open') expected = 'create';
      else if (NOW - lastActivityAt > 240 * 60 * 1000) expected = 'replace-idle';
      else if (mine && !expired.includes(mine)) expected = 'already-joined';
      else if (alive.length >= 12) expected = 'full';
      else expected = 'pending';
      expect(result.outcome).toBe(expected);
      if (expected !== 'create' && expected !== 'replace-idle') expect(result.expiredIds).toEqual(expired.map((p) => p.id));
    }
  });
});

describe('canManageGuests', () => {
  const s = session([host(1), person(2), person(3, { status: 'pending', role: 'host' })]);
  test('only the approved host of an open session', () => {
    expect(canManageGuests(s, 'p1')).toBe(true);
    expect(canManageGuests(s, 'p2')).toBe(false);
    expect(canManageGuests(s, 'p3')).toBe(false); // a pending "host" does not count
    expect(canManageGuests(s, 'nobody')).toBe(false);
    expect(canManageGuests({ ...s, status: 'closed' }, 'p1')).toBe(false);
    expect(canManageGuests(null, 'p1')).toBe(false);
  });
});

describe('pickNewHost', () => {
  test('the longest-seated approved guest, ignoring pending people and the excluded one', () => {
    const list = [host(1, { joinedAt: minutesAgo(100) }), person(2, { joinedAt: minutesAgo(50) }), person(3, { joinedAt: minutesAgo(80) }), person(4, { status: 'pending', joinedAt: minutesAgo(200) })];
    expect(pickNewHost(list, 'p1')).toBe('p3');
    expect(pickNewHost(list, 'nobody')).toBe('p1');
  });
  test('ties go to the earlier position, undated people go last, and nobody gives null', () => {
    const same = minutesAgo(10);
    expect(pickNewHost([person(1, { joinedAt: same }), person(2, { joinedAt: same })], 'x')).toBe('p1');
    expect(pickNewHost([person(1, { joinedAt: undefined }), person(2, { joinedAt: minutesAgo(5) })], 'x')).toBe('p2');
    expect(pickNewHost([host(1)], 'p1')).toBeNull();
    expect(pickNewHost([], 'p1')).toBeNull();
    expect(pickNewHost(undefined, 'p1')).toBeNull();
  });
});

describe('sanitiseNickname', () => {
  test.each([['Ravi', 'Ravi'], ['  Ravi   Kumar ', 'Ravi Kumar'], ["D'Souza", "D'Souza"], ['Anne-Marie', 'Anne-Marie'], ['Dr. Shah', 'Dr. Shah'], ['Seat 5', 'Seat 5'], ['José', 'José'], ['राहुल', 'राहुल'], ['પ્રિયા', 'પ્રિયા'], ['A', 'A']])('accepts %p', (input, expected) => {
    expect(sanitiseNickname(input)).toBe(expected);
  });
  test.each([[null], [undefined], [5], [{}], [''], ['   '], ['<b>x</b>'], ['Ravi<script>'], ['a@b.com'], ['😀'], ['Ravi😀'], ['-Ravi'], ['.Ravi'], ["' OR 1=1"], ['x'.repeat(31)], ['a\nb\u0000c']])('rejects %p', (input) => {
    expect(sanitiseNickname(input)).toBeNull();
  });
  test('allows exactly 30 characters, counting letters not bytes', () => {
    expect(sanitiseNickname('x'.repeat(30))).toBe('x'.repeat(30));
    expect(sanitiseNickname('र'.repeat(30))).toBe('र'.repeat(30));
  });
});

describe('what each viewer may see', () => {
  const s = session([host(1), person(2), person(3, { status: 'pending', joinedAt: minutesAgo(2) }), person(4, { status: 'pending', joinedAt: minutesAgo(30) })]);
  test('public, staff and self views', () => {
    expect(publicParticipant(host(1))).toEqual({ id: 'p1', nickname: 'Guest 1', role: 'host', status: 'approved' });
    expect(staffParticipant(host(1)).maskedPhone).toBe('+91 90••• ••001');
    expect(selfParticipant(host(1))).toMatchObject({ id: 'p1', allergiesDeclared: false, maskedPhone: '+91 90••• ••001' });
    expect(staffParticipant({ ...host(1), phone: null }).maskedPhone).toBe('');
  });
  test('no view ever contains a full phone number', () => {
    for (const p of [host(1), person(2)]) {
      for (const view of [publicParticipant(p), staffParticipant(p), selfParticipant(p)]) {
        expect(JSON.stringify(view)).not.toContain(p.phone);
        expect(JSON.stringify(view)).not.toContain(p.phone.slice(3));
      }
    }
  });
  test('the host sees approved people and live pending requests, but not expired ones', () => {
    const v = visibleParticipantsFor(s, 'p1', NOW);
    expect(v.approved.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(v.pending.map((p) => p.id)).toEqual(['p3']);
  });
  test('an approved guest sees approved people only', () => {
    const v = visibleParticipantsFor(s, 'p2', NOW);
    expect(v.approved.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(v.pending).toEqual([]);
  });
  test('a pending guest or a stranger sees nobody', () => {
    expect(visibleParticipantsFor(s, 'p3', NOW)).toEqual({ approved: [], pending: [] });
    expect(visibleParticipantsFor(s, 'nobody', NOW)).toEqual({ approved: [], pending: [] });
    expect(visibleParticipantsFor(null, 'p1', NOW)).toEqual({ approved: [], pending: [] });
  });
  test('does not change its input', () => {
    expect(() => visibleParticipantsFor(deepFreeze(session([host(1), person(2)])), 'p1', NOW)).not.toThrow();
  });
});
