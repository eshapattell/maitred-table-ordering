// KitchenDashboard.jsx: Live kitchen board displaying active orders and tickets
import React, { useState, useEffect } from "react";
import { useKitchenBoard } from "../hooks/useKitchenBoard.js";
import { boardSummary } from "../utils/kitchenBoard.js";
import { MESSAGES } from "../utils/messages.js";
import OrderTicket from "../Components/Kitchen/OrderTicket.jsx";
import Loader from "../Components/Common/Loader.jsx";
import ErrorMessage from "../Components/Common/ErrorMessage.jsx";
import Button from "../Components/Common/Button.jsx";
import Modal from "../Components/Common/Modal.jsx";

export const KitchenDashboard = () => {
  const board = useKitchenBoard({ enabled: true });
  const [now, setNow] = useState(() => new Date());
  const [cancelTarget, setCancelTarget] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const summary = boardSummary(board.orders);

  const handleMove = (orderId, dish, status) => {
    board.moveDish(orderId, dish.id, status);
  };

  const handleOpenCancel = (orderId, dish) => {
    setCancelTarget({ orderId, dish });
  };

  const handleCloseCancel = () => {
    setCancelTarget(null);
  };

  const handleConfirmCancel = () => {
    if (!cancelTarget) return;
    board.moveDish(cancelTarget.orderId, cancelTarget.dish.id, "cancelled");
    setCancelTarget(null);
  };

  return (
    <div className="kitchen-dashboard">
      <header className="kitchen-header">
        <div className="kitchen-header-top">
          <h1 className="kitchen-title">{MESSAGES.kitchen.boardTitle}</h1>
          {board.liveState === "live" && (
            <span role="status" className="kitchen-live-chip kitchen-live-chip--live">
              {MESSAGES.kitchen.liveOn}
            </span>
          )}
          {board.liveState === "reconnecting" && (
            <span
              role="status"
              className="kitchen-live-chip kitchen-live-chip--reconnecting"
            >
              {MESSAGES.kitchen.liveReconnecting}
            </span>
          )}
        </div>
        <p className="kitchen-summary">
          {MESSAGES.kitchen.summary(summary.orders, summary.openDishes)}
        </p>
      </header>

      {board.status === "loading" && <Loader />}

      {board.status === "error" && board.orders.length === 0 && (
        <div className="kitchen-error-state">
          <ErrorMessage>{MESSAGES.kitchen.loadFailed}</ErrorMessage>
          <Button variant="primary" onClick={board.refresh}>
            {MESSAGES.kitchen.retry}
          </Button>
        </div>
      )}

      {board.error && (
        <div className="kitchen-alert-container">
          <ErrorMessage>{board.error}</ErrorMessage>
        </div>
      )}

      {board.status === "ready" && board.orders.length === 0 && (
        <p className="kitchen-empty">{MESSAGES.kitchen.empty}</p>
      )}

      {board.orders.length > 0 && (
        <div className="kitchen-tickets-grid">
          {board.orders.map((order) => (
            <OrderTicket
              key={order.id}
              order={order}
              now={now}
              busyKey={board.busyKey}
              onMove={handleMove}
              onCancel={handleOpenCancel}
            />
          ))}
        </div>
      )}

      {cancelTarget && (
        <Modal
          title={MESSAGES.kitchen.cancelTitle}
          onClose={handleCloseCancel}
        >
          <p className="kitchen-cancel-body">
            {MESSAGES.kitchen.cancelBody(cancelTarget.dish.name)}
          </p>
          <div className="kitchen-modal-actions">
            <Button
              variant="ghost"
              data-autofocus="true"
              onClick={handleCloseCancel}
            >
              {MESSAGES.kitchen.cancelKeep}
            </Button>
            <Button variant="primary" onClick={handleConfirmCancel}>
              {MESSAGES.kitchen.cancelConfirm}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default KitchenDashboard;
