// splitBill.test.js: tests for the pure bill-splitting functions (no database needed).
import Bill from '../models/Bill.js';
import {
  SPLIT_MODES,
  toPaise,
  toRupees,
  orderTotal,
  splitEqual,
  splitByItem,
  splitCustom,
  splitBill,
} from './splitBill.js';

// Small seeded random generator so the "random" tests give the same result on every run.
const mulberry32 = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const deepFreeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};
const ids = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const paiseOf = (shares) => shares.map((s) => Math.round(s.amount * 100));
const sum = (list) => list.reduce((a, b) => a + b, 0);

describe('SPLIT_MODES', () => {
  test('lists the three modes and matches the Bill model enum', () => {
    expect([...SPLIT_MODES]).toEqual(['equal', 'item', 'custom']);
    expect(Object.isFrozen(SPLIT_MODES)).toBe(true);
    expect([...Bill.schema.path('splitMode').enumValues].sort()).toEqual([...SPLIT_MODES].sort());
  });
});

describe('toPaise and toRupees', () => {
  test('converts correctly, including the classic floating point traps', () => {
    expect(toPaise(0)).toBe(0);
    expect(toPaise(1800)).toBe(180000);
    expect(toPaise(19.99)).toBe(1999);
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise(1.1 * 3)).toBe(330);
    expect(toRupees(1999)).toBe(19.99);
  });
  test.each([[10.005], [-1], [NaN], [Infinity], ['5'], [null], [undefined], [{}], [1e8]])(
    'rejects %p',
    (value) => {
      expect(() => toPaise(value)).toThrow();
    }
  );
  test('round trip holds for 5000 random paise values', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 5000; i++) {
      const paise = Math.floor(rand() * 1e9);
      expect(toPaise(toRupees(paise))).toBe(paise);
    }
  });
});

describe('splitEqual', () => {
  test('100 rupees between 3 gives 33.34, 33.33, 33.33', () => {
    const result = splitEqual(100, ids(3));
    expect(result.map((s) => s.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(result.map((s) => s.participantId)).toEqual(['p1', 'p2', 'p3']);
  });
  test('1 paisa between 3 gives it to the first person only', () => {
    expect(splitEqual(0.01, ids(3)).map((s) => s.amount)).toEqual([0.01, 0, 0]);
  });
  test('even splits and edge totals', () => {
    expect(splitEqual(1000, ids(4)).map((s) => s.amount)).toEqual([250, 250, 250, 250]);
    expect(splitEqual(1800, ids(1)).map((s) => s.amount)).toEqual([1800]);
    expect(splitEqual(0, ids(4)).map((s) => s.amount)).toEqual([0, 0, 0, 0]);
  });
  test('leftover paise go to the first people in the order given', () => {
    const result = splitEqual(0.05, ['zed', 'amy', 'bob']); // 5 paise between 3: 2, 2, 1
    expect(result.map((s) => [s.participantId, s.amount])).toEqual([['zed', 0.02], ['amy', 0.02], ['bob', 0.01]]);
  });
  test('3000 random cases: shares add up exactly and differ by at most one paisa', () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 3000; i++) {
      const n = 1 + Math.floor(rand() * 12);
      const totalPaise = Math.floor(rand() * 5000000);
      const paise = paiseOf(splitEqual(toRupees(totalPaise), ids(n)));
      expect(sum(paise)).toBe(totalPaise);
      expect(Math.max(...paise) - Math.min(...paise)).toBeLessThanOrEqual(1);
      expect(paise.every((p) => p >= 0)).toBe(true);
      expect([...paise].sort((a, b) => b - a)).toEqual(paise); // extra paise sit at the front
    }
  });
  test('does not change its input', () => {
    const people = deepFreeze(ids(3));
    expect(() => splitEqual(100, people)).not.toThrow();
  });
  test.each([
    ['no participants', []],
    ['not an array', 'p1'],
    ['duplicates', ['a', 'a']],
    ['empty id', ['a', '']],
    ['blank id', ['a', '   ']],
    ['non-string id', ['a', 5]],
    ['more than 50 people', ids(51)],
  ])('rejects %s', (_label, people) => {
    expect(() => splitEqual(100, people)).toThrow();
  });
  test('rejects a bad total', () => {
    for (const bad of [-5, 10.005, NaN, '100', undefined]) {
      expect(() => splitEqual(bad, ids(2))).toThrow();
    }
  });
});

describe('splitByItem', () => {
  const people = ['a', 'b', 'c'];
  test('each person pays for what they ordered', () => {
    const items = [
      { price: 450, qty: 2, orderedBy: 'a' },
      { price: 300, qty: 1, orderedBy: 'a' },
      { price: 1800, qty: 1, orderedBy: 'b' },
    ];
    expect(splitByItem(items, people).map((s) => s.amount)).toEqual([1200, 1800, 0]);
  });
  test('decimal prices stay exact', () => {
    expect(splitByItem([{ price: 19.99, qty: 3, orderedBy: 'a' }], people)[0].amount).toBe(59.97);
  });
  test('no items means everyone owes zero', () => {
    expect(splitByItem([], people).map((s) => s.amount)).toEqual([0, 0, 0]);
  });
  test('an item ordered by someone not in the bill is rejected', () => {
    expect(() => splitByItem([{ price: 10, qty: 1, orderedBy: 'ghost' }], people)).toThrow();
    expect(() => splitByItem([{ price: 10, qty: 1 }], people)).toThrow();
  });
  test.each([[0], [1.5], ['2'], [1001], [-1], [undefined]])('rejects quantity %p', (qty) => {
    expect(() => splitByItem([{ price: 10, qty, orderedBy: 'a' }], people)).toThrow();
  });
  test('rejects bad prices, bad items and bad input', () => {
    for (const price of [10.005, -1, '10', null, NaN]) {
      expect(() => splitByItem([{ price, qty: 1, orderedBy: 'a' }], people)).toThrow();
    }
    expect(() => splitByItem([null], people)).toThrow();
    expect(() => splitByItem('nope', people)).toThrow();
  });
  test('2000 random orders: shares add up to the items, checked with an independent loop', () => {
    const rand = mulberry32(99);
    for (let i = 0; i < 2000; i++) {
      const n = 1 + Math.floor(rand() * 8);
      const who = ids(n);
      const items = Array.from({ length: Math.floor(rand() * 15) }, () => ({
        price: Math.floor(rand() * 300000) / 100,
        qty: 1 + Math.floor(rand() * 6),
        orderedBy: who[Math.floor(rand() * n)],
      }));
      const expected = new Map(who.map((id) => [id, 0]));
      for (const it of items) expected.set(it.orderedBy, expected.get(it.orderedBy) + Math.round(it.price * 100) * it.qty);
      const result = splitByItem(items, who);
      result.forEach((s) => expect(Math.round(s.amount * 100)).toBe(expected.get(s.participantId)));
      expect(toPaise(orderTotal(items))).toBe(sum([...expected.values()]));
    }
  });
});

describe('splitCustom', () => {
  const people = ['a', 'b', 'c'];
  test('accepts shares that add up exactly, including a zero share', () => {
    const shares = [{ participantId: 'a', amount: 600 }, { participantId: 'b', amount: 400 }, { participantId: 'c', amount: 0 }];
    expect(splitCustom(1000, shares, people).map((s) => s.amount)).toEqual([600, 400, 0]);
  });
  test('0.1 + 0.2 equals 0.3 because the check is done in paise', () => {
    const shares = [{ participantId: 'a', amount: 0.1 }, { participantId: 'b', amount: 0.2 }, { participantId: 'c', amount: 0 }];
    expect(() => splitCustom(0.3, shares, people)).not.toThrow();
  });
  test('rejects shares that do not add up and names both amounts', () => {
    const shares = [{ participantId: 'a', amount: 600 }, { participantId: 'b', amount: 399.99 }, { participantId: 'c', amount: 0 }];
    expect(() => splitCustom(1000, shares, people)).toThrow(/999\.99.*1000\.00/);
  });
  test('rejects a missing person, a stranger, a duplicate and bad amounts', () => {
    const full = [{ participantId: 'a', amount: 1 }, { participantId: 'b', amount: 1 }, { participantId: 'c', amount: 1 }];
    expect(() => splitCustom(3, full.slice(0, 2), people)).toThrow();
    expect(() => splitCustom(3, [...full.slice(0, 2), { participantId: 'x', amount: 1 }], people)).toThrow();
    expect(() => splitCustom(3, [...full, { participantId: 'a', amount: 0 }], people)).toThrow();
    expect(() => splitCustom(2, [{ participantId: 'a', amount: -1 }, { participantId: 'b', amount: 3 }, { participantId: 'c', amount: 0 }], people)).toThrow();
    expect(() => splitCustom(1, [{ participantId: 'a', amount: 0.001 }, { participantId: 'b', amount: 0 }, { participantId: 'c', amount: 0 }], people)).toThrow();
    expect(() => splitCustom(3, 'nope', people)).toThrow();
    expect(() => splitCustom(3, [null, ...full], people)).toThrow();
  });
});

describe('orderTotal', () => {
  test('adds price times quantity in whole paise', () => {
    expect(orderTotal([{ price: 450, qty: 2 }, { price: 19.99, qty: 3 }])).toBe(959.97);
    expect(orderTotal([])).toBe(0);
  });
});

describe('splitBill', () => {
  const people = ['a', 'b', 'c'];
  const items = [{ price: 450, qty: 2, orderedBy: 'a' }, { price: 1800, qty: 1, orderedBy: 'b' }];
  test('equal mode returns a Bill-shaped body with unpaid shares', () => {
    expect(splitBill({ mode: 'equal', total: 100, participantIds: people })).toEqual({
      splitMode: 'equal',
      total: 100,
      shares: [
        { participantId: 'a', amount: 33.34, paid: false },
        { participantId: 'b', amount: 33.33, paid: false },
        { participantId: 'c', amount: 33.33, paid: false },
      ],
    });
  });
  test('item mode works out the total, and an explicit matching total is accepted', () => {
    const bill = splitBill({ mode: 'item', items, participantIds: people });
    expect(bill.total).toBe(2700);
    expect(bill.shares.map((s) => s.amount)).toEqual([900, 1800, 0]);
    expect(splitBill({ mode: 'item', items, total: 2700, participantIds: people }).total).toBe(2700);
  });
  test('item mode rejects a total that does not match the items', () => {
    expect(() => splitBill({ mode: 'item', items, total: 2699.99, participantIds: people })).toThrow(/does not match/);
  });
  test('custom mode', () => {
    const shares = [{ participantId: 'a', amount: 50 }, { participantId: 'b', amount: 30 }, { participantId: 'c', amount: 20 }];
    expect(splitBill({ mode: 'custom', total: 100, shares, participantIds: people }).shares.map((s) => s.amount)).toEqual([50, 30, 20]);
  });
  test('rejects unknown modes and missing arguments without crashing', () => {
    for (const args of [undefined, {}, { mode: 'half' }, { mode: 'equal' }, { mode: 'item' }, { mode: 'custom', total: 10 }]) {
      expect(() => splitBill(args)).toThrow();
    }
  });
  test('500 random bills in all three modes always add up to the total', () => {
    const rand = mulberry32(2024);
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(rand() * 9);
      const who = ids(n);
      const totalPaise = Math.floor(rand() * 2000000);
      const equal = splitBill({ mode: 'equal', total: toRupees(totalPaise), participantIds: who });
      expect(sum(paiseOf(equal.shares))).toBe(totalPaise);
      const lines = Array.from({ length: 1 + Math.floor(rand() * 8) }, () => ({ price: Math.floor(rand() * 100000) / 100, qty: 1 + Math.floor(rand() * 4), orderedBy: who[Math.floor(rand() * n)] }));
      const byItem = splitBill({ mode: 'item', items: lines, participantIds: who });
      expect(sum(paiseOf(byItem.shares))).toBe(toPaise(byItem.total));
      const shares = equal.shares.map((s) => ({ participantId: s.participantId, amount: s.amount }));
      expect(sum(paiseOf(splitBill({ mode: 'custom', total: equal.total, shares, participantIds: who }).shares))).toBe(totalPaise);
    }
  });
  test('does not change its inputs', () => {
    const frozen = deepFreeze({ mode: 'item', items: [{ price: 10, qty: 1, orderedBy: 'a' }], participantIds: ['a', 'b'] });
    expect(() => splitBill(frozen)).not.toThrow();
  });
});
