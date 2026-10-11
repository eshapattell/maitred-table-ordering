import { describe, test, expect } from 'vitest';
import { needsReview, isHidden, filterItems, menuSummary, groupByCategory, categoryOptions, MENU_FILTERS } from './menuView.js';

const dish = (over) => ({ id: over.name, name: 'x', category: 'Mains', allergensConfirmed: true, available: true, ...over });
const items = [
  dish({ name: 'Bruschetta', category: 'Starters' }),
  dish({ name: 'Soup', category: 'Starters', allergensConfirmed: false }),
  dish({ name: 'Risotto', category: 'Mains', available: false }),
  dish({ name: 'Tiramisu', category: 'Desserts', allergensConfirmed: false, available: false }),
];

describe('needsReview: only an exact true counts as confirmed', () => {
  test('true is confirmed', () => expect(needsReview({ allergensConfirmed: true })).toBe(false));
  test.each([[false], [undefined], [null], ['true'], [1], [0], ['']])('%p needs review', (value) => expect(needsReview({ allergensConfirmed: value })).toBe(true));
  test('a missing key and a missing item need review', () => {
    expect(needsReview({})).toBe(true);
    expect(needsReview(undefined)).toBe(true);
    expect(needsReview(null)).toBe(true);
  });
});

describe('isHidden: only an exact false counts as hidden', () => {
  test('false is hidden', () => expect(isHidden({ available: false })).toBe(true));
  test.each([[true], [undefined], [null], [0], ['false']])('%p is not hidden', (value) => expect(isHidden({ available: value })).toBe(false));
});

describe('filterItems and menuSummary', () => {
  test('all, review, hidden', () => {
    expect(filterItems(items, 'all')).toHaveLength(4);
    expect(filterItems(items, 'review').map((i) => i.name)).toEqual(['Soup', 'Tiramisu']);
    expect(filterItems(items, 'hidden').map((i) => i.name)).toEqual(['Risotto', 'Tiramisu']);
  });
  test('an unknown filter shows everything', () => {
    expect(filterItems(items, 'nonsense')).toHaveLength(4);
    expect(filterItems(items, undefined)).toHaveLength(4);
  });
  test('non-arrays give empty results', () => {
    expect(filterItems(null, 'all')).toEqual([]);
    expect(menuSummary(undefined)).toEqual({ total: 0, review: 0, hidden: 0 });
  });
  test('summary counts', () => expect(menuSummary(items)).toEqual({ total: 4, review: 2, hidden: 2 }));
  test('the filter list is frozen and complete', () => {
    expect([...MENU_FILTERS]).toEqual(['all', 'review', 'hidden']);
    expect(Object.isFrozen(MENU_FILTERS)).toBe(true);
  });
});

describe('groupByCategory and categoryOptions', () => {
  test('keeps the server order of sections and of dishes inside them', () => {
    const grouped = groupByCategory(items);
    expect(grouped.map((g) => g.category)).toEqual(['Starters', 'Mains', 'Desserts']);
    expect(grouped[0].items.map((i) => i.name)).toEqual(['Bruschetta', 'Soup']);
  });
  test('dishes without a section go to "Other"; spaces are trimmed', () => {
    const grouped = groupByCategory([{ name: 'a' }, { name: 'b', category: '  ' }, { name: 'c', category: ' Mains ' }, { name: 'd', category: 'Mains' }]);
    expect(grouped.map((g) => [g.category, g.items.length])).toEqual([['Other', 2], ['Mains', 2]]);
  });
  test('junk input gives no groups', () => {
    expect(groupByCategory(null)).toEqual([]);
    expect(groupByCategory([null, undefined])).toEqual([{ category: 'Other', items: [null, undefined] }]);
  });
  test('categoryOptions: unique and sorted', () => {
    expect(categoryOptions(items)).toEqual(['Desserts', 'Mains', 'Starters']);
    expect(categoryOptions([{ category: 'b' }, { category: 'a' }, { category: 'b' }, {}, null])).toEqual(['a', 'b']);
    expect(categoryOptions(undefined)).toEqual([]);
  });
});
