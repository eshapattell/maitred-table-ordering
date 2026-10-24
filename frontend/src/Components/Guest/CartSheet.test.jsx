import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CartSheet from './CartSheet.jsx';
import { MESSAGES } from '../../utils/messages.js';
import { formatPrice } from '../../utils/formatters.js';
import { buildCartView } from '../../../../backend/utils/cartView.js';
import { orderHistoryView } from '../../../../backend/utils/orderHistory.js';
import { freezeOrderItem } from '../../../../backend/utils/orderRules.js';

const makeDish = (id, name, price, over = {}) => ({
  id,
  _id: id,
  name,
  description: `${name} description`,
  price,
  category: 'mains',
  isVeg: true,
  allergens: [],
  allergensConfirmed: true,
  spiceLevel: 'mild',
  flavourTags: [],
  cuisine: 'Indian',
  course: 'main',
  portionSize: 'Serves 1',
  prepMinutes: 15,
  safe: true,
  clashes: [],
  reason: 'safe',
  available: true,
  ...over,
});

const ID = {
  soup: 'a'.repeat(24),
  peanutSalad: 'b'.repeat(24),
  mousse: 'c'.repeat(24),
  hidden: 'd'.repeat(24),
  draft: 'e'.repeat(24),
};

const MENU = [
  makeDish(ID.soup, 'Tomato Soup', 250),
  makeDish(ID.peanutSalad, 'Peanut Salad', 400, { allergens: ['peanut'] }),
  makeDish(ID.mousse, 'Mousse', 300, { allergens: ['dairy'], allergensConfirmed: false }),
  makeDish(ID.hidden, 'Old Special', 550, { available: false }),
];

const makePerson = (id, nickname, role, allergies = []) => ({
  id,
  nickname,
  role,
  status: 'approved',
  allergiesDeclared: true,
  allergies,
});

const HOST = makePerson('h1', 'Hema', 'host', []);
const GUEST = makePerson('g1', 'Ravi', 'guest', ['peanut']);

const makeLine = (n, itemId, qty, addedBy, over = {}) => ({
  cartItemId: `00000000-0000-4000-8000-00000000000${n}`,
  itemId,
  qty,
  addedBy,
  isSurprise: false,
  ...over,
});

const CART_ITEMS = [
  makeLine(1, ID.soup, 2, 'h1'),
  makeLine(2, ID.peanutSalad, 1, 'h1'),
  makeLine(3, ID.soup, 1, 'g1'),
  makeLine(4, ID.mousse, 1, 'g1'),
  makeLine(5, ID.hidden, 1, 'h1'),
  makeLine(6, ID.draft, 1, 'h1', { isSurprise: true }),
];

const SESSION = {
  cartVersion: 7,
  participants: [HOST, GUEST],
  cart: CART_ITEMS,
};

const viewFor = (viewer, session = SESSION, items = MENU) =>
  buildCartView({ session, items, viewer });

describe('CartSheet', () => {
  it('1. renders empty state when cart is null or has no lines', () => {
    const { rerender } = render(<CartSheet cart={null} viewerId="h1" />);
    expect(screen.getByText(MESSAGES.guest.cartEmpty)).toBeInTheDocument();

    rerender(<CartSheet cart={{ lines: [] }} viewerId="h1" />);
    expect(screen.getByText(MESSAGES.guest.cartEmpty)).toBeInTheDocument();
  });

  it('2. groups lines by adder and displays group headings', () => {
    const cart = viewFor(HOST);
    render(<CartSheet cart={cart} viewerId="h1" />);

    expect(screen.getByRole('heading', { level: 2, name: MESSAGES.guest.cartAddedByYou })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: MESSAGES.guest.cartAddedBy('Ravi') })).toBeInTheDocument();
  });

  it('3. viewer own line gets +, - (only above 1), and Remove', () => {
    const cart = viewFor(HOST);
    render(<CartSheet cart={cart} viewerId="h1" />);

    // Line 1 is Tomato Soup qty 2 added by h1
    expect(screen.getByRole('button', { name: MESSAGES.guest.cartTakeOffAria('Tomato Soup') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: MESSAGES.guest.cartAddOneAria('Tomato Soup') })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: MESSAGES.guest.cartRemoveAria('Tomato Soup') })[0]).toBeInTheDocument();

    // Line 2 is Peanut Salad qty 1 added by h1: minus should not be present (quantity is 1)
    expect(screen.queryByRole('button', { name: MESSAGES.guest.cartTakeOffAria('Peanut Salad') })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: MESSAGES.guest.cartAddOneAria('Peanut Salad') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: MESSAGES.guest.cartRemoveAria('Peanut Salad') })).toBeInTheDocument();
  });

  it('4. another guest line gets no buttons for an ordinary guest', () => {
    const cart = viewFor(GUEST);
    render(<CartSheet cart={cart} viewerId="g1" />);

    // Line 1 (Tomato Soup) and Line 2 (Peanut Salad) added by Hema (h1)
    // For Ravi (g1), Peanut Salad should have no +, -, or Remove
    expect(screen.queryByRole('button', { name: MESSAGES.guest.cartAddOneAria('Peanut Salad') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MESSAGES.guest.cartTakeOffAria('Peanut Salad') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MESSAGES.guest.cartRemoveAria('Peanut Salad') })).not.toBeInTheDocument();
  });

  it('5. another guest line gets Remove only for the host', () => {
    const cart = viewFor(HOST);
    render(<CartSheet cart={cart} viewerId="h1" />);

    // Line 4 is Mousse added by Ravi (g1)
    expect(screen.queryByRole('button', { name: MESSAGES.guest.cartAddOneAria('Mousse') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MESSAGES.guest.cartTakeOffAria('Mousse') })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: MESSAGES.guest.cartRemoveAria('Mousse') })).toBeInTheDocument();
  });

  it('6. an unsafe line shows the warning note', () => {
    const cart = viewFor(GUEST); // Ravi is allergic to peanut
    render(<CartSheet cart={cart} viewerId="g1" />);

    const note = screen.getByText('Contains peanut');
    expect(note).toBeInTheDocument();
    expect(note).toHaveAttribute('role', 'note');
  });

  it('7. an unavailable line shows "No longer available" and has no total', () => {
    const cart = viewFor(HOST);
    render(<CartSheet cart={cart} viewerId="h1" />);

    // Line 5 is Old Special (available: false)
    expect(screen.getByText('Old Special')).toBeInTheDocument();
    const note = screen.getByText('No longer available');
    expect(note).toBeInTheDocument();
    expect(note).toHaveAttribute('role', 'note');

    // It has no lineTotal (550 should not appear)
    expect(screen.queryByText('₹550')).not.toBeInTheDocument();
  });

  it('8. a surprise line shows "Surprise dish" and no buttons', () => {
    const cart = viewFor(HOST);
    render(<CartSheet cart={cart} viewerId="h1" />);

    expect(screen.getByText('Surprise dish')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MESSAGES.guest.cartAddOneAria('Surprise dish') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MESSAGES.guest.cartTakeOffAria('Surprise dish') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MESSAGES.guest.cartRemoveAria('Surprise dish') })).not.toBeInTheDocument();
  });

  it('9. the total comes from the cart', () => {
    const cart = viewFor(HOST);
    render(<CartSheet cart={cart} viewerId="h1" />);

    expect(screen.getByText(MESSAGES.guest.cartTotal)).toBeInTheDocument();
    expect(screen.getByText(formatPrice(cart.total))).toBeInTheDocument();
  });

  it('10. the notes appear: cartHiddenNote when hasHiddenLines, cartSharedNote, and cartPlaceholder', () => {
    const cart = viewFor(HOST);
    render(<CartSheet cart={cart} viewerId="h1" viewer={HOST} />);

    expect(screen.getByText(MESSAGES.guest.cartHiddenNote)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.guest.cartSharedNote)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: MESSAGES.guest.placeOrder })).toBeInTheDocument();
  });

  it('11. the buttons are disabled while busy is true', () => {
    const cart = viewFor(HOST);
    render(<CartSheet cart={cart} viewerId="h1" busy={true} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }
  });

  it('12. each button calls its handler with that line', () => {
    const cart = viewFor(HOST);
    const onAdd = vi.fn();
    const onDecrease = vi.fn();
    const onRemove = vi.fn();

    render(
      <CartSheet
        cart={cart}
        viewerId="h1"
        onAdd={onAdd}
        onDecrease={onDecrease}
        onRemove={onRemove}
      />
    );

    // Line 1 is Tomato Soup (h1, qty 2)
    const line1 = cart.lines.find((l) => l.name === 'Tomato Soup' && l.quantity === 2);

    const minusBtn = screen.getByRole('button', { name: MESSAGES.guest.cartTakeOffAria('Tomato Soup') });
    fireEvent.click(minusBtn);
    expect(onDecrease).toHaveBeenCalledTimes(1);
    expect(onDecrease).toHaveBeenCalledWith(line1);

    const plusBtn = screen.getByRole('button', { name: MESSAGES.guest.cartAddOneAria('Tomato Soup') });
    fireEvent.click(plusBtn);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(line1);

    const removeBtn = screen.getAllByRole('button', { name: MESSAGES.guest.cartRemoveAria('Tomato Soup') })[0];
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(line1);
  });

  it('13. shows error in an ErrorMessage when present', () => {
    render(<CartSheet cart={null} viewerId="h1" error="Failed to update cart" />);

    expect(screen.getByText('Failed to update cart')).toBeInTheDocument();
  });

  it('14. the host sees Place order and a guest sees the host note and no button', () => {
    const cart = viewFor(HOST);
    const { rerender } = render(<CartSheet cart={cart} viewer={HOST} />);

    expect(screen.getByRole('button', { name: MESSAGES.guest.placeOrder })).toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.guest.hostNote)).not.toBeInTheDocument();

    rerender(<CartSheet cart={cart} viewer={GUEST} />);
    expect(screen.getByText(MESSAGES.guest.hostNote)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MESSAGES.guest.placeOrder })).not.toBeInTheDocument();
  });

  it('15. an empty cart gives no button', () => {
    render(<CartSheet cart={{ lines: [], version: 1 }} viewer={HOST} />);
    expect(screen.queryByRole('button', { name: MESSAGES.guest.placeOrder })).not.toBeInTheDocument();
  });

  it('16. a click calls onPlaceOrder once', () => {
    const cart = viewFor(HOST);
    const onPlaceOrder = vi.fn();
    render(<CartSheet cart={cart} viewer={HOST} onPlaceOrder={onPlaceOrder} />);

    const btn = screen.getByRole('button', { name: MESSAGES.guest.placeOrder });
    fireEvent.click(btn);
    expect(onPlaceOrder).toHaveBeenCalledTimes(1);
  });

  it('17. disabled while placing', () => {
    const cart = viewFor(HOST);
    const onPlaceOrder = vi.fn();
    render(<CartSheet cart={cart} viewer={HOST} placing={true} onPlaceOrder={onPlaceOrder} />);

    const btn = screen.getByRole('button', { name: MESSAGES.guest.placingOrder });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onPlaceOrder).not.toHaveBeenCalled();
  });

  it('18. disabled while busy', () => {
    const cart = viewFor(HOST);
    const onPlaceOrder = vi.fn();
    render(<CartSheet cart={cart} viewer={HOST} busy={true} onPlaceOrder={onPlaceOrder} />);

    const btn = screen.getByRole('button', { name: MESSAGES.guest.placeOrder });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onPlaceOrder).not.toHaveBeenCalled();
  });

  it('19. the message and the error appear', () => {
    const cart = viewFor(HOST);
    render(
      <CartSheet
        cart={cart}
        viewer={HOST}
        orderMessage="Order placed: 2 dishes sent to the kitchen."
        orderError="Nothing in the cart can be ordered right now"
      />
    );

    const msg = screen.getByRole('status');
    expect(msg).toHaveTextContent('Order placed: 2 dishes sent to the kitchen.');
    expect(screen.getByText('Nothing in the cart can be ordered right now')).toBeInTheDocument();
  });

  it('20. the placed list appears only for the host and only when there are rows', () => {
    const sampleRows = [
      { orderId: 'd'.repeat(24), orderItemId: '00000000-0000-4000-8000-000000000001', name: 'Tomato Soup', qty: 2, orderedBy: 'Hema' },
    ];

    // Guest sees no placed list even if rows provided
    const { rerender } = render(<CartSheet cart={null} viewer={GUEST} placedRows={sampleRows} />);
    expect(screen.queryByText(MESSAGES.guest.placedHeading)).not.toBeInTheDocument();

    // Host with empty rows sees no placed list
    rerender(<CartSheet cart={null} viewer={HOST} placedRows={[]} />);
    expect(screen.queryByText(MESSAGES.guest.placedHeading)).not.toBeInTheDocument();

    // Host with rows sees placed list
    rerender(<CartSheet cart={null} viewer={HOST} placedRows={sampleRows} />);
    expect(screen.getByText(MESSAGES.guest.placedHeading)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.guest.placedHint)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.guest.placedLine(2, 'Tomato Soup'))).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.guest.placedBy('Hema'))).toBeInTheDocument();
  });

  it('21. the inline cancel flow (ask, keep, confirm)', () => {
    const sampleRows = [
      { orderId: 'd'.repeat(24), orderItemId: '00000000-0000-4000-8000-000000000001', name: 'Tomato Soup', qty: 2, orderedBy: 'Hema' },
    ];
    const onCancelPlaced = vi.fn();

    render(<CartSheet cart={null} viewer={HOST} placedRows={sampleRows} onCancelPlaced={onCancelPlaced} />);

    // Initially shows cancel button
    const cancelBtn = screen.getByRole('button', { name: MESSAGES.guest.cancelPlacedAria('Tomato Soup') });
    expect(cancelBtn).toBeInTheDocument();

    // Click Cancel -> turns into inline confirmation with cancelAsk and two buttons
    fireEvent.click(cancelBtn);
    expect(screen.getByText(MESSAGES.guest.cancelAsk('Tomato Soup'))).toBeInTheDocument();

    const noBtn = screen.getByRole('button', { name: MESSAGES.guest.cancelNo });
    const yesBtn = screen.getByRole('button', { name: MESSAGES.guest.cancelYes });
    expect(noBtn).toBeInTheDocument();
    expect(yesBtn).toBeInTheDocument();

    // cancelNo puts the row back
    fireEvent.click(noBtn);
    expect(screen.queryByText(MESSAGES.guest.cancelAsk('Tomato Soup'))).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: MESSAGES.guest.cancelPlacedAria('Tomato Soup') })).toBeInTheDocument();
    expect(onCancelPlaced).not.toHaveBeenCalled();

    // Click cancel again, then cancelYes calls onCancelPlaced
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.guest.cancelPlacedAria('Tomato Soup') }));
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.guest.cancelYes }));
    expect(onCancelPlaced).toHaveBeenCalledTimes(1);
    expect(onCancelPlaced).toHaveBeenCalledWith(sampleRows[0]);
  });

  it('22. a row\'s buttons are disabled while it is being cancelled', () => {
    const rowKey = `${'d'.repeat(24)}:00000000-0000-4000-8000-000000000001`;
    const sampleRows = [
      { orderId: 'd'.repeat(24), orderItemId: '00000000-0000-4000-8000-000000000001', name: 'Tomato Soup', qty: 2, orderedBy: 'Hema' },
    ];

    const { rerender } = render(
      <CartSheet cart={null} viewer={HOST} placedRows={sampleRows} cancelKey={rowKey} />
    );

    const cancelBtn = screen.getByRole('button', { name: MESSAGES.guest.cancelPlacedAria('Tomato Soup') });
    expect(cancelBtn).toBeDisabled();

    // If already in confirming state, confirmation buttons are disabled
    rerender(
      <CartSheet cart={null} viewer={HOST} placedRows={sampleRows} cancelKey={null} />
    );
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.guest.cancelPlacedAria('Tomato Soup') }));

    rerender(
      <CartSheet cart={null} viewer={HOST} placedRows={sampleRows} cancelKey={rowKey} />
    );
    expect(screen.getByRole('button', { name: MESSAGES.guest.cancelYes })).toBeDisabled();
    expect(screen.getByRole('button', { name: MESSAGES.guest.cancelNo })).toBeDisabled();
  });

  it('23. the old placeholder sentence never appears', () => {
    const cart = viewFor(HOST);
    const { rerender } = render(<CartSheet cart={cart} viewer={HOST} />);
    expect(screen.queryByText(MESSAGES.guest.cartPlaceholder)).not.toBeInTheDocument();

    rerender(<CartSheet cart={cart} viewer={GUEST} />);
    expect(screen.queryByText(MESSAGES.guest.cartPlaceholder)).not.toBeInTheDocument();

    rerender(<CartSheet cart={null} viewer={HOST} />);
    expect(screen.queryByText(MESSAGES.guest.cartPlaceholder)).not.toBeInTheDocument();
  });

  it('24. the Ordered so far section appears when history prop is provided for the host', () => {
    const history = orderHistoryView([
      {
        _id: '1'.repeat(24),
        createdAt: '2026-10-14T13:42:00.000Z',
        items: [
          freezeOrderItem({
            line: { qty: 2 },
            dish: { _id: 'a'.repeat(24), name: 'Paneer Tikka', price: 250, allergens: [] },
            adder: { nickname: 'Hema' },
            orderItemId: '00000000-0000-4000-8000-000000000001',
          }),
        ],
      },
    ]);
    render(<CartSheet cart={null} viewer={HOST} history={history} />);
    expect(screen.getByRole('heading', { level: 3, name: MESSAGES.guest.orderedHeading })).toBeInTheDocument();
    expect(screen.getByText('2 x Paneer Tikka')).toBeInTheDocument();
  });

  it('25. the Ordered so far section appears when history prop is provided for an ordinary guest', () => {
    const history = orderHistoryView([
      {
        _id: '1'.repeat(24),
        createdAt: '2026-10-14T13:42:00.000Z',
        items: [
          freezeOrderItem({
            line: { qty: 1 },
            dish: { _id: 'a'.repeat(24), name: 'Dal Makhani', price: 200, allergens: [] },
            adder: { nickname: 'Bala' },
            orderItemId: '00000000-0000-4000-8000-000000000002',
          }),
        ],
      },
    ]);
    render(<CartSheet cart={null} viewer={GUEST} history={history} />);
    expect(screen.getByRole('heading', { level: 3, name: MESSAGES.guest.orderedHeading })).toBeInTheDocument();
    expect(screen.getByText('1 x Dal Makhani')).toBeInTheDocument();
  });

  it('26. the Ordered so far section appears when the cart is empty', () => {
    const history = orderHistoryView([
      {
        _id: '1'.repeat(24),
        createdAt: '2026-10-14T13:42:00.000Z',
        items: [
          freezeOrderItem({
            line: { qty: 2 },
            dish: { _id: 'a'.repeat(24), name: 'Paneer Tikka', price: 250, allergens: [] },
            adder: { nickname: 'Hema' },
            orderItemId: '00000000-0000-4000-8000-000000000001',
          }),
        ],
      },
    ]);
    render(<CartSheet cart={{ lines: [], version: 1 }} viewer={HOST} history={history} />);
    expect(screen.getByText(MESSAGES.guest.cartEmpty)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: MESSAGES.guest.orderedHeading })).toBeInTheDocument();
    expect(screen.getByText('2 x Paneer Tikka')).toBeInTheDocument();
  });

  it('27. the Ordered so far section appears together with the host\'s Sent to the kitchen list', () => {
    const history = orderHistoryView([
      {
        _id: '1'.repeat(24),
        createdAt: '2026-10-14T13:42:00.000Z',
        items: [
          freezeOrderItem({
            line: { qty: 2 },
            dish: { _id: 'a'.repeat(24), name: 'Paneer Tikka', price: 250, allergens: [] },
            adder: { nickname: 'Hema' },
            orderItemId: '00000000-0000-4000-8000-000000000001',
          }),
        ],
      },
    ]);
    const sampleRows = [
      { orderId: 'd'.repeat(24), orderItemId: '00000000-0000-4000-8000-000000000002', name: 'Tomato Soup', qty: 1, orderedBy: 'Hema' },
    ];
    render(<CartSheet cart={null} viewer={HOST} history={history} placedRows={sampleRows} />);
    expect(screen.getByRole('heading', { level: 3, name: MESSAGES.guest.orderedHeading })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: MESSAGES.guest.placedHeading })).toBeInTheDocument();
  });

  it('28. the Ordered so far section is absent when no history prop is given', () => {
    render(<CartSheet cart={null} viewer={HOST} />);
    expect(screen.queryByRole('heading', { level: 3, name: MESSAGES.guest.orderedHeading })).not.toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.guest.orderedNothing)).not.toBeInTheDocument();
  });

  it('29. Ordered so far section is placed right above Sent to the kitchen list in DOM', () => {
    const history = orderHistoryView([
      {
        _id: '1'.repeat(24),
        createdAt: '2026-10-14T13:42:00.000Z',
        items: [
          freezeOrderItem({
            line: { qty: 1 },
            dish: { _id: 'a'.repeat(24), name: 'Naan', price: 50, allergens: [] },
            adder: { nickname: 'Hema' },
            orderItemId: '00000000-0000-4000-8000-000000000003',
          }),
        ],
      },
    ]);
    const sampleRows = [
      { orderId: 'd'.repeat(24), orderItemId: '00000000-0000-4000-8000-000000000004', name: 'Soup', qty: 1, orderedBy: 'Hema' },
    ];
    const { container } = render(<CartSheet cart={null} viewer={HOST} history={history} placedRows={sampleRows} />);
    const orderedSection = container.querySelector('.ordered-so-far');
    const placedSection = container.querySelector('.cart-sheet__placed-section');
    expect(orderedSection).toBeInTheDocument();
    expect(placedSection).toBeInTheDocument();
    expect(orderedSection.compareDocumentPosition(placedSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

