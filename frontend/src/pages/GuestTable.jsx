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
  endedMessage,
} from '../utils/guestSession.js';
import { approveGuest, rejectGuest } from '../services/guestService.js';
import { MESSAGES } from '../utils/messages.js';

export const GuestTable = () => {
  const { status, data, offline, error, endedCode, refresh, applyData } =
    useGuestTable();

  const [screenOverride, setScreenOverride] = useState(null);
  const [busyRequest, setBusyRequest] = useState(false);
  const [hostActionError, setHostActionError] = useState(null);

  if (status === 'noToken') {
    return (
      <div className="guest-no-token-screen">
        <p className="guest-no-token-body">
          {MESSAGES?.guest?.noActiveSession ||
            'Scan the QR code at your table to join.'}
        </p>
      </div>
    );
  }

  if (status === 'loading') {
    return <Loader />;
  }

  if (status === 'error') {
    return (
      <div className="guest-table-error">
        <ErrorMessage>{error}</ErrorMessage>
        <Button variant="primary" onClick={refresh}>
          {MESSAGES?.common?.tryAgain || 'Try again'}
        </Button>
      </div>
    );
  }

  if (status === 'ended') {
    return (
      <div className="guest-ended-screen">
        <p className="guest-ended-body">{endedMessage(endedCode)}</p>
      </div>
    );
  }

  // status === 'ready'
  const approvedDiners = diners(data);
  const seatedCount =
    typeof approvedDiners?.seated === 'number'
      ? approvedDiners.seated
      : Array.isArray(approvedDiners)
        ? approvedDiners.length
        : 0;
  const pendingCount =
    typeof approvedDiners?.pending === 'number'
      ? approvedDiners.pending
      : Array.isArray(data?.pending)
        ? data.pending.length
        : 0;

  const handleApprove = async (id) => {
    setBusyRequest(true);
    setHostActionError(null);
    try {
      await approveGuest(id);
      await refresh();
    } catch (err) {
      setHostActionError(
        err?.response?.data?.message || 'Could not approve guest.'
      );
    } finally {
      setBusyRequest(false);
    }
  };

  const handleReject = async (id) => {
    setBusyRequest(true);
    setHostActionError(null);
    try {
      await rejectGuest(id);
      await refresh();
    } catch (err) {
      setHostActionError(
        err?.response?.data?.message || 'Could not decline guest.'
      );
    } finally {
      setBusyRequest(false);
    }
  };

  const baseScreen = screenFor(data);
  const activeScreen =
    baseScreen === 'menu' || baseScreen === 'allergies'
      ? screenOverride || baseScreen
      : baseScreen;

  const alreadyAnswered =
    data?.me?.allergiesDeclared === true || Array.isArray(data?.me?.allergies);

  const handleAllergiesSaved = (updatedMe) => {
    if (applyData) {
      applyData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          me: {
            ...prev.me,
            ...(updatedMe || {}),
            allergiesDeclared: true,
          },
        };
      });
    } else {
      refresh();
    }
    setScreenOverride('menu');
  };

  return (
    <div className="guest-table-page">
      {offline && (
        <div className="guest-offline-banner" role="status">
          {MESSAGES?.guest?.offlineBanner || 'Trying to reconnect...'}
        </div>
      )}

      <header className="guest-table-header">
        <h1 className="guest-table-title">{`Table ${data?.tableNumber ?? ''}`}</h1>
        <p className="guest-table-subtitle">{`Welcome, ${data?.me?.nickname ?? ''}`}</p>
        <p className="guest-table-summary">{`${seatedCount} seated · ${pendingCount} waiting`}</p>
      </header>

      {isHost(data?.me) && (
        <>
          {hostActionError && <ErrorMessage>{hostActionError}</ErrorMessage>}
          <PendingRequests
            requests={data?.pending}
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
              {MESSAGES?.guest?.waitingHeading || 'Waiting for your host'}
            </h2>
            <p className="guest-waiting-body">
              {MESSAGES?.guest?.waitingBody ||
                'Your request has been sent. You will be seated once the host approves.'}
            </p>
          </div>
        )}

        {activeScreen === 'allergies' && (
          <AllergyForm
            current={data?.me?.allergies}
            onSaved={handleAllergiesSaved}
            onCancel={
              alreadyAnswered ? () => setScreenOverride('menu') : undefined
            }
          />
        )}

        {activeScreen === 'menu' && (
          <GuestMenuList
            onChangeAllergies={() => setScreenOverride('allergies')}
            onNeedRefresh={refresh}
          />
        )}

        {activeScreen === 'unknown' && (
          <div className="guest-unknown-screen">
            <p className="guest-unknown-body">
              {MESSAGES?.guest?.unknownScreen ||
                'We could not open this screen. Please ask a member of staff.'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default GuestTable;
