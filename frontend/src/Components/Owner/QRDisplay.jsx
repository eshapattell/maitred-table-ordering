// QRDisplay.jsx: Component displaying table QR code with print and download actions
import React from 'react';
import Button from '../Common/Button.jsx';
import { isPngDataUrl, isHttpUrl, qrFileName } from '../../utils/qr.js';
import { APP_NAME } from '../../utils/constants.js';
import { MESSAGES } from '../../utils/messages.js';

export const QRDisplay = ({ number, url, qrDataUrl }) => {
  const hasValidPng = isPngDataUrl(qrDataUrl);
  const hasValidUrl = isHttpUrl(url);

  const handlePrint = () => {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  };

  return (
    <div className="qr-container">
      <div className="qr-print">
        <h2 className="qr-title">{MESSAGES.owner.tables.tableHeading(number)}</h2>
        {hasValidPng ? (
          <img
            src={qrDataUrl}
            alt={MESSAGES.owner.tables.qrAlt(number)}
            className="qr-image"
          />
        ) : (
          <p className="field-hint qr-unavailable">
            {MESSAGES.owner.tables.qrUnavailable}
          </p>
        )}
        <p className="qr-caption">{MESSAGES.owner.tables.qrCaption(APP_NAME)}</p>
      </div>

      <div className="no-print qr-actions">
        {hasValidUrl && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--ghost"
          >
            {MESSAGES.owner.tables.openGuestLink}
          </a>
        )}
        {hasValidPng && (
          <a
            href={qrDataUrl}
            download={qrFileName(number)}
            className="btn btn--ghost"
          >
            {MESSAGES.owner.tables.downloadImage}
          </a>
        )}
        <Button variant="primary" onClick={handlePrint}>
          {MESSAGES.owner.tables.print}
        </Button>
      </div>
    </div>
  );
};

export default QRDisplay;
