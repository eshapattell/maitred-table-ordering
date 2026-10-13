// cartView.strict.test.js: the cart view must treat anything but an exact true from the safety check as UNSAFE,
// even if the safety check itself were ever changed to answer loosely. The check is replaced by a fake here.
import { jest } from '@jest/globals';

const answers = [];
jest.unstable_mockModule('./allergyFilter.js', () => ({
  checkItemSafety: () => answers.shift(),
}));
const { buildCartView } = await import('./cartView.js');

const viewer = { id: 'g1', role: 'guest', status: 'approved', allergies: ['peanut'], allergiesDeclared: true };
const oneLine = () => buildCartView({
  session: { cart: [{ cartItemId: '11111111-1111-4111-8111-111111111111', itemId: '65f0c0ffee65f0c0ffee65f1', qty: 1, addedBy: 'g1' }], participants: [viewer] },
  items: [{ _id: '65f0c0ffee65f0c0ffee65f1', name: 'Dish', price: 100, available: true }],
  viewer,
}).lines[0];

describe('a loose answer from the safety check is never "safe"', () => {
  test.each([['yes'], [1], ['true'], [{}], [[]], [undefined], [null], [0], ['']])('safe: %p', (safe) => {
    answers.push({ safe, reason: 'ok', clashes: [] });
    expect(oneLine().safeForYou).toBe(false);
  });
  test('only an exact true is safe', () => {
    answers.push({ safe: true, reason: 'ok', clashes: [] });
    expect(oneLine().safeForYou).toBe(true);
  });
  test('a clashes value that is not a list becomes an empty list', () => {
    answers.push({ safe: false, reason: 'allergen', clashes: 'peanut' });
    expect(oneLine().clashes).toEqual([]);
  });
});
