import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CartSheet from './CartSheet.jsx';
import { MESSAGES } from '../../utils/messages.js';
import { formatPrice } from '../../utils/formatters.js';
import { buildCartView } from '../../../../backend/utils/cartView.js';

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
    render(<CartSheet cart={cart} viewerId="h1" />);

    expect(screen.getByText(MESSAGES.guest.cartHiddenNote)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.guest.cartSharedNote)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.guest.cartPlaceholder)).toBeInTheDocument();
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
});
