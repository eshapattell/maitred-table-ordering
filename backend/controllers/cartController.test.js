// cartController.test.js: Basic smoke unit tests for cartController exports
import { getCart, addItem, decreaseItem, removeItem } from './cartController.js';

describe('cartController exports', () => {
  test('exports required controller handler functions', () => {
    expect(typeof getCart).toBe('function');
    expect(typeof addItem).toBe('function');
    expect(typeof decreaseItem).toBe('function');
    expect(typeof removeItem).toBe('function');
  });
});
