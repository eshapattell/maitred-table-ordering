import { describe, test, expect } from 'vitest';
import { orderHistoryView } from '../../../backend/utils/orderHistory.js';
import { freezeOrderItem } from '../../../backend/utils/orderRules.js';
import {
  emptyHistory, sanitizeHistory, orderedQuantities, orderedQuantityFor, roundsOf, historySummary, HISTORY_MESSAGES, historyErrorMessage,
} from './tableOrders.js';

// ---- real answers, built by the BACKEND's own rule ----
const uuid = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const ID = { a: 'a'.repeat(24), b: 'b'.repeat(24), c: 'c'.repeat(24), o1: '1'.repeat(24), o2: '2'.repeat(24) };
const item = (n, dishId, name, qty, orderedBy, over = {}) => ({
  ...freezeOrderItem({ line: { qty }, dish: { _id: dishId, name, price: 250, allergens: [] }, adder: { nickname: orderedBy }, orderItemId: uuid(n) }), ...over,
});
const order = (id, createdAt, items) => ({ _id: id, createdAt, items });
const T1 = '2026-10-14T13:42:00.000Z';
const T2 = '2026-10-14T14:05:00.000Z';
const REAL = orderHistoryView([
  order(ID.o1, T1, [item(1, ID.a, 'Hibiscus Rose Cooler', 2, 'Hema'), item(2, ID.b, 'Kesar Badam Milkshake', 1, 'Bala', { status: 'cancelled' })]),
  order(ID.o2, T2, [item(3, ID.a, 'Hibiscus Rose Cooler', 3, 'Bala'), item(4, ID.c, 'Soup', 1, 'Hema'), item(5, ID.c, 'Hidden', 2, 'Hema', { isSurprise: true })]),
]);

describe('contract with the backend (these fail if either side changes)', () => {
  test('a real history passes through sanitizeHistory unchanged', () => expect(sanitizeHistory(REAL)).toEqual(REAL));
  test('a real history has exactly the fields the helpers read', () => {
    expect(Object.keys(REAL).sort()).toEqual(['orders', 'totals']);
    expect(Object.keys(REAL.orders[0]).sort()).toEqual(['id', 'items', 'placedAt']);
    expect(Object.keys(REAL.orders[0].items[0]).sort()).toEqual(['cancelled', 'id', 'menuItemId', 'name', 'orderedBy', 'qty']);
  });
  test('the totals the helpers work out equal the totals the backend sent', () => {
    expect(sanitizeHistory(REAL).totals).toEqual(REAL.totals);
    expect(REAL.totals).toEqual({ dishes: 4, items: 8 });
  });
  test('the messages are frozen', () => expect(Object.isFrozen(HISTORY_MESSAGES)).toBe(true));
});

describe('sanitizeHistory', () => {
  test('the totals are worked out from the rows, never trusted from the server', () => {
    expect(sanitizeHistory({ ...REAL, totals: { dishes: 999, items: 999 } }).totals).toEqual({ dishes: 4, items: 8 });
    expect(sanitizeHistory({ orders: REAL.orders }).totals).toEqual({ dishes: 4, items: 8 });
  });
  test.each([
    [{ id: '', name: 'A', qty: 1 }], [{ id: 5, name: 'A', qty: 1 }], [{ id: 'x', name: '', qty: 1 }], [{ id: 'x', name: 5, qty: 1 }],
    [{ id: 'x', name: 'A', qty: 0 }], [{ id: 'x', name: 'A', qty: 1.5 }], [{ id: 'x', name: 'A', qty: '2' }], [null], [undefined], ['row'], [5],
  ])('an untrustworthy row %j is dropped', (row) => {
    expect(sanitizeHistory({ orders: [{ id: 'r1', placedAt: T1, items: [{ id: 'good', name: 'Good', qty: 1 }, row] }] }).orders[0].items.map((r) => r.name)).toEqual(['Good']);
  });
  test('a round with no usable rows, or no id, is dropped', () => {
    expect(sanitizeHistory({ orders: [{ id: 'r1', items: [{ id: 'x', name: '', qty: 1 }] }, { id: '', items: [{ id: 'x', name: 'A', qty: 1 }] }, { items: [] }, null, 5] })).toEqual(emptyHistory());
  });
  test('only an exact cancelled true marks a row cancelled', () => {
    const rowWith = (cancelled) => sanitizeHistory({ orders: [{ id: 'r', items: [{ id: 'x', name: 'A', qty: 1, cancelled }] }] }).orders[0].items[0].cancelled;
    expect(rowWith(true)).toBe(true);
    for (const v of ['true', 1, undefined, null, false]) expect(rowWith(v)).toBe(false);
  });
  test('a dish id that is not a real id becomes null and a good one is lower-cased', () => {
    const idOf = (menuItemId) => sanitizeHistory({ orders: [{ id: 'r', items: [{ id: 'x', name: 'A', qty: 1, menuItemId }] }] }).orders[0].items[0].menuItemId;
    expect(idOf(ID.a.toUpperCase())).toBe(ID.a);
    for (const v of ['xyz', '', null, undefined, 5, ID.a + 'a']) expect(idOf(v)).toBeNull();
  });
  test('a missing adder name becomes empty text and a missing time becomes null', () => {
    const round = sanitizeHistory({ orders: [{ id: 'r', placedAt: 5, items: [{ id: 'x', name: 'A', qty: 1 }] }] }).orders[0];
    expect(round.items[0].orderedBy).toBe('');
    expect(round.placedAt).toBeNull();
    expect(sanitizeHistory({ orders: [{ id: 'r', placedAt: '', items: [{ id: 'x', name: 'A', qty: 1 }] }] }).orders[0].placedAt).toBeNull();
  });
  test.each([[undefined], [null], ['x'], [5], [{}], [{ orders: 'x' }], [{ orders: [null, 5] }]])('junk %p gives an empty history', (v) => expect(sanitizeHistory(v)).toEqual(emptyHistory()));
  test('it does not change its input', () => {
    const frozen = Object.freeze({ orders: Object.freeze(REAL.orders.map((o) => Object.freeze({ ...o, items: Object.freeze(o.items.map((i) => Object.freeze({ ...i }))) }))), totals: Object.freeze({ ...REAL.totals }) });
    expect(() => sanitizeHistory(frozen)).not.toThrow();
  });
});

describe('orderedQuantities and orderedQuantityFor', () => {
  test('the whole table counted across every order and guest (Hema 2 plus Bala 3 of the cooler)', () => {
    expect(orderedQuantities(REAL)).toEqual({ [ID.a]: 5, [ID.c]: 1 });
  });
  test('a cancelled dish is not counted, and a hidden surprise dish never shows a count', () => {
    expect(orderedQuantities(REAL)[ID.b]).toBeUndefined();
    expect(Object.values(orderedQuantities(REAL)).reduce((a, b) => a + b, 0)).toBe(6);
  });
  test('orderedQuantityFor gives the count for one dish and 0 for the rest', () => {
    expect(orderedQuantityFor(REAL, ID.a)).toBe(5);
    expect(orderedQuantityFor(REAL, ID.c)).toBe(1);
    expect(orderedQuantityFor(REAL, ID.b)).toBe(0);
    expect(orderedQuantityFor(REAL, ID.a.toUpperCase())).toBe(5);
  });
  test.each([[undefined], [null], [''], ['xyz'], [5], [{}], [ID.a + 'a']])('a junk dish id %p gives 0', (id) => expect(orderedQuantityFor(REAL, id)).toBe(0));
  test('junk history gives 0 and no counts', () => {
    for (const v of [undefined, null, {}, 'x']) { expect(orderedQuantities(v)).toEqual({}); expect(orderedQuantityFor(v, ID.a)).toBe(0); }
  });
  test('the answer is a plain object that cannot be polluted through odd dish ids', () => {
    expect(orderedQuantityFor(REAL, '__proto__')).toBe(0);
    expect(orderedQuantityFor(REAL, 'constructor')).toBe(0);
  });
});

describe('roundsOf and historySummary', () => {
  test('rounds are numbered from 1 in the order they were placed', () => {
    const rounds = roundsOf(REAL);
    expect(rounds.map((r) => r.number)).toEqual([1, 2]);
    expect(rounds.map((r) => r.placedAt)).toEqual([T1, T2]);
    expect(rounds[0].rows.map((r) => r.name)).toEqual(['Hibiscus Rose Cooler', 'Kesar Badam Milkshake']);
    expect(rounds[1].rows.find((r) => r.name === 'Surprise dish')).toBeTruthy();
  });
  test('a round whose rows were all untrustworthy does not take a number', () => {
    const history = { orders: [{ id: 'r0', items: [{ id: '', name: 'x', qty: 1 }] }, ...REAL.orders] };
    expect(roundsOf(history).map((r) => r.number)).toEqual([1, 2]);
  });
  test('the summary counts rounds, dishes and items', () => {
    expect(historySummary(REAL)).toEqual({ rounds: 2, dishes: 4, items: 8, hasOrders: true });
  });
  test('a history with only cancelled dishes has orders listed but nothing ordered', () => {
    const onlyCancelled = orderHistoryView([order(ID.o1, T1, [item(1, ID.a, 'A', 2, 'X', { status: 'cancelled' })])]);
    expect(historySummary(onlyCancelled)).toEqual({ rounds: 1, dishes: 0, items: 0, hasOrders: false });
  });
  test('an empty or junk history is empty', () => {
    for (const v of [undefined, null, emptyHistory(), {}]) expect(historySummary(v)).toEqual({ rounds: 0, dishes: 0, items: 0, hasOrders: false });
    expect(roundsOf(undefined)).toEqual([]);
  });
});

describe('historyErrorMessage', () => {
  const fail = (status, data) => ({ response: { status, data: { message: 'SERVER TEXT MUST NOT APPEAR', ...data } } });
  test('no response is a network problem; 503 and 429 are handled; anything else is generic', () => {
    expect(historyErrorMessage(new Error('Network Error'))).toBe(HISTORY_MESSAGES.network);
    expect(historyErrorMessage({})).toBe(HISTORY_MESSAGES.network);
    expect(historyErrorMessage(fail(503, {}))).toBe(HISTORY_MESSAGES.tryAgain);
    expect(historyErrorMessage(fail(429, {}))).toBe(HISTORY_MESSAGES.tooMany);
    expect(historyErrorMessage(fail(500, {}))).toBe(HISTORY_MESSAGES.generic);
    expect(historyErrorMessage(fail(403, { code: 'ALLERGIES_REQUIRED' }))).toBe(HISTORY_MESSAGES.generic);
  });
  test('the server text is never shown', () => {
    for (const status of [400, 403, 404, 500, 503]) expect(historyErrorMessage(fail(status, {}))).not.toMatch(/SERVER TEXT/);
  });
});
