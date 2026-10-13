// PendingRequests.jsx: List of pending diners awaiting approval from the host
import React from 'react';
import Button from '../Common/Button.jsx';
import { MESSAGES } from '../../utils/messages.js';

export const PendingRequests = ({
  requests = [],
  busy = false,
  onApprove,
  onReject,
}) => {
  if (!Array.isArray(requests) || requests.length === 0) {
    return null;
  }

  return (
    <section className="pending-requests" aria-labelledby="pending-requests-title">
      <h2 id="pending-requests-title" className="pending-requests-title">
        {MESSAGES.guest.joinRequestsTitle}
      </h2>
      <div className="pending-requests-list">
        {requests.map((person) => (
          <div key={person.id} className="pending-request-card">
            <p className="pending-request-info">
              <span className="pending-nickname">{person.nickname}</span>{' '}
              <span className="pending-msg">{MESSAGES.guest.wantsToJoin}</span>
            </p>
            <div className="pending-request-actions">
              <Button
                variant="primary"
                disabled={busy}
                aria-label={MESSAGES.guest.approveLabel(person.nickname)}
                onClick={() => onApprove && onApprove(person.id)}
              >
                {MESSAGES.guest.approve}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                aria-label={MESSAGES.guest.declineLabel(person.nickname)}
                onClick={() => onReject && onReject(person.id)}
              >
                {MESSAGES.guest.decline}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default PendingRequests;
