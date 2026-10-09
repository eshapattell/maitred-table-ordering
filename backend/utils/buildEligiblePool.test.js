// buildEligiblePool.test.js: Unit tests and safety sweep for buildEligiblePool
import { buildEligiblePool } from './buildEligiblePool.js';

// Helper to deeply freeze inputs to verify zero side-effects
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

describe('buildEligiblePool: Core Filters', () => {
  const baseSafeDish = {
    id: 'd1',
    name: 'Steamed Rice',
    description: 'Fluffy jasmine rice',
    price: 10,
    isVeg: true,
    available: true,
    allergensConfirmed: true,
    allergens: [],
  };

  test('removes unavailable dishes', () => {
    const menu = [
      { ...baseSafeDish, id: '1', available: true },
      { ...baseSafeDish, id: '2', available: false },
    ];
    const pool = buildEligiblePool({ allergies: [] }, menu);
    expect(pool).toHaveLength(1);
    expect(pool[0].id).toBe('1');
  });

  test('removes unsafe dishes; removes unconfirmed dishes for allergic guest and keeps them for guest with no allergies', () => {
    const peanutDish = {
      ...baseSafeDish,
      id: 'p1',
      allergensConfirmed: true,
      allergens: ['peanut'],
    };
    const unconfirmedDish = {
      ...baseSafeDish,
      id: 'u1',
      allergensConfirmed: false,
      allergens: [],
    };
    const menu = [peanutDish, unconfirmedDish, baseSafeDish];

    // Allergic guest
    const allergicGuest = { allergies: ['peanut'] };
    const allergicPool = buildEligiblePool(allergicGuest, menu);
    expect(allergicPool).toHaveLength(1);
    expect(allergicPool[0].id).toBe('d1');

    // Guest with no allergies
    const nonAllergicGuest = { allergies: [] };
    const nonAllergicPool = buildEligiblePool(nonAllergicGuest, menu);
    expect(nonAllergicPool).toHaveLength(3);
  });

  test('dishes with an unrecognised tag are removed for an allergic guest and kept for a guest with none', () => {
    const typoDish = {
      ...baseSafeDish,
      id: 't1',
      allergensConfirmed: true,
      allergens: ['peanuts'], // Typo: plural instead of peanut
    };
    const menu = [typoDish, baseSafeDish];

    const allergicGuest = { allergies: ['dairy'] };
    const allergicPool = buildEligiblePool(allergicGuest, menu);
    expect(allergicPool).toHaveLength(1);
    expect(allergicPool[0].id).toBe('d1');

    const noAllergyGuest = { allergies: [] };
    const noAllergyPool = buildEligiblePool(noAllergyGuest, menu);
    expect(noAllergyPool).toHaveLength(2);
  });

  test('guest with a non-string allergy entry, or an unrecognised allergy: pool is []', () => {
    const menu = [baseSafeDish];

    expect(buildEligiblePool({ allergies: [null] }, menu)).toEqual([]);
    expect(buildEligiblePool({ allergies: [123] }, menu)).toEqual([]);
    expect(buildEligiblePool({ allergies: ['nut'] }, menu)).toEqual([]); // 'nut' not in KNOWN_ALLERGENS
  });

  test('diet: veg keeps only isVeg; egg behaves as veg; non-veg keeps all; missing/null/"" keep all; unknown value and number behave as veg; trimmed/case-insensitive', () => {
    const vegDish = { ...baseSafeDish, id: 'v', isVeg: true };
    const nonVegDish = { ...baseSafeDish, id: 'nv', isVeg: false };
    const menu = [vegDish, nonVegDish];

    // veg keeps only isVeg
    expect(
      buildEligiblePool({ allergies: [], tasteProfile: { diet: 'veg' } }, menu).map((d) => d.id)
    ).toEqual(['v']);

    // egg behaves as veg
    expect(
      buildEligiblePool({ allergies: [], tasteProfile: { diet: 'egg' } }, menu).map((d) => d.id)
    ).toEqual(['v']);

    // non-veg keeps all
    expect(
      buildEligiblePool({ allergies: [], tasteProfile: { diet: 'non-veg' } }, menu).map((d) => d.id)
    ).toEqual(['v', 'nv']);

    // missing, null and "" keep all
    expect(
      buildEligiblePool({ allergies: [], tasteProfile: {} }, menu).map((d) => d.id)
    ).toEqual(['v', 'nv']);
    expect(
      buildEligiblePool({ allergies: [], tasteProfile: { diet: null } }, menu).map((d) => d.id)
    ).toEqual(['v', 'nv']);
    expect(
      buildEligiblePool({ allergies: [], tasteProfile: { diet: '   ' } }, menu).map((d) => d.id)
    ).toEqual(['v', 'nv']);

    // unknown value and number behave as veg
    expect(
      buildEligiblePool({ allergies: [], tasteProfile: { diet: 'paleo' } }, menu).map((d) => d.id)
    ).toEqual(['v']);
    expect(
      buildEligiblePool({ allergies: [], tasteProfile: { diet: 999 } }, menu).map((d) => d.id)
    ).toEqual(['v']);

    // " Veg " and " NON-VEG " trimmed and case-insensitive
    expect(
      buildEligiblePool({ allergies: [], tasteProfile: { diet: ' Veg ' } }, menu).map((d) => d.id)
    ).toEqual(['v']);
    expect(
      buildEligiblePool({ allergies: [], tasteProfile: { diet: ' NON-VEG ' } }, menu).map((d) => d.id)
    ).toEqual(['v', 'nv']);
  });

  test('dislikes: match in name, match in description, case-insensitive, empty string dislike does not drop all, missing description does not throw', () => {
    const menu = [
      { ...baseSafeDish, id: '1', name: 'Garlic Bread', description: 'Warm bread' },
      { ...baseSafeDish, id: '2', name: 'Soup', description: 'Cream of mushroom' },
      { ...baseSafeDish, id: '3', name: 'Salad', description: undefined },
    ];

    // match in name
    const pool1 = buildEligiblePool(
      { allergies: [], tasteProfile: { dislikes: ['garlic'] } },
      menu
    );
    expect(pool1.map((d) => d.id)).toEqual(['2', '3']);

    // match in description
    const pool2 = buildEligiblePool(
      { allergies: [], tasteProfile: { dislikes: ['MUSHROOM'] } },
      menu
    );
    expect(pool2.map((d) => d.id)).toEqual(['1', '3']);

    // empty string dislike does not drop everything
    const pool3 = buildEligiblePool(
      { allergies: [], tasteProfile: { dislikes: ['', '   ', null] } },
      menu
    );
    expect(pool3.map((d) => d.id)).toEqual(['1', '2', '3']);
  });

  test('budget: from taste profile, from options.maxPrice, lower wins, budget 0/missing means no limit, non-number price excluded when limit applies', () => {
    const menu = [
      { ...baseSafeDish, id: '1', price: 20 },
      { ...baseSafeDish, id: '2', price: 40 },
      { ...baseSafeDish, id: '3', price: 60 },
      { ...baseSafeDish, id: '4', price: 'free' },
    ];

    // from taste profile
    const poolProfile = buildEligiblePool(
      { allergies: [], tasteProfile: { budget: 40 } },
      menu
    );
    expect(poolProfile.map((d) => d.id)).toEqual(['1', '2']);

    // from options.maxPrice
    const poolOptions = buildEligiblePool(
      { allergies: [], tasteProfile: {} },
      menu,
      { maxPrice: 20 }
    );
    expect(poolOptions.map((d) => d.id)).toEqual(['1']);

    // lower of the two wins (budget 50 vs maxPrice 30 => limit 30)
    const poolLower = buildEligiblePool(
      { allergies: [], tasteProfile: { budget: 50 } },
      menu,
      { maxPrice: 30 }
    );
    expect(poolLower.map((d) => d.id)).toEqual(['1']);

    // budget 0 or missing means no limit (and string price remains when no limit applies)
    const poolNoLimit = buildEligiblePool(
      { allergies: [], tasteProfile: { budget: 0 } },
      menu
    );
    expect(poolNoLimit.map((d) => d.id)).toEqual(['1', '2', '3', '4']);
  });

  test('excludeItemIds: excludes by _id compared as strings, item with no _id and no id not excluded by "undefined"', () => {
    const fakeObjectId = { toString: () => '507f1f77bcf86cd799439011' };
    const menu = [
      { ...baseSafeDish, _id: fakeObjectId, id: 'ignore_me' },
      { ...baseSafeDish, id: 'id_keep' },
      { ...baseSafeDish, _id: undefined, id: undefined, name: 'no ids' },
    ];

    const pool = buildEligiblePool(
      { allergies: [] },
      menu,
      { excludeItemIds: ['507f1f77bcf86cd799439011', 'undefined'] }
    );
    expect(pool).toHaveLength(2);
    expect(pool[0].id).toBe('id_keep');
    expect(pool[1].name).toBe('no ids');
  });

  test('all filters combined in one case', () => {
    const menu = [
      {
        id: '1',
        name: 'Truffle Pasta',
        description: 'Contains dairy',
        price: 35,
        isVeg: true,
        available: true,
        allergensConfirmed: true,
        allergens: ['dairy', 'gluten'],
      },
      {
        id: '2',
        name: 'Veggie Salad',
        description: 'Fresh greens with onions',
        price: 25,
        isVeg: true,
        available: true,
        allergensConfirmed: true,
        allergens: [],
      },
      {
        id: '3',
        name: 'Grilled Beef',
        description: 'Steak',
        price: 45,
        isVeg: false,
        available: true,
        allergensConfirmed: true,
        allergens: [],
      },
    ];

    const participant = {
      allergies: ['peanut'],
      tasteProfile: {
        diet: 'veg',
        dislikes: ['onion'],
        budget: 40,
      },
    };

    // Item 1 passes: safe (no peanut), veg, no onion, price 35 <= 40
    // Item 2 fails: contains 'onion' in description
    // Item 3 fails: isVeg === false
    const pool = buildEligiblePool(participant, menu);
    expect(pool).toHaveLength(1);
    expect(pool[0].id).toBe('1');
  });

  test('returns [] for missing participant and non-array menu; skips non-object items in menu', () => {
    expect(buildEligiblePool(null, [baseSafeDish])).toEqual([]);
    expect(buildEligiblePool(undefined, [baseSafeDish])).toEqual([]);
    expect(buildEligiblePool('guest', [baseSafeDish])).toEqual([]);
    expect(buildEligiblePool({ allergies: [] }, null)).toEqual([]);
    expect(buildEligiblePool({ allergies: [] }, 'not-an-array')).toEqual([]);

    const mixedMenu = [null, 'string', 123, baseSafeDish, undefined, []];
    const pool = buildEligiblePool({ allergies: [] }, mixedMenu);
    expect(pool).toHaveLength(1);
    expect(pool[0].id).toBe('d1');
  });

  test('returns a new array of the same item objects in menu order and does not mutate deep-frozen inputs', () => {
    const d1 = { ...baseSafeDish, id: '1' };
    const d2 = { ...baseSafeDish, id: '2' };
    const menu = deepFreeze([d1, d2]);
    const participant = deepFreeze({ allergies: [] });

    const pool = buildEligiblePool(participant, menu);
    expect(pool).not.toBe(menu);
    expect(pool).toHaveLength(2);
    expect(pool[0]).toBe(d1);
    expect(pool[1]).toBe(d2);
  });

  test('missing tasteProfile still enforces allergies', () => {
    const peanutDish = {
      ...baseSafeDish,
      id: 'p1',
      allergensConfirmed: true,
      allergens: ['peanut'],
    };
    const menu = [peanutDish, baseSafeDish];
    const participant = { allergies: ['peanut'] }; // no tasteProfile property

    const pool = buildEligiblePool(participant, menu);
    expect(pool).toHaveLength(1);
    expect(pool[0].id).toBe('d1');
  });
});

describe('buildEligiblePool: Comprehensive Safety Sweep', () => {
  // Hard-coded list of 10 standard allergen names (without importing from allergyFilter)
  const SWEEP_ALLERGENS = [
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
  ];

  // Seeded pseudo-random number generator (Mulberry32)
  const makeRng = (seed = 42) => {
    let s = seed;
    return () => {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  test('Sweep 40 dishes across 200 random guest profiles', () => {
    const rng = makeRng(42);

    // 1. Build a 40-dish menu with random properties
    const menu = [];
    for (let i = 0; i < 40; i++) {
      const numAllergens = Math.floor(rng() * 3); // 0, 1, or 2 allergens
      const dishAllergens = [];
      for (let a = 0; a < numAllergens; a++) {
        const picked = SWEEP_ALLERGENS[Math.floor(rng() * SWEEP_ALLERGENS.length)];
        if (!dishAllergens.includes(picked)) {
          dishAllergens.push(picked);
        }
      }

      menu.push({
        id: `dish_${i}`,
        name: `Signature Dish ${i}`,
        description: `Delicately prepared course number ${i}`,
        price: 15 + Math.floor(rng() * 70),
        isVeg: rng() > 0.4,
        available: rng() > 0.15, // ~85% available
        allergensConfirmed: i < 5 ? false : rng() > 0.25, // First 5 unconfirmed, then ~75% confirmed
        allergens: dishAllergens,
      });
    }

    let totalReturnedDishes = 0;
    let allergicProfilesWithNonEmptyPool = 0;
    let unconfirmedDishDeliveredToNonAllergic = false;

    // 2. Run 200 random guest profiles
    for (let p = 0; p < 200; p++) {
      const numGuestAllergies = Math.floor(rng() * 4); // 0, 1, 2, or 3
      const guestAllergies = [];
      for (let g = 0; g < numGuestAllergies; g++) {
        const picked = SWEEP_ALLERGENS[Math.floor(rng() * SWEEP_ALLERGENS.length)];
        if (!guestAllergies.includes(picked)) {
          guestAllergies.push(picked);
        }
      }

      const diets = [undefined, 'veg', 'non-veg', 'egg'];
      const diet = diets[Math.floor(rng() * diets.length)];
      const budget = rng() > 0.3 ? 30 + Math.floor(rng() * 50) : undefined;
      const dislikes = rng() > 0.5 ? [`dish ${Math.floor(rng() * 40)}`] : [];

      const fullParticipant = {
        allergies: guestAllergies,
        tasteProfile: { diet, budget, dislikes },
      };

      const pool = buildEligiblePool(fullParticipant, menu);
      totalReturnedDishes += pool.length;

      // Assertion 1: Safety Check for allergic profiles
      if (guestAllergies.length > 0) {
        if (pool.length > 0) {
          allergicProfilesWithNonEmptyPool++;
        }
        for (let d = 0; d < pool.length; d++) {
          const dish = pool[d];
          // Every returned dish MUST have allergens confirmed
          expect(dish.allergensConfirmed).toBe(true);
          // Every returned dish MUST share NO allergen with the guest
          for (let a = 0; a < dish.allergens.length; a++) {
            expect(guestAllergies.includes(dish.allergens[a])).toBe(false);
          }
        }
      } else {
        // Non-allergic guest: check if unconfirmed dish is served
        for (let d = 0; d < pool.length; d++) {
          if (pool[d].allergensConfirmed === false) {
            unconfirmedDishDeliveredToNonAllergic = true;
          }
        }
      }

      // Assertion 2: Completeness check on allergy-only participant
      const allergyOnlyParticipant = {
        allergies: guestAllergies,
      };
      const allergyOnlyPool = buildEligiblePool(allergyOnlyParticipant, menu);
      const actualIds = allergyOnlyPool.map((item) => item.id);

      // Independent plain loop expected list
      const expectedIds = [];
      for (let m = 0; m < menu.length; m++) {
        const item = menu[m];
        if (item.available === true) {
          if (guestAllergies.length === 0) {
            expectedIds.push(item.id);
          } else if (item.allergensConfirmed === true) {
            let shared = false;
            for (let k = 0; k < item.allergens.length; k++) {
              if (guestAllergies.includes(item.allergens[k])) {
                shared = true;
                break;
              }
            }
            if (!shared) {
              expectedIds.push(item.id);
            }
          }
        }
      }
      expect(actualIds).toEqual(expectedIds);
    }

    // Assertion 3: The sweep is not vacuous
    expect(totalReturnedDishes).toBeGreaterThan(0);
    expect(allergicProfilesWithNonEmptyPool).toBeGreaterThan(0);

    // Assertion 4: At least one profile with no allergies receives an unconfirmed dish
    expect(unconfirmedDishDeliveredToNonAllergic).toBe(true);
  });
});
