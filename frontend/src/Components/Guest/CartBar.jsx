import React from 'react';
import { MESSAGES } from '../../utils/messages.js';
import { formatPrice } from '../../utils/formatters.js';

export const CartBar = ({ summary, onOpen }) => {
  const itemCount = summary?.itemCount ?? 0;
  const total = summary?.total ?? 0;
  const text = MESSAGES.guest.cartBar(itemCount, formatPrice(total));

  return (
    <button
      type="button"
      className="guest-cart-bar"
      onClick={onOpen}
    >
      {text}
    </button>
  );
};

export default CartBar;
