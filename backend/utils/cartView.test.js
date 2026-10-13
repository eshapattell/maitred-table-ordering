// cartView.test.js: tests for the per-guest cart view (no database needed).
import { randomUUID } from 'node:crypto';
import { buildCartView, SURPRISE_NAME, UNAVAILABLE_NAME, FORMER_GUEST } from './cartView.js';

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};
const ID = (n) => `65f0c0ffee65f0c0ffee65f${n}`;
const dish = (n, over = {}) => ({ _id: ID(n), name: `Dish ${n}`, price: 100 * n, available: true, allergens: [], allergensConfirmed: true, ...over });
const line = (n, over = {}) => ({ cartItemId: randomUUID(), itemId: ID(n), qty: 1, addedBy: 'g1', isSurprise: false, ...over });
const people = [
  { id: 'h1', nickname: 'Hema', role: 'host', status: 'approved', phone: '+919824079988', allergies: ['peanut'], allergiesDeclared: true },
  { id: 'g1', nickname: 'Ravi', role: 'guest', status: 'approved', phone: '+919824079977', allergies: [], allergiesDeclared: true },
  { id: 'g2', nickname: 'Asha', role: 'guest', status: 'approved', phone: '+919824079966', allergies: ['dairy', 'soy'], allergiesDeclared: true },
];
const viewerOf = (id) => people.find((p) => p.id === id);
const sessionWith = (cart, over = {}) => ({ cart, cartVersion: 4, participants: people, ...over });
const view = (cart, items, viewerId = 'g1', sessionOver = {}) =>
  buildCartView(deepFreeze({ session: sessionWith(cart, sessionOver), items, viewer: viewerOf(viewerId) }));

describe('an ordinary cart', () => {
  const cart = [line(1, { qty: 2 }), line(2, { addedBy: 'g2', qty: 1 })];
  const items = [dish(1), dish(2)];
  test('lines carry the dish details, quantity, adder and totals', () => {
    const v = view(cart, items);
    expect(v.version).toBe(4);
    expect(v.lines).toHaveLength(2);
    expect(v.lines[0]).toMatchObject({ id: cart[0].cartItemId, menuItemId: ID(1), name: 'Dish 1', price: 100, quantity: 2, lineTotal: 200, addedBy: { id: 'g1', nickname: 'Ravi' }, isSurprise: false, unavailable: false });
    expect(v.totalQuantity).toBe(3);
    expect(v.total).toBe(400);
    expect(v.hasHiddenLines).toBe(false);
  });
  test('every line has exactly these keys', () => {
    for (const l of view(cart, items).lines) {
      expect(Object.keys(l).sort()).toEqual(['addedBy', 'canEdit', 'clashes', 'id', 'isSurprise', 'lineTotal', 'menuItemId', 'name', 'price', 'quantity', 'reason', 'safeForYou', 'unavailable']);
    }
  });
  test('the order of the stored cart is kept', () => expect(view(cart, items).lines.map((l) => l.menuItemId)).toEqual([ID(1), ID(2)]));
  test('an empty cart', () => expect(view([], items)).toEqual({ version: 4, lines: [], totalQuantity: 0, total: 0, hasHiddenLines: false }));
  test('the inputs are never changed (they are deep-frozen in these tests)', () => {
    expect(() => view(cart, items)).not.toThrow();
  });
});

describe('totals use whole paise, never floating point', () => {
  test('three of a 0.1 rupee dish is exactly 0.3', () => expect(view([line(1, { qty: 3 })], [dish(1, { price: 0.1 })]).total).toBe(0.3));
  test('a mix of awkward prices adds up exactly', () => {
    const v = view([line(1, { qty: 3 }), line(2, { qty: 7 }), line(3, { qty: 1 })], [dish(1, { price: 33.33 }), dish(2, { price: 0.29 }), dish(3, { price: 1234.56 })]);
    expect(v.total).toBe(1336.58); // 99.99 + 2.03 + 1234.56
    expect(v.lines.map((l) => l.lineTotal)).toEqual([99.99, 2.03, 1234.56]);
  });
  test('prices that cannot be exact (too many decimals, zero, negative, text) make the line unavailable and uncounted', () => {
    for (const price of [1.005, 0, -5, '100', null, undefined, NaN, 100001]) {
      const v = view([line(1, { qty: 2 })], [dish(1, { price })]);
      expect(v.lines[0].unavailable).toBe(true);
      expect(v.lines[0].price).toBeNull();
      expect(v.lines[0].lineTotal).toBeNull();
      expect(v.total).toBe(0);
    }
  });
});

describe('who may edit which line', () => {
  const cart = [line(1, { addedBy: 'g1' }), line(2, { addedBy: 'g2' })];
  const items = [dish(1), dish(2)];
  test('a guest may edit their own line only', () => expect(view(cart, items, 'g1').lines.map((l) => l.canEdit)).toEqual([true, false]));
  test('the host may edit every line', () => expect(view(cart, items, 'h1').lines.map((l) => l.canEdit)).toEqual([true, true]));
  test('a pending viewer may edit nothing', () => {
    const pending = { ...viewerOf('g1'), status: 'pending' };
    expect(buildCartView({ session: sessionWith(cart), items, viewer: pending }).lines.every((l) => l.canEdit === false)).toBe(true);
  });
});

describe('the safety flag is personal to the viewer and fails closed', () => {
  const cart = [line(1), line(2), line(3), line(4)];
  const items = [
    dish(1, { allergens: ['peanut'] }),
    dish(2, { allergens: ['dairy'], allergensConfirmed: false }),
    dish(3, { allergens: [] }),
    dish(4, { allergens: ['wheat'] }),
  ];
  test('a guest with no allergies sees every available dish as safe', () => {
    const v = view(cart, items, 'g1');
    expect(v.lines.map((l) => l.safeForYou)).toEqual([true, true, true, true]);
    expect(v.lines.map((l) => l.reason)).toEqual(['ok', 'ok', 'ok', 'ok']);
  });
  test('a peanut allergy flags the peanut dish with the clash, and the unconfirmed dish as unconfirmed', () => {
    const v = view(cart, items, 'h1');
    expect(v.lines[0]).toMatchObject({ safeForYou: false, reason: 'allergen', clashes: ['peanut'] });
    expect(v.lines[1]).toMatchObject({ safeForYou: false, reason: 'unconfirmed', clashes: [] });
    expect(v.lines[2]).toMatchObject({ safeForYou: true, reason: 'ok' });
    expect(v.lines[3]).toMatchObject({ safeForYou: false, reason: 'unrecognised-tag' });
  });
  test('two guests see different flags for the same cart', () => {
    const forHema = view(cart, items, 'h1').lines.map((l) => l.safeForYou);
    const forAsha = view(cart, items, 'g2').lines.map((l) => l.safeForYou);
    expect(forHema).not.toEqual(forAsha);
    expect(forAsha).toEqual([true, false, true, false]);
  });
  test('a viewer who has not declared allergies sees NOTHING as safe', () => {
    for (const declared of [false, undefined, null, 'true', 1]) {
      const viewer = { ...viewerOf('g1'), allergiesDeclared: declared };
      const v = buildCartView({ session: sessionWith(cart), items, viewer });
      expect(v.lines.every((l) => l.safeForYou === false && l.reason === 'allergies-not-declared')).toBe(true);
    }
  });
  test('a missing viewer sees nothing as safe and can edit nothing', () => {
    const v = buildCartView({ session: sessionWith(cart), items });
    expect(v.lines.every((l) => l.safeForYou === false && l.canEdit === false)).toBe(true);
  });
  test('only an exact true from the safety check counts as safe', () => {
    expect(view([line(1)], [dish(1, { allergens: 'peanut' })], 'h1').lines[0].safeForYou).toBe(false);
    expect(view([line(1)], [dish(1, { allergensConfirmed: 'true' })], 'h1').lines[0].safeForYou).toBe(false);
  });
  test('other guests\' allergies never appear anywhere in the view', () => {
    const text = JSON.stringify(view(cart, items, 'g1'));
    expect(text).not.toMatch(/dairy|soy|"allergies"|allergiesDeclared/);
  });
});

describe('unavailable and missing dishes', () => {
  test('a dish the owner has hidden stays in the cart but is unavailable, not safe, and not counted', () => {
    const v = view([line(1, { qty: 2 }), line(2)], [dish(1, { available: false }), dish(2)]);
    expect(v.lines[0]).toMatchObject({ name: 'Dish 1', unavailable: true, safeForYou: false, reason: 'unavailable', price: null, lineTotal: null });
    expect(v.total).toBe(200); // only dish 2
    expect(v.totalQuantity).toBe(3);
  });
  test.each([[false], [undefined], [null], ['true'], [1]])('available %p is not available (only an exact true is)', (available) => {
    expect(view([line(1)], [dish(1, { available })]).lines[0].unavailable).toBe(true);
  });
  test('a dish that no longer exists is shown as unavailable with a neutral name', () => {
    const v = view([line(9)], [dish(1)]);
    expect(v.lines[0]).toMatchObject({ name: UNAVAILABLE_NAME, unavailable: true, safeForYou: false, reason: 'unavailable', menuItemId: ID(9) });
  });
  test('a corrupt stored quantity is never guessed: unavailable, quantity 0, uncounted', () => {
    for (const qty of [0, -2, 1.5, '3', null, undefined, NaN]) {
      const v = view([{ ...line(1), qty }], [dish(1)]);
      expect(v.lines[0]).toMatchObject({ quantity: 0, unavailable: true, lineTotal: null });
      expect(v.total).toBe(0);
      expect(v.totalQuantity).toBe(0);
    }
  });
});

describe('who added a line', () => {
  test('the nickname comes from the table, and a guest who left shows as "Former guest"', () => {
    const v = view([line(1, { addedBy: 'g2' }), line(2, { addedBy: 'gone' })], [dish(1), dish(2)]);
    expect(v.lines[0].addedBy).toEqual({ id: 'g2', nickname: 'Asha' });
    expect(v.lines[1].addedBy).toEqual({ id: 'gone', nickname: FORMER_GUEST });
  });
  test('phone numbers never appear in the view', () => {
    const text = JSON.stringify(view([line(1, { addedBy: 'g2' }), line(2, { addedBy: 'h1' })], [dish(1), dish(2)]));
    expect(text).not.toMatch(/\+91|9824079|"phone"/);
  });
});

describe('surprise dishes stay hidden', () => {
  const secret = ID(7);
  const surprise = { cartItemId: randomUUID(), itemId: secret, qty: 1, addedBy: 'g1', isSurprise: true, surpriseFor: 'g1', budgetCap: 750, note: 'NOTE-TEXT' };
  const items = [dish(7, { name: 'Truffle Secret', price: 640 }), dish(1)];
  const v = view([surprise, line(1)], items);
  test('the dish is never named, priced or identified', () => {
    expect(v.lines[0]).toMatchObject({ name: SURPRISE_NAME, menuItemId: null, price: null, lineTotal: null, isSurprise: true });
    const text = JSON.stringify(v);
    expect(text).not.toContain(secret);
    expect(text).not.toContain('Truffle Secret');
    expect(text).not.toMatch(/640|750|surpriseFor|budgetCap|NOTE-TEXT/);
  });
  test('it is not counted in the total but is counted in the quantity, and the view says something is hidden', () => {
    expect(v.total).toBe(100);
    expect(v.totalQuantity).toBe(2);
    expect(v.hasHiddenLines).toBe(true);
  });
  test('the reason and clashes are suppressed so they cannot describe the hidden dish', () => {
    const forPeanut = buildCartView({ session: sessionWith([{ ...surprise, itemId: ID(8) }]), items: [dish(8, { allergens: ['peanut'] })], viewer: viewerOf('h1') });
    expect(forPeanut.lines[0].safeForYou).toBe(false);
    expect(forPeanut.lines[0].reason).toBeNull();
    expect(forPeanut.lines[0].clashes).toEqual([]);
  });
  test('only an exact true makes a line a surprise', () => {
    for (const flag of ['true', 1, undefined, null]) {
      const l = view([{ ...surprise, isSurprise: flag }], items).lines[0];
      expect(l.isSurprise).toBe(false);
      expect(l.name).toBe('Truffle Secret');
    }
  });
  test('a surprise line whose dish no longer exists is still hidden and unavailable', () => {
    const l = view([{ ...surprise, itemId: ID(5) }], [dish(1)]).lines[0];
    expect(l).toMatchObject({ name: SURPRISE_NAME, menuItemId: null, unavailable: true });
  });
});

describe('versions and strange input', () => {
  test.each([[0, 0], [7, 7], [undefined, 0], [-1, 0], [1.5, 0], ['3', 0], [null, 0]])('cartVersion %p gives version %p', (cartVersion, expected) => {
    expect(view([], [], 'g1', { cartVersion }).version).toBe(expected);
  });
  test('missing or junk input gives an empty, safe view and never throws', () => {
    for (const input of [undefined, null, {}, { session: null }, { session: { cart: 'x', participants: 5 }, items: 'y' }, { session: { cart: [null, 5, 'x', undefined] } }]) {
      expect(() => buildCartView(input)).not.toThrow();
      expect(buildCartView(input).lines).toEqual([]);
    }
  });
  test('a null or junk item in the menu list is ignored', () => {
    expect(view([line(1)], [null, undefined, 5, {}, dish(1)]).lines[0].name).toBe('Dish 1');
  });
});
