// menuOptions.js: allowed values, limits and display labels for dishes (FINAL drop-in, Task 8b).
// The three lists must match backend/controllers/menuController.js exactly; menuOptions.test.js
// reads that file and fails if they ever differ.
export const COURSES = Object.freeze(['starter', 'main', 'side', 'dessert', 'beverage']);
export const PORTION_SIZES = Object.freeze(['light', 'regular', 'large']);
export const FLAVOUR_TAGS = Object.freeze(['sweet', 'tangy', 'creamy', 'crispy', 'light']);
export const SPICE_LEVELS = Object.freeze([1, 2, 3, 4, 5]);

// Limits used by the form. The server enforces the same ones and stays the authority.
export const LIMITS = Object.freeze({
  nameMax: 80,
  descriptionMax: 300,
  categoryMax: 40,
  cuisineMax: 40,
  priceMax: 100000,
  prepMax: 120,
  tableMax: 500,
});

export const OPTION_LABELS = Object.freeze({
  course: Object.freeze({ starter: 'Starter', main: 'Main', side: 'Side', dessert: 'Dessert', beverage: 'Beverage' }),
  portionSize: Object.freeze({ light: 'Light', regular: 'Regular', large: 'Large' }),
  flavour: Object.freeze({ sweet: 'Sweet', tangy: 'Tangy', creamy: 'Creamy', crispy: 'Crispy', light: 'Light' }),
  spice: Object.freeze({ 1: 'Very mild', 2: 'Mild', 3: 'Medium', 4: 'Hot', 5: 'Very hot' }),
});
