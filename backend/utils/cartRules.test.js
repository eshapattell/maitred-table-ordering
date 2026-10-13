// cartRules.test.js: tests for the pure cart rules (no database needed).
import { randomUUID } from 'node:crypto';
import {
  CART_LIMITS, isValidItemId, isValidCartItemId, validateAddInput, validateDecreaseInput, canEditLine, priceToPaise, newCartLine,
} from './cartRules.js';

const ITEM = '65f0c0ffee65f0c0ffee65f0';

describe('limits and ids', () => {
  test('the limits are frozen and are the documented ones', () => {
    expect(CART_LIMITS).toEqual({ maxLines: 40, maxQuantity: 20 });
    expect(Object.isFrozen(CART_LIMITS)).toBe(true);
  });
  test.each([[ITEM, true], ['65F0C0FFEE65F0C0FFEE65F0', true], ['65f0c0ffee65f0c0ffee65f', false], ['65f0c0ffee65f0c0ffee65f00', false], ['zzf0c0ffee65f0c0ffee65f0', false], ['', false], [null, false], [undefined, false], [5, false], [{}, false], [[ITEM], false]])(
    'isValidItemId(%p) is %p', (value, expected) => expect(isValidItemId(value)).toBe(expected));
  test('every UUID that crypto.randomUUID makes is a valid cart item id', () => {
    for (let i = 0; i < 300; i++) expect(isValidCartItemId(randomUUID())).toBe(true);
  });
  test.each([['not-a-uuid'], [''], [null], [undefined], [5], ['1234'], [ITEM], ['ZZZZZZZZ-ZZZZ-4ZZZ-8ZZZ-ZZZZZZZZZZZZ'], [randomUUID() + 'x'], [' ' + randomUUID()], [randomUUID().toUpperCase()]])(
    'isValidCartItemId(%p) is false', (value) => expect(isValidCartItemId(value)).toBe(false));
});

describe('validateAddInput', () => {
  test('a good body gives the dish and the quantity', () => expect(validateAddInput({ menuItemId: ITEM, quantity: 3 })).toEqual({ ok: true, menuItemId: ITEM, quantity: 3 }));
  test('a missing quantity means 1', () => expect(validateAddInput({ menuItemId: ITEM })).toEqual({ ok: true, menuItemId: ITEM, quantity: 1 }));
  test.each([[1], [20]])('quantity %p is accepted', (quantity) => expect(validateAddInput({ menuItemId: ITEM, quantity }).ok).toBe(true));
  test.each([[0], [21], [-1], [1.5], ['2'], [null], [NaN], [Infinity], [true], [[2]], [{}], ['']])('quantity %p is rejected', (quantity) => {
    expect(validateAddInput({ menuItemId: ITEM, quantity }).ok).toBe(false);
  });
  test.each([[undefined], [null], [''], ['abc'], [5], [{ $ne: null }], [[ITEM]]])('menuItemId %p is rejected', (menuItemId) => {
    expect(validateAddInput({ menuItemId, quantity: 1 }).ok).toBe(false);
  });
  test('a missing, null or odd body never throws and is rejected', () => {
    for (const body of [undefined, null, 'x', 5, [], [ITEM], {}]) {
      expect(() => validateAddInput(body)).not.toThrow();
      expect(validateAddInput(body).ok).toBe(false);
    }
  });
  test('extra fields are ignored and never returned', () => {
    expect(validateAddInput({ menuItemId: ITEM, quantity: 2, price: 1, addedBy: 'x', isSurprise: true })).toEqual({ ok: true, menuItemId: ITEM, quantity: 2 });
  });
});

describe('validateDecreaseInput: only exactly { delta: -1 }', () => {
  test('-1 is accepted and gives nothing else', () => expect(validateDecreaseInput({ delta: -1 })).toEqual({ ok: true }));
  test.each([[undefined], [1], [0], [-0], [-2], [2], [-0.5], ['-1'], [null], [NaN], [-Infinity], [true], [[-1]], [{}], ['']])('delta %p is rejected', (delta) => {
    expect(validateDecreaseInput({ delta }).ok).toBe(false);
  });
  test('adding more is refused here: +1 must go through the add route', () => expect(validateDecreaseInput({ delta: 1 }).ok).toBe(false));
  test('a missing, null or odd body never throws and is rejected', () => {
    for (const body of [undefined, null, [], 'x', 5, {}]) expect(validateDecreaseInput(body).ok).toBe(false);
  });
  test('extra fields are ignored', () => expect(validateDecreaseInput({ delta: -1, quantity: 99, $set: { qty: 0 } })).toEqual({ ok: true }));
});

describe('canEditLine', () => {
  const guest = { id: 'g1', role: 'guest', status: 'approved' };
  const host = { id: 'h1', role: 'host', status: 'approved' };
  const mine = { addedBy: 'g1' };
  const theirs = { addedBy: 'g2' };
  test('a guest may edit their own line only', () => {
    expect(canEditLine(guest, mine)).toBe(true);
    expect(canEditLine(guest, theirs)).toBe(false);
  });
  test('the host may edit any line', () => {
    expect(canEditLine(host, mine)).toBe(true);
    expect(canEditLine(host, theirs)).toBe(true);
  });
  test('a pending guest, even a pending "host", may edit nothing', () => {
    expect(canEditLine({ ...guest, status: 'pending' }, mine)).toBe(false);
    expect(canEditLine({ ...host, status: 'pending' }, theirs)).toBe(false);
  });
  test.each([['HOST'], ['Host'], ['admin'], [undefined], [null]])('role %p is not the host', (role) => {
    expect(canEditLine({ id: 'x', role, status: 'approved' }, theirs)).toBe(false);
  });
  test('missing or strange input is always false', () => {
    for (const viewer of [undefined, null, {}, 'x', { id: '', role: 'host', status: 'approved' }, { role: 'host', status: 'approved' }, { id: 5, role: 'host', status: 'approved' }]) {
      expect(canEditLine(viewer, mine)).toBe(false);
    }
    for (const line of [undefined, null, 'x', 5]) expect(canEditLine(host, line)).toBe(false);
  });
  test('a line with no adder is editable only by the host', () => {
    expect(canEditLine(guest, {})).toBe(false);
    expect(canEditLine(host, {})).toBe(true);
  });
});

describe('priceToPaise', () => {
  test.each([[250, 25000], [0.1, 10], [0.29, 29], [19.99, 1999], [1234.56, 123456], [100000, 10000000], [0.01, 1], [1.1, 110], [4.35, 435]])('%p rupees is %p paise', (price, paise) => {
    expect(priceToPaise(price)).toBe(paise);
  });
  test.each([[0], [-1], [100001], [1.005], [0.001], [19.999], [NaN], [Infinity], ['250'], [null], [undefined], [{}], [[]], [true]])('%p is not a usable price', (price) => {
    expect(priceToPaise(price)).toBeNull();
  });
  test('3000 prices made from whole paise always convert back exactly', () => {
    let seed = 99;
    const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    for (let i = 0; i < 3000; i++) {
      const paise = 1 + Math.floor(rand() * 10000000);
      expect(priceToPaise(paise / 100)).toBe(paise);
    }
  });
});

describe('newCartLine', () => {
  test('builds exactly the stored shape for an ordinary line', () => {
    const id = randomUUID();
    expect(newCartLine({ cartItemId: id, itemId: ITEM, quantity: 2, addedBy: 'g1' })).toEqual({ cartItemId: id, itemId: ITEM, qty: 2, addedBy: 'g1', isSurprise: false });
  });
  test('accepts an object whose string form is a valid id (an ObjectId)', () => {
    const asObject = { toString: () => ITEM };
    expect(newCartLine({ cartItemId: randomUUID(), itemId: asObject, quantity: 1, addedBy: 'g1' }).qty).toBe(1);
  });
  test('refuses to build anything invalid', () => {
    const ok = { cartItemId: randomUUID(), itemId: ITEM, quantity: 1, addedBy: 'g1' };
    for (const bad of [{ cartItemId: 'x' }, { itemId: 'x' }, { quantity: 0 }, { quantity: 21 }, { quantity: 1.5 }, { addedBy: '' }, { addedBy: 5 }]) {
      expect(() => newCartLine({ ...ok, ...bad })).toThrow(TypeError);
    }
    expect(() => newCartLine()).toThrow(TypeError);
    expect(() => newCartLine(null)).toThrow(TypeError);
  });
});
