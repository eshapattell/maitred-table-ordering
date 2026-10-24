import React, { useState } from 'react';
import ErrorMessage from '../Common/ErrorMessage.jsx';
import Button from '../Common/Button.jsx';
import { MESSAGES } from '../../utils/messages.js';
import { formatPrice } from '../../utils/formatters.js';
import { groupLinesByAdder, lineActions, lineWarning } from '../../utils/guestCart.js';
import { canPlaceOrder } from '../../utils/guestOrder.js';
import { isHost } from '../../utils/guestSession.js';
import { OrderedSoFar } from './OrderedSoFar.jsx';

export const CartSheet = ({
  cart,
  viewerId,
  viewer,
  history,
  busy = false,
  error = null,
  placing = false,
  orderMessage = null,
  orderError = null,
  placedRows = [],
  cancelKey = null,
  onAdd,
  onDecrease,
  onRemove,
  onPlaceOrder,
  onCancelPlaced,
}) => {
  const [confirmingRowKey, setConfirmingRowKey] = useState(null);

  const effectiveViewer = viewer || (viewerId ? { id: viewerId } : null);
  const effectiveViewerId = effectiveViewer?.id || viewerId;
  const hasLines = Array.isArray(cart?.lines) && cart.lines.length > 0;
  const viewerIsHost = isHost(effectiveViewer);

  return (
    <div className="cart-sheet">
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {orderError && <ErrorMessage>{orderError}</ErrorMessage>}
      {orderMessage && (
        <p className="cart-sheet__order-message" role="status">
          {orderMessage}
        </p>
      )}

      {!hasLines ? (
        <p className="cart-sheet__empty">{MESSAGES.guest.cartEmpty}</p>
      ) : (
        <>
          <div className="cart-sheet__groups">
            {groupLinesByAdder(cart).map((group) => {
              const isViewer = group.adder?.id === effectiveViewerId;
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
                      const actions = lineActions(line, effectiveViewerId);

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

            {canPlaceOrder({ cart, viewer: effectiveViewer }) ? (
              <Button
                variant="primary"
                className="cart-sheet__place-btn"
                disabled={placing || busy}
                onClick={onPlaceOrder}
              >
                {placing ? MESSAGES.guest.placingOrder : MESSAGES.guest.placeOrder}
              </Button>
            ) : !viewerIsHost ? (
              <p className="cart-sheet__host-note">{MESSAGES.guest.hostNote}</p>
            ) : null}
          </div>
        </>
      )}

      {history && <OrderedSoFar history={history} />}

      {viewerIsHost && Array.isArray(placedRows) && placedRows.length > 0 && (
        <section className="cart-sheet__placed-section">
          <h2 className="cart-sheet__placed-heading">{MESSAGES.guest.placedHeading}</h2>
          <p className="cart-sheet__placed-hint">{MESSAGES.guest.placedHint}</p>
          <div className="cart-sheet__placed-list">
            {placedRows.map((row) => {
              const rowKey = `${row.orderId}:${row.orderItemId}`;
              const isConfirming = confirmingRowKey === rowKey;
              const isCancelling = cancelKey === rowKey;

              return (
                <div key={rowKey} className="cart-placed-row">
                  {isConfirming ? (
                    <div className="cart-placed-row__confirm">
                      <span className="cart-placed-row__ask">
                        {MESSAGES.guest.cancelAsk(row.name)}
                      </span>
                      <div className="cart-placed-row__confirm-actions">
                        <Button
                          variant="ghost"
                          className="cart-placed-row__yes-btn"
                          disabled={isCancelling}
                          onClick={() => {
                            setConfirmingRowKey(null);
                            onCancelPlaced?.(row);
                          }}
                        >
                          {MESSAGES.guest.cancelYes}
                        </Button>
                        <Button
                          variant="secondary"
                          className="cart-placed-row__no-btn"
                          disabled={isCancelling}
                          autoFocus
                          onClick={() => setConfirmingRowKey(null)}
                        >
                          {MESSAGES.guest.cancelNo}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="cart-placed-row__content">
                      <div className="cart-placed-row__info">
                        <span className="cart-placed-row__line">
                          {MESSAGES.guest.placedLine(row.qty, row.name)}
                        </span>
                        {row.orderedBy && (
                          <span className="cart-placed-row__ordered-by">
                            {MESSAGES.guest.placedBy(row.orderedBy)}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        className="cart-placed-row__cancel-btn"
                        disabled={isCancelling}
                        aria-label={MESSAGES.guest.cancelPlacedAria(row.name)}
                        onClick={() => setConfirmingRowKey(rowKey)}
                      >
                        {MESSAGES.guest.cancelPlaced}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

export default CartSheet;
