// generateQR.js: QR code generation and table join URL utilities for maitred
import QRCode from 'qrcode';

/**
 * Constructs the canonical table onboarding URL for dining guests.
 * Strips trailing slashes from clientUrl and encodes all parameter values.
 *
 * @param {Object} params
 * @param {string} [params.clientUrl] - Base frontend URL
 * @param {string|number} params.restaurantId - Restaurant ID
 * @param {string|number} params.tableNumber - Table number
 * @param {string} params.qrToken - Unique table QR security token
 * @returns {string} Formatted join URL
 */
export const buildTableUrl = ({ clientUrl, restaurantId, tableNumber, qrToken }) => {
  let base = 'http://localhost:5173';
  if (typeof clientUrl === 'string' && clientUrl.trim().length > 0) {
    base = clientUrl.trim().replace(/\/+$/, '');
  }

  const encRestaurantId = encodeURIComponent(String(restaurantId));
  const encTableNumber = encodeURIComponent(String(tableNumber));
  const encToken = encodeURIComponent(String(qrToken));

  return `${base}/r/${encRestaurantId}/table/${encTableNumber}?token=${encToken}`;
};

/**
 * Generates a high-resolution PNG data URL for a given string text.
 * Uses medium error correction level and 512px resolution for reliable scanning.
 *
 * @param {string} text - Raw string to encode into the QR code
 * @returns {Promise<string>} PNG data URL string
 */
export const generateQR = async (text) => {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('QR text must be a non-empty string');
  }

  return await QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 512,
  });
};
