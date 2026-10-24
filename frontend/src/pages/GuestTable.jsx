// GuestTable.jsx: Guest table landing page and state dispatcher
import React, { useState, useEffect, useRef } from 'react';
import Loader from '../Components/Common/Loader.jsx';
import ErrorMessage from '../Components/Common/ErrorMessage.jsx';
import Button from '../Components/Common/Button.jsx';
import Modal from '../Components/Common/Modal.jsx';
import PendingRequests from '../Components/Guest/PendingRequests.jsx';
import AllergyForm from '../Components/Guest/AllergyForm.jsx';
import GuestMenuList from '../Components/Guest/GuestMenuList.jsx';
import CartBar from '../Components/Guest/CartBar.jsx';
import CartSheet from '../Components/Guest/CartSheet.jsx';
import { useGuestTable } from '../hooks/useGuestTable.js';
import { useCart } from '../hooks/useCart.js';
import { useHostOrders } from '../hooks/useHostOrders.js';
import { useTableOrders } from '../hooks/useTableOrders.js';
import { useLiveConnection } from '../hooks/useLiveConnection.js';
import { pollIntervalFor, cartSummary } from '../utils/guestCart.js';
import { orderedQuantities, historySummary } from '../utils/tableOrders.js';
import {
  screenFor,
  isHost,
  diners,
  pendingRequests,
  endedMessage,
} from '../utils/guestSession.js';
import {
  declareAllergies,
  approveGuest,
  rejectGuest,
} from '../services/guestService.js';
import { MESSAGES } from '../utils/messages.js';

export const GuestTable = () => {
  const [liveFlag, setLiveFlag] = useState(false);
  const [menuReload, setMenuReload] = useState(0);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [screenOverride, setScreenOverride] = useState(null);
  const [allergySubmitting, setAllergySubmitting] = useState(false);
  const [allergyError, setAllergyError] = useState(null);
  const [busyRequest, setBusyRequest] = useState(false);
  const [hostActionError, setHostActionError] = useState(null);

  const table = useGuestTable({ pollMs: pollIntervalFor(liveFlag) });
  const { status, data, offline, endedCode, refresh, applyData } = table;

  const baseScreen = screenFor(data);
  const activeScreen =
    baseScreen === 'menu' || baseScreen === 'allergies'
      ? screenOverride || baseScreen
      : baseScreen;

  const onMenu = table.status === 'ready' && activeScreen === 'menu';

  const cart = useCart({
    enabled: onMenu,
    onStale: () => setMenuReload((n) => n + 1),
  });

  const tableOrders = useTableOrders({ enabled: onMenu });

  const { liveState } = useLiveConnection({
    enabled: table.status === 'ready',
    getCartVersion: cart.getVersion,
    onSessionChanged: table.refresh,
    onCartChanged: () => {
      cart.refresh();
      tableOrders.load();
    },
    onLiveChange: setLiveFlag,
  });

  const orders = useHostOrders({
    enabled: onMenu && isHost(data?.me),
    onCartApplied: cart.applyCart,
    onStale: cart.refresh,
  });

  const prevCartVersionRef = useRef(cart.cart?.version);
  useEffect(() => {
    if (
      onMenu &&
      prevCartVersionRef.current !== undefined &&
      cart.cart?.version !== undefined &&
      cart.cart.version !== prevCartVersionRef.current
    ) {
      tableOrders.load();
    }
    if (isCartModalOpen && isHost(data?.me)) {
      if (
        prevCartVersionRef.current !== undefined &&
        cart.cart?.version !== undefined &&
        cart.cart.version !== prevCartVersionRef.current
      ) {
        orders.loadPlaced();
      }
    }
    prevCartVersionRef.current = cart.cart?.version;
  }, [onMenu, isCartModalOpen, data?.me, cart.cart?.version, orders.loadPlaced, tableOrders.load]);

  const prevDataRef = useRef(table.data);
  useEffect(() => {
    if (
      onMenu &&
      table.data &&
      prevDataRef.current &&
      prevDataRef.current !== table.data
    ) {
      cart.refresh();
      tableOrders.load();
    }
    prevDataRef.current = table.data;
  }, [onMenu, table.data, cart.refresh, tableOrders.load]);

  if (status === 'noToken') {
    return (
      <div className="guest-no-token-screen">
        <p className="guest-no-token-body">{MESSAGES.guest.noToken}</p>
      </div>
    );
  }

  if (status === 'loading') {
    return <Loader />;
  }

  if (status === 'error') {
    return (
      <div className="guest-table-error">
        <ErrorMessage>{MESSAGES.guest.loadFailed}</ErrorMessage>
        <Button variant="primary" onClick={refresh}>
          {MESSAGES.common.tryAgain}
        </Button>
      </div>
    );
  }

  if (status === 'ended') {
    return (
      <div className="guest-ended-screen">
        <h1 className="guest-ended-title">{MESSAGES.guest.endedTitle}</h1>
        <p className="guest-ended-body">{endedMessage(endedCode)}</p>
      </div>
    );
  }

  // status === 'ready'
  const handleApprove = async (id) => {
    setBusyRequest(true);
    setHostActionError(null);
    try {
      const answer = await approveGuest(id);
      applyData(answer);
    } catch (err) {
      const respStatus = err?.response?.status;
      if (respStatus === 404 || respStatus === 403) {
        setHostActionError(MESSAGES.guest.requestChanged);
        await refresh();
      } else {
        setHostActionError(MESSAGES.guest.actionFailed);
      }
    } finally {
      setBusyRequest(false);
    }
  };

  const handleReject = async (id) => {
    setBusyRequest(true);
    setHostActionError(null);
    try {
      const answer = await rejectGuest(id);
      applyData(answer);
    } catch (err) {
      const respStatus = err?.response?.status;
      if (respStatus === 404 || respStatus === 403) {
        setHostActionError(MESSAGES.guest.requestChanged);
        await refresh();
      } else {
        setHostActionError(MESSAGES.guest.actionFailed);
      }
    } finally {
      setBusyRequest(false);
    }
  };

  const handleAllergySubmit = async (allergies) => {
    if (allergySubmitting) return;
    setAllergySubmitting(true);
    setAllergyError(null);
    try {
      const result = await declareAllergies(allergies);
      if (applyData) {
        if (result?.session && result?.me) {
          applyData(result);
        } else {
          applyData({
            ...data,
            me: {
              ...data?.me,
              ...(result?.me || {}),
              allergiesDeclared: true,
              allergies,
            },
          });
        }
      }
      setScreenOverride(null);
      await refresh();
    } catch (err) {
      if (
        err?.response?.status === 403 &&
        err?.response?.data?.code === 'APPROVAL_PENDING'
      ) {
        await refresh();
      } else {
        setAllergyError(MESSAGES.guest.allergySaveFailed);
      }
    } finally {
      setAllergySubmitting(false);
    }
  };

  const handleOpenCart = () => {
    setIsCartModalOpen(true);
    orders.loadPlaced();
    tableOrders.load();
  };

  const handleCloseCart = () => {
    setIsCartModalOpen(false);
    orders.dismiss();
  };

  const tableHeading =
    data?.session?.tableNumber != null
      ? MESSAGES.guest.tableHeading(data.session.tableNumber)
      : MESSAGES.guest.yourTable;

  return (
    <div className="guest-table-page">
      {liveState === 'reconnecting' && (
        <div className="guest-live-banner" role="status">
          {MESSAGES.guest.liveReconnecting}
        </div>
      )}

      {offline && (
        <div className="guest-offline-banner" role="status">
          {MESSAGES.guest.offlineBanner}
        </div>
      )}

      <header className="guest-table-header">
        <h1 className="guest-table-title">{tableHeading}</h1>
        <p className="guest-table-subtitle">
          {MESSAGES.guest.welcome(data?.me?.nickname || '')}
        </p>
        {activeScreen !== 'waiting' && (
          <p className="guest-table-summary">
            {MESSAGES.guest.peopleAtTable(diners(data).length)}
          </p>
        )}
      </header>

      {isHost(data?.me) && (
        <>
          {hostActionError && <ErrorMessage>{hostActionError}</ErrorMessage>}
          <PendingRequests
            requests={pendingRequests(data)}
            busy={busyRequest}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </>
      )}

      <main className="guest-table-main">
        {activeScreen === 'waiting' && (
          <div className="guest-waiting-screen">
            <h2 className="guest-waiting-title">
              {MESSAGES.guest.waitingTitle}
            </h2>
            <p className="guest-waiting-body">{MESSAGES.guest.waitingBody}</p>
            <p className="guest-waiting-note">{MESSAGES.guest.waitingNote}</p>
          </div>
        )}

        {activeScreen === 'allergies' && (
          <AllergyForm
            onSubmit={handleAllergySubmit}
            submitting={allergySubmitting}
            error={allergyError}
            onCancel={
              baseScreen === 'menu' ? () => setScreenOverride(null) : undefined
            }
          />
        )}

        {activeScreen === 'menu' && (
          <>
            {cart.error && <ErrorMessage>{cart.error}</ErrorMessage>}
            {cart.status === 'error' && !cart.cart ? (
              <div className="guest-cart-load-error">
                <ErrorMessage>{MESSAGES.guest.cartLoadFailed}</ErrorMessage>
                <Button variant="primary" onClick={cart.refresh}>
                  {MESSAGES.guest.tryAgain}
                </Button>
              </div>
            ) : (
              <>
                <GuestMenuList
                  onChangeAllergies={() => setScreenOverride('allergies')}
                  onNeedRefresh={refresh}
                  cart={cart.cart}
                  viewerId={data?.me?.id}
                  orderedQuantities={orderedQuantities(tableOrders.history)}
                  onAdd={(dish) => cart.add(dish.id)}
                  busy={cart.busy}
                  reloadToken={menuReload}
                />
                <CartBar
                  summary={cartSummary(cart.cart)}
                  orderedItems={historySummary(tableOrders.history).items}
                  onOpen={handleOpenCart}
                />
                {isCartModalOpen && (
                  <Modal
                    title={MESSAGES.guest.cartTitle}
                    onClose={handleCloseCart}
                    busy={cart.busy}
                  >
                    <CartSheet
                      cart={cart.cart}
                      viewerId={data?.me?.id}
                      viewer={data?.me}
                      history={tableOrders.history}
                      busy={cart.busy}
                      error={cart.error}
                      placing={orders.placing}
                      orderMessage={orders.message}
                      orderError={orders.error}
                      placedRows={orders.rows}
                      cancelKey={orders.cancelKey}
                      onAdd={(line) => cart.add(line.menuItemId)}
                      onDecrease={(line) => cart.decrease(line.id)}
                      onRemove={(line) => cart.remove(line.id)}
                      onPlaceOrder={() => {
                        const v = cart.cart?.version;
                        if (Number.isInteger(v)) {
                          orders.place(v);
                        }
                      }}
                      onCancelPlaced={orders.cancel}
                    />
                  </Modal>
                )}
              </>
            )}
          </>
        )}

        {activeScreen !== 'waiting' &&
          activeScreen !== 'allergies' &&
          activeScreen !== 'menu' && (
            <div className="guest-unknown-screen">
              <p className="guest-unknown-body">
                {MESSAGES.guest.unknownScreen}
              </p>
            </div>
          )}
      </main>
    </div>
  );
};

export default GuestTable;
