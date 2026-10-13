// GuestTable.jsx: Guest table landing page and state dispatcher
import React, { useState } from 'react';
import Loader from '../Components/Common/Loader.jsx';
import ErrorMessage from '../Components/Common/ErrorMessage.jsx';
import Button from '../Components/Common/Button.jsx';
import PendingRequests from '../Components/Guest/PendingRequests.jsx';
import AllergyForm from '../Components/Guest/AllergyForm.jsx';
import GuestMenuList from '../Components/Guest/GuestMenuList.jsx';
import { useGuestTable } from '../hooks/useGuestTable.js';
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
  const { status, data, offline, endedCode, refresh, applyData } =
    useGuestTable();

  const [screenOverride, setScreenOverride] = useState(null);
  const [allergySubmitting, setAllergySubmitting] = useState(false);
  const [allergyError, setAllergyError] = useState(null);
  const [busyRequest, setBusyRequest] = useState(false);
  const [hostActionError, setHostActionError] = useState(null);

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

  const baseScreen = screenFor(data);
  const activeScreen =
    baseScreen === 'menu' || baseScreen === 'allergies'
      ? screenOverride || baseScreen
      : baseScreen;

  const tableHeading =
    data?.session?.tableNumber != null
      ? MESSAGES.guest.tableHeading(data.session.tableNumber)
      : MESSAGES.guest.yourTable;

  return (
    <div className="guest-table-page">
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
          <GuestMenuList
            onChangeAllergies={() => setScreenOverride('allergies')}
            onNeedRefresh={refresh}
          />
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
