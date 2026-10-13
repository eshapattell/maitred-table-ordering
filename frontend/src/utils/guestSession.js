// guestSession.js: pure helpers for the guest's table screens (FINAL drop-in, Task 10a).

export const GUEST_POLL_MS = 5000;

// Which screen to show for a /api/sessions/me response. Only an approved guest of an OPEN session
// ever gets past "waiting", and anything unrecognised is "unknown" (never the menu): fail closed.
export const screenFor = (data) => {
  const me = data?.me;
  if (!me || typeof me !== 'object') return 'unknown';
  if (data?.session?.status !== 'open') return 'ended';
  if (me.status === 'pending') return 'waiting';
  if (me.status === 'approved') return me.allergiesDeclared === true ? 'menu' : 'allergies';
  return 'unknown';
};

export const isHost = (me) => me?.role === 'host' && me?.status === 'approved';

// Requests waiting for the host. Only a host ever sees them, and only well-formed pending entries.
export const pendingRequests = (data) =>
  isHost(data?.me) && Array.isArray(data?.pending)
    ? data.pending.filter((p) => p && p.status === 'pending' && typeof p.id === 'string' && p.id !== '')
    : [];

// The approved people at the table.
export const diners = (data) =>
  Array.isArray(data?.participants) ? data.participants.filter((p) => p && p.status === 'approved') : [];

// Answers that mean "this guest's session is over": the token must be dropped.
export const ENDED_CODES = Object.freeze(['SESSION_CLOSED', 'PARTICIPANT_REMOVED', 'INVALID_TOKEN']);

export const endedCodeOf = (err) => {
  const response = err?.response;
  return response?.status === 401 && ENDED_CODES.includes(response?.data?.code) ? response.data.code : null;
};

export const endedMessage = (code) => {
  if (code === 'SESSION_CLOSED') {
    return 'This table session has ended. If you are still dining, please scan the QR code on your table again.';
  }
  if (code === 'PARTICIPANT_REMOVED') {
    return 'You are no longer part of this table. Please ask a member of staff if this is a mistake.';
  }
  return 'Your session has expired. Please scan the QR code on your table again.';
};
