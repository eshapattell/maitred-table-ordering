import { describe, test, expect } from 'vitest';
import {
  EDITABLE_FIELDS, emptyMenuForm, menuFormFromItem, validateMenuForm, buildPatchPayload, sameAllergens, unknownAllergens,
} from './menuForm.js';
import { COURSES, PORTION_SIZES, FLAVOUR_TAGS } from './menuOptions.js';

const goodForm = (over = {}) => ({
  name: 'Saffron Risotto', description: 'Arborio rice, saffron, butter and parmesan', price: '1450', category: 'Mains',
  isVeg: true, allergens: ['dairy'], noAllergens: false, spiceLevel: '2', flavourTags: ['creamy'],
  cuisine: 'Italian', course: 'main', portionSize: 'regular', prepMinutes: '25', ...over,
});
const errorsFor = (over) => validateMenuForm(goodForm(over)).errors;

describe('validateMenuForm: a good form', () => {
  test('is valid and the payload is exactly what the API expects', () => {
    const result = validateMenuForm(goodForm());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.payload).toEqual({
      name: 'Saffron Risotto', description: 'Arborio rice, saffron, butter and parmesan', price: 1450, category: 'Mains', isVeg: true,
      allergens: ['dairy'], spiceLevel: 2, flavourTags: ['creamy'], cuisine: 'Italian', course: 'main', portionSize: 'regular', prepMinutes: 25,
    });
    expect(Object.keys(result.payload).sort()).toEqual([...EDITABLE_FIELDS].sort());
  });
  test('text fields are trimmed', () => {
    const { payload } = validateMenuForm(goodForm({ name: '  Risotto  ', description: '  creamy  ', category: ' Mains ', cuisine: ' Italian ' }));
    expect([payload.name, payload.description, payload.category, payload.cuisine]).toEqual(['Risotto', 'creamy', 'Mains', 'Italian']);
  });
  test('a missing description becomes an empty string', () => {
    expect(validateMenuForm(goodForm({ description: undefined })).payload.description).toBe('');
    expect(validateMenuForm(goodForm({ description: null })).payload.description).toBe('');
  });
  test('numbers given as numbers are accepted too', () => {
    const { payload } = validateMenuForm(goodForm({ price: 450, spiceLevel: 3, prepMinutes: 15 }));
    expect([payload.price, payload.spiceLevel, payload.prepMinutes]).toEqual([450, 3, 15]);
  });
  test('false is a valid isVeg answer', () => expect(validateMenuForm(goodForm({ isVeg: false })).valid).toBe(true));
  test('every course and portion size is accepted', () => {
    for (const course of COURSES) expect(validateMenuForm(goodForm({ course })).valid).toBe(true);
    for (const portionSize of PORTION_SIZES) expect(validateMenuForm(goodForm({ portionSize })).valid).toBe(true);
  });
});

describe('validateMenuForm: one bad field at a time', () => {
  test.each([
    ['empty', ''], ['spaces only', '   '], ['81 characters', 'x'.repeat(81)], ['a number', 5], ['null', null],
  ])('name %s is rejected', (_label, name) => expect(errorsFor({ name }).name).toBeTruthy());
  test('name of exactly 80 characters is accepted', () => expect(errorsFor({ name: 'x'.repeat(80) }).name).toBeUndefined());

  test('description of 300 is accepted, 301 and a number are rejected', () => {
    expect(errorsFor({ description: 'd'.repeat(300) }).description).toBeUndefined();
    expect(errorsFor({ description: 'd'.repeat(301) }).description).toBeTruthy();
    expect(errorsFor({ description: 12 }).description).toBeTruthy();
  });

  test.each([
    [''], ['   '], ['0'], ['-5'], ['12.5'], ['1e3'], ['abc'], ['250rs'], ['100001'], ['1000000'], ['9999999'], [250.5], [Number.NaN], [Infinity], [null], [undefined],
  ])('price %p is rejected', (price) => expect(errorsFor({ price }).price).toBeTruthy());
  test.each([['1', 1], ['100000', 100000], [' 450 ', 450], ['0007', 7], [450, 450]])('price %p is accepted as %p', (price, expected) => {
    const result = validateMenuForm(goodForm({ price }));
    expect(result.errors.price).toBeUndefined();
    expect(result.payload.price).toBe(expected);
  });

  test('category and cuisine: empty and 41 characters rejected, 40 accepted', () => {
    for (const field of ['category', 'cuisine']) {
      expect(errorsFor({ [field]: '' })[field]).toBeTruthy();
      expect(errorsFor({ [field]: 'c'.repeat(41) })[field]).toBeTruthy();
      expect(errorsFor({ [field]: 'c'.repeat(40) })[field]).toBeUndefined();
    }
  });

  test.each([[null], [undefined], ['true'], [1], [0], ['']])('isVeg %p is rejected', (isVeg) => expect(errorsFor({ isVeg }).isVeg).toBeTruthy());

  test.each([[''], [0], [6], [2.5], ['x'], [null], ['10']])('spiceLevel %p is rejected', (spiceLevel) => expect(errorsFor({ spiceLevel }).spiceLevel).toBeTruthy());
  test.each([[1], [2], [3], [4], [5], ['1'], ['5']])('spiceLevel %p is accepted', (spiceLevel) => expect(errorsFor({ spiceLevel }).spiceLevel).toBeUndefined());

  test.each([[''], [0], [121], [10.5], ['abc'], [null]])('prepMinutes %p is rejected', (prepMinutes) => expect(errorsFor({ prepMinutes }).prepMinutes).toBeTruthy());
  test.each([['1'], ['120'], [60]])('prepMinutes %p is accepted', (prepMinutes) => expect(errorsFor({ prepMinutes }).prepMinutes).toBeUndefined());

  test('course and portion size outside the lists are rejected', () => {
    for (const course of ['', 'brunch', null, undefined]) expect(errorsFor({ course }).course).toBeTruthy();
    for (const portionSize of ['', 'huge', null]) expect(errorsFor({ portionSize }).portionSize).toBeTruthy();
  });

  test('flavour tags: unknown and non-array rejected, duplicates removed, canonical order', () => {
    expect(errorsFor({ flavourTags: ['spicy'] }).flavourTags).toBeTruthy();
    expect(errorsFor({ flavourTags: 'sweet' }).flavourTags).toBeTruthy();
    expect(errorsFor({ flavourTags: [] }).flavourTags).toBeUndefined();
    expect(validateMenuForm(goodForm({ flavourTags: ['crispy', 'sweet', 'sweet'] })).payload.flavourTags).toEqual(['sweet', 'crispy']);
    expect([...FLAVOUR_TAGS]).toContain('light');
  });
});

describe('validateMenuForm: the allergen answer must be explicit', () => {
  test('no allergens ticked and no confirmation of "none" is an error (missing is never none)', () => {
    expect(errorsFor({ allergens: [], noAllergens: false }).allergens).toBeTruthy();
    expect(validateMenuForm(goodForm({ allergens: [], noAllergens: undefined })).valid).toBe(false);
  });
  test('"contains none" with an empty list is valid and sends an explicit []', () => {
    const result = validateMenuForm(goodForm({ allergens: [], noAllergens: true }));
    expect(result.valid).toBe(true);
    expect(result.payload.allergens).toEqual([]);
  });
  test('"contains none" together with a ticked allergen is a conflict', () => {
    expect(errorsFor({ allergens: ['dairy'], noAllergens: true }).allergens).toBeTruthy();
  });
  test('unknown allergens and non-arrays are rejected', () => {
    for (const allergens of [['wheat'], ['peanuts'], [null], [5], 'dairy', undefined, null]) {
      expect(errorsFor({ allergens, noAllergens: false }).allergens).toBeTruthy();
    }
  });
  test('case and spaces are tolerated, duplicates removed, canonical order used', () => {
    expect(validateMenuForm(goodForm({ allergens: [' Peanut ', 'DAIRY', 'dairy'] })).payload.allergens).toEqual(['peanut', 'dairy']);
    expect(validateMenuForm(goodForm({ allergens: ['mustard', 'peanut', 'tree nut'] })).payload.allergens).toEqual(['peanut', 'tree nut', 'mustard']);
  });
  test('all ten allergens can be ticked', () => {
    const all = ['peanut', 'tree nut', 'dairy', 'egg', 'gluten', 'soy', 'fish', 'shellfish', 'sesame', 'mustard'];
    expect(validateMenuForm(goodForm({ allergens: all })).payload.allergens).toEqual(all);
  });
});

describe('validateMenuForm: whole forms', () => {
  test('a blank form is invalid and reports every unanswered field at once', () => {
    const result = validateMenuForm(emptyMenuForm());
    expect(result.valid).toBe(false);
    expect(result.payload).toBeNull();
    expect(Object.keys(result.errors).sort()).toEqual(['allergens', 'category', 'course', 'cuisine', 'isVeg', 'name', 'prepMinutes', 'price']);
  });
  test('missing or strange input never throws', () => {
    for (const value of [null, undefined, 'text', 42, [], {}]) {
      expect(() => validateMenuForm(value)).not.toThrow();
      expect(validateMenuForm(value).valid).toBe(false);
    }
  });
  test('the blank form never answers the safety questions for the owner', () => {
    const blank = emptyMenuForm();
    expect([blank.isVeg, blank.allergens, blank.noAllergens]).toEqual([null, [], false]);
  });
});

describe('menuFormFromItem', () => {
  const item = {
    id: 'a1', name: 'Dal Makhani', description: 'Black lentils, butter and cream', price: 650, category: 'Mains', isVeg: true,
    allergens: ['soy', 'dairy'], allergensConfirmed: true, spiceLevel: 3, flavourTags: ['creamy'], cuisine: 'North Indian',
    course: 'main', portionSize: 'regular', prepMinutes: 20, available: true,
  };
  test('turns a server item into form values (strings for the inputs, canonical allergen order)', () => {
    expect(menuFormFromItem(item)).toEqual({
      name: 'Dal Makhani', description: 'Black lentils, butter and cream', price: '650', category: 'Mains', isVeg: true,
      allergens: ['dairy', 'soy'], noAllergens: false, spiceLevel: '3', flavourTags: ['creamy'], cuisine: 'North Indian',
      course: 'main', portionSize: 'regular', prepMinutes: '20',
    });
  });
  test('an explicit empty allergen list means "contains none"; a missing list does not', () => {
    expect(menuFormFromItem({ ...item, allergens: [] }).noAllergens).toBe(true);
    const { allergens, ...withoutList } = item; // eslint-disable-line no-unused-vars
    expect(menuFormFromItem(withoutList).noAllergens).toBe(false);
  });
  test('a missing description becomes empty; junk input never throws', () => {
    const { description, ...rest } = item; // eslint-disable-line no-unused-vars
    expect(menuFormFromItem(rest).description).toBe('');
    for (const value of [null, undefined, 'x', 5]) expect(() => menuFormFromItem(value)).not.toThrow();
  });
  test('round trip: an untouched edit form validates and reproduces the same editable values', () => {
    const result = validateMenuForm(menuFormFromItem(item));
    expect(result.valid).toBe(true);
    for (const field of EDITABLE_FIELDS) {
      if (field === 'allergens') expect(sameAllergens(item.allergens, result.payload.allergens)).toBe(true);
      else expect(result.payload[field]).toEqual(item[field]);
    }
  });
});

describe('sameAllergens and unknownAllergens', () => {
  test('order, case, spaces and duplicates do not matter', () => {
    expect(sameAllergens(['soy', 'dairy'], [' DAIRY ', 'Soy', 'soy'])).toBe(true);
    expect(sameAllergens([], [])).toBe(true);
  });
  test('different lists differ', () => {
    expect(sameAllergens(['dairy'], ['dairy', 'egg'])).toBe(false);
    expect(sameAllergens(['dairy'], [])).toBe(false);
  });
  test('anything that is not a list counts as different (fail closed)', () => {
    expect(sameAllergens(undefined, [])).toBe(false);
    expect(sameAllergens([], null)).toBe(false);
    expect(sameAllergens(undefined, undefined)).toBe(false);
    expect(sameAllergens('dairy', ['dairy'])).toBe(false);
  });
  test('unknownAllergens finds tags the screens do not recognise', () => {
    expect(unknownAllergens(['dairy', 'soy'])).toEqual([]);
    expect(unknownAllergens(['dairy', 'wheat'])).toEqual(['wheat']);
    expect(unknownAllergens(['PEANUTS'])).toEqual(['peanuts']);
    expect(unknownAllergens([])).toEqual([]);
  });
  test('unknownAllergens returns null when the stored value is not a list', () => {
    expect(unknownAllergens(undefined)).toBeNull();
    expect(unknownAllergens('dairy')).toBeNull();
  });
});

describe('buildPatchPayload: only real changes are sent', () => {
  const item = menuFormFromItem({
    name: 'Dal Makhani', description: 'Black lentils', price: 650, category: 'Mains', isVeg: true, allergens: ['dairy', 'soy'],
    spiceLevel: 3, flavourTags: ['creamy', 'sweet'], cuisine: 'North Indian', course: 'main', portionSize: 'regular', prepMinutes: 20,
  });
  const stored = { name: 'Dal Makhani', description: 'Black lentils', price: 650, category: 'Mains', isVeg: true, allergens: ['soy', 'dairy'], spiceLevel: 3, flavourTags: ['creamy', 'sweet'], cuisine: 'North Indian', course: 'main', portionSize: 'regular', prepMinutes: 20 };
  const payloadFor = (over = {}) => validateMenuForm({ ...item, ...over }).payload;

  test('nothing changed gives an empty object', () => expect(buildPatchPayload(stored, payloadFor())).toEqual({}));
  test('only the price changed', () => expect(buildPatchPayload(stored, payloadFor({ price: '700' }))).toEqual({ price: 700 }));
  test('the same allergens in a different order are NOT sent', () => {
    expect(buildPatchPayload(stored, payloadFor({ allergens: ['soy', 'dairy'] }))).toEqual({});
  });
  test('changed allergens are sent, in canonical order', () => {
    expect(buildPatchPayload(stored, payloadFor({ allergens: ['egg', 'dairy'] }))).toEqual({ allergens: ['dairy', 'egg'] });
  });
  test('removing every allergen is a change and sends an explicit empty list', () => {
    expect(buildPatchPayload(stored, payloadFor({ allergens: [], noAllergens: true }))).toEqual({ allergens: [] });
  });
  test('a stored item without a readable allergen list always sends allergens (fail closed)', () => {
    const { allergens, ...broken } = stored; // eslint-disable-line no-unused-vars
    expect(buildPatchPayload(broken, payloadFor())).toEqual({ allergens: ['dairy', 'soy'] });
  });
  test('description: stored undefined equals an empty form value', () => {
    const { description, ...noDescription } = stored; // eslint-disable-line no-unused-vars
    expect(buildPatchPayload(noDescription, payloadFor({ description: '' }))).toEqual({});
    expect(buildPatchPayload(noDescription, payloadFor({ description: 'New' }))).toEqual({ description: 'New' });
  });
  test('flavour tags: the same set in another order is not sent; a different set is', () => {
    expect(buildPatchPayload(stored, payloadFor({ flavourTags: ['sweet', 'creamy'] }))).toEqual({});
    expect(buildPatchPayload(stored, payloadFor({ flavourTags: ['crispy'] }))).toEqual({ flavourTags: ['crispy'] });
  });
  test('several changes at once', () => {
    expect(buildPatchPayload(stored, payloadFor({ name: 'Dal Bukhara', isVeg: false, prepMinutes: '30' }))).toEqual({ name: 'Dal Bukhara', isVeg: false, prepMinutes: 30 });
  });
  test('the result only ever contains editable fields', () => {
    const changed = buildPatchPayload({ ...stored, available: true, allergensConfirmed: true, id: 'x' }, payloadFor({ price: '1' }));
    for (const key of Object.keys(changed)) expect(EDITABLE_FIELDS).toContain(key);
  });
});
