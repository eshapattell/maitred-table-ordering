// menuForm.js: pure helpers for the owner's dish form (FINAL drop-in, Task 8b).
// They mirror the rules in backend/controllers/menuController.js so the owner gets fast, clear
// feedback, but the SERVER stays the authority and always validates again.
import { ALLERGEN_VALUES } from './allergens.js';
import { COURSES, PORTION_SIZES, FLAVOUR_TAGS, LIMITS } from './menuOptions.js';

// Must match EDITABLE_FIELDS in the backend controller (a test enforces it).
export const EDITABLE_FIELDS = Object.freeze([
  'name', 'description', 'price', 'category', 'isVeg', 'allergens', 'spiceLevel',
  'flavourTags', 'cuisine', 'course', 'portionSize', 'prepMinutes',
]);

const norm = (value) => String(value).trim().toLowerCase();
const isText = (value) => typeof value === 'string';

// Sorted, de-duplicated, lower-case copy of an allergen list; null when it is not an array.
const normalisedList = (list) => (Array.isArray(list) ? [...new Set(list.map(norm))].sort() : null);

// Same allergens regardless of order, case or duplicates. Anything that is not an array on
// either side counts as DIFFERENT (fail closed: unknown must never look like "unchanged").
export const sameAllergens = (a, b) => {
  const x = normalisedList(a);
  const y = normalisedList(b);
  if (!x || !y) return false;
  return x.length === y.length && x.every((value, index) => value === y[index]);
};

// Allergen tags this screen does not recognise. Returns null when the stored value is not a
// list at all. The screens must treat null and a non-empty result as a blocking problem.
export const unknownAllergens = (list) => {
  const x = normalisedList(list);
  if (!x) return null;
  return x.filter((value) => !ALLERGEN_VALUES.includes(value));
};

// Known allergens in the canonical order of ALLERGEN_VALUES.
const orderAllergens = (list) => {
  const x = normalisedList(list) || [];
  return ALLERGEN_VALUES.filter((value) => x.includes(value));
};

// A blank form. isVeg and the allergen answer are deliberately unanswered: the owner must
// choose, so "forgot to answer" can never be saved as "vegetarian" or "no allergens".
export const emptyMenuForm = () => ({
  name: '',
  description: '',
  price: '',
  category: '',
  isVeg: null,
  allergens: [],
  noAllergens: false,
  spiceLevel: '1',
  flavourTags: [],
  cuisine: '',
  course: '',
  portionSize: 'regular',
  prepMinutes: '',
});

// Form values for editing an existing dish (an explicit empty list means "no allergens").
export const menuFormFromItem = (item) => {
  const source = item && typeof item === 'object' ? item : {};
  const hasList = Array.isArray(source.allergens);
  return {
    name: isText(source.name) ? source.name : '',
    description: isText(source.description) ? source.description : '',
    price: source.price == null ? '' : String(source.price),
    category: isText(source.category) ? source.category : '',
    isVeg: typeof source.isVeg === 'boolean' ? source.isVeg : null,
    allergens: hasList ? orderAllergens(source.allergens) : [],
    noAllergens: hasList && source.allergens.length === 0,
    spiceLevel: source.spiceLevel == null ? '' : String(source.spiceLevel),
    flavourTags: Array.isArray(source.flavourTags) ? FLAVOUR_TAGS.filter((t) => source.flavourTags.includes(t)) : [],
    cuisine: isText(source.cuisine) ? source.cuisine : '',
    course: isText(source.course) ? source.course : '',
    portionSize: isText(source.portionSize) ? source.portionSize : '',
    prepMinutes: source.prepMinutes == null ? '' : String(source.prepMinutes),
  };
};

const wholeNumber = (value) => {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : isText(value) ? value.trim() : '';
  return /^\d{1,6}$/.test(text) ? Number(text) : null;
};

const between = (text, max) => text.length >= 1 && text.length <= max;

// Returns { valid, errors, payload }. errors maps a field name to one message; payload is the
// exact body for the API when valid, otherwise null.
export const validateMenuForm = (values) => {
  const v = values && typeof values === 'object' ? values : {};
  const errors = {};

  const name = isText(v.name) ? v.name.trim() : '';
  if (!between(name, LIMITS.nameMax)) errors.name = `Enter the dish name (up to ${LIMITS.nameMax} characters)`;

  let description = '';
  if (v.description !== undefined && v.description !== null && v.description !== '') {
    if (!isText(v.description) || v.description.trim().length > LIMITS.descriptionMax) {
      errors.description = `The description can be up to ${LIMITS.descriptionMax} characters`;
    } else {
      description = v.description.trim();
    }
  }

  const price = wholeNumber(v.price);
  if (price === null || price < 1 || price > LIMITS.priceMax) {
    errors.price = 'Enter the price in whole rupees (1 to 1,00,000)';
  }

  const category = isText(v.category) ? v.category.trim() : '';
  if (!between(category, LIMITS.categoryMax)) errors.category = `Enter a menu section (up to ${LIMITS.categoryMax} characters)`;

  if (typeof v.isVeg !== 'boolean') errors.isVeg = 'Choose vegetarian or non-vegetarian';

  let allergens = [];
  if (!Array.isArray(v.allergens)) {
    errors.allergens = 'Choose the allergens again';
  } else if (v.allergens.some((tag) => !ALLERGEN_VALUES.includes(norm(tag)))) {
    errors.allergens = 'One of the allergens is not recognised';
  } else {
    allergens = orderAllergens(v.allergens);
    if (allergens.length === 0 && v.noAllergens !== true) {
      errors.allergens = 'Tick every allergen this dish contains, or confirm that it contains none';
    } else if (allergens.length > 0 && v.noAllergens === true) {
      errors.allergens = 'Untick "contains none" or remove the ticked allergens';
    }
  }

  const spice = /^[1-5]$/.test(String(v.spiceLevel ?? '').trim()) ? Number(String(v.spiceLevel).trim()) : null;
  if (spice === null) errors.spiceLevel = 'Choose a spice level from 1 to 5';

  let flavourTags = [];
  if (!Array.isArray(v.flavourTags) || v.flavourTags.some((tag) => !FLAVOUR_TAGS.includes(tag))) {
    errors.flavourTags = 'Choose flavours from the list';
  } else {
    flavourTags = FLAVOUR_TAGS.filter((tag) => v.flavourTags.includes(tag));
  }

  const cuisine = isText(v.cuisine) ? v.cuisine.trim() : '';
  if (!between(cuisine, LIMITS.cuisineMax)) errors.cuisine = `Enter the cuisine (up to ${LIMITS.cuisineMax} characters)`;

  if (!COURSES.includes(v.course)) errors.course = 'Choose a course';
  if (!PORTION_SIZES.includes(v.portionSize)) errors.portionSize = 'Choose a portion size';

  const prep = wholeNumber(v.prepMinutes);
  if (prep === null || prep < 1 || prep > LIMITS.prepMax) errors.prepMinutes = `Enter the preparation time in minutes (1 to ${LIMITS.prepMax})`;

  const valid = Object.keys(errors).length === 0;
  return {
    valid,
    errors,
    payload: valid
      ? { name, description, price, category, isVeg: v.isVeg, allergens, spiceLevel: spice, flavourTags, cuisine, course: v.course, portionSize: v.portionSize, prepMinutes: prep }
      : null,
  };
};

const sameSet = (a, b) => {
  const x = Array.isArray(a) ? [...new Set(a)].sort() : null;
  const y = Array.isArray(b) ? [...new Set(b)].sort() : null;
  return Boolean(x && y) && x.length === y.length && x.every((value, index) => value === y[index]);
};

// For an edit: only the fields that really changed. Sending less means a stale edit screen
// cannot overwrite something that someone else changed in the meantime. {} means "no changes".
export const buildPatchPayload = (item, payload) => {
  const stored = item && typeof item === 'object' ? item : {};
  const changed = {};
  for (const field of EDITABLE_FIELDS) {
    if (field === 'allergens') {
      if (!sameAllergens(stored.allergens, payload.allergens)) changed.allergens = payload.allergens;
    } else if (field === 'flavourTags') {
      if (!sameSet(stored.flavourTags, payload.flavourTags)) changed.flavourTags = payload.flavourTags;
    } else if (field === 'description') {
      if ((stored.description ?? '') !== payload.description) changed.description = payload.description;
    } else if (stored[field] !== payload[field]) {
      changed[field] = payload[field];
    }
  }
  return changed;
};
