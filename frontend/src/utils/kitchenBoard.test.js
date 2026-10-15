import { describe, test, expect } from 'vitest';
import { KITCHEN_NAMESPACE as BACKEND_NAMESPACE, ORDER_EVENTS, ITEM_STATUSES, kitchenOrderView, canMoveStatus } from '../../../backend/utils/orderRules.js';
import {
  KITCHEN_NAMESPACE, KITCHEN_EVENTS, BOARD_POLL_LIVE_MS, BOARD_POLL_FALLBACK_MS, pollIntervalFor, nextStatusOf, canCancelDish, dishActions, isOpenDish,
  splitDishes, allergyLines, hasAllergyWarning, dishAllergens, waitMinutes, sortOrders, boardSummary, actionsForEvent, nextLiveState,
  BOARD_MESSAGES, boardErrorMessage, staleAfterBoardError,
} from './kitchenBoard.js';

// ---- real tickets, built by the BACKEND's own code ----
const uuid = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const dishRow = (n, name, qty, orderedBy, status, flags = []) => ({ orderItemId: uuid(n), itemId: 'a'.repeat(24), name, price: 250, qty, orderedBy, allergyFlags: flags, status, isSurprise: false, revealed: false });
const order = (id, createdAt, items, tableAllergies = [], tableNumber = 4) => kitchenOrderView({ _id: id.repeat(24), sessionId: 'b'.repeat(24), restaurantId: 'c'.repeat(24), tableNumber, createdAt, items, tableAllergies, status: 'placed' });
const T1 = order('1', '2026-10-14T13:42:00.000Z', [dishRow(1, 'Tomato Soup', 2, 'Bala', 'placed', ['dairy']), dishRow(2, 'Walnut Salad', 1, 'Asha', 'preparing', ['tree nut']), dishRow(3, 'Tea', 1, 'Bala', 'served'), dishRow(4, 'Pasta', 1, 'Chitra', 'cancelled'), dishRow(5, 'Cake', 1, 'Asha', 'ready')],
  [{ nickname: 'Asha', allergies: ['tree nut'] }, { nickname: 'Chitra', allergies: ['peanut', 'sesame'] }]);
const T2 = order('2', '2026-10-14T13:30:00.000Z', [dishRow(6, 'Soup', 1, 'Dev', 'placed')], [], 7);
const T3 = order('3', '2026-10-14T13:50:00.000Z', [dishRow(7, 'Wine', 1, 'Dev', 'served')], [], 2);

describe('contract with the backend (these fail if either side changes)', () => {
  test('the namespace and event name are the backend ones', () => {
    expect(KITCHEN_NAMESPACE).toBe(BACKEND_NAMESPACE);
    expect({ ...KITCHEN_EVENTS }).toEqual({ ...ORDER_EVENTS });
  });
  test('every status step the helper offers is one the backend allows, and nothing else is offered', () => {
    for (const status of ITEM_STATUSES) {
      const next = nextStatusOf(status);
      if (next) expect(canMoveStatus(status, next)).toBe(true);
      for (const target of ITEM_STATUSES) if (canMoveStatus(status, target) && target !== 'cancelled') expect(next).toBe(target);
      expect(canCancelDish({ status })).toBe(canMoveStatus(status, 'cancelled'));
    }
  });
  test('a real ticket has exactly the fields the helpers read', () => {
    expect(Object.keys(T1).sort()).toEqual(['id', 'items', 'placedAt', 'status', 'tableAllergies', 'tableNumber']);
    expect(Object.keys(T1.items[0]).sort()).toEqual(['allergyFlags', 'id', 'name', 'orderedBy', 'qty', 'status']);
  });
  test('the events and messages are frozen', () => { for (const v of [KITCHEN_EVENTS, BOARD_MESSAGES]) expect(Object.isFrozen(v)).toBe(true); });
});

describe('pollIntervalFor', () => {
  test('live means a slow safety net, anything else every 5 seconds', () => {
    expect(pollIntervalFor(true)).toBe(BOARD_POLL_LIVE_MS);
    expect(BOARD_POLL_LIVE_MS).toBe(30000);
    expect(BOARD_POLL_FALLBACK_MS).toBe(5000);
    for (const v of [false, undefined, null, 'true', 1, 'live']) expect(pollIntervalFor(v)).toBe(BOARD_POLL_FALLBACK_MS);
  });
});

describe('nextStatusOf, canCancelDish, dishActions and isOpenDish', () => {
  test('one step forward, and nothing after served or cancelled', () => {
    expect(nextStatusOf('placed')).toBe('preparing');
    expect(nextStatusOf('preparing')).toBe('ready');
    expect(nextStatusOf('ready')).toBe('served');
    for (const s of ['served', 'cancelled', 'weird', '', undefined, null, 5, {}, 'toString', '__proto__', 'constructor']) expect(nextStatusOf(s)).toBeNull();
  });
  test('only a dish that is still "placed" can be cancelled', () => {
    expect(canCancelDish({ status: 'placed' })).toBe(true);
    for (const s of ['preparing', 'ready', 'served', 'cancelled', undefined, 'PLACED']) expect(canCancelDish({ status: s })).toBe(false);
    for (const d of [undefined, null, 'x', 5]) expect(canCancelDish(d)).toBe(false);
  });
  test('dishActions combines both', () => {
    expect(dishActions({ status: 'placed' })).toEqual({ next: 'preparing', canCancel: true });
    expect(dishActions({ status: 'preparing' })).toEqual({ next: 'ready', canCancel: false });
    expect(dishActions({ status: 'ready' })).toEqual({ next: 'served', canCancel: false });
    expect(dishActions({ status: 'served' })).toEqual({ next: null, canCancel: false });
    expect(dishActions(undefined)).toEqual({ next: null, canCancel: false });
  });
  test('a dish is open while placed, preparing or ready', () => {
    for (const s of ['placed', 'preparing', 'ready']) expect(isOpenDish({ status: s })).toBe(true);
    for (const s of ['served', 'cancelled', 'x', undefined]) expect(isOpenDish({ status: s })).toBe(false);
    for (const d of [undefined, null, 'x']) expect(isOpenDish(d)).toBe(false);
  });
});

describe('splitDishes', () => {
  test('open dishes and finished dishes, each in ticket order', () => {
    const { open, done } = splitDishes(T1);
    expect(open.map((d) => d.name)).toEqual(['Tomato Soup', 'Walnut Salad', 'Cake']);
    expect(done.map((d) => d.name)).toEqual(['Tea', 'Pasta']);
  });
  test('junk gives two empty lists', () => {
    for (const v of [undefined, null, {}, { items: 'x' }, { items: [null, 5, 'y'] }]) expect(splitDishes(v)).toEqual({ open: [], done: [] });
  });
});

describe('allergy banner helpers', () => {
  test('one line per guest, by nickname, and nothing else', () => {
    expect(allergyLines(T1)).toEqual(['Asha: tree nut', 'Chitra: peanut, sesame']);
    expect(hasAllergyWarning(T1)).toBe(true);
    expect(JSON.stringify(allergyLines(T1))).not.toMatch(/phone|\+91|"id"/);
  });
  test('no allergies means no banner', () => {
    expect(allergyLines(T2)).toEqual([]);
    expect(hasAllergyWarning(T2)).toBe(false);
  });
  test('empty or junk entries are dropped', () => {
    expect(allergyLines({ tableAllergies: [{ nickname: 'Z', allergies: [] }, { nickname: 5, allergies: ['soy'] }, { nickname: 'Y', allergies: ['', 5, 'soy'] }, null, 'x'] })).toEqual(['Y: soy']);
    for (const v of [undefined, null, {}, { tableAllergies: 'x' }]) { expect(allergyLines(v)).toEqual([]); expect(hasAllergyWarning(v)).toBe(false); }
  });
  test('dishAllergens lists what a dish contains', () => {
    expect(dishAllergens(T1.items[0])).toEqual(['dairy']);
    expect(dishAllergens(T1.items[2])).toEqual([]);
    for (const v of [undefined, null, {}, { allergyFlags: 'x' }]) expect(dishAllergens(v)).toEqual([]);
    expect(dishAllergens({ allergyFlags: ['soy', '', 5, null] })).toEqual(['soy']);
  });
});

describe('waitMinutes', () => {
  const now = new Date('2026-10-14T13:50:30.000Z');
  test('whole minutes since the order was placed', () => {
    expect(waitMinutes(T1.placedAt, now)).toBe(8);
    expect(waitMinutes('2026-10-14T13:50:00.000Z', now)).toBe(0);
    expect(waitMinutes(new Date('2026-10-14T12:50:30.000Z'), now)).toBe(60);
  });
  test('a time in the future never goes negative', () => expect(waitMinutes('2026-10-14T14:50:00.000Z', now)).toBe(0));
  test.each([[undefined], [null], ['not a date'], [{}], [NaN], ['']])('an unreadable time (%p) gives null', (v) => expect(waitMinutes(v, now)).toBeNull());
  test('an unreadable "now" gives null', () => { for (const bad of ['x', null, 5, {}]) expect(waitMinutes(T1.placedAt, bad)).toBeNull();
    expect(typeof waitMinutes(T1.placedAt)).toBe('number'); });
});

describe('sortOrders and boardSummary', () => {
  test('oldest first, without changing the input', () => {
    const input = [T1, T3, T2];
    expect(sortOrders(input).map((o) => o.id)).toEqual([T2.id, T1.id, T3.id]);
    expect(input.map((o) => o.id)).toEqual([T1.id, T3.id, T2.id]);
  });
  test('an order with no readable time goes last, and ties are broken by id', () => {
    const noTime = { id: 'z', placedAt: null, items: [] };
    const emptyTime = { id: 'y', placedAt: '', items: [] };
    const tieA = { id: 'a', placedAt: '2026-10-14T13:00:00.000Z', items: [] };
    const tieB = { id: 'b', placedAt: '2026-10-14T13:00:00.000Z', items: [] };
    expect(sortOrders([noTime, emptyTime, tieB, tieA]).map((o) => o.id)).toEqual(['a', 'b', 'y', 'z']);
  });
  test('junk gives an empty list', () => { for (const v of [undefined, null, 'x', {}, [null, 5]]) expect(sortOrders(v)).toEqual([]); });
  test('the summary counts open dishes by status', () => {
    expect(boardSummary([T1, T2, T3])).toEqual({ orders: 3, openDishes: 4, byStatus: { placed: 2, preparing: 1, ready: 1 } });
    expect(boardSummary([])).toEqual({ orders: 0, openDishes: 0, byStatus: { placed: 0, preparing: 0, ready: 0 } });
    for (const v of [undefined, null, 'x']) expect(boardSummary(v).orders).toBe(0);
  });
});

describe('actionsForEvent and nextLiveState', () => {
  test('connect, an orders ping and a refused connection all ask the board again', () => {
    for (const e of ['connect', KITCHEN_EVENTS.ORDERS_CHANGED, 'connect_error']) expect(actionsForEvent(e)).toEqual({ refetch: true });
  });
  test('a disconnect and anything else ask for nothing', () => {
    for (const e of ['disconnect', 'something', undefined, null, 5]) expect(actionsForEvent(e)).toEqual({ refetch: false });
  });
  test('the live state follows the connection', () => {
    expect(nextLiveState('connecting', 'connect')).toBe('live');
    expect(nextLiveState('live', 'disconnect')).toBe('reconnecting');
    expect(nextLiveState('connecting', 'connect_error')).toBe('reconnecting');
    expect(nextLiveState('live', 'ping')).toBe('live');
    expect(nextLiveState('reconnecting', 'x')).toBe('reconnecting');
    for (const s of [undefined, null, 'weird', 5]) expect(nextLiveState(s, 'x')).toBe('connecting');
  });
});

describe('boardErrorMessage and staleAfterBoardError', () => {
  const fail = (status, data) => ({ response: { status, data: { message: 'SERVER TEXT MUST NOT APPEAR', ...data } } });
  test.each([['INVALID_MOVE', 409, BOARD_MESSAGES.dishMoved], ['ORDER_NOT_FOUND', 404, BOARD_MESSAGES.orderGone], ['TRY_AGAIN', 503, BOARD_MESSAGES.tryAgain]])('code %s', (code, status, expected) => {
    expect(boardErrorMessage(fail(status, { code }))).toBe(expected);
  });
  test('no response is a network problem; 503, 429 and anything else are handled', () => {
    expect(boardErrorMessage(new Error('Network Error'))).toBe(BOARD_MESSAGES.network);
    expect(boardErrorMessage({})).toBe(BOARD_MESSAGES.network);
    expect(boardErrorMessage(fail(503, {}))).toBe(BOARD_MESSAGES.tryAgain);
    expect(boardErrorMessage(fail(429, {}))).toBe(BOARD_MESSAGES.tooMany);
    expect(boardErrorMessage(fail(500, {}))).toBe(BOARD_MESSAGES.generic);
    expect(boardErrorMessage(fail(400, { code: 'INVALID_INPUT' }))).toBe(BOARD_MESSAGES.generic);
    expect(boardErrorMessage({ response: { status: 500, data: 'oops' } })).toBe(BOARD_MESSAGES.generic);
  });
  test('the server text is never shown', () => {
    for (const code of ['INVALID_MOVE', 'ORDER_NOT_FOUND', 'TRY_AGAIN', 'X']) expect(boardErrorMessage(fail(409, { code }))).not.toMatch(/SERVER TEXT/);
  });
  test('the board refreshes after an out-of-date answer, not after a network failure or a plain 500', () => {
    for (const code of ['INVALID_MOVE', 'ORDER_NOT_FOUND', 'TRY_AGAIN']) expect(staleAfterBoardError(fail(409, { code }))).toBe(true);
    expect(staleAfterBoardError(fail(503, {}))).toBe(true);
    for (const v of [new Error('x'), {}, null, undefined, fail(400, { code: 'INVALID_INPUT' }), fail(500, {})]) expect(staleAfterBoardError(v)).toBe(false);
  });
});
