import React from 'react';
import ErrorMessage from '../Common/ErrorMessage.jsx';
import Button from '../Common/Button.jsx';
import { MESSAGES } from '../../utils/messages.js';
import { formatPrice } from '../../utils/formatters.js';
import { groupLinesByAdder, lineActions, lineWarning } from '../../utils/guestCart.js';

export const CartSheet = ({
  cart,
  viewerId,
  busy = false,
  error = null,
  onAdd,
  onDecrease,
  onRemove,
}) => {
  const hasLines = Array.isArray(cart?.lines) && cart.lines.length > 0;

  return (
    <div className="cart-sheet">
      {error && <ErrorMessage>{error}</ErrorMessage>}

      {!hasLines ? (
        <p className="cart-sheet__empty">{MESSAGES.guest.cartEmpty}</p>
      ) : (
        <>
          <div className="cart-sheet__groups">
            {groupLinesByAdder(cart).map((group) => {
              const isViewer = group.adder?.id === viewerId;
              const heading = isViewer
                ? MESSAGES.guest.cartAddedByYou
                : MESSAGES.guest.cartAddedBy(group.adder?.nickname);

              return (
                <div key={group.adder?.id || 'unknown'} className="cart-sheet__group">
                  <h2 className="cart-sheet__group-heading">{heading}</h2>
                  <div className="cart-sheet__lines">
                    {group.lines.map((line) => {
                      const warning = lineWarning(line);
                      const isWarn =
                        (line.unavailable === true || line.safeForYou !== true) &&
                        line.isSurprise !== true;
                      const actions = lineActions(line, viewerId);

                      return (
                        <div
                          key={line.id}
                          className={`cart-line ${isWarn ? 'cart-line--warn' : ''}`.trim()}
                        >
                          <div className="cart-line__info">
                            <h3 className="cart-line__name">{line.name}</h3>
                            {line.price !== null && line.price !== undefined && (
                              <span className="cart-line__quantity">
                                {MESSAGES.guest.cartQuantityLine(
                                  line.quantity,
                                  formatPrice(line.price)
                                )}
                              </span>
                            )}
                            {line.lineTotal !== null && line.lineTotal !== undefined && (
                              <span className="cart-line__total">
                                {formatPrice(line.lineTotal)}
                              </span>
                            )}
                            {warning && (
                              <span className="cart-line__chip" role="note">
                                {warning}
                              </span>
                            )}
                          </div>
                          <div className="cart-line__actions">
                            {actions.canDecrease && (
                              <Button
                                variant="ghost"
                                disabled={busy}
                                aria-label={MESSAGES.guest.cartTakeOffAria(line.name)}
                                onClick={() => onDecrease?.(line)}
                              >
                                -
                              </Button>
                            )}
                            {actions.canIncrease && (
                              <Button
                                variant="ghost"
                                disabled={busy}
                                aria-label={MESSAGES.guest.cartAddOneAria(line.name)}
                                onClick={() => onAdd?.(line)}
                              >
                                +
                              </Button>
                            )}
                            {actions.canRemove && (
                              <Button
                                variant="ghost"
                                disabled={busy}
                                aria-label={MESSAGES.guest.cartRemoveAria(line.name)}
                                onClick={() => onRemove?.(line)}
                              >
                                {MESSAGES.guest.cartRemove}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="cart-sheet__footer">
            <div className="cart-sheet__total-row">
              <span className="cart-sheet__total-label">{MESSAGES.guest.cartTotal}</span>
              <span className="cart-sheet__total-value">{formatPrice(cart.total)}</span>
            </div>
            {cart.hasHiddenLines && (
              <p className="cart-sheet__hidden-note">{MESSAGES.guest.cartHiddenNote}</p>
            )}
            <p className="cart-sheet__shared-note">{MESSAGES.guest.cartSharedNote}</p>
            <p className="cart-sheet__placeholder">{MESSAGES.guest.cartPlaceholder}</p>
          </div>
        </>
      )}
    </div>
  );
};

export default CartSheet;
