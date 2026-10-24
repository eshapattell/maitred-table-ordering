// OrderedSoFar.jsx: Component displaying table order history by rounds
import React from 'react';
import { roundsOf, historySummary } from '../../utils/tableOrders.js';
import { formatClock } from '../../utils/formatters.js';
import { MESSAGES } from '../../utils/messages.js';

export const OrderedSoFar = ({ history }) => {
  const rounds = roundsOf(history);
  const summary = historySummary(history);

  return (
    <section className="ordered-so-far" aria-label={MESSAGES.guest.orderedHeading}>
      <h3 className="ordered-so-far__heading">{MESSAGES.guest.orderedHeading}</h3>
      {rounds.length === 0 ? (
        <p className="ordered-so-far__empty">{MESSAGES.guest.orderedNothing}</p>
      ) : (
        <>
          {summary.hasOrders && (
            <p className="ordered-so-far__summary">
              {MESSAGES.guest.orderedSummary(summary.items)}
            </p>
          )}
          <div className="ordered-so-far__rounds">
            {rounds.map((round) => {
              const clock = formatClock(round.placedAt);
              const title = MESSAGES.guest.orderedRound(round.number, clock);
              return (
                <div key={round.id || round.number} className="ordered-round">
                  <h4 className="ordered-round__title">{title}</h4>
                  <ul className="ordered-round__items">
                    {round.rows.map((row) => {
                      const isCancelled = row.cancelled === true;
                      const rowClasses = [
                        'ordered-row',
                        isCancelled ? 'ordered-row--cancelled' : '',
                      ]
                        .filter(Boolean)
                        .join(' ');

                      return (
                        <li key={row.id} className={rowClasses}>
                          <span className="ordered-row__line">
                            {MESSAGES.guest.placedLine(row.qty, row.name)}
                          </span>
                          {row.orderedBy !== '' && (
                            <span className="ordered-row__by">
                              {MESSAGES.guest.placedBy(row.orderedBy)}
                            </span>
                          )}
                          {isCancelled && (
                            <span className="ordered-row__cancelled-tag">
                              {MESSAGES.guest.cancelledTag}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
};
