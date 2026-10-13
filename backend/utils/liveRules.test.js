import { LIVE_EVENTS, roomFor, socketAccess, cartPing } from './liveRules.js';
import { SESSION_LIMITS } from './sessionRules.js';

const NOW = new Date('2026-10-13T12:00:00Z');
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60000);
const session = (over = {}, people = [{ id: 'g1', status: 'approved', role: 'host', joinedAt: minutesAgo(30) }]) =>
  ({ status: 'open', lastActivityAt: minutesAgo(5), participants: people, ...over });

describe('LIVE_EVENTS and roomFor', () => {
  test('the events are frozen and fixed', () => {
    expect({ ...LIVE_EVENTS }).toEqual({ SESSION_CHANGED: 'session:changed', CART_CHANGED: 'cart:changed' });
    expect(Object.isFrozen(LIVE_EVENTS)).toBe(true);
  });
  test('a 24-character id gives a lower-case room name', () => {
    expect(roomFor('65F0C0FFEE65F0C0FFEE65F0')).toBe('session:65f0c0ffee65f0c0ffee65f0');
    expect(roomFor({ toString: () => '65f0c0ffee65f0c0ffee65f0' })).toBe('session:65f0c0ffee65f0c0ffee65f0');
  });
  test.each([[''], ['abc'], ['65f0c0ffee65f0c0ffee65f'], ['65f0c0ffee65f0c0ffee65f00'], ['zzf0c0ffee65f0c0ffee65f0'], [null], [undefined], [5], [{}], ['session:65f0c0ffee65f0c0ffee65f0']])('%p gives no room', (value) => {
    expect(roomFor(value)).toBeNull();
  });
});

describe('socketAccess', () => {
  test('an approved guest of an open session may listen', () => expect(socketAccess(session(), 'g1', NOW)).toEqual({ allowed: true, reason: 'ok' }));
  test('a waiting guest whose request is still fresh may listen (to learn that they were approved)', () => {
    const s = session({}, [{ id: 'p1', status: 'pending', joinedAt: minutesAgo(3) }]);
    expect(socketAccess(s, 'p1', NOW).allowed).toBe(true);
  });
  test('a waiting guest whose request expired may not', () => {
    const s = session({}, [{ id: 'p1', status: 'pending', joinedAt: minutesAgo(SESSION_LIMITS.pendingMinutes + 1) }]);
    expect(socketAccess(s, 'p1', NOW)).toEqual({ allowed: false, reason: 'expired' });
  });
  test.each([[undefined], [null], ['x'], [5], [[]], [{}]])('a missing or strange session (%p) is closed', (value) => {
    expect(socketAccess(value, 'g1', NOW)).toEqual({ allowed: false, reason: 'closed' });
  });
  test.each([['closed'], [undefined], [null], ['OPEN'], ['']])('a session with status %p is closed', (status) => {
    expect(socketAccess(session({ status }), 'g1', NOW)).toEqual({ allowed: false, reason: 'closed' });
  });
  test('an idle session is refused', () => {
    expect(socketAccess(session({ lastActivityAt: minutesAgo(SESSION_LIMITS.idleMinutes + 1) }), 'g1', NOW)).toEqual({ allowed: false, reason: 'idle' });
  });
  test.each([[undefined], [null], [''], ['nobody'], [5], [{}]])('participant %p is not seated', (id) => {
    expect(socketAccess(session(), id, NOW)).toEqual({ allowed: false, reason: 'not-seated' });
  });
  test.each([['weird'], ['removed'], ['APPROVED'], [undefined], [null]])('a participant with status %p is not allowed', (status) => {
    const s = session({}, [{ id: 'g1', status, joinedAt: minutesAgo(5) }]);
    expect(socketAccess(s, 'g1', NOW).allowed).toBe(false);
  });
  test('strange participant lists never throw', () => {
    for (const participants of [undefined, null, 'x', [null], [undefined, {}], 5]) {
      expect(() => socketAccess({ status: 'open', lastActivityAt: minutesAgo(1), participants }, 'g1', NOW)).not.toThrow();
      expect(socketAccess({ status: 'open', lastActivityAt: minutesAgo(1), participants }, 'g1', NOW).allowed).toBe(false);
    }
  });
});

describe('cartPing carries only a version number', () => {
  test('the version of the cart and nothing else', () => {
    expect(cartPing({ cartVersion: 7, cart: [{ secret: 1 }], participants: [{ phone: '+919824079988' }] })).toEqual({ version: 7 });
  });
  test.each([[undefined], [-1], [1.5], ['3'], [null], [NaN]])('a bad version (%p) becomes 0', (cartVersion) => expect(cartPing({ cartVersion })).toEqual({ version: 0 }));
  test('a missing session gives version 0', () => expect(cartPing(undefined)).toEqual({ version: 0 }));
});
