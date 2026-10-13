import { describe, test, expect } from 'vitest';
import { GUEST_POLL_MS, screenFor, isHost, pendingRequests, diners, ENDED_CODES, endedCodeOf, endedMessage } from './guestSession.js';

const data = (me, over = {}) => ({ session: { id: 's', tableNumber: 5, status: 'open' }, me: { id: 'p1', nickname: 'Ravi', role: 'guest', status: 'approved', allergiesDeclared: true, ...me }, participants: [], pending: [], ...over });

describe('screenFor', () => {
  test('pending guest waits', () => expect(screenFor(data({ status: 'pending', allergiesDeclared: false }))).toBe('waiting'));
  test('approved guest who has not answered the allergy question gets the allergy screen', () => expect(screenFor(data({ allergiesDeclared: false }))).toBe('allergies'));
  test('approved guest who has answered gets the menu', () => expect(screenFor(data({ allergiesDeclared: true }))).toBe('menu'));
  test('the host follows the same path as everyone', () => {
    expect(screenFor(data({ role: 'host', allergiesDeclared: false }))).toBe('allergies');
    expect(screenFor(data({ role: 'host', allergiesDeclared: true }))).toBe('menu');
  });
  test.each([[undefined], [null], ['true'], [1], [0], ['']])('allergiesDeclared %p is NOT an answer: allergy screen', (value) => {
    expect(screenFor(data({ allergiesDeclared: value }))).toBe('allergies');
  });
  test.each([['removed'], ['weird'], [''], [null], [undefined], ['APPROVED'], ['approved '], [1]])('status %p never reaches the menu', (status) => {
    expect(screenFor(data({ status }))).toBe('unknown');
  });
  test.each([['closed'], [undefined], [null], ['OPEN'], ['']])('a session whose status is %p is over', (status) => {
    expect(screenFor(data({}, { session: { id: 's', status } }))).toBe('ended');
  });
  test('a missing session is over, never the menu', () => expect(screenFor({ me: { status: 'approved', allergiesDeclared: true } })).toBe('ended'));
  test('missing or strange data is "unknown" and never throws', () => {
    for (const value of [undefined, null, {}, 'x', 5, [], { me: null }, { me: 'x' }, { me: [] }]) {
      expect(() => screenFor(value)).not.toThrow();
      expect(['unknown', 'ended']).toContain(screenFor(value));
    }
    expect(screenFor(undefined)).toBe('unknown');
  });
});

describe('isHost, pendingRequests and diners', () => {
  const pending = [{ id: 'a', nickname: 'Asha', role: 'guest', status: 'pending' }, { id: 'b', nickname: 'Bob', role: 'guest', status: 'pending' }];
  test('isHost needs role host AND status approved', () => {
    expect(isHost({ role: 'host', status: 'approved' })).toBe(true);
    for (const me of [{ role: 'host', status: 'pending' }, { role: 'guest', status: 'approved' }, { role: 'HOST', status: 'approved' }, {}, null, undefined, 'host']) {
      expect(isHost(me)).toBe(false);
    }
  });
  test('the host sees the waiting requests', () => expect(pendingRequests(data({ role: 'host' }, { pending })).map((p) => p.id)).toEqual(['a', 'b']));
  test('an ordinary guest never sees requests, even if the data holds them', () => expect(pendingRequests(data({ role: 'guest' }, { pending }))).toEqual([]));
  test('only well-formed pending entries are kept', () => {
    const messy = [...pending, null, undefined, { id: '', status: 'pending' }, { id: 'c', status: 'approved' }, { id: 5, status: 'pending' }, 'x'];
    expect(pendingRequests(data({ role: 'host' }, { pending: messy })).map((p) => p.id)).toEqual(['a', 'b']);
  });
  test('missing lists give empty lists', () => {
    expect(pendingRequests(data({ role: 'host' }, { pending: undefined }))).toEqual([]);
    expect(pendingRequests(undefined)).toEqual([]);
    expect(diners(undefined)).toEqual([]);
    expect(diners({ participants: 'x' })).toEqual([]);
  });
  test('diners keeps only approved people', () => {
    const list = [{ id: 'a', status: 'approved' }, { id: 'b', status: 'pending' }, null, { id: 'c', status: 'approved' }, { id: 'd' }];
    expect(diners({ participants: list }).map((p) => p.id)).toEqual(['a', 'c']);
  });
});

describe('endedCodeOf and endedMessage', () => {
  const err = (status, code) => ({ response: { status, data: { code } } });
  test.each(ENDED_CODES.map((c) => [c]))('401 %s means the session is over', (code) => expect(endedCodeOf(err(401, code))).toBe(code));
  test('the same codes with another status are not "ended"', () => {
    for (const status of [400, 403, 404, 409, 500]) expect(endedCodeOf(err(status, 'SESSION_CLOSED'))).toBeNull();
  });
  test('other 401 codes and shapes are not "ended"', () => {
    expect(endedCodeOf(err(401, 'SOMETHING_ELSE'))).toBeNull();
    expect(endedCodeOf(err(401, undefined))).toBeNull();
    for (const value of [null, undefined, {}, new Error('x'), { response: {} }, { response: { status: 401 } }]) expect(endedCodeOf(value)).toBeNull();
  });
  test('ENDED_CODES is frozen and complete', () => {
    expect([...ENDED_CODES]).toEqual(['SESSION_CLOSED', 'PARTICIPANT_REMOVED', 'INVALID_TOKEN']);
    expect(Object.isFrozen(ENDED_CODES)).toBe(true);
  });
  test('every code has its own, calm message', () => {
    const messages = new Set([endedMessage('SESSION_CLOSED'), endedMessage('PARTICIPANT_REMOVED'), endedMessage('INVALID_TOKEN')]);
    expect(messages.size).toBe(3);
    expect(endedMessage('SESSION_CLOSED')).toMatch(/scan the QR code/);
    expect(endedMessage('PARTICIPANT_REMOVED')).toMatch(/staff/);
    expect(endedMessage(undefined)).toBe(endedMessage('INVALID_TOKEN'));
  });
  test('the poll interval is five seconds', () => expect(GUEST_POLL_MS).toBe(5000));
});
