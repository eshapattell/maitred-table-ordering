// OrderTicket.jsx: Displays a single active order ticket on the kitchen board
import React from "react";
import Button from "../Common/Button.jsx";
import { formatClock } from "../../utils/formatters.js";
import {
  waitMinutes,
  splitDishes,
  dishActions,
  hasAllergyWarning,
  allergyLines,
  dishAllergens,
} from "../../utils/kitchenBoard.js";
import { MESSAGES } from "../../utils/messages.js";

const STATUS_LABELS = Object.freeze({
  placed: MESSAGES.kitchen.statusPlaced,
  preparing: MESSAGES.kitchen.statusPreparing,
  ready: MESSAGES.kitchen.statusReady,
  served: MESSAGES.kitchen.statusServed,
  cancelled: MESSAGES.kitchen.statusCancelled,
});

const getActionLabel = (next) => {
  if (next === "preparing") return MESSAGES.kitchen.actionStart;
  if (next === "ready") return MESSAGES.kitchen.actionReady;
  if (next === "served") return MESSAGES.kitchen.actionServed;
  return null;
};

const getActionAria = (next, name) => {
  if (next === "preparing") return MESSAGES.kitchen.actionStartAria(name);
  if (next === "ready") return MESSAGES.kitchen.actionReadyAria(name);
  if (next === "served") return MESSAGES.kitchen.actionServedAria(name);
  return undefined;
};

export const OrderTicket = ({
  order,
  now = new Date(),
  busyKey = null,
  onMove,
  onCancel,
}) => {
  if (!order) return null;

  const clock = formatClock(order.placedAt);
  const minutes = waitMinutes(order.placedAt, now);
  const { open, done } = splitDishes(order);
  const showAllergies = hasAllergyWarning(order);
  const allergies = showAllergies ? allergyLines(order) : [];

  return (
    <article className="order-ticket-card" data-order-id={order.id}>
      <header className="order-ticket-header">
        <div className="order-ticket-header-main">
          <h2 className="order-ticket-title">
            {MESSAGES.kitchen.tableHeading(order.tableNumber)}
          </h2>
          <span className={`status-chip status-chip--${order.status}`}>
            {STATUS_LABELS[order.status] || order.status}
          </span>
        </div>
        <p className="order-ticket-time">
          {MESSAGES.kitchen.placedAt(clock, minutes)}
        </p>
      </header>

      {showAllergies && (
        <section role="note" className="order-ticket-allergies">
          <h3 className="order-ticket-allergies-heading">
            {MESSAGES.kitchen.allergiesHeading}
          </h3>
          <ul className="order-ticket-allergies-list">
            {allergies.map((line, idx) => (
              <li key={idx} className="order-ticket-allergy-line">
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="order-ticket-open-dishes">
        {open.map((dish) => {
          const isBusy = busyKey === `${order.id}:${dish.id}`;
          const { next, canCancel } = dishActions(dish);
          const tags = dishAllergens(dish);
          const actionLabel = getActionLabel(next);
          const actionAria = getActionAria(next, dish.name);

          return (
            <div
              key={dish.id}
              className="order-ticket-dish-row"
              data-dish-id={dish.id}
            >
              <div className="order-ticket-dish-info">
                <div className="order-ticket-dish-header">
                  <span className="order-ticket-dish-name">
                    {MESSAGES.kitchen.quantityLine(dish.qty, dish.name)}
                  </span>
                  <span className={`status-chip status-chip--${dish.status}`}>
                    {STATUS_LABELS[dish.status] || dish.status}
                  </span>
                </div>
                <p className="order-ticket-dish-ordered-by">
                  {MESSAGES.kitchen.orderedBy(dish.orderedBy)}
                </p>
                {tags.length > 0 && (
                  <p className="order-ticket-dish-contains">
                    {MESSAGES.kitchen.contains(tags.join(", "))}
                  </p>
                )}
              </div>

              <div className="order-ticket-dish-actions">
                {next && (
                  <Button
                    variant="primary"
                    disabled={isBusy}
                    aria-label={actionAria}
                    onClick={() => onMove?.(order.id, dish, next)}
                    className="order-ticket-action-btn"
                  >
                    {actionLabel}
                  </Button>
                )}
                {canCancel && (
                  <Button
                    variant="ghost"
                    disabled={isBusy}
                    aria-label={MESSAGES.kitchen.cancelDishAria(dish.name)}
                    onClick={() => onCancel?.(order.id, dish)}
                    className="order-ticket-cancel-btn"
                  >
                    {MESSAGES.kitchen.cancelDish}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {done.length > 0 && (
        <section className="order-ticket-done">
          <h3 className="order-ticket-done-heading">
            {MESSAGES.kitchen.doneHeading}
          </h3>
          <ul className="order-ticket-done-list">
            {done.map((dish) => (
              <li key={dish.id} className="order-ticket-done-item">
                <span className="order-ticket-done-name">{dish.name}</span>
                <span className={`status-chip status-chip--${dish.status}`}>
                  {STATUS_LABELS[dish.status] || dish.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
};

export default OrderTicket;
