// GuestMenuList.jsx: Display guest menu with server safety evaluation
import React, { useState, useEffect, useCallback } from 'react';
import Loader from '../Common/Loader.jsx';
import ErrorMessage from '../Common/ErrorMessage.jsx';
import Button from '../Common/Button.jsx';
import { fetchGuestMenu } from '../../services/guestService.js';
import {
  isSafeForGuest,
  unsafeLabel,
  menuCounts,
  filterGuestMenu,
} from '../../utils/guestMenu.js';
import { groupByCategory } from '../../utils/menuView.js';
import { formatPrice } from '../../utils/formatters.js';
import { OPTION_LABELS } from '../../utils/menuOptions.js';
import { MESSAGES } from '../../utils/messages.js';

export const GuestMenuList = ({ onChangeAllergies, onNeedRefresh }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAuthBlocked, setIsAuthBlocked] = useState(false);
  const [items, setItems] = useState([]);
  const [hideUnsafe, setHideUnsafe] = useState(false);

  const loadMenu = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsAuthBlocked(false);
    try {
      const data = await fetchGuestMenu();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      const status = err?.response?.status;
      const code = err?.response?.data?.code;
      if (
        status === 403 &&
        (code === 'ALLERGIES_REQUIRED' || code === 'APPROVAL_PENDING')
      ) {
        setIsAuthBlocked(true);
        if (onNeedRefresh) {
          onNeedRefresh();
        }
        return;
      }
      setError(
        err?.response?.data?.message ||
          MESSAGES?.guest?.loadMenuFailed ||
          'We could not load the menu. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [onNeedRefresh]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  if (loading) {
    return <Loader label={MESSAGES?.guest?.loadingMenu || 'Loading the menu...'} />;
  }

  if (isAuthBlocked) {
    return null;
  }

  if (error) {
    return (
      <div className="guest-menu-error">
        <ErrorMessage>{error}</ErrorMessage>
        <Button variant="primary" onClick={loadMenu}>
          {MESSAGES?.guest?.tryAgain || 'Try again'}
        </Button>
      </div>
    );
  }

  const counts = menuCounts(items);
  const displayedItems = filterGuestMenu(items, hideUnsafe);
  const groups = groupByCategory(displayedItems);

  const dishArticleClass = (dish) =>
    isSafeForGuest(dish) ? 'guest-dish' : 'guest-dish guest-dish--unsafe';

  return (
    <div className="guest-menu-container">
      <div className="guest-menu-summary">
        <p className="guest-menu-summary-text">
          {MESSAGES?.guest?.summary
            ? MESSAGES.guest.summary(counts.safe, counts.total)
            : `You can have ${counts.safe} of ${counts.total} dishes.`}
        </p>
        <div className="guest-menu-controls">
          <label className="guest-hide-unsafe-toggle">
            <input
              type="checkbox"
              checked={hideUnsafe}
              onChange={(e) => setHideUnsafe(e.target.checked)}
            />
            <span>
              {MESSAGES?.guest?.hideUnsafeLabel || 'Hide dishes I cannot have'}
            </span>
          </label>
          <div className="guest-menu-actions">
            <Button variant="ghost" onClick={loadMenu}>
              {MESSAGES?.guest?.refreshMenu || 'Refresh menu'}
            </Button>
            <Button variant="ghost" onClick={onChangeAllergies}>
              {MESSAGES?.guest?.changeAllergies || 'Change my allergies'}
            </Button>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="guest-menu-empty">
          {MESSAGES?.guest?.emptyMenu || 'The menu is not available right now.'}
        </p>
      ) : (
        <div className="guest-menu-list">
          {groups.map((group) => (
            <section key={group.category} className="guest-menu-section">
              <h2 className="guest-menu-section-title">{group.category}</h2>
              <div className="guest-menu-dishes">
                {group.items.map((dish) => (
                  <article key={dish._id} className={dishArticleClass(dish)}>
                    <div className="guest-dish-header">
                      <h3 className="guest-dish-name">{dish.name}</h3>
                      <span className="guest-dish-price">
                        {formatPrice(dish.price)}
                      </span>
                    </div>
                    <div className="guest-dish-meta">
                      <span className="guest-dish-course">
                        {OPTION_LABELS?.course?.[dish.course] || dish.course}
                      </span>
                      {dish.cuisine && (
                        <span className="guest-dish-cuisine">{dish.cuisine}</span>
                      )}
                      <span className="guest-dish-diet">
                        {dish.isVegetarian ? 'Vegetarian' : 'Non-vegetarian'}
                      </span>
                    </div>
                    {dish.description && (
                      <p className="guest-dish-desc">{dish.description}</p>
                    )}
                    {!isSafeForGuest(dish) && (
                      <span
                        className="guest-dish-flag guest-dish-flag--unsafe"
                        role="note"
                      >
                        {unsafeLabel(dish)}
                      </span>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="guest-menu-note">
        {MESSAGES?.guest?.advisoryNote ||
          'Dish information is entered by the restaurant. If you are unsure, please ask a member of staff.'}
      </p>
    </div>
  );
};

export default GuestMenuList;
