import {
  ITEM_STATUSES, ACTIVE_STATUSES, KITCHEN_NAMESPACE, ORDER_EVENTS, KITCHEN_ROLES, LEFT_REASONS, isValidOrderId, isValidOrderItemId,
  kitchenRoomFor, staffSocketAccess, validateExpectedVersion, validateStatusInput, canMoveStatus, classifyCartLines, placementSummary,
  freezeOrderItem, tableAllergiesOf, orderTotal, orderStatusOf, isActiveOrder, kitchenOrderView, placedItemsOf,
} from './orderRules.js';

const ID = { soup: 'a'.repeat(24), nutSalad: 'b'.repeat(24), hidden: 'c'.repeat(24), archived: 'd'.repeat(24), gone: 'e'.repeat(24), rest: 'f'.repeat(24) };
const uuid = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const dish = (id, name, price, over = {}) => ({ _id: id, name, price, available: true, allergens: [], allergensConfirmed: true, ...over });
const MENU = [
  dish(ID.soup, 'Tomato Soup', 250),
  dish(ID.nutSalad, 'Walnut Salad', 400, { allergens: ['tree nut'] }),
  dish(ID.hidden, 'Old Special', 500, { available: false }),
  dish(ID.archived, 'Retired Pasta', 600, { archived: true }),
];
const person = (id, nickname, allergies, over = {}) => ({ id, nickname, role: 'guest', status: 'approved', allergiesDeclared: true, allergies, phone: '+919824079988', ...over });
const A = person('a1', 'Asha', ['tree nut']);
const B = person('b1', 'Bala', []);
const C = person('c1', 'Chitra', ['peanut', 'sesame']);
const line = (n, itemId, qty, addedBy, over = {}) => ({ cartItemId: uuid(n), itemId, qty, addedBy, isSurprise: false, ...over });
const session = (cart, people = [A, B, C]) => ({ cart, participants: people, cartVersion: 4 });
const reasonOf = (result, n) => result.left.find((l) => l.cartItemId === uuid(n))?.reason;

describe('constants and ids', () => {
  test('the statuses and events are fixed and frozen', () => {
    expect([...ITEM_STATUSES]).toEqual(['placed', 'preparing', 'ready', 'served', 'cancelled']);
    expect([...ACTIVE_STATUSES]).toEqual(['placed', 'preparing', 'ready']);
    expect({ ...ORDER_EVENTS }).toEqual({ ORDERS_CHANGED: 'orders:changed' });
    expect([...KITCHEN_ROLES]).toEqual(['owner', 'kitchen']);
    expect(KITCHEN_NAMESPACE).toBe('/kitchen');
    for (const v of [ITEM_STATUSES, ACTIVE_STATUSES, ORDER_EVENTS, KITCHEN_ROLES, LEFT_REASONS]) expect(Object.isFrozen(v)).toBe(true);
  });
  test('order ids are 24 hex characters and order item ids are UUIDs', () => {
    expect(isValidOrderId(ID.soup)).toBe(true);
    expect(isValidOrderItemId(uuid(1))).toBe(true);
    for (const v of ['', 'abc', 'g'.repeat(24), ID.soup + 'a', null, undefined, 5, {}, [], { $ne: null }]) { expect(isValidOrderId(v)).toBe(false); expect(isValidOrderItemId(v)).toBe(false); }
  });
});

describe('kitchenRoomFor and staffSocketAccess', () => {
  test('a valid restaurant id gives a lower-case room', () => {
    expect(kitchenRoomFor('AAAAAAAAAAAAAAAAAAAAAAAA')).toBe(`kitchen:${'a'.repeat(24)}`);
    expect(kitchenRoomFor({ toString: () => ID.rest })).toBe(`kitchen:${ID.rest}`);
  });
  test.each([[''], ['abc'], [null], [undefined], [5], [{}], [`kitchen:${ID.rest}`]])('%p gives no room', (v) => expect(kitchenRoomFor(v)).toBeNull());
  test('owner and kitchen accounts with a restaurant may listen', () => {
    expect(staffSocketAccess({ role: 'owner', restaurantId: ID.rest })).toEqual({ allowed: true, reason: 'ok' });
    expect(staffSocketAccess({ role: 'kitchen', restaurantId: ID.rest }).allowed).toBe(true);
  });
  test.each([['guest'], ['admin'], [undefined], [null], ['OWNER']])('role %p is refused', (role) => {
    expect(staffSocketAccess({ role, restaurantId: ID.rest })).toEqual({ allowed: false, reason: 'role' });
  });
  test('a missing restaurant or a strange user is refused', () => {
    expect(staffSocketAccess({ role: 'owner' })).toEqual({ allowed: false, reason: 'no-restaurant' });
    expect(staffSocketAccess({ role: 'owner', restaurantId: 'x' }).allowed).toBe(false);
    for (const u of [undefined, null, 'x', 5, []]) expect(staffSocketAccess(u)).toEqual({ allowed: false, reason: 'unknown-user' });
  });
});

describe('validateExpectedVersion', () => {
  test.each([[0], [1], [99]])('%p is accepted', (expectedVersion) => expect(validateExpectedVersion({ expectedVersion })).toEqual({ ok: true, expectedVersion }));
  test.each([[undefined], [-1], [1.5], ['3'], [null], [NaN], [Infinity], [true], [[1]], [{ $gt: 0 }]])('%p is rejected', (expectedVersion) => expect(validateExpectedVersion({ expectedVersion }).ok).toBe(false));
  test('odd bodies never throw and are rejected', () => { for (const b of [undefined, null, [], 'x', 5, {}]) expect(validateExpectedVersion(b).ok).toBe(false); });
});

describe('validateStatusInput and canMoveStatus', () => {
  test.each([['preparing'], ['ready'], ['served'], ['cancelled']])('%p is a valid target', (status) => expect(validateStatusInput({ status })).toEqual({ ok: true, status }));
  test.each([['placed'], ['PREPARING'], [''], [undefined], [null], [5], [['ready']], [{}], ['done']])('%p is not a valid target', (status) => expect(validateStatusInput({ status }).ok).toBe(false));
  test('odd bodies are rejected', () => { for (const b of [undefined, null, [], 'x', {}]) expect(validateStatusInput(b).ok).toBe(false); });
  test('the full table of moves: only one step forward, or cancel from placed', () => {
    const allowed = new Set(['placed>preparing', 'preparing>ready', 'ready>served', 'placed>cancelled']);
    for (const from of [...ITEM_STATUSES, 'weird', undefined, null]) {
      for (const to of [...ITEM_STATUSES, 'weird', undefined, null]) {
        expect(canMoveStatus(from, to)).toBe(allowed.has(`${from}>${to}`));
      }
    }
  });
});

describe('classifyCartLines', () => {
  test('a good line is ready and keeps its references', () => {
    const r = classifyCartLines({ session: session([line(1, ID.soup, 2, 'b1')]), items: MENU });
    expect(r.left).toEqual([]);
    expect(r.ready).toHaveLength(1);
    expect(r.ready[0].line.cartItemId).toBe(uuid(1));
    expect(r.ready[0].dish.name).toBe('Tomato Soup');
    expect(r.ready[0].adder.nickname).toBe('Bala');
  });
  test('a dish unsafe for ANOTHER guest is still ordered (only the adder matters)', () => {
    const r = classifyCartLines({ session: session([line(1, ID.nutSalad, 1, 'b1')]), items: MENU });
    expect(r.ready).toHaveLength(1);
    expect(r.left).toEqual([]);
  });
  test('a dish unsafe for the guest who ADDED it stays in the cart', () => {
    const r = classifyCartLines({ session: session([line(1, ID.nutSalad, 1, 'a1')]), items: MENU });
    expect(r.ready).toEqual([]);
    expect(reasonOf(r, 1)).toBe('not-suitable');
  });
  test('an unconfirmed dish is not suitable for an allergic adder but fine for a guest with no allergies', () => {
    const unconfirmed = [dish(ID.soup, 'Mousse', 300, { allergens: ['dairy'], allergensConfirmed: false })];
    expect(reasonOf(classifyCartLines({ session: session([line(1, ID.soup, 1, 'c1')]), items: unconfirmed }), 1)).toBe('not-suitable');
    expect(classifyCartLines({ session: session([line(1, ID.soup, 1, 'b1')]), items: unconfirmed }).ready).toHaveLength(1);
  });
  test('a dish that became unavailable, was archived, or no longer exists stays', () => {
    const r = classifyCartLines({ session: session([line(1, ID.hidden, 1, 'b1'), line(2, ID.archived, 1, 'b1'), line(3, ID.gone, 1, 'b1')]), items: MENU });
    expect([1, 2, 3].map((n) => reasonOf(r, n))).toEqual(['unavailable', 'unavailable', 'unavailable']);
    expect(r.ready).toEqual([]);
  });
  test('only an exact available: true counts (a missing or loose flag is not available)', () => {
    for (const available of [undefined, null, 'true', 1, false]) {
      const items = [dish(ID.soup, 'Soup', 250, { available })];
      expect(reasonOf(classifyCartLines({ session: session([line(1, ID.soup, 1, 'b1')]), items }), 1)).toBe('unavailable');
    }
  });
  test('a dish with no usable price or name cannot be frozen, so it stays', () => {
    for (const over of [{ price: -1 }, { price: NaN }, { price: '250' }, { price: null }, { name: '' }, { name: 5 }]) {
      const items = [dish(ID.soup, 'Soup', 250, over)];
      expect(reasonOf(classifyCartLines({ session: session([line(1, ID.soup, 1, 'b1')]), items }), 1)).toBe('unavailable');
    }
  });
  test('a free dish (price 0) is orderable', () => {
    expect(classifyCartLines({ session: session([line(1, ID.soup, 1, 'b1')]), items: [dish(ID.soup, 'Water', 0)] }).ready).toHaveLength(1);
  });
  test('a line from a guest who left, is waiting, or is unknown stays', () => {
    const people = [A, person('x1', 'Gone', [], { status: 'pending' }), person('y1', 'Odd', [], { status: 'weird' })];
    const r = classifyCartLines({ session: session([line(1, ID.soup, 1, 'zz'), line(2, ID.soup, 1, 'x1'), line(3, ID.soup, 1, 'y1')], people), items: MENU });
    expect([1, 2, 3].map((n) => reasonOf(r, n))).toEqual(['adder-left', 'adder-left', 'adder-left']);
  });
  test('a line whose adder has not answered the allergy question stays (never assume "no allergies")', () => {
    for (const allergiesDeclared of [false, undefined, null, 'true', 1]) {
      const r = classifyCartLines({ session: session([line(1, ID.soup, 1, 'b1')], [person('b1', 'Bala', [], { allergiesDeclared })]), items: MENU });
      expect(reasonOf(r, 1)).toBe('adder-allergies-unknown');
    }
  });
  test('a surprise line is never ordered here', () => {
    expect(reasonOf(classifyCartLines({ session: session([line(1, ID.soup, 1, 'b1', { isSurprise: true })]), items: MENU }), 1)).toBe('surprise');
  });
  test('a line with a bad quantity stays', () => {
    for (const qty of [0, -1, 1.5, '2', null, undefined, NaN]) expect(reasonOf(classifyCartLines({ session: session([line(1, ID.soup, qty, 'b1')]), items: MENU }), 1)).toBe('invalid-line');
  });
  test('a mixed cart is split, in cart order, and nothing is lost', () => {
    const cart = [line(1, ID.soup, 1, 'b1'), line(2, ID.nutSalad, 1, 'a1'), line(3, ID.nutSalad, 2, 'c1'), line(4, ID.hidden, 1, 'b1'), line(5, ID.soup, 3, 'a1')];
    const r = classifyCartLines({ session: session(cart), items: MENU });
    expect(r.ready.map((x) => x.line.cartItemId)).toEqual([uuid(1), uuid(3), uuid(5)]);
    expect(r.left).toEqual([{ cartItemId: uuid(2), reason: 'not-suitable' }, { cartItemId: uuid(4), reason: 'unavailable' }]);
    expect(r.ready.length + r.left.length).toBe(cart.length);
  });
  test('the adder is matched by id, not by nickname', () => {
    const r = classifyCartLines({ session: session([line(1, ID.nutSalad, 1, 'b1')], [person('a1', 'Bala', ['tree nut']), person('b1', 'Asha', [])]), items: MENU });
    expect(r.ready).toHaveLength(1);
  });
  test('an adder whose allergy list is malformed is never "safe"', () => {
    const r = classifyCartLines({ session: session([line(1, ID.soup, 1, 'b1')], [person('b1', 'Bala', 'peanut')]), items: MENU });
    expect(reasonOf(r, 1)).toBe('not-suitable');
  });
  test('junk input never throws and gives nothing to order', () => {
    for (const input of [{}, { session: null, items: null }, { session: { cart: 'x', participants: 5 }, items: 'y' }, undefined]) {
      expect(() => classifyCartLines(input ?? {})).not.toThrow();
      expect(classifyCartLines(input ?? {}).ready).toEqual([]);
    }
    expect(classifyCartLines({ session: session([null, 5, 'x', {}, { cartItemId: 'not-a-uuid' }]), items: MENU })).toEqual({ ready: [], left: [] });
  });
  test('it does not change its input', () => {
    const s = Object.freeze({ ...session([Object.freeze(line(1, ID.soup, 1, 'b1'))]), cart: Object.freeze([Object.freeze(line(1, ID.soup, 1, 'b1'))]) });
    expect(() => classifyCartLines({ session: s, items: Object.freeze(MENU) })).not.toThrow();
  });
});

describe('placementSummary', () => {
  test('counts the lines that stayed, by reason', () => {
    expect(placementSummary([{ reason: 'unavailable' }, { reason: 'unavailable' }, { reason: 'not-suitable' }])).toEqual({ total: 3, byReason: { unavailable: 2, 'not-suitable': 1 } });
  });
  test('nothing left, and junk, give zero', () => {
    for (const v of [[], undefined, null, 'x', [null, {}, { reason: 5 }]]) expect(placementSummary(v)).toEqual({ total: 0, byReason: {} });
  });
});

describe('freezeOrderItem', () => {
  const ready = classifyCartLines({ session: session([line(7, ID.nutSalad, 2, 'b1')]), items: MENU }).ready[0];
  const frozen = freezeOrderItem({ ...ready, orderItemId: uuid(50) });
  test('it carries exactly the ticket fields', () => {
    expect(Object.keys(frozen).sort()).toEqual(['allergyFlags', 'isSurprise', 'itemId', 'name', 'orderItemId', 'orderedBy', 'price', 'qty', 'revealed', 'status']);
    expect(frozen).toMatchObject({ orderItemId: uuid(50), itemId: ID.nutSalad, name: 'Walnut Salad', price: 400, qty: 2, orderedBy: 'Bala', allergyFlags: ['tree nut'], isSurprise: false, revealed: false, status: 'placed' });
  });
  test('it copies the allergen tags, so changing the menu later changes nothing', () => {
    const d = dish(ID.soup, 'Soup', 250, { allergens: ['dairy'] });
    const f = freezeOrderItem({ line: { qty: 1 }, dish: d, adder: B, orderItemId: uuid(1) });
    d.allergens.push('soy'); d.name = 'Changed'; d.price = 999;
    expect(f.allergyFlags).toEqual(['dairy']);
    expect(f.name).toBe('Soup');
    expect(f.price).toBe(250);
  });
  test('no phone number, session id or adder id ever lands on a ticket line', () => {
    expect(JSON.stringify(frozen)).not.toMatch(/9824079988|phone|a1|sessionId/);
    expect(frozen.orderedBy).toBe('Bala');
  });
  test('a dish with no tag list freezes to an empty list', () => {
    expect(freezeOrderItem({ line: { qty: 1 }, dish: { _id: ID.soup, name: 'S', price: 1, allergens: undefined }, adder: B, orderItemId: uuid(1) }).allergyFlags).toEqual([]);
  });
});

describe('tableAllergiesOf', () => {
  test('lists seated guests with allergies by nickname, and nothing else about them', () => {
    expect(tableAllergiesOf(session([]))).toEqual([{ nickname: 'Asha', allergies: ['tree nut'] }, { nickname: 'Chitra', allergies: ['peanut', 'sesame'] }]);
  });
  test('no phone number, id or role is ever included', () => {
    const text = JSON.stringify(tableAllergiesOf(session([])));
    expect(text).not.toMatch(/9824079988|phone|"id"|role|a1|c1/);
  });
  test('waiting, unknown and unanswered guests are left out, and so are guests with no allergies', () => {
    const people = [A, person('p1', 'Pending', ['soy'], { status: 'pending' }), person('w1', 'Weird', ['soy'], { status: 'weird' }), person('u1', 'Unsure', ['soy'], { allergiesDeclared: false }), B];
    expect(tableAllergiesOf(session([], people))).toEqual([{ nickname: 'Asha', allergies: ['tree nut'] }]);
  });
  test('the list is a copy', () => {
    const out = tableAllergiesOf(session([]));
    out[0].allergies.push('x');
    expect(A.allergies).toEqual(['tree nut']);
  });
  test('junk allergy entries are dropped and junk input gives an empty list', () => {
    expect(tableAllergiesOf(session([], [person('z', 'Zed', ['', 5, null, 'soy'])]))).toEqual([{ nickname: 'Zed', allergies: ['soy'] }]);
    for (const v of [undefined, null, {}, { participants: 'x' }, { participants: [null, 5] }]) expect(tableAllergiesOf(v)).toEqual([]);
  });
});

describe('orderTotal', () => {
  test('adds price times quantity exactly, in whole paise', () => {
    expect(orderTotal([{ price: 250, qty: 2, status: 'placed' }, { price: 399.99, qty: 3, status: 'served' }])).toBe(1699.97);
    expect(orderTotal([{ price: 0.1, qty: 3, status: 'placed' }])).toBe(0.3);
  });
  test('cancelled dishes are not charged, and bad lines are ignored', () => {
    expect(orderTotal([{ price: 250, qty: 2, status: 'cancelled' }, { price: 100, qty: 1, status: 'placed' }, { price: -5, qty: 1 }, { price: 10, qty: 0 }, null, 'x'])).toBe(100);
    for (const v of [undefined, null, [], 'x']) expect(orderTotal(v)).toBe(0);
  });
});

describe('orderStatusOf and isActiveOrder', () => {
  const it = (...statuses) => statuses.map((status) => ({ status }));
  test.each([
    [['placed', 'placed'], 'placed'], [['served', 'served'], 'served'], [['ready', 'ready'], 'ready'], [['ready', 'served'], 'ready'],
    [['placed', 'served'], 'preparing'], [['preparing', 'placed'], 'preparing'], [['preparing'], 'preparing'], [['placed', 'ready'], 'preparing'],
    [['cancelled', 'served'], 'served'], [['cancelled', 'placed'], 'placed'], [['cancelled', 'cancelled'], 'cancelled'], [[], 'cancelled'],
  ])('%j is %s', (statuses, expected) => expect(orderStatusOf(it(...statuses))).toBe(expected));
  test('an unknown status never makes an order look finished', () => {
    expect(orderStatusOf(it('weird', 'served'))).toBe('preparing');
    expect(orderStatusOf(it(undefined))).toBe('preparing');
  });
  test('junk gives "cancelled" (nothing to cook)', () => { for (const v of [undefined, null, 'x', {}]) expect(orderStatusOf(v)).toBe('cancelled'); });
  test('an order is active while any dish is placed, preparing or ready', () => {
    expect(isActiveOrder({ items: it('served', 'ready') })).toBe(true);
    expect(isActiveOrder({ items: it('placed') })).toBe(true);
    expect(isActiveOrder({ items: it('served', 'cancelled') })).toBe(false);
    for (const v of [undefined, null, {}, { items: 'x' }, { items: [] }, { items: [null] }]) expect(isActiveOrder(v)).toBe(false);
  });
});

describe('kitchenOrderView and placedItemsOf', () => {
  const order = {
    _id: ID.rest, sessionId: ID.soup, restaurantId: ID.nutSalad, tableNumber: 4, createdAt: '2026-10-14T13:42:00.000Z', status: 'placed',
    items: [
      { orderItemId: uuid(1), itemId: ID.soup, name: 'Soup', price: 250, qty: 2, orderedBy: 'Bala', allergyFlags: ['dairy'], status: 'placed', isSurprise: false },
      { orderItemId: uuid(2), itemId: ID.nutSalad, name: 'Salad', price: 400, qty: 1, orderedBy: 'Asha', allergyFlags: [], status: 'served' },
    ],
    tableAllergies: [{ nickname: 'Asha', allergies: ['tree nut'], phone: '+919824079988' }],
  };
  test('the board sees the table, the time, the dishes, who ordered them and the table allergies', () => {
    expect(kitchenOrderView(order)).toEqual({
      id: ID.rest, tableNumber: 4, placedAt: '2026-10-14T13:42:00.000Z', status: 'preparing',
      items: [{ id: uuid(1), name: 'Soup', qty: 2, orderedBy: 'Bala', allergyFlags: ['dairy'], status: 'placed' }, { id: uuid(2), name: 'Salad', qty: 1, orderedBy: 'Asha', allergyFlags: [], status: 'served' }],
      tableAllergies: [{ nickname: 'Asha', allergies: ['tree nut'] }],
    });
  });
  test('the board never sees prices, session ids, dish ids, the stored status or phone numbers', () => {
    const text = JSON.stringify(kitchenOrderView(order));
    expect(text).not.toMatch(/"price"|"sessionId"|"restaurantId"|"itemId"|9824079988|"phone"/);
    expect(Object.keys(kitchenOrderView(order)).sort()).toEqual(['id', 'items', 'placedAt', 'status', 'tableAllergies', 'tableNumber']);
  });
  test('the status shown is the worked-out one, not the stored one', () => {
    expect(kitchenOrderView({ ...order, status: 'served' }).status).toBe('preparing');
  });
  test('junk input gives an empty, safe view', () => {
    for (const v of [undefined, null, {}, { items: 'x', tableAllergies: 'y' }]) {
      expect(() => kitchenOrderView(v)).not.toThrow();
      expect(kitchenOrderView(v).items).toEqual([]);
      expect(kitchenOrderView(v).tableAllergies).toEqual([]);
    }
  });
  test('placedItemsOf lists only dishes still waiting for the kitchen, from every order', () => {
    const second = { _id: ID.hidden, items: [{ orderItemId: uuid(3), name: 'Pasta', qty: 1, orderedBy: 'Chitra', status: 'placed' }, { orderItemId: uuid(4), name: 'Tea', qty: 1, orderedBy: 'Bala', status: 'preparing' }] };
    expect(placedItemsOf([order, second])).toEqual([
      { orderId: ID.rest, orderItemId: uuid(1), name: 'Soup', qty: 2, orderedBy: 'Bala' },
      { orderId: ID.hidden, orderItemId: uuid(3), name: 'Pasta', qty: 1, orderedBy: 'Chitra' },
    ]);
    for (const v of [undefined, null, 'x', [null, {}, { items: 'y' }]]) expect(placedItemsOf(v)).toEqual([]);
  });
});
