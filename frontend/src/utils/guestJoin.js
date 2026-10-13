// guestJoin.js: pure helpers for the guest "join a table" screen (FINAL drop-in, Task 10a).
// normalisePhoneInput and cleanNickname copy the SERVER's rules (backend/utils/phone.js and
// backend/utils/sessionRules.js) so a guest gets feedback at once. guestJoin.test.js compares them
// with the real backend functions over thousands of inputs. The server still validates everything again.

const MOBILE_DIGITS = /^[6-9]\d{9}$/;
const NICKNAME_MAX = 30;

// What the guest typed -> "+91XXXXXXXXXX", or null when it is not a valid Indian mobile number.
export const normalisePhoneInput = (input) => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 20) return null;
  if (!/^\+?[0-9\s\-()]+$/.test(trimmed)) return null;
  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/[^0-9]/g, '');
  if (hasPlus) {
    if (!digits.startsWith('91')) return null;
    digits = digits.slice(2);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return MOBILE_DIGITS.test(digits) ? `+91${digits}` : null;
};

// A name for the table: letters from any language, digits, spaces and . ' - (1 to 30 characters).
export const cleanNickname = (input) => {
  if (typeof input !== 'string') return null;
  const cleaned = input.normalize('NFC').replace(/\s+/g, ' ').trim();
  const length = [...cleaned].length;
  if (length < 1 || length > NICKNAME_MAX) return null;
  // \p{M} matters: Hindi and Gujarati vowel signs are combining marks, not letters.
  if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N} .'\-]*$/u.test(cleaned)) return null;
  return cleaned;
};

// The link on the table's QR code: /r/:restaurantId/table/:tableNo?token=...
export const parseJoinLink = (link) => {
  const { restaurantId, tableNo, token } = link ?? {};
  const tableNumber = typeof tableNo === 'string' && /^[1-9]\d{0,2}$/.test(tableNo) ? Number(tableNo) : NaN;
  const ok =
    typeof restaurantId === 'string' && /^[0-9a-f]{24}$/i.test(restaurantId) &&
    Number.isInteger(tableNumber) && tableNumber >= 1 && tableNumber <= 500 &&
    typeof token === 'string' && /^[0-9a-f]{32}$/.test(token);
  return ok ? { ok: true, restaurantId, tableNumber, qrToken: token } : { ok: false };
};

export const JOIN_MESSAGES = Object.freeze({
  phoneMissing: 'Enter your mobile number',
  phoneInvalid: 'Enter a valid 10-digit Indian mobile number',
  nicknameMissing: 'Enter the name you would like the table to see',
  nicknameInvalid: "Use letters, numbers, spaces and . ' - only, up to 30 characters",
  network: 'We could not reach the restaurant. Please check your connection and try again.',
  tableNotFound: 'This table link is not valid. Please scan the code on your table again.',
  phoneElsewhere: 'This number is already seated at another table. Please ask a member of staff for help.',
  alreadyJoined: 'This number has already joined this table. Please ask the host or a member of staff for help.',
  tableFull: 'This table is full. Please ask a member of staff for help.',
  tryAgain: 'Please try again in a moment.',
  invalidInput: 'Please check your name and mobile number.',
  tooMany: 'Too many attempts. Please wait a moment and try again.',
  generic: 'Something went wrong. Please try again.',
});

// Returns { valid, errors, values }. values.phone is the normalised "+91..." number and
// values.nickname the cleaned name; both are null-safe: values is null when invalid.
export const validateJoinForm = (form) => {
  const { phone, nickname } = form ?? {};
  const errors = {};
  const e164 = normalisePhoneInput(phone);
  if (typeof phone !== 'string' || phone.trim() === '') errors.phone = JOIN_MESSAGES.phoneMissing;
  else if (!e164) errors.phone = JOIN_MESSAGES.phoneInvalid;
  const name = cleanNickname(nickname);
  if (typeof nickname !== 'string' || nickname.trim() === '') errors.nickname = JOIN_MESSAGES.nicknameMissing;
  else if (!name) errors.nickname = JOIN_MESSAGES.nicknameInvalid;
  const valid = Object.keys(errors).length === 0;
  return { valid, errors, values: valid ? { phone: e164, nickname: name } : null };
};

// Wording for a failed join. Never shows the server's own text.
export const joinErrorMessage = (err) => {
  const response = err?.response;
  if (!response) return JOIN_MESSAGES.network;
  switch (response?.data?.code) {
    case 'TABLE_NOT_FOUND': return JOIN_MESSAGES.tableNotFound;
    case 'PHONE_ACTIVE_ELSEWHERE': return JOIN_MESSAGES.phoneElsewhere;
    case 'ALREADY_JOINED': return JOIN_MESSAGES.alreadyJoined;
    case 'TABLE_FULL': return JOIN_MESSAGES.tableFull;
    case 'TRY_AGAIN': return JOIN_MESSAGES.tryAgain;
    case 'INVALID_INPUT': return JOIN_MESSAGES.invalidInput;
    default: break;
  }
  if (response.status === 503) return JOIN_MESSAGES.tryAgain;
  if (response.status === 429) return JOIN_MESSAGES.tooMany;
  return JOIN_MESSAGES.generic;
};
