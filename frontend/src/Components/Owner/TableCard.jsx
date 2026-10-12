// TableCard.jsx: Card displaying table number and owner action buttons
import React from 'react';
import Button from '../Common/Button.jsx';
import { MESSAGES } from '../../utils/messages.js';

export const TableCard = ({ table, busy = false, onShowQr, onRotate, onDelete }) => {
  const number = table?.number;

  return (
    <article className="table-card">
      <h3 className="table-card-title">
        {MESSAGES.owner.tables.tableHeading(number)}
      </h3>
      <div className="table-card-actions">
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => onShowQr && onShowQr(table)}
          aria-label={MESSAGES.owner.tables.showQr(number)}
        >
          {MESSAGES.owner.tables.showQr(number)}
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => onRotate && onRotate(table)}
          aria-label={MESSAGES.owner.tables.replaceQr(number)}
        >
          {MESSAGES.owner.tables.replaceQr(number)}
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => onDelete && onDelete(table)}
          aria-label={MESSAGES.owner.tables.deleteTable(number)}
        >
          {MESSAGES.owner.tables.deleteTable(number)}
        </Button>
      </div>
    </article>
  );
};

export default TableCard;
