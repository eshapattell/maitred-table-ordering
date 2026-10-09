// menuController.js: Luxury dining menu controller for maitred
import mongoose from 'mongoose';
import MenuItem from '../models/MenuItem.js';
import Restaurant from '../models/Restaurant.js';
import {
  KNOWN_ALLERGENS,
  normaliseAllergen,
  normaliseAllergies,
} from '../utils/allergyFilter.js';

// Permitted menu taxonomy constants
export const COURSES = Object.freeze([
  'starter',
  'main',
  'side',
  'dessert',
  'beverage',
]);

export const PORTION_SIZES = Object.freeze(['light', 'regular', 'large']);

export const FLAVOUR_TAGS = Object.freeze([
  'sweet',
  'tangy',
  'creamy',
  'crispy',
  'light',
]);

const EDITABLE_FIELDS = Object.freeze([
  'name',
  'description',
  'price',
  'category',
  'isVeg',
  'allergens',
  'spiceLevel',
  'flavourTags',
  'cuisine',
  'course',
  'portionSize',
  'prepMinutes',
]);

/**
 * Validates menu item fields for creation or partial updates.
 *
 * @param {Object} body
 * @param {{ partial?: boolean }} options
 * @returns {{ valid: boolean, status?: number, message?: string, data?: Object }}
 */
export const validateMenuFields = (body, { partial = false } = {}) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, status: 400, message: 'Invalid body' };
  }

  if (partial) {
    const presentEditable = EDITABLE_FIELDS.filter((f) => f in body);
    if (presentEditable.length === 0) {
      return { valid: false, status: 400, message: 'Nothing to update' };
    }
  }

  const data = {};

  // 1. name: string, trimmed, 1 to 80 characters
  if (!partial || 'name' in body) {
    if (!('name' in body)) {
      return { valid: false, status: 400, message: 'Dish name is required' };
    }
    const { name } = body;
    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 80) {
      return { valid: false, status: 400, message: 'Invalid dish name' };
    }
    data.name = name.trim();
  }

  // 2. description: optional string, trimmed, at most 300 characters (default "")
  if (!partial || 'description' in body) {
    if ('description' in body && body.description !== undefined && body.description !== null) {
      if (typeof body.description !== 'string' || body.description.trim().length > 300) {
        return { valid: false, status: 400, message: 'Invalid description' };
      }
      data.description = body.description.trim();
    } else {
      data.description = '';
    }
  }

  // 3. price: finite number greater than 0 and at most 100000
  if (!partial || 'price' in body) {
    if (!('price' in body)) {
      return { valid: false, status: 400, message: 'Price is required' };
    }
    const { price } = body;
    if (
      typeof price !== 'number' ||
      !Number.isFinite(price) ||
      price <= 0 ||
      price > 100000
    ) {
      return { valid: false, status: 400, message: 'Invalid price' };
    }
    data.price = price;
  }

  // 4. category: string, trimmed, 1 to 40 characters
  if (!partial || 'category' in body) {
    if (!('category' in body)) {
      return { valid: false, status: 400, message: 'Category is required' };
    }
    const { category } = body;
    if (
      typeof category !== 'string' ||
      category.trim().length < 1 ||
      category.trim().length > 40
    ) {
      return { valid: false, status: 400, message: 'Invalid category' };
    }
    data.category = category.trim();
  }

  // 5. isVeg: boolean
  if (!partial || 'isVeg' in body) {
    if (!('isVeg' in body)) {
      return { valid: false, status: 400, message: 'isVeg flag is required' };
    }
    const { isVeg } = body;
    if (typeof isVeg !== 'boolean') {
      return { valid: false, status: 400, message: 'Invalid isVeg flag' };
    }
    data.isVeg = isVeg;
  }

  // 6. allergens: array of at most 10 strings; every entry must normalise to KNOWN_ALLERGENS
  if (!partial || 'allergens' in body) {
    // Viva note: On create, the allergens field is required. Missing must never be read as "none".
    // An explicit [] means "no allergens".
    if (!('allergens' in body)) {
      return { valid: false, status: 400, message: 'Allergens field is required' };
    }
    const { allergens } = body;
    if (!Array.isArray(allergens) || allergens.length > 10) {
      return { valid: false, status: 400, message: 'Invalid allergens' };
    }
    for (let i = 0; i < allergens.length; i++) {
      if (typeof allergens[i] !== 'string') {
        return { valid: false, status: 400, message: 'Invalid allergens' };
      }
      const norm = normaliseAllergen(allergens[i]);
      if (!KNOWN_ALLERGENS.includes(norm)) {
        return { valid: false, status: 400, message: 'Unknown allergen tag' };
      }
    }
    data.allergens = normaliseAllergies(allergens);
  }

  // 7. spiceLevel: integer 1 to 5
  if (!partial || 'spiceLevel' in body) {
    if (!('spiceLevel' in body)) {
      return { valid: false, status: 400, message: 'Spice level is required' };
    }
    const { spiceLevel } = body;
    if (
      typeof spiceLevel !== 'number' ||
      !Number.isInteger(spiceLevel) ||
      spiceLevel < 1 ||
      spiceLevel > 5
    ) {
      return { valid: false, status: 400, message: 'Invalid spice level' };
    }
    data.spiceLevel = spiceLevel;
  }

  // 8. flavourTags: array of at most 5 entries, each one of FLAVOUR_TAGS; de-duplicate
  if (!partial || 'flavourTags' in body) {
    if (!('flavourTags' in body)) {
      return { valid: false, status: 400, message: 'flavourTags is required' };
    }
    const { flavourTags } = body;
    if (!Array.isArray(flavourTags) || flavourTags.length > 5) {
      return { valid: false, status: 400, message: 'Invalid flavour tags' };
    }
    for (let i = 0; i < flavourTags.length; i++) {
      if (
        typeof flavourTags[i] !== 'string' ||
        !FLAVOUR_TAGS.includes(flavourTags[i])
      ) {
        return { valid: false, status: 400, message: 'Invalid flavour tag' };
      }
    }
    data.flavourTags = [...new Set(flavourTags)];
  }

  // 9. cuisine: string, trimmed, 1 to 40 characters
  if (!partial || 'cuisine' in body) {
    if (!('cuisine' in body)) {
      return { valid: false, status: 400, message: 'Cuisine is required' };
    }
    const { cuisine } = body;
    if (
      typeof cuisine !== 'string' ||
      cuisine.trim().length < 1 ||
      cuisine.trim().length > 40
    ) {
      return { valid: false, status: 400, message: 'Invalid cuisine' };
    }
    data.cuisine = cuisine.trim();
  }

  // 10. course: one of COURSES
  if (!partial || 'course' in body) {
    if (!('course' in body)) {
      return { valid: false, status: 400, message: 'Course is required' };
    }
    const { course } = body;
    if (typeof course !== 'string' || !COURSES.includes(course)) {
      return { valid: false, status: 400, message: 'Invalid course' };
    }
    data.course = course;
  }

  // 11. portionSize: one of PORTION_SIZES
  if (!partial || 'portionSize' in body) {
    if (!('portionSize' in body)) {
      return { valid: false, status: 400, message: 'Portion size is required' };
    }
    const { portionSize } = body;
    if (typeof portionSize !== 'string' || !PORTION_SIZES.includes(portionSize)) {
      return { valid: false, status: 400, message: 'Invalid portion size' };
    }
    data.portionSize = portionSize;
  }

  // 12. prepMinutes: integer 1 to 120
  if (!partial || 'prepMinutes' in body) {
    if (!('prepMinutes' in body)) {
      return { valid: false, status: 400, message: 'Preparation minutes is required' };
    }
    const { prepMinutes } = body;
    if (
      typeof prepMinutes !== 'number' ||
      !Number.isInteger(prepMinutes) ||
      prepMinutes < 1 ||
      prepMinutes > 120
    ) {
      return { valid: false, status: 400, message: 'Invalid prep minutes' };
    }
    data.prepMinutes = prepMinutes;
  }

  return { valid: true, data };
};

/**
 * Whitelist projection for public guest menu view.
 * Excludes internal restaurantId, available status, and timestamps.
 */
export const publicMenuItem = (item) => ({
  id: String(item._id),
  name: item.name,
  description: item.description ?? '',
  price: item.price,
  category: item.category,
  isVeg: item.isVeg,
  allergens: item.allergens ?? [],
  allergensConfirmed: item.allergensConfirmed ?? false,
  spiceLevel: item.spiceLevel,
  flavourTags: item.flavourTags ?? [],
  cuisine: item.cuisine,
  course: item.course,
  portionSize: item.portionSize,
  prepMinutes: item.prepMinutes,
});

/**
 * Whitelist projection for restaurant staff (owner & kitchen).
 * Includes available flag for inventory management.
 */
export const ownerMenuItem = (item) => ({
  ...publicMenuItem(item),
  available: item.available ?? true,
});

/**
 * Helper to check whether two allergen arrays contain identical normalised items.
 */
const areAllergiesEqual = (arr1, arr2) => {
  const norm1 = normaliseAllergies(arr1);
  const norm2 = normaliseAllergies(arr2);
  if (norm1.length !== norm2.length) return false;
  return norm1.every((val, idx) => val === norm2[idx]);
};

/**
 * Public route: Returns only available dishes for a given restaurant,
 * sorted by category then name.
 */
export const getPublicMenu = async (req, res, next) => {
  try {
    const { restaurantId } = req.params;
    if (!mongoose.isObjectIdOrHexString(restaurantId)) {
      return res.status(404).json({ message: 'Not found' });
    }

    const restaurant = await Restaurant.findById(restaurantId).lean();
    if (!restaurant) {
      return res.status(404).json({ message: 'Not found' });
    }

    const items = await MenuItem.find({
      restaurantId,
      available: true,
    })
      .sort({ category: 1, name: 1 })
      .lean();

    res.status(200).json({ items: items.map(publicMenuItem) });
  } catch (err) {
    next(err);
  }
};

/**
 * Staff route: Returns all dishes for authenticated user's restaurant,
 * including unavailable ones, sorted by category then name.
 */
export const getStaffMenu = async (req, res, next) => {
  try {
    const items = await MenuItem.find({
      restaurantId: req.user.restaurantId,
    })
      .sort({ category: 1, name: 1 })
      .lean();

    res.status(200).json({ items: items.map(ownerMenuItem) });
  } catch (err) {
    next(err);
  }
};

/**
 * Owner route: Creates a new menu item.
 * allergensConfirmed is always forced to false and available is true.
 */
export const createMenuItem = async (req, res, next) => {
  try {
    const validation = validateMenuFields(req.body, { partial: false });
    if (!validation.valid) {
      return res.status(validation.status).json({ message: validation.message });
    }

    const {
      name,
      description = '',
      price,
      category,
      isVeg,
      allergens,
      spiceLevel,
      flavourTags,
      cuisine,
      course,
      portionSize,
      prepMinutes,
    } = validation.data;

    const created = await MenuItem.create({
      restaurantId: req.user.restaurantId,
      name,
      description,
      price,
      category,
      isVeg,
      allergens,
      allergensConfirmed: false,
      available: true,
      spiceLevel,
      flavourTags,
      cuisine,
      course,
      portionSize,
      prepMinutes,
    });

    res.status(201).json({ item: ownerMenuItem(created) });
  } catch (err) {
    if (err && (err.name === 'ValidationError' || err instanceof mongoose.Error.ValidationError)) {
      return res.status(400).json({ message: 'Invalid menu item' });
    }
    next(err);
  }
};

/**
 * Owner route: Validated partial update for a menu item.
 * Only validated editable fields are set. Modifying allergens resets allergensConfirmed to false.
 */
export const updateMenuItem = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    if (!mongoose.isObjectIdOrHexString(itemId)) {
      return res.status(404).json({ message: 'Not found' });
    }

    const stored = await MenuItem.findOne({
      _id: itemId,
      restaurantId: req.user.restaurantId,
    }).lean();

    if (!stored) {
      return res.status(404).json({ message: 'Not found' });
    }

    const validation = validateMenuFields(req.body, { partial: true });
    if (!validation.valid) {
      return res.status(validation.status).json({ message: validation.message });
    }

    const $set = {};

    // Build $set with editable fields only
    for (const field of EDITABLE_FIELDS) {
      if (field !== 'allergens' && field in validation.data) {
        $set[field] = validation.data[field];
      }
    }

    // Handle allergens comparison
    if ('allergens' in validation.data) {
      const storedNorm = normaliseAllergies(stored.allergens);
      const newNorm = validation.data.allergens;
      const isUnchanged =
        storedNorm.length === newNorm.length &&
        storedNorm.every((val, idx) => val === newNorm[idx]);

      if (!isUnchanged) {
        // Viva note: Changed tags must be re-confirmed, and a stale edit must never
        // overwrite tags that were changed and confirmed in the meantime.
        $set.allergens = newNorm;
        $set.allergensConfirmed = false;
      }
    }

    if (Object.keys($set).length === 0) {
      return res.status(200).json({ item: ownerMenuItem(stored) });
    }

    await MenuItem.updateOne(
      { _id: itemId, restaurantId: req.user.restaurantId },
      { $set },
      { runValidators: true }
    );

    const updated = await MenuItem.findOne({
      _id: itemId,
      restaurantId: req.user.restaurantId,
    }).lean();

    res.status(200).json({ item: ownerMenuItem(updated) });
  } catch (err) {
    if (err && (err.name === 'ValidationError' || err instanceof mongoose.Error.ValidationError)) {
      return res.status(400).json({ message: 'Invalid menu item' });
    }
    next(err);
  }
};

/**
 * Owner route: Explicitly confirms reviewed allergens on a dish.
 * Fails with 409 if stored allergens differ or changed concurrently.
 */
export const confirmMenuItemAllergens = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    if (!mongoose.isObjectIdOrHexString(itemId)) {
      return res.status(404).json({ message: 'Not found' });
    }

    if (!req.body || !('allergens' in req.body)) {
      return res.status(400).json({ message: 'Allergens field is required' });
    }

    const { allergens } = req.body;
    if (!Array.isArray(allergens) || allergens.length > 10) {
      return res.status(400).json({ message: 'Invalid allergens' });
    }
    for (let i = 0; i < allergens.length; i++) {
      if (typeof allergens[i] !== 'string') {
        return res.status(400).json({ message: 'Invalid allergens' });
      }
      const norm = normaliseAllergen(allergens[i]);
      if (!KNOWN_ALLERGENS.includes(norm)) {
        return res.status(400).json({ message: 'Unknown allergen tag' });
      }
    }

    const stored = await MenuItem.findOne({
      _id: itemId,
      restaurantId: req.user.restaurantId,
    }).lean();

    if (!stored) {
      return res.status(404).json({ message: 'Not found' });
    }

    if (!Array.isArray(stored.allergens)) {
      return res.status(409).json({ message: 'Allergens changed since you reviewed them' });
    }

    if (!areAllergiesEqual(stored.allergens, allergens)) {
      return res.status(409).json({ message: 'Allergens changed since you reviewed them' });
    }

    // Viva note: Confirmation must apply to exactly the tags the owner reviewed,
    // even if another edit lands at the same moment.
    const result = await MenuItem.updateOne(
      {
        _id: stored._id,
        restaurantId: req.user.restaurantId,
        allergens: stored.allergens,
      },
      { $set: { allergensConfirmed: true } }
    );

    if (result.matchedCount === 0) {
      return res.status(409).json({ message: 'Allergens changed since you reviewed them' });
    }

    const updated = await MenuItem.findOne({
      _id: stored._id,
      restaurantId: req.user.restaurantId,
    }).lean();

    res.status(200).json({ item: ownerMenuItem(updated) });
  } catch (err) {
    if (err && (err.name === 'ValidationError' || err instanceof mongoose.Error.ValidationError)) {
      return res.status(400).json({ message: 'Invalid menu item' });
    }
    next(err);
  }
};

/**
 * Staff route (owner or kitchen): Toggles dish availability in real time.
 */
export const updateMenuItemAvailability = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    if (!mongoose.isObjectIdOrHexString(itemId)) {
      return res.status(404).json({ message: 'Not found' });
    }

    if (!req.body || typeof req.body.available !== 'boolean') {
      return res.status(400).json({ message: 'Invalid availability' });
    }

    const stored = await MenuItem.findOne({
      _id: itemId,
      restaurantId: req.user.restaurantId,
    }).lean();

    if (!stored) {
      return res.status(404).json({ message: 'Not found' });
    }

    await MenuItem.updateOne(
      { _id: itemId, restaurantId: req.user.restaurantId },
      { $set: { available: req.body.available } }
    );

    const updated = await MenuItem.findOne({
      _id: itemId,
      restaurantId: req.user.restaurantId,
    }).lean();

    res.status(200).json({ item: ownerMenuItem(updated) });
  } catch (err) {
    if (err && (err.name === 'ValidationError' || err instanceof mongoose.Error.ValidationError)) {
      return res.status(400).json({ message: 'Invalid menu item' });
    }
    next(err);
  }
};
