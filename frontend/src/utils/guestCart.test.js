import { describe, test, expect } from 'vitest';
import { buildCartView } from '../../../backend/utils/cartView.js';
import { LIVE_EVENTS as BACKEND_EVENTS } from '../../../backend/utils/liveRules.js';
import { CART_LIMITS } from '../../../backend/utils/cartRules.js';
import {
  LIVE_EVENTS, CART_MAX_QUANTITY, LIVE_SAFETY_POLL_MS, pollIntervalFor, emptyCart, shouldApplyCart, shouldFetchForPing, actionsFor,
  nextLiveState, cartSummary, myQuantityFor, groupLinesByAdder, lineActions, lineWarning, CART_MESSAGES, cartErrorMessage, staleAfter,
} from './guestCart.js';
import { GUEST_POLL_MS } from './guestSession.js';
import { UNSAFE_MESSAGES } from './guestMenu.js';

// ---- real cart views, built by the BACKEND's own code ----
const ID = { soup: 'a'.repeat(24), peanutSalad: 'b'.repeat(24), mousse: 'c'.repeat(24), hidden: 'd'.repeat(24), draft: 'e'.repeat(24) };
const dish = (id, name, price, over = {}) => ({ _id: id, name, price, available: true, allergens: [], allergensConfirmed: true, ...over });
const MENU = [
  dish(ID.soup, 'Tomato Soup', 250),
  dish(ID.peanutSalad, 'Peanut Salad', 400, { allergens: ['peanut'] }),
  dish(ID.mousse, 'Mousse', 300, { allergens: ['dairy'], allergensConfirmed: false }),
  dish(ID.hidden, 'Old Special', 500, { available: false }),
];
const person = (id, nickname, role, allergies) => ({ id, nickname, role, status: 'approved', allergiesDeclared: true, allergies });
const HOST = person('h1', 'Hema', 'host', []);
const RAVI = person('g1', 'Ravi', 'guest', ['peanut']);
const line = (n, itemId, qty, addedBy, over = {}) => ({ cartItemId: `00000000-0000-4000-8000-00000000000${n}`, itemId, qty, addedBy, isSurprise: false, ...over });
const CART = [line(1, ID.soup, 2, 'h1'), line(2, ID.peanutSalad, 1, 'h1'), line(3, ID.soup, 1, 'g1'), line(4, ID.mousse, 1, 'g1'), line(5, ID.hidden, 1, 'h1'), line(6, ID.draft, 1, 'h1', { isSurprise: true })];
const SESSION = { cartVersion: 7, participants: [HOST, RAVI], cart: CART };
const viewFor = (viewer, session = SESSION, items = MENU) => buildCartView({ session, items, viewer });
const hostView = viewFor(HOST);
const raviView = viewFor(RAVI);
const find = (view, n) => view.lines.find((l) => l.id.endsWith(String(n)));

describe('contract with the backend (these fail if either side changes)', () => {
  test('the live event names are the backend ones', () => expect({ ...LIVE_EVENTS }).toEqual({ ...BACKEND_EVENTS }));
  test('the quantity limit is the backend one', () => expect(CART_MAX_QUANTITY).toBe(CART_LIMITS.maxQuantity));
  test('a real cart view has exactly the fields the helpers read', () => {
    expect(Object.keys(hostView).sort()).toEqual(['hasHiddenLines', 'lines', 'total', 'totalQuantity', 'version']);
    expect(Object.keys(hostView.lines[0]).sort()).toEqual(['addedBy', 'canEdit', 'clashes', 'id', 'isSurprise', 'lineTotal', 'menuItemId', 'name', 'price', 'quantity', 'reason', 'safeForYou', 'unavailable']);
  });
  test('the events and messages are frozen', () => {
    for (const value of [LIVE_EVENTS, CART_MESSAGES]) expect(Object.isFrozen(value)).toBe(true);
  });
});

describe('poll interval and the empty cart', () => {
  test('live means a slow safety-net refresh, anything else means every 5 seconds', () => {
    expect(pollIntervalFor(true)).toBe(LIVE_SAFETY_POLL_MS);
    expect(LIVE_SAFETY_POLL_MS).toBe(30000);
    for (const value of [false, undefined, null, 'true', 1, 'live']) expect(pollIntervalFor(value)).toBe(GUEST_POLL_MS);
    expect(GUEST_POLL_MS).toBe(5000);
  });
  test('an empty cart is a valid, current-looking cart', () => {
    expect(emptyCart()).toEqual({ version: 0, lines: [], totalQuantity: 0, total: 0, hasHiddenLines: false });
    expect(cartSummary(emptyCart())).toEqual({ itemCount: 0, total: 0, hasLines: false });
  });
});

describe('shouldApplyCart: a late answer never replaces a newer one', () => {
  const v = (version) => ({ version, lines: [] });
  test('newer and equal versions are applied, older ones are not', () => {
    expect(shouldApplyCart(v(5), v(6))).toBe(true);
    expect(shouldApplyCart(v(5), v(5))).toBe(true);
    expect(shouldApplyCart(v(5), v(4))).toBe(false);
  });
  test('with nothing on screen yet any well-formed cart is applied', () => {
    expect(shouldApplyCart(null, v(0))).toBe(true);
    expect(shouldApplyCart(undefined, v(3))).toBe(true);
  });
  test.each([[undefined], [null], [{}], [{ version: 1 }], [{ lines: [] }], [{ version: -1, lines: [] }], [{ version: 1.5, lines: [] }], [{ version: '2', lines: [] }], [{ version: 2, lines: 'x' }], ['cart'], [5]])('a malformed answer %p is never applied', (incoming) => {
    expect(shouldApplyCart(v(1), incoming)).toBe(false);
    expect(shouldApplyCart(null, incoming)).toBe(false);
  });
  test('a real server cart is applied', () => expect(shouldApplyCart(emptyCart(), hostView)).toBe(true));
});

describe('shouldFetchForPing and actionsFor', () => {
  test('a ping is only skipped when it is clearly not newer', () => {
    expect(shouldFetchForPing(5, { version: 6 })).toBe(true);
    expect(shouldFetchForPing(5, { version: 5 })).toBe(false);
    expect(shouldFetchForPing(5, { version: 4 })).toBe(false);
  });
  test.each([[undefined], [null], [{}], [{ version: 'x' }], [{ version: -3 }], [{ version: 2.5 }], ['v']])('an unreadable ping %p means "ask, to be safe"', (payload) => {
    expect(shouldFetchForPing(5, payload)).toBe(true);
  });
  test('holding no cart yet means "ask"', () => {
    expect(shouldFetchForPing(undefined, { version: 1 })).toBe(true);
    expect(shouldFetchForPing(null, { version: 0 })).toBe(true);
  });
  test('connect (including a reconnect) re-syncs everything', () => expect(actionsFor('connect', undefined, 3)).toEqual({ session: true, cart: true }));
  test('a session change re-syncs everything', () => expect(actionsFor(LIVE_EVENTS.SESSION_CHANGED, {}, 3)).toEqual({ session: true, cart: true }));
  test('a cart change asks for the cart only, and only when newer', () => {
    expect(actionsFor(LIVE_EVENTS.CART_CHANGED, { version: 9 }, 3)).toEqual({ session: false, cart: true });
    expect(actionsFor(LIVE_EVENTS.CART_CHANGED, { version: 3 }, 3)).toEqual({ session: false, cart: false });
  });
  test('a refused connection asks the normal route what is going on and is NEVER read as "removed"', () => {
    expect(actionsFor('connect_error', { message: 'unauthorised' }, 3)).toEqual({ session: true, cart: false });
  });
  test.each([['disconnect'], ['something'], [undefined], [null], [5]])('%p asks for nothing', (event) => expect(actionsFor(event, {}, 3)).toEqual({ session: false, cart: false }));
});

describe('nextLiveState', () => {
  test('connect makes it live, a drop or a refusal makes it reconnecting', () => {
    expect(nextLiveState('connecting', 'connect')).toBe('live');
    expect(nextLiveState('reconnecting', 'connect')).toBe('live');
    expect(nextLiveState('live', 'disconnect')).toBe('reconnecting');
    expect(nextLiveState('connecting', 'connect_error')).toBe('reconnecting');
  });
  test('unknown events keep the state, and a strange state starts as connecting', () => {
    expect(nextLiveState('live', 'ping')).toBe('live');
    expect(nextLiveState('reconnecting', 'x')).toBe('reconnecting');
    for (const state of [undefined, null, 'weird', 5]) expect(nextLiveState(state, 'x')).toBe('connecting');
  });
});

describe('cartSummary, myQuantityFor and groupLinesByAdder on real server views', () => {
  test('the summary comes from the server numbers (soup 250 x 2 + 250 x 1 + peanut salad 400 + mousse 300 = 1450)', () => {
    expect(cartSummary(hostView)).toEqual({ itemCount: 7, total: 1450, hasLines: true });
  });
  test('the hidden dish is in the count but never in the total', () => expect(find(hostView, 5)).toMatchObject({ unavailable: true, lineTotal: null }));
  test.each([[undefined], [null], [{}], [{ total: 'x', totalQuantity: 'y' }], [{ total: -5, totalQuantity: -2, lines: [] }], [{ total: NaN, totalQuantity: 1.5 }]])('a strange cart %p gives a safe summary', (cart) => {
    expect(cartSummary(cart)).toEqual({ itemCount: 0, total: 0, hasLines: false });
  });
  test('myQuantityFor counts only this guest\'s own line of that dish', () => {
    expect(myQuantityFor(hostView, ID.soup, 'h1')).toBe(2);
    expect(myQuantityFor(hostView, ID.soup, 'g1')).toBe(1);
    expect(myQuantityFor(hostView, ID.mousse, 'h1')).toBe(0);
  });
  test('an unavailable or surprise line is never counted, and junk gives 0', () => {
    expect(myQuantityFor(hostView, ID.hidden, 'h1')).toBe(0);
    expect(myQuantityFor(hostView, null, 'h1')).toBe(0);
    for (const args of [[undefined, ID.soup, 'h1'], [hostView, '', 'h1'], [hostView, ID.soup, ''], [hostView, ID.soup, undefined], [{ lines: 'x' }, ID.soup, 'h1']]) expect(myQuantityFor(...args)).toBe(0);
  });
  test('lines are grouped by the guest who added them, in order of first appearance', () => {
    const groups = groupLinesByAdder(hostView);
    expect(groups.map((g) => g.adder.nickname)).toEqual(['Hema', 'Ravi']);
    expect(groups[0].lines).toHaveLength(4);
    expect(groups[1].lines).toHaveLength(2);
  });
  test('a guest who left shows as "Former guest"', () => {
    const view = viewFor(HOST, { ...SESSION, participants: [HOST] });
    expect(groupLinesByAdder(view).map((g) => g.adder.nickname)).toEqual(['Hema', 'Former guest']);
  });
  test('junk input gives no groups and never throws', () => {
    for (const value of [undefined, null, {}, { lines: 'x' }, { lines: [null, undefined, 5] }]) expect(groupLinesByAdder(value)).toEqual([]);
  });
  test('a line with a missing or empty adder name is shown under "Former guest" (the frontend fallback)', () => {
    const lines = [{ id: 'l1', addedBy: { id: 'x' } }, { id: 'l2', addedBy: { id: 'y', nickname: '' } }, { id: 'l3' }, { id: 'l4', addedBy: { id: 'z', nickname: 5 } }];
    expect(groupLinesByAdder({ lines }).map((g) => g.adder.nickname)).toEqual(['Former guest', 'Former guest', 'Former guest', 'Former guest']);
  });
});

describe('lineActions on real server views', () => {
  test('the host may remove or decrease anybody\'s line, but may only increase their own', () => {
    expect(lineActions(find(hostView, 1), 'h1')).toEqual({ canIncrease: true, canDecrease: true, canRemove: true });
    expect(lineActions(find(hostView, 3), 'h1')).toEqual({ canIncrease: false, canDecrease: false, canRemove: true });
  });
  test('an ordinary guest may only touch their own lines', () => {
    expect(lineActions(find(raviView, 3), 'g1')).toEqual({ canIncrease: true, canDecrease: false, canRemove: true });
    expect(lineActions(find(raviView, 1), 'g1')).toEqual({ canIncrease: false, canDecrease: false, canRemove: false });
  });
  test('a line that is not safe for the guest cannot be increased, only removed', () => {
    expect(lineActions(find(raviView, 4), 'g1')).toEqual({ canIncrease: false, canDecrease: false, canRemove: true });
  });
  test('an unavailable line can only be removed or decreased, never increased', () => {
    expect(lineActions(find(hostView, 5), 'h1')).toEqual({ canIncrease: false, canDecrease: false, canRemove: true });
  });
  test('a surprise line has no buttons for anybody', () => {
    expect(lineActions(find(hostView, 6), 'h1')).toEqual({ canIncrease: false, canDecrease: false, canRemove: false });
  });
  test('the quantity limit stops the plus', () => {
    const full = { ...find(hostView, 1), quantity: CART_MAX_QUANTITY };
    expect(lineActions(full, 'h1').canIncrease).toBe(false);
    expect(lineActions({ ...full, quantity: CART_MAX_QUANTITY - 1 }, 'h1').canIncrease).toBe(true);
  });
  test('the minus needs a quantity above 1', () => {
    expect(lineActions({ ...find(hostView, 1), quantity: 1 }, 'h1').canDecrease).toBe(false);
    expect(lineActions({ ...find(hostView, 1), quantity: 2 }, 'h1').canDecrease).toBe(true);
  });
  test.each([[undefined], [null], [{}], ['x'], [5]])('junk line %p gets no buttons', (value) => expect(lineActions(value, 'h1')).toEqual({ canIncrease: false, canDecrease: false, canRemove: false }));
  test('only an exact true for canEdit and safeForYou counts (fail closed)', () => {
    const base = find(hostView, 1);
    for (const v of ['true', 1, undefined, null]) {
      expect(lineActions({ ...base, canEdit: v }, 'h1')).toEqual({ canIncrease: false, canDecrease: false, canRemove: false });
      expect(lineActions({ ...base, safeForYou: v }, 'h1').canIncrease).toBe(false);
    }
  });
  test('without knowing who the viewer is, "+" is never offered', () => {
    for (const viewer of [undefined, null, '', 5]) expect(lineActions(find(hostView, 1), viewer).canIncrease).toBe(false);
  });
});

describe('lineWarning on real server views', () => {
  test('a safe line has no warning', () => expect(lineWarning(find(hostView, 1))).toBeNull());
  test('a peanut dish for a peanut-allergic guest says what clashes', () => {
    expect(lineWarning(find(raviView, 2))).toBe('Contains peanut');
  });
  test('an unconfirmed dish for an allergic guest says so', () => expect(lineWarning(find(raviView, 4))).toBe(UNSAFE_MESSAGES.unconfirmed));
  test('a hidden dish says it is no longer available', () => expect(lineWarning(find(hostView, 5))).toBe('No longer available'));
  test('a surprise line never explains anything', () => expect(lineWarning(find(hostView, 6))).toBeNull());
  test('a guest who has not answered the allergy question never gets a "safe" line', () => {
    const undeclared = viewFor({ ...HOST, allergiesDeclared: false });
    expect(find(undeclared, 1).safeForYou).toBe(false);
    expect(lineWarning(find(undeclared, 1))).toBe(UNSAFE_MESSAGES.unknown);
  });
  test('anything not exactly safe gets the cautious sentence', () => {
    for (const safeForYou of [undefined, null, 'true', 1, false]) expect(lineWarning({ ...find(hostView, 1), safeForYou, reason: 'weird' })).toBe(UNSAFE_MESSAGES.unknown);
  });
  test('junk gives no warning', () => {
    for (const value of [undefined, null, 'x', 5]) expect(lineWarning(value)).toBeNull();
  });
});

describe('cartErrorMessage and staleAfter', () => {
  const fail = (status, data) => ({ response: { status, data: { message: 'SERVER TEXT MUST NOT APPEAR', ...data } } });
  test('NOT_SAFE says what clashed, using the menu wording', () => {
    expect(cartErrorMessage(fail(409, { code: 'NOT_SAFE', reason: 'allergen', clashes: ['peanut', 'soy'] }))).toBe('Not added. Contains peanut, soy');
    expect(cartErrorMessage(fail(409, { code: 'NOT_SAFE', reason: 'unconfirmed', clashes: [] }))).toBe(`Not added. ${UNSAFE_MESSAGES.unconfirmed}`);
    expect(cartErrorMessage(fail(409, { code: 'NOT_SAFE' }))).toBe(`Not added. ${UNSAFE_MESSAGES.unknown}`);
  });
  test.each([
    ['ITEM_NOT_FOUND', 404, CART_MESSAGES.itemGone], ['QTY_LIMIT', 409, CART_MESSAGES.qtyLimit], ['CART_FULL', 409, CART_MESSAGES.cartFull],
    ['MIN_QTY', 409, CART_MESSAGES.minQty], ['CART_ITEM_NOT_FOUND', 404, CART_MESSAGES.lineChanged], ['TRY_AGAIN', 503, CART_MESSAGES.tryAgain],
  ])('code %s', (code, status, expected) => expect(cartErrorMessage(fail(status, { code }))).toBe(expected));
  test('no response is a network problem; 503 and 429 without a code are handled; anything else is generic', () => {
    expect(cartErrorMessage(new Error('Network Error'))).toBe(CART_MESSAGES.network);
    expect(cartErrorMessage({})).toBe(CART_MESSAGES.network);
    expect(cartErrorMessage(fail(503, {}))).toBe(CART_MESSAGES.tryAgain);
    expect(cartErrorMessage(fail(429, {}))).toBe(CART_MESSAGES.tooMany);
    expect(cartErrorMessage(fail(500, {}))).toBe(CART_MESSAGES.generic);
    expect(cartErrorMessage(fail(400, { code: 'INVALID_INPUT' }))).toBe(CART_MESSAGES.generic);
    expect(cartErrorMessage({ response: { status: 500 } })).toBe(CART_MESSAGES.generic);
    expect(cartErrorMessage({ response: { status: 500, data: 'oops' } })).toBe(CART_MESSAGES.generic);
  });
  test('the server\'s own text is never shown', () => {
    for (const code of ['NOT_SAFE', 'ITEM_NOT_FOUND', 'QTY_LIMIT', 'CART_FULL', 'MIN_QTY', 'CART_ITEM_NOT_FOUND', 'TRY_AGAIN', 'X']) {
      expect(cartErrorMessage(fail(409, { code }))).not.toMatch(/SERVER TEXT/);
    }
  });
  test('staleAfter is true when the screen must have been out of date', () => {
    for (const code of ['ITEM_NOT_FOUND', 'CART_ITEM_NOT_FOUND', 'QTY_LIMIT', 'CART_FULL', 'MIN_QTY', 'NOT_SAFE', 'TRY_AGAIN']) expect(staleAfter(fail(409, { code }))).toBe(true);
    expect(staleAfter(fail(503, {}))).toBe(true);
  });
  test('staleAfter is false for a network failure, a 400 and a 500', () => {
    for (const value of [new Error('x'), {}, null, undefined, fail(400, { code: 'INVALID_INPUT' }), fail(500, {})]) expect(staleAfter(value)).toBe(false);
  });
});
