import { SURPRISE_NAME, orderHistoryView } from './orderHistory.js';
import { freezeOrderItem } from './orderRules.js';

const uuid = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const ID = { a: 'a'.repeat(24), b: 'b'.repeat(24), c: 'c'.repeat(24), o1: '1'.repeat(24), o2: '2'.repeat(24), session: '9'.repeat(24), rest: '8'.repeat(24) };

// Items are built by the real freezeOrderItem, then given the fields a stored order has.
const item = (n, dishId, name, qty, orderedBy, over = {}) => ({
  ...freezeOrderItem({ line: { qty }, dish: { _id: dishId, name, price: 250, allergens: ['dairy'] }, adder: { nickname: orderedBy }, orderItemId: uuid(n) }),
  ...over,
});
const order = (id, createdAt, items, over = {}) => ({
  _id: id, sessionId: ID.session, restaurantId: ID.rest, tableNumber: 5, createdAt, items, tableAllergies: [{ nickname: 'Hema', allergies: ['tree nut'], phone: '+919833333333' }], status: 'placed', ...over,
});
const T1 = '2026-10-14T13:42:00.000Z';
const T2 = '2026-10-14T14:05:00.000Z';
const BASE = [
  order(ID.o1, new Date(T1), [item(1, ID.a, 'Hibiscus Rose Cooler', 2, 'Hema'), item(2, ID.b, 'Kesar Badam Milkshake', 1, 'Bala', { status: 'cancelled' })]),
  order(ID.o2, T2, [item(3, ID.c, 'Soup', 3, 'Bala', { status: 'served' })]),
];

describe('orderHistoryView: the shape every guest at the table gets', () => {
  const view = orderHistoryView(BASE);
  test('rounds in the order given, each with its time and its dishes', () => {
    expect(view.orders.map((o) => o.id)).toEqual([ID.o1, ID.o2]);
    expect(view.orders.map((o) => o.placedAt)).toEqual([T1, T2]);
    expect(view.orders[0].items.map((r) => r.name)).toEqual(['Hibiscus Rose Cooler', 'Kesar Badam Milkshake']);
  });
  test('a row has exactly the fields a guest needs', () => {
    expect(view.orders[0].items[0]).toEqual({ id: uuid(1), menuItemId: ID.a, name: 'Hibiscus Rose Cooler', qty: 2, orderedBy: 'Hema', cancelled: false });
    expect(Object.keys(view.orders[0].items[0]).sort()).toEqual(['cancelled', 'id', 'menuItemId', 'name', 'orderedBy', 'qty']);
    expect(Object.keys(view.orders[0]).sort()).toEqual(['id', 'items', 'placedAt']);
    expect(Object.keys(view).sort()).toEqual(['orders', 'totals']);
  });
  test('a cancelled dish stays in the list, marked cancelled', () => {
    expect(view.orders[0].items[1]).toMatchObject({ name: 'Kesar Badam Milkshake', cancelled: true });
  });
  test('totals count only dishes that were not cancelled', () => {
    expect(view.totals).toEqual({ dishes: 2, items: 5 });
  });
  test('a served dish is just a dish (no cooking status is ever shown)', () => {
    expect(JSON.stringify(view)).not.toMatch(/"status"|"preparing"|"served"|"placed"|"ready"/);
  });
  test('no price, allergy information, session, restaurant, table or phone number ever appears', () => {
    const text = JSON.stringify(view);
    expect(text).not.toMatch(/price|allergyFlags|allergies|tree nut|sessionId|restaurantId|tableNumber|phone|9833333333|isSurprise|revealed/);
    expect(text).not.toContain(ID.session);
    expect(text).not.toContain(ID.rest);
  });
  test('a Date becomes an ISO string and a string stays as it is', () => {
    expect(orderHistoryView([order(ID.o1, new Date(T1), [item(1, ID.a, 'A', 1, 'X')])]).orders[0].placedAt).toBe(T1);
    expect(orderHistoryView([order(ID.o1, T2, [item(1, ID.a, 'A', 1, 'X')])]).orders[0].placedAt).toBe(T2);
  });
  test.each([[undefined], [null], [''], [5], [new Date('nope')], [{}]])('an unreadable time (%p) becomes null', (createdAt) => {
    expect(orderHistoryView([order(ID.o1, createdAt, [item(1, ID.a, 'A', 1, 'X')])]).orders[0].placedAt).toBeNull();
  });
});

describe('surprise dishes stay hidden until served and revealed', () => {
  test('the hidden name is exactly the wording the cart already uses', () => expect(SURPRISE_NAME).toBe('Surprise dish'));
  const surprise = (over) => orderHistoryView([order(ID.o1, T1, [item(1, ID.a, 'Chef Secret', 1, 'Hema', { isSurprise: true, ...over })])]).orders[0].items[0];
  test('hidden: no name and no dish id', () => {
    expect(surprise({})).toMatchObject({ name: SURPRISE_NAME, menuItemId: null });
    expect(JSON.stringify(surprise({}))).not.toContain('Chef Secret');
    expect(JSON.stringify(surprise({}))).not.toContain(ID.a);
  });
  test('revealed but not yet served is still hidden', () => expect(surprise({ revealed: true, status: 'preparing' })).toMatchObject({ name: SURPRISE_NAME, menuItemId: null }));
  test('served but not revealed is still hidden', () => expect(surprise({ revealed: false, status: 'served' })).toMatchObject({ name: SURPRISE_NAME, menuItemId: null }));
  test('only an exact revealed true and served shows the dish', () => {
    expect(surprise({ revealed: true, status: 'served' })).toMatchObject({ name: 'Chef Secret', menuItemId: ID.a });
    for (const revealed of ['true', 1, undefined, null]) expect(surprise({ revealed, status: 'served' }).name).toBe(SURPRISE_NAME);
  });
  test('only an exact isSurprise true hides a dish', () => {
    for (const isSurprise of ['true', 1, undefined, false]) expect(surprise({ isSurprise }).name).toBe('Chef Secret');
  });
  test('a hidden surprise dish is still counted in the totals', () => {
    expect(orderHistoryView([order(ID.o1, T1, [item(1, ID.a, 'S', 2, 'H', { isSurprise: true })])]).totals).toEqual({ dishes: 1, items: 2 });
  });
});

describe('rows and orders that cannot be trusted are dropped', () => {
  const rowsOf = (over) => orderHistoryView([order(ID.o1, T1, [item(1, ID.a, 'Good', 1, 'X'), over])]).orders[0].items.map((r) => r.name);
  test.each([
    [{ orderItemId: 'not-a-uuid' }], [{ orderItemId: undefined }], [{ name: '' }], [{ name: 5 }], [{ qty: 0 }], [{ qty: 1.5 }], [{ qty: '2' }], [{ qty: null }],
  ])('a row with %j is dropped', (bad) => expect(rowsOf({ ...item(2, ID.b, 'Bad', 1, 'Y'), ...bad })).toEqual(['Good']));
  test('junk entries in the items list are dropped', () => {
    expect(orderHistoryView([order(ID.o1, T1, [null, undefined, 5, 'x', [], item(1, ID.a, 'Good', 1, 'X')])]).orders[0].items).toHaveLength(1);
  });
  test('an order with no usable rows is left out entirely', () => {
    expect(orderHistoryView([order(ID.o1, T1, [{ orderItemId: 'x' }]), order(ID.o2, T2, [item(3, ID.c, 'Soup', 1, 'X')])]).orders.map((o) => o.id)).toEqual([ID.o2]);
    expect(orderHistoryView([order(ID.o1, T1, [])])).toEqual({ orders: [], totals: { dishes: 0, items: 0 } });
  });
  test.each([[undefined], [null], ['x'], [5], [{}], [[null, 5, 'x', { items: 'y' }, { items: null }]]])('junk %p gives an empty history and never throws', (v) => {
    expect(() => orderHistoryView(v)).not.toThrow();
    expect(orderHistoryView(v)).toEqual({ orders: [], totals: { dishes: 0, items: 0 } });
  });
  test('a missing orderedBy becomes empty text, not undefined', () => {
    expect(orderHistoryView([order(ID.o1, T1, [item(1, ID.a, 'A', 1, 'X', { orderedBy: undefined })])]).orders[0].items[0].orderedBy).toBe('');
  });
  test('a dish id that is not a real id is hidden as null (the row is still shown)', () => {
    for (const itemId of ['xyz', '', null, undefined, 5]) {
      const row = orderHistoryView([order(ID.o1, T1, [item(1, ID.a, 'A', 1, 'X', { itemId })])]).orders[0].items[0];
      expect(row.menuItemId).toBeNull();
      expect(row.name).toBe('A');
    }
  });
  test('a dish id given as an object with a string form is accepted and lower-cased', () => {
    const row = orderHistoryView([order(ID.o1, T1, [item(1, ID.a, 'A', 1, 'X', { itemId: { toString: () => ID.a.toUpperCase() } })])]).orders[0].items[0];
    expect(row.menuItemId).toBe(ID.a);
  });
  test('the order id is a string even when the database gives an object', () => {
    expect(orderHistoryView([order({ toString: () => ID.o1 }, T1, [item(1, ID.a, 'A', 1, 'X')])]).orders[0].id).toBe(ID.o1);
  });
});

describe('orderHistoryView does not change its input and counts correctly', () => {
  test('it never mutates what it is given', () => {
    const frozen = Object.freeze(BASE.map((o) => Object.freeze({ ...o, items: Object.freeze(o.items.map((i) => Object.freeze({ ...i }))) })));
    expect(() => orderHistoryView(frozen)).not.toThrow();
  });
  test('quantities add up across rounds', () => {
    const many = [order(ID.o1, T1, [item(1, ID.a, 'A', 4, 'X'), item(2, ID.a, 'A', 3, 'Y')]), order(ID.o2, T2, [item(3, ID.a, 'A', 2, 'X', { status: 'cancelled' }), item(4, ID.b, 'B', 5, 'Z')])];
    expect(orderHistoryView(many).totals).toEqual({ dishes: 3, items: 12 });
  });
});
