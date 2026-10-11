// qr.js: checks for the QR data the owner screens display (FINAL drop-in, Task 8b).
const PNG_PREFIX = 'data:image/png;base64,';

// Only a real base64 PNG data URL of sensible size may be used as an image source.
export const isPngDataUrl = (value) =>
  typeof value === 'string' &&
  value.startsWith(PNG_PREFIX) &&
  value.length > PNG_PREFIX.length + 100 &&
  value.length <= 300000 &&
  /^[A-Za-z0-9+/]+={0,2}$/.test(value.slice(PNG_PREFIX.length));

// Only http(s) links may be opened from a link; never javascript: or data: URLs.
export const isHttpUrl = (value) => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

// File name for the downloaded QR image.
export const qrFileName = (tableNumber) =>
  Number.isInteger(tableNumber) && tableNumber >= 1 && tableNumber <= 500
    ? `maitred-table-${tableNumber}.png`
    : 'maitred-table.png';
