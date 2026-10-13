import { describe, test, expect } from 'vitest';
import { isSafeForGuest, unsafeLabel, menuCounts, filterGuestMenu, UNSAFE_MESSAGES } from './guestMenu.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('isSafeForGuest: only an exact true is safe', () => {
  test('true is safe', () => expect(isSafeForGuest({ safe: true })).toBe(true));
  test.each([[false], [undefined], [null], ['true'], [1], [0], [''], [{}], [[]]])('%p is NOT safe', (value) => expect(isSafeForGuest({ safe: value })).toBe(false));
  test('a missing flag and a missing item are not safe', () => {
    expect(isSafeForGuest({})).toBe(false);
    expect(isSafeForGuest(undefined)).toBe(false);
    expect(isSafeForGuest(null)).toBe(false);
  });
  test('the dish\'s own allergen data is never consulted', () => {
    expect(isSafeForGuest({ allergens: [], allergensConfirmed: true })).toBe(false);
    expect(isSafeForGuest({ safe: false, allergens: [], allergensConfirmed: true })).toBe(false);
    expect(isSafeForGuest({ safe: true, allergens: ['peanut'], allergensConfirmed: false })).toBe(true);
  });
});

describe('unsafeLabel', () => {
  test('a safe dish has no label', () => expect(unsafeLabel({ safe: true, reason: 'ok', clashes: [] })).toBeNull());
  test('an allergen clash names the guest\'s own allergies, in canonical order, in lower case', () => {
    expect(unsafeLabel({ safe: false, reason: 'allergen', clashes: ['soy', 'peanut'] })).toBe('Contains peanut, soy');
    expect(unsafeLabel({ safe: false, reason: 'allergen', clashes: ['tree nut'] })).toBe('Contains tree nut');
  });
  test('an allergen clash with nothing readable falls back to the cautious sentence', () => {
    for (const clashes of [[], undefined, null, 'peanut', ['wheat'], [null]]) {
      expect(unsafeLabel({ safe: false, reason: 'allergen', clashes })).toBe(UNSAFE_MESSAGES.unknown);
    }
  });
  test('unconfirmed dishes say so', () => expect(unsafeLabel({ safe: false, reason: 'unconfirmed', clashes: [] })).toBe(UNSAFE_MESSAGES.unconfirmed));
  test.each([['invalid'], ['unrecognised-tag'], ['unrecognised-allergy'], ['something-new'], [undefined], [null], ['']])('reason %p gives the cautious sentence', (reason) => {
    expect(unsafeLabel({ safe: false, reason })).toBe(UNSAFE_MESSAGES.unknown);
  });
  test('a dish with no flag at all is treated as unsafe, with the cautious sentence', () => {
    expect(unsafeLabel({})).toBe(UNSAFE_MESSAGES.unknown);
    expect(unsafeLabel(undefined)).toBe(UNSAFE_MESSAGES.unknown);
  });
  test('an "ok" reason with safe not true is still unsafe (the flag wins)', () => expect(unsafeLabel({ safe: 'true', reason: 'ok' })).toBe(UNSAFE_MESSAGES.unknown));
  test('the messages are frozen', () => expect(Object.isFrozen(UNSAFE_MESSAGES)).toBe(true));
});

describe('menuCounts and filterGuestMenu', () => {
  const items = [{ id: 1, safe: true }, { id: 2, safe: false }, { id: 3 }, { id: 4, safe: 'true' }, { id: 5, safe: true }];
  test('counts treat anything but an exact true as unsafe', () => expect(menuCounts(items)).toEqual({ total: 5, safe: 2, unsafe: 3 }));
  test('empty and junk input', () => {
    expect(menuCounts([])).toEqual({ total: 0, safe: 0, unsafe: 0 });
    expect(menuCounts(undefined)).toEqual({ total: 0, safe: 0, unsafe: 0 });
  });
  test('hideUnsafe true keeps only the safe dishes', () => expect(filterGuestMenu(items, true).map((i) => i.id)).toEqual([1, 5]));
  test('anything but exactly true shows everything', () => {
    for (const flag of [false, undefined, null, 'true', 1]) expect(filterGuestMenu(items, flag)).toHaveLength(5);
  });
  test('junk input gives an empty list', () => {
    expect(filterGuestMenu(undefined, true)).toEqual([]);
    expect(filterGuestMenu('x', false)).toEqual([]);
  });
});

describe('the guest menu helpers never read a dish\'s allergen tags', () => {
  test('guestMenu.js does not mention the allergens or allergensConfirmed properties', () => {
    const source = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'guestMenu.js'), 'utf8');
    const code = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/\.allergens\b|allergensConfirmed/);
  });
});
