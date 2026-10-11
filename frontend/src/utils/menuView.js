// menuView.js: pure helpers for listing the owner's menu (FINAL drop-in, Task 8b).
export const MENU_FILTERS = Object.freeze(['all', 'review', 'hidden']);

// A dish needs review unless the server says allergensConfirmed is exactly true.
// Anything else (false, missing, null, "true") counts as NOT confirmed: fail closed.
export const needsReview = (item) => item?.allergensConfirmed !== true;

// Hidden only when the server says available is exactly false.
export const isHidden = (item) => item?.available === false;

export const filterItems = (items, filter) => {
  if (!Array.isArray(items)) return [];
  if (filter === 'review') return items.filter(needsReview);
  if (filter === 'hidden') return items.filter(isHidden);
  return items; // "all" and any unknown filter show everything
};

export const menuSummary = (items) => {
  const list = Array.isArray(items) ? items : [];
  return { total: list.length, review: list.filter(needsReview).length, hidden: list.filter(isHidden).length };
};

// Groups by menu section, keeping the order the server sent (it sorts by category then name).
export const groupByCategory = (items) => {
  const groups = [];
  const byName = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const key = typeof item?.category === 'string' && item.category.trim() ? item.category.trim() : 'Other';
    if (!byName.has(key)) {
      const group = { category: key, items: [] };
      byName.set(key, group);
      groups.push(group);
    }
    byName.get(key).items.push(item);
  }
  return groups;
};

// Existing sections for the form's suggestions: unique, sorted.
export const categoryOptions = (items) => {
  const names = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    if (typeof item?.category === 'string' && item.category.trim()) names.add(item.category.trim());
  }
  return [...names].sort((a, b) => a.localeCompare(b));
};
