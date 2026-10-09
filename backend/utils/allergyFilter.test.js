// allergyFilter.test.js: Unit tests for deterministic allergy safety rules
import {
  KNOWN_ALLERGENS,
  normaliseAllergen,
  normaliseAllergies,
  checkItemSafety,
  isItemSafe,
} from './allergyFilter.js';

// Helper to deeply freeze objects to verify immutability
const deepFreeze = (obj) => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  const propNames = Object.getOwnPropertyNames(obj);
  for (const name of propNames) {
    const value = obj[name];
    if (value !== null && typeof value === 'object') {
      deepFreeze(value);
    }
  }
  return obj;
};

describe('allergyFilter: KNOWN_ALLERGENS and Normalisation', () => {
  test('KNOWN_ALLERGENS is frozen and contains exactly 10 items', () => {
    expect(Object.isFrozen(KNOWN_ALLERGENS)).toBe(true);
    expect(KNOWN_ALLERGENS).toHaveLength(10);
    expect(KNOWN_ALLERGENS).toEqual([
      'peanut',
      'tree nut',
      'dairy',
      'egg',
      'gluten',
      'soy',
      'fish',
      'shellfish',
      'sesame',
      'mustard',
    ]);
  });

  test('normaliseAllergen returns empty string for non-strings and trims/collapses whitespace', () => {
    expect(normaliseAllergen(null)).toBe('');
    expect(normaliseAllergen(undefined)).toBe('');
    expect(normaliseAllergen(123)).toBe('');
    expect(normaliseAllergen({})).toBe('');
    expect(normaliseAllergen('  Peanut ')).toBe('peanut');
    expect(normaliseAllergen('tree   nut')).toBe('tree nut');
    expect(normaliseAllergen('DAIRY\t ')).toBe('dairy');
  });

  test('normaliseAllergies sorts, de-duplicates, drops empty strings and non-strings, returns [] for non-arrays', () => {
    expect(normaliseAllergies(null)).toEqual([]);
    expect(normaliseAllergies('peanut')).toEqual([]);
    expect(normaliseAllergies(123)).toEqual([]);
    const input = ['  soy ', '', 123, 'gluten', 'soy', '  ', 'dairy'];
    expect(normaliseAllergies(input)).toEqual(['dairy', 'gluten', 'soy']);
  });
});

describe('allergyFilter: checkItemSafety Core Safety Rules', () => {
  test('peanut guest vs peanut dish: unsafe, clashes ["peanut"], reason "allergen"', () => {
    const dish = { allergensConfirmed: true, allergens: ['peanut'] };
    const res = checkItemSafety(['peanut'], dish);
    expect(res).toEqual({ safe: false, clashes: ['peanut'], reason: 'allergen' });
  });

  test('no clash: safe, reason "ok"', () => {
    const dish = { allergensConfirmed: true, allergens: ['dairy'] };
    const res = checkItemSafety(['peanut'], dish);
    expect(res).toEqual({ safe: true, clashes: [], reason: 'ok' });
  });

  test('two allergies, dish has both: both clashes sorted; dish has one: only that one', () => {
    const dishBoth = { allergensConfirmed: true, allergens: ['peanut', 'dairy'] };
    const resBoth = checkItemSafety(['peanut', 'dairy'], dishBoth);
    expect(resBoth).toEqual({ safe: false, clashes: ['dairy', 'peanut'], reason: 'allergen' });

    const dishOne = { allergensConfirmed: true, allergens: ['dairy', 'gluten'] };
    const resOne = checkItemSafety(['peanut', 'dairy'], dishOne);
    expect(resOne).toEqual({ safe: false, clashes: ['dairy'], reason: 'allergen' });
  });

  test('case and whitespace normalised on both sides ("  Peanut " vs "PEANUT"; "tree   nut" vs "Tree Nut")', () => {
    const dish1 = { allergensConfirmed: true, allergens: ['PEANUT'] };
    const res1 = checkItemSafety(['  Peanut '], dish1);
    expect(res1.safe).toBe(false);
    expect(res1.clashes).toEqual(['peanut']);
    expect(res1.reason).toBe('allergen');

    const dish2 = { allergensConfirmed: true, allergens: ['Tree Nut'] };
    const res2 = checkItemSafety(['tree   nut'], dish2);
    expect(res2.safe).toBe(false);
    expect(res2.clashes).toEqual(['tree nut']);
  });

  test('empty allergies: safe even for a dish with allergens', () => {
    const dish = { allergensConfirmed: true, allergens: ['peanut', 'dairy'] };
    const res = checkItemSafety([], dish);
    expect(res).toEqual({ safe: true, clashes: [], reason: 'ok' });
  });

  test('blank guest entries ("" and "  "): treated as no allergies, safe', () => {
    const dish = { allergensConfirmed: true, allergens: ['peanut'] };
    const res = checkItemSafety(['', '  '], dish);
    expect(res).toEqual({ safe: true, clashes: [], reason: 'ok' });
  });

  test('no allergies + unconfirmed dish: safe', () => {
    const dish = { allergensConfirmed: false, allergens: ['peanut'] };
    const res = checkItemSafety([], dish);
    expect(res).toEqual({ safe: true, clashes: [], reason: 'ok' });
  });

  test('allergies + unconfirmed dish: unsafe, "unconfirmed"', () => {
    const dish = { allergensConfirmed: false, allergens: ['peanut'] };
    const res = checkItemSafety(['peanut'], dish);
    expect(res).toEqual({ safe: false, clashes: [], reason: 'unconfirmed' });
  });

  test('allergies + confirmed dish with allergens missing or not an array: unsafe, "invalid"', () => {
    const dishMissing = { allergensConfirmed: true };
    expect(checkItemSafety(['peanut'], dishMissing)).toEqual({
      safe: false,
      clashes: [],
      reason: 'invalid',
    });

    const dishNotArray = { allergensConfirmed: true, allergens: 'peanut' };
    expect(checkItemSafety(['peanut'], dishNotArray)).toEqual({
      safe: false,
      clashes: [],
      reason: 'invalid',
    });
  });

  test('null, array, string and number items: unsafe, "invalid"', () => {
    expect(checkItemSafety(['peanut'], null)).toEqual({
      safe: false,
      clashes: [],
      reason: 'invalid',
    });
    expect(checkItemSafety(['peanut'], ['array'])).toEqual({
      safe: false,
      clashes: [],
      reason: 'invalid',
    });
    expect(checkItemSafety(['peanut'], 'dish string')).toEqual({
      safe: false,
      clashes: [],
      reason: 'invalid',
    });
    expect(checkItemSafety(['peanut'], 42)).toEqual({
      safe: false,
      clashes: [],
      reason: 'invalid',
    });
  });

  test('participantAllergies undefined, null or a string: unsafe, "invalid"', () => {
    const dish = { allergensConfirmed: true, allergens: [] };
    expect(checkItemSafety(undefined, dish)).toEqual({
      safe: false,
      clashes: [],
      reason: 'invalid',
    });
    expect(checkItemSafety(null, dish)).toEqual({
      safe: false,
      clashes: [],
      reason: 'invalid',
    });
    expect(checkItemSafety('peanut', dish)).toEqual({
      safe: false,
      clashes: [],
      reason: 'invalid',
    });
  });

  test('guest allergy list containing null, 123 or {} (alone and next to "peanut"): unsafe, "invalid"', () => {
    const dish = { allergensConfirmed: true, allergens: ['peanut'] };
    expect(checkItemSafety([null], dish)).toEqual({ safe: false, clashes: [], reason: 'invalid' });
    expect(checkItemSafety([123], dish)).toEqual({ safe: false, clashes: [], reason: 'invalid' });
    expect(checkItemSafety([{}], dish)).toEqual({ safe: false, clashes: [], reason: 'invalid' });
    expect(checkItemSafety(['peanut', null], dish)).toEqual({
      safe: false,
      clashes: [],
      reason: 'invalid',
    });
    expect(checkItemSafety(['peanut', 123], dish)).toEqual({
      safe: false,
      clashes: [],
      reason: 'invalid',
    });
    expect(checkItemSafety(['peanut', {}], dish)).toEqual({
      safe: false,
      clashes: [],
      reason: 'invalid',
    });
  });

  test('dish allergens containing null (guest allergic to peanut, dish confirmed): unsafe, "invalid"', () => {
    const dish = { allergensConfirmed: true, allergens: [null] };
    const res = checkItemSafety(['peanut'], dish);
    expect(res).toEqual({ safe: false, clashes: [], reason: 'invalid' });
  });

  test('guest allergy "nut" (not known): unsafe, "unrecognised-allergy", clashes ["nut"], even for dish with empty allergens; several unknown values sorted', () => {
    const dishEmpty = { allergensConfirmed: true, allergens: [] };
    const res1 = checkItemSafety(['nut'], dishEmpty);
    expect(res1).toEqual({ safe: false, clashes: ['nut'], reason: 'unrecognised-allergy' });

    const res2 = checkItemSafety(['strawberries', 'nut', 'kiwi'], dishEmpty);
    expect(res2).toEqual({
      safe: false,
      clashes: ['kiwi', 'nut', 'strawberries'],
      reason: 'unrecognised-allergy',
    });
  });

  test('dish tagged "peanuts" or "wheat" with a peanut guest: unsafe, "unrecognised-tag"; same dish for guest with no allergies: safe', () => {
    const dishTypo = { allergensConfirmed: true, allergens: ['peanuts'] };
    const dishWheat = { allergensConfirmed: true, allergens: ['wheat'] };

    expect(checkItemSafety(['peanut'], dishTypo)).toEqual({
      safe: false,
      clashes: [],
      reason: 'unrecognised-tag',
    });
    expect(checkItemSafety(['peanut'], dishWheat)).toEqual({
      safe: false,
      clashes: [],
      reason: 'unrecognised-tag',
    });

    // Guest with no allergies is safe because there are no allergies to protect against
    expect(checkItemSafety([], dishTypo)).toEqual({ safe: true, clashes: [], reason: 'ok' });
    expect(checkItemSafety([], dishWheat)).toEqual({ safe: true, clashes: [], reason: 'ok' });
  });

  test('"tree nut" on a dish does not clash with a "peanut" guest', () => {
    const dish = { allergensConfirmed: true, allergens: ['tree nut'] };
    const res = checkItemSafety(['peanut'], dish);
    expect(res).toEqual({ safe: true, clashes: [], reason: 'ok' });
  });

  test('inputs are deep-frozen before the call; the call does not throw and changes nothing', () => {
    const guest = deepFreeze(['peanut', 'dairy']);
    const dish = deepFreeze({
      allergensConfirmed: true,
      allergens: ['dairy', 'gluten'],
    });

    expect(() => checkItemSafety(guest, dish)).not.toThrow();
    const res = checkItemSafety(guest, dish);
    expect(res.safe).toBe(false);
    expect(res.clashes).toEqual(['dairy']);
    expect(guest).toEqual(['peanut', 'dairy']);
    expect(dish.allergens).toEqual(['dairy', 'gluten']);
  });

  test('isItemSafe agrees with checkItemSafety(...).safe on a set of cases', () => {
    const cases = [
      { guest: ['peanut'], dish: { allergensConfirmed: true, allergens: ['peanut'] } },
      { guest: ['peanut'], dish: { allergensConfirmed: true, allergens: ['dairy'] } },
      { guest: [], dish: { allergensConfirmed: false, allergens: ['peanut'] } },
      { guest: ['egg'], dish: { allergensConfirmed: false, allergens: ['egg'] } },
      { guest: ['unknown'], dish: { allergensConfirmed: true, allergens: [] } },
    ];
    for (const c of cases) {
      expect(isItemSafe(c.guest, c.dish)).toBe(checkItemSafety(c.guest, c.dish).safe);
    }
  });
});

describe('allergyFilter: test.each over KNOWN_ALLERGENS', () => {
  test.each(KNOWN_ALLERGENS)(
    'Allergen isolation: dish with [%s] is unsafe for same allergen, safe for any other single known allergen',
    (allergen) => {
      const dish = { allergensConfirmed: true, allergens: [allergen] };
      // Unsafe for guest with the same allergen
      expect(isItemSafe([allergen], dish)).toBe(false);

      // Safe for any other single known allergen
      const otherAllergens = KNOWN_ALLERGENS.filter((a) => a !== allergen);
      for (let i = 0; i < otherAllergens.length; i++) {
        expect(isItemSafe([otherAllergens[i]], dish)).toBe(true);
      }
    }
  );
});
