import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CartBar from './CartBar.jsx';
import { MESSAGES } from '../../utils/messages.js';

describe('CartBar', () => {
  it('renders the empty text when itemCount is 0', () => {
    render(<CartBar summary={{ itemCount: 0, total: 0 }} onOpen={vi.fn()} />);

    expect(screen.getByRole('button')).toHaveTextContent(MESSAGES.guest.cartBar(0, '₹0'));
    expect(screen.getByRole('button')).toHaveTextContent('Table order is empty');
  });

  it('renders singular count with the formatted total', () => {
    render(<CartBar summary={{ itemCount: 1, total: 250 }} onOpen={vi.fn()} />);

    expect(screen.getByRole('button')).toHaveTextContent(MESSAGES.guest.cartBar(1, '₹250'));
    expect(screen.getByRole('button')).toHaveTextContent('View table order: 1 item, ₹250');
  });

  it('renders plural count with the formatted total', () => {
    render(<CartBar summary={{ itemCount: 4, total: 1000 }} onOpen={vi.fn()} />);

    expect(screen.getByRole('button')).toHaveTextContent(MESSAGES.guest.cartBar(4, '₹1,000'));
    expect(screen.getByRole('button')).toHaveTextContent('View table order: 4 items, ₹1,000');
  });

  it('calls onOpen when clicked', () => {
    const onOpen = vi.fn();
    render(<CartBar summary={{ itemCount: 2, total: 500 }} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('has the fixed-bar class guest-cart-bar', () => {
    render(<CartBar summary={{ itemCount: 1, total: 100 }} onOpen={vi.fn()} />);

    expect(screen.getByRole('button')).toHaveClass('guest-cart-bar');
  });

  it('renders cartBarOrdered text when cart is empty and orderedItems is positive', () => {
    const { rerender } = render(
      <CartBar summary={{ itemCount: 0, total: 0 }} orderedItems={3} onOpen={vi.fn()} />
    );
    expect(screen.getByRole('button')).toHaveTextContent(
      'View table order: nothing new in the cart, 3 items ordered so far'
    );

    rerender(
      <CartBar summary={{ itemCount: 0, total: 0 }} orderedItems={1} onOpen={vi.fn()} />
    );
    expect(screen.getByRole('button')).toHaveTextContent(
      'View table order: nothing new in the cart, 1 item ordered so far'
    );
  });

  it('renders old empty text when cart is empty and orderedItems is zero, negative, or undefined', () => {
    const { rerender } = render(
      <CartBar summary={{ itemCount: 0, total: 0 }} orderedItems={0} onOpen={vi.fn()} />
    );
    expect(screen.getByRole('button')).toHaveTextContent('Table order is empty');

    rerender(
      <CartBar summary={{ itemCount: 0, total: 0 }} orderedItems={-1} onOpen={vi.fn()} />
    );
    expect(screen.getByRole('button')).toHaveTextContent('Table order is empty');

    rerender(
      <CartBar summary={{ itemCount: 0, total: 0 }} onOpen={vi.fn()} />
    );
    expect(screen.getByRole('button')).toHaveTextContent('Table order is empty');
  });

  it('renders old text when cart has lines, unaffected by orderedItems', () => {
    render(
      <CartBar summary={{ itemCount: 2, total: 500 }} orderedItems={5} onOpen={vi.fn()} />
    );
    expect(screen.getByRole('button')).toHaveTextContent('View table order: 2 items, ₹500');
    expect(screen.getByRole('button')).not.toHaveTextContent('nothing new in the cart');
  });
});

