import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { LEFT_REASONS, classifyCartLines, placementSummary } from '../../../backend/utils/orderRules.js';
import {
  LEFT_LABELS, canPlaceOrder, leftPhrase, placementMessage, ORDER_MESSAGES, orderErrorMessage, staleAfterOrderError, placedRow, placedRows,
} from './guestOrder.js';

const here = dirname(fileURLToPath(import.meta.url));
const orderControllerSource = readFileSync(resolve(here, '../../../backend/controllers/orderController.js'), 'utf8');

// ---- real server answers, built by the BACKEND's own rules ----
const uuid = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const ID = { soup: 'a'.repeat(24), nut: 'b'.repeat(24), hidden: 'c'.repeat(24) };
const person = (id, nickname, allergies, over = {}) => ({ id, nickname, role: 'guest', status: 'approved', allergiesDeclared: true, allergies, ...over });
const line = (n, itemId, addedBy) => ({ cartItemId: uuid(n), itemId, qty: 1, addedBy, isSurprise: false });
const dish = (id, name, over = {}) => ({ _id: id, name, price: 100, available: true, allergens: [], allergensConfirmed: true, ...over });
const realAnswer = () => {
  const session = { participants: [person('h', 'Hema', [], { role: 'host' }), person('a', 'Asha', ['tree nut'])], cart: [line(1, ID.soup, 'h'), line(2, ID.nut, 'a'), line(3, ID.hidden, 'h'), line(4, ID.soup, 'zz')] };
  const items = [dish(ID.soup, 'Soup'), dish(ID.nut, 'Salad', { allergens: ['tree nut'] }), dish(ID.hidden, 'Old', { available: false })];
  const { ready, left } = classifyCartLines({ session, items });
  return { placed: ready.length, left, summary: placementSummary(left) };
};
const HOST = { id: 'h', nickname: 'Hema', role: 'host', status: 'approved' };
const GUEST = { id: 'g', nickname: 'Gita', role: 'guest', status: 'approved' };
const cartWith = (n, version = 3) => ({ version, lines: Array.from({ length: n }, (_, i) => ({ id: uuid(i + 1) })) });

describe('contract with the backend (these fail if either side changes)', () => {
  test('the reasons a line can stay in the cart are exactly the backend ones', () => {
    expect(Object.keys(LEFT_LABELS).sort()).toEqual(Object.values(LEFT_REASONS).sort());
  });
  test('every error code this file reacts to is really sent by the backend order controller', () => {
    for (const code of ['CART_CHANGED', 'NOTHING_TO_ORDER', 'ALREADY_STARTED', 'ORDER_ITEM_NOT_FOUND', 'TRY_AGAIN']) {
      expect(orderControllerSource).toContain(`code: '${code}'`);
    }
  });
  test('a real placement answer has exactly the fields the helpers read', () => {
    const answer = realAnswer();
    expect(Object.keys(answer).sort()).toEqual(['left', 'placed', 'summary']);
    expect(Object.keys(answer.summary).sort()).toEqual(['byReason', 'total']);
  });
  test('the labels and messages are frozen', () => { for (const v of [LEFT_LABELS, ORDER_MESSAGES]) expect(Object.isFrozen(v)).toBe(true); });
});

describe('canPlaceOrder: only the host, only with something in the cart', () => {
  test('the host with lines may', () => expect(canPlaceOrder({ cart: cartWith(2), viewer: HOST })).toBe(true));
  test('an ordinary guest never may', () => expect(canPlaceOrder({ cart: cartWith(2), viewer: GUEST })).toBe(false));
  test('an empty cart or no cart cannot be ordered', () => {
    expect(canPlaceOrder({ cart: cartWith(0), viewer: HOST })).toBe(false);
    for (const cart of [undefined, null, {}, { lines: 'x', version: 1 }]) expect(canPlaceOrder({ cart, viewer: HOST })).toBe(false);
  });
  test('without a readable version there is nothing to send, so no button', () => {
    for (const version of [undefined, -1, 1.5, '3', null, NaN]) expect(canPlaceOrder({ cart: { ...cartWith(1), version }, viewer: HOST })).toBe(false);
  });
  test('a waiting or unknown host-like viewer never may', () => {
    for (const viewer of [{ ...HOST, status: 'pending' }, { ...HOST, status: 'weird' }, { ...HOST, role: 'HOST' }, undefined, null, {}]) expect(canPlaceOrder({ cart: cartWith(1), viewer })).toBe(false);
  });
});

describe('leftPhrase', () => {
  test('counts in a fixed order, whatever order the server listed them', () => {
    expect(leftPhrase({ 'not-suitable': 1, unavailable: 2 })).toBe('unavailable: 2, not suitable for who added it: 1');
  });
  test('an unknown reason is shown as "other", never as the raw text', () => {
    expect(leftPhrase({ unavailable: 1, 'something-new': 2, another: 1 })).toBe('unavailable: 1, other: 3');
    expect(leftPhrase({ 'something-new': 1 })).toBe('other: 1');
  });
  test('zero, negative, fractional and non-number counts are ignored', () => {
    expect(leftPhrase({ unavailable: 0, 'adder-left': -1, surprise: 1.5, 'invalid-line': '2' })).toBe('');
  });
  test.each([[undefined], [null], ['x'], [5], [[]]])('junk %p gives nothing', (v) => expect(leftPhrase(v)).toBe(''));
});

describe('placementMessage on real server answers', () => {
  test('a real mixed answer tells the host what was sent and what stayed', () => {
    const answer = realAnswer();
    expect(answer.placed).toBe(1);
    expect(placementMessage(answer)).toBe('Order placed: 1 dish sent to the kitchen. 3 items were left in the cart (unavailable: 1, not suitable for who added it: 1, added by someone who left: 1).');
  });
  test('nothing left behind gives one clean sentence, singular and plural', () => {
    expect(placementMessage({ placed: 1, left: [], summary: { total: 0, byReason: {} } })).toBe('Order placed: 1 dish sent to the kitchen.');
    expect(placementMessage({ placed: 4, left: [], summary: { total: 0, byReason: {} } })).toBe('Order placed: 4 dishes sent to the kitchen.');
  });
  test('one item left uses the singular', () => {
    expect(placementMessage({ placed: 2, summary: { total: 1, byReason: { unavailable: 1 } } })).toBe('Order placed: 2 dishes sent to the kitchen. 1 item was left in the cart (unavailable: 1).');
  });
  test('no dishes placed (which the server never reports as success) gives no sentence', () => {
    for (const answer of [{ placed: 0 }, { placed: -1 }, { placed: 1.5 }, { placed: '2' }, {}, undefined, null]) expect(placementMessage(answer)).toBe('');
  });
  test('a missing summary never breaks the sentence', () => {
    expect(placementMessage({ placed: 2 })).toBe('Order placed: 2 dishes sent to the kitchen.');
    expect(placementMessage({ placed: 2, summary: { total: 3 } })).toBe('Order placed: 2 dishes sent to the kitchen.');
  });
});

describe('orderErrorMessage and staleAfterOrderError', () => {
  const fail = (status, data) => ({ response: { status, data: { message: 'SERVER TEXT MUST NOT APPEAR', ...data } } });
  test.each([
    ['CART_CHANGED', 409, ORDER_MESSAGES.cartChanged], ['ALREADY_STARTED', 409, ORDER_MESSAGES.alreadyStarted],
    ['ORDER_ITEM_NOT_FOUND', 404, ORDER_MESSAGES.dishGone], ['TRY_AGAIN', 503, ORDER_MESSAGES.tryAgain],
  ])('code %s', (code, status, expected) => expect(orderErrorMessage(fail(status, { code }))).toBe(expected));
  test('NOTHING_TO_ORDER explains why, from the real left list', () => {
    const { left } = realAnswer();
    expect(orderErrorMessage(fail(409, { code: 'NOTHING_TO_ORDER', left }))).toBe('Nothing in the cart can be ordered right now (unavailable: 1, not suitable for who added it: 1, added by someone who left: 1)');
    expect(orderErrorMessage(fail(409, { code: 'NOTHING_TO_ORDER' }))).toBe(ORDER_MESSAGES.nothingToOrder);
    expect(orderErrorMessage(fail(409, { code: 'NOTHING_TO_ORDER', left: [null, 5, { reason: 5 }] }))).toBe(ORDER_MESSAGES.nothingToOrder);
  });
  test('no response is a network problem; 503 and 429 without a code are handled; anything else is generic', () => {
    expect(orderErrorMessage(new Error('Network Error'))).toBe(ORDER_MESSAGES.network);
    expect(orderErrorMessage({})).toBe(ORDER_MESSAGES.network);
    expect(orderErrorMessage(fail(503, {}))).toBe(ORDER_MESSAGES.tryAgain);
    expect(orderErrorMessage(fail(429, {}))).toBe(ORDER_MESSAGES.tooMany);
    expect(orderErrorMessage(fail(500, {}))).toBe(ORDER_MESSAGES.generic);
    expect(orderErrorMessage(fail(403, { code: 'NOT_HOST' }))).toBe(ORDER_MESSAGES.generic);
    expect(orderErrorMessage({ response: { status: 500, data: 'oops' } })).toBe(ORDER_MESSAGES.generic);
  });
  test('the server text is never shown', () => {
    for (const code of ['CART_CHANGED', 'NOTHING_TO_ORDER', 'ALREADY_STARTED', 'ORDER_ITEM_NOT_FOUND', 'TRY_AGAIN', 'X']) expect(orderErrorMessage(fail(409, { code }))).not.toMatch(/SERVER TEXT/);
  });
  test('the screen refreshes after an out-of-date answer, not after a network failure, a 403 or a plain 500', () => {
    for (const code of ['CART_CHANGED', 'NOTHING_TO_ORDER', 'ALREADY_STARTED', 'ORDER_ITEM_NOT_FOUND', 'TRY_AGAIN']) expect(staleAfterOrderError(fail(409, { code }))).toBe(true);
    expect(staleAfterOrderError(fail(503, {}))).toBe(true);
    for (const v of [new Error('x'), {}, null, undefined, fail(403, { code: 'NOT_HOST' }), fail(400, { code: 'INVALID_INPUT' }), fail(500, {})]) expect(staleAfterOrderError(v)).toBe(false);
  });
});

describe('placedRow and placedRows (the host\'s "sent to the kitchen" list)', () => {
  const row = { orderId: 'd'.repeat(24), orderItemId: uuid(9), name: 'Soup', qty: 2, orderedBy: 'Bala' };
  test('a good row is returned with exactly the fields shown', () => expect(placedRow({ ...row, price: 250, extra: 1 })).toEqual(row));
  test('a missing adder name becomes empty text, not undefined', () => expect(placedRow({ ...row, orderedBy: undefined }).orderedBy).toBe(''));
  test.each([
    [{ ...row, orderId: 'short' }], [{ ...row, orderId: 5 }], [{ ...row, orderItemId: 'not-a-uuid' }], [{ ...row, name: '' }], [{ ...row, name: 5 }],
    [{ ...row, qty: 0 }], [{ ...row, qty: 1.5 }], [{ ...row, qty: '2' }], [undefined], [null], ['x'], [5],
  ])('an untrustworthy row %# is dropped', (value) => expect(placedRow(value)).toBeNull());
  test('placedRows keeps the good rows in order and drops the rest', () => {
    expect(placedRows([row, null, { ...row, qty: 0 }, { ...row, orderItemId: uuid(10), name: 'Tea' }]).map((r) => r.name)).toEqual(['Soup', 'Tea']);
    for (const v of [undefined, null, 'x', {}]) expect(placedRows(v)).toEqual([]);
  });
});
