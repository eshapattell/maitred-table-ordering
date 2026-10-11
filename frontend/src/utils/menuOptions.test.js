import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COURSES, PORTION_SIZES, FLAVOUR_TAGS, SPICE_LEVELS, LIMITS, OPTION_LABELS } from './menuOptions.js';
import { EDITABLE_FIELDS } from './menuForm.js';

// Reads the backend source text, so a change on either side makes this test fail.
const backendSource = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../backend/controllers/menuController.js'), 'utf8');
const listFromBackend = (name) => {
  const match = backendSource.match(new RegExp(`(?:export )?const ${name} = Object\\.freeze\\(\\[([^\\]]*)\\]\\)`));
  expect(match, `${name} not found in backend/controllers/menuController.js`).not.toBeNull();
  return [...match[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2]);
};

describe('menu options match the backend controller exactly', () => {
  test('COURSES', () => expect([...COURSES]).toEqual(listFromBackend('COURSES')));
  test('PORTION_SIZES', () => expect([...PORTION_SIZES]).toEqual(listFromBackend('PORTION_SIZES')));
  test('FLAVOUR_TAGS', () => expect([...FLAVOUR_TAGS]).toEqual(listFromBackend('FLAVOUR_TAGS')));
  test('EDITABLE_FIELDS', () => expect([...EDITABLE_FIELDS]).toEqual(listFromBackend('EDITABLE_FIELDS')));
});

describe('menu options shape', () => {
  test('the lists and objects are frozen', () => {
    for (const value of [COURSES, PORTION_SIZES, FLAVOUR_TAGS, SPICE_LEVELS, LIMITS, OPTION_LABELS, OPTION_LABELS.course, OPTION_LABELS.spice]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });
  test('every option has a label', () => {
    expect(COURSES.every((c) => typeof OPTION_LABELS.course[c] === 'string')).toBe(true);
    expect(PORTION_SIZES.every((c) => typeof OPTION_LABELS.portionSize[c] === 'string')).toBe(true);
    expect(FLAVOUR_TAGS.every((c) => typeof OPTION_LABELS.flavour[c] === 'string')).toBe(true);
    expect(SPICE_LEVELS.every((c) => typeof OPTION_LABELS.spice[c] === 'string')).toBe(true);
  });
  test('spice levels are 1 to 5 and the limits are the documented ones', () => {
    expect([...SPICE_LEVELS]).toEqual([1, 2, 3, 4, 5]);
    expect(LIMITS).toEqual({ nameMax: 80, descriptionMax: 300, categoryMax: 40, cuisineMax: 40, priceMax: 100000, prepMax: 120, tableMax: 500 });
  });
});
