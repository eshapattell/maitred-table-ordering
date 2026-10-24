// OrderedSoFar.test.jsx: Unit tests for OrderedSoFar component
import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { orderHistoryView } from '../../../../backend/utils/orderHistory.js';
import { freezeOrderItem } from '../../../../backend/utils/orderRules.js';
import { OrderedSoFar } from './OrderedSoFar.jsx';
import { MESSAGES } from '../../utils/messages.js';

const uuid = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const ID = { a: 'a'.repeat(24), b: 'b'.repeat(24), c: 'c'.repeat(24), o1: '1'.repeat(24), o2: '2'.repeat(24) };
const item = (n, dishId, name, qty, orderedBy, over = {}) => ({
  ...freezeOrderItem({ line: { qty }, dish: { _id: dishId, name, price: 250, allergens: [] }, adder: { nickname: orderedBy }, orderItemId: uuid(n) }),
  ...over,
});
const order = (id, createdAt, items) => ({ _id: id, createdAt, items });
const T1 = '2026-10-14T13:42:00.000Z';
const T2 = '2026-10-14T14:05:00.000Z';

const REAL = orderHistoryView([
  order(ID.o1, T1, [
    item(1, ID.a, 'Hibiscus Rose Cooler', 2, 'Hema'),
    item(2, ID.b, 'Kesar Badam Milkshake', 1, 'Bala', { status: 'cancelled' }),
  ]),
  order(ID.o2, T2, [
    item(3, ID.a, 'Hibiscus Rose Cooler', 3, 'Bala'),
    item(4, ID.c, 'Soup', 1, 'Hema'),
    item(5, ID.c, 'Hidden', 2, 'Hema', { isSurprise: true }),
  ]),
]);

describe('OrderedSoFar', () => {
  test('1. empty history shows orderedNothing and nothing else', () => {
    const { container } = render(<OrderedSoFar history={{ orders: [], totals: { dishes: 0, items: 0 } }} />);
    expect(screen.getByRole('heading', { level: 3, name: MESSAGES.guest.orderedHeading })).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.guest.orderedNothing)).toBeInTheDocument();
    expect(container.querySelector('.ordered-so-far__summary')).not.toBeInTheDocument();
    expect(container.querySelector('.ordered-round')).not.toBeInTheDocument();
  });

  test('2. undefined or junk history shows orderedNothing and nothing else', () => {
    render(<OrderedSoFar history={null} />);
    expect(screen.getByText(MESSAGES.guest.orderedNothing)).toBeInTheDocument();
  });

  test('3. rounds numbered from 1 with their times', () => {
    render(<OrderedSoFar history={REAL} />);
    const roundHeadings = screen.getAllByRole('heading', { level: 4 });
    expect(roundHeadings).toHaveLength(2);
    expect(roundHeadings[0].textContent).toMatch(/^Order 1,/);
    expect(roundHeadings[1].textContent).toMatch(/^Order 2,/);
  });

  test('4. round with unreadable or missing placedAt gives Order N without comma', () => {
    const history = orderHistoryView([
      order(ID.o1, '', [item(1, ID.a, 'Tea', 1, 'Ravi')]),
    ]);
    render(<OrderedSoFar history={history} />);
    expect(screen.getByRole('heading', { level: 4, name: 'Order 1' })).toBeInTheDocument();
  });

  test('5. rows show quantity, name and who ordered', () => {
    render(<OrderedSoFar history={REAL} />);
    expect(screen.getByText('2 x Hibiscus Rose Cooler')).toBeInTheDocument();
    expect(screen.getAllByText('Ordered by Hema')).toHaveLength(3);
    expect(screen.getByText('3 x Hibiscus Rose Cooler')).toBeInTheDocument();
    expect(screen.getAllByText('Ordered by Bala')).toHaveLength(2);
    expect(screen.getByText('1 x Soup')).toBeInTheDocument();
  });

  test('6. a cancelled dish is shown, tagged and dimmed', () => {
    const { container } = render(<OrderedSoFar history={REAL} />);
    const cancelledRow = container.querySelector('.ordered-row--cancelled');
    expect(cancelledRow).toBeInTheDocument();
    expect(within(cancelledRow).getByText('1 x Kesar Badam Milkshake')).toBeInTheDocument();
    expect(within(cancelledRow).getByText('Cancelled')).toBeInTheDocument();
  });

  test('7. the summary counts only dishes that were not cancelled', () => {
    render(<OrderedSoFar history={REAL} />);
    // In REAL: 2 Hema cooler + 3 Bala cooler + 1 Hema soup + 2 surprise = 8 items (Kesar milkshake is cancelled)
    expect(screen.getByText('8 items ordered so far')).toBeInTheDocument();
  });

  test('8. singular 1 item ordered so far wording', () => {
    const singleHistory = orderHistoryView([
      order(ID.o1, T1, [item(1, ID.a, 'Samosa', 1, 'Hema')]),
    ]);
    render(<OrderedSoFar history={singleHistory} />);
    expect(screen.getByText('1 item ordered so far')).toBeInTheDocument();
  });

  test('9. a history with only cancelled dishes shows the rounds but no summary line', () => {
    const onlyCancelled = orderHistoryView([
      order(ID.o1, T1, [item(1, ID.a, 'Soup', 2, 'Ravi', { status: 'cancelled' })]),
    ]);
    const { container } = render(<OrderedSoFar history={onlyCancelled} />);
    expect(screen.getByText('Order 1', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('2 x Soup')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(container.querySelector('.ordered-so-far__summary')).not.toBeInTheDocument();
  });

  test('10. a hidden surprise dish shows as "Surprise dish"', () => {
    render(<OrderedSoFar history={REAL} />);
    expect(screen.getByText('2 x Surprise dish')).toBeInTheDocument();
  });

  test('11. no price, cooking status, or allergy text appears anywhere in the rendered markup', () => {
    const { container } = render(<OrderedSoFar history={REAL} />);
    const text = container.textContent;
    expect(text).not.toMatch(/₹|\$|price|250/i);
    expect(text).not.toMatch(/placed|preparing|ready|served/i);
    expect(text).not.toMatch(/allerg/i);
  });
});
