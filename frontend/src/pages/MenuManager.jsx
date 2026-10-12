// MenuManager.jsx: Owner menu management page with allergen review and availability toggles
import React, { useState, useEffect, useRef } from 'react';
import Button from '../Components/Common/Button.jsx';
import ErrorMessage from '../Components/Common/ErrorMessage.jsx';
import Loader from '../Components/Common/Loader.jsx';
import Modal from '../Components/Common/Modal.jsx';
import MenuForm from '../Components/Owner/MenuForm.jsx';
import AllergenTagReview from '../Components/Owner/AllergenTagReview.jsx';
import {
  fetchMenu,
  createMenuItem,
  updateMenuItem,
  confirmAllergens,
  setAvailability,
} from '../services/menuService.js';
import { ALLERGENS } from '../utils/allergens.js';
import { OPTION_LABELS } from '../utils/menuOptions.js';
import {
  buildPatchPayload,
  unknownAllergens,
} from '../utils/menuForm.js';
import {
  MENU_FILTERS,
  needsReview,
  isHidden,
  filterItems,
  menuSummary,
  groupByCategory,
  categoryOptions,
} from '../utils/menuView.js';
import { formatPrice } from '../utils/formatters.js';
import { MESSAGES } from '../utils/messages.js';

export const MenuManager = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState('all');
  const [statusMessage, setStatusMessage] = useState(null);
  const [pageError, setPageError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Modal states: null | { type: 'add' } | { type: 'edit', item } | { type: 'review', item }
  const [activeModal, setActiveModal] = useState(null);
  const [modalError, setModalError] = useState(null);

  const isMountedRef = useRef(true);

  const loadMenu = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await fetchMenu();
      if (!isMountedRef.current) return;
      setItems(data);
      setLoading(false);
    } catch {
      if (!isMountedRef.current) return;
      setLoadError(true);
      setLoading(false);
    }
  };

  const reFetchMenu = async () => {
    try {
      const data = await fetchMenu();
      if (!isMountedRef.current) return;
      setItems(data);
      setLoadError(false);
    } catch {
      if (!isMountedRef.current) return;
      setLoadError(true);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    loadMenu();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const clearAlerts = () => {
    setStatusMessage(null);
    setPageError(null);
    setModalError(null);
  };

  // Add flow
  const handleAddSubmit = async (payload) => {
    setBusy(true);
    setModalError(null);
    try {
      await createMenuItem(payload);
      if (!isMountedRef.current) return;
      setActiveModal(null);
      setBusy(false);
      await reFetchMenu();
      if (!isMountedRef.current) return;
      setStatusMessage(MESSAGES.owner.menu.savedAfterAdd);
    } catch (err) {
      if (!isMountedRef.current) return;
      setBusy(false);
      const status = err?.response?.status;
      if (status === 400) {
        setModalError(MESSAGES.owner.menu.errors.notAccepted);
      } else {
        setModalError(MESSAGES.owner.menu.errors.saveFailed);
      }
    }
  };

  // Edit flow
  const handleEditSubmit = async (payload) => {
    if (!activeModal?.item) return;
    const currentItem = activeModal.item;
    const patch = buildPatchPayload(currentItem, payload);

    if (Object.keys(patch).length === 0) {
      setActiveModal(null);
      setStatusMessage(MESSAGES.owner.menu.noChanges);
      return;
    }

    setBusy(true);
    setModalError(null);
    try {
      await updateMenuItem(currentItem.id, patch);
      if (!isMountedRef.current) return;
      setActiveModal(null);
      setBusy(false);
      await reFetchMenu();
      if (!isMountedRef.current) return;
      if (Object.prototype.hasOwnProperty.call(patch, 'allergens')) {
        setStatusMessage(MESSAGES.owner.menu.savedAfterEditAllergens);
      } else {
        setStatusMessage(MESSAGES.owner.menu.changesSaved);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setBusy(false);
      const status = err?.response?.status;
      if (status === 400) {
        setModalError(MESSAGES.owner.menu.errors.notAccepted);
      } else if (status === 404) {
        setActiveModal(null);
        setPageError(MESSAGES.owner.menu.errors.notFound);
        await reFetchMenu();
      } else {
        setModalError(MESSAGES.owner.menu.errors.saveFailed);
      }
    }
  };

  // Review flow
  const handleReviewConfirm = async (allergens) => {
    if (!activeModal?.item) return;
    const currentItem = activeModal.item;
    setBusy(true);
    setModalError(null);
    try {
      await confirmAllergens(currentItem.id, allergens);
      if (!isMountedRef.current) return;
      setActiveModal(null);
      setBusy(false);
      await reFetchMenu();
      if (!isMountedRef.current) return;
      setStatusMessage(MESSAGES.owner.menu.allergensConfirmedFor(currentItem.name));
    } catch (err) {
      if (!isMountedRef.current) return;
      setBusy(false);
      const status = err?.response?.status;
      if (status === 409) {
        setActiveModal(null);
        setPageError(MESSAGES.owner.menu.reviewConflict);
        await reFetchMenu();
      } else if (status === 404) {
        setActiveModal(null);
        setPageError(MESSAGES.owner.menu.errors.notFound);
        await reFetchMenu();
      } else if (status === 400) {
        setModalError(MESSAGES.owner.menu.errors.notAccepted);
      } else {
        setModalError(MESSAGES.owner.menu.errors.saveFailed);
      }
    }
  };

  // Availability toggle
  const handleToggleAvailability = async (item) => {
    if (busy) return;
    setBusy(true);
    clearAlerts();
    try {
      const nextAvailable = isHidden(item); // hidden -> true, otherwise -> false
      await setAvailability(item.id, nextAvailable);
      if (!isMountedRef.current) return;
      setBusy(false);
      await reFetchMenu();
    } catch (err) {
      if (!isMountedRef.current) return;
      setBusy(false);
      const status = err?.response?.status;
      if (status === 404) {
        setPageError(MESSAGES.owner.menu.errors.notFound);
        await reFetchMenu();
      } else {
        setPageError(MESSAGES.owner.menu.errors.saveFailed);
      }
    }
  };

  const summary = menuSummary(items);
  const filteredItems = filterItems(items, filter);
  const groups = groupByCategory(filteredItems);
  const categories = categoryOptions(items);

  return (
    <div className="page-content menu-manager">
      <h1 className="page-title">{MESSAGES.nav.menu}</h1>

      {loading ? (
        <Loader />
      ) : loadError && items.length === 0 ? (
        <div className="error-container">
          <ErrorMessage>{MESSAGES.owner.menu.errors.loadFailed}</ErrorMessage>
          <Button variant="primary" onClick={loadMenu}>
            {MESSAGES.common.tryAgain}
          </Button>
        </div>
      ) : (
        <>
          {loadError && (
            <div className="error-container">
              <ErrorMessage>{MESSAGES.owner.menu.errors.loadFailed}</ErrorMessage>
              <Button variant="primary" onClick={loadMenu}>
                {MESSAGES.common.tryAgain}
              </Button>
            </div>
          )}

          {statusMessage && (
            <div role="status" className="status-note">
              {statusMessage}
            </div>
          )}

          {pageError && <ErrorMessage>{pageError}</ErrorMessage>}

          <p className="page-lead">{MESSAGES.owner.menu.summary(summary)}</p>

          <div className="toolbar">
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                clearAlerts();
                setActiveModal({ type: 'add' });
              }}
            >
              {MESSAGES.owner.menu.addDish}
            </Button>

            <div
              className="filter-group"
              role="group"
              aria-label={MESSAGES.owner.menu.filterGroupLabel}
            >
              {MENU_FILTERS.map((f) => {
                const isPressed = filter === f;
                const label =
                  f === 'all'
                    ? MESSAGES.owner.menu.filterAll(summary.total)
                    : f === 'review'
                    ? MESSAGES.owner.menu.filterReview(summary.review)
                    : MESSAGES.owner.menu.filterHidden(summary.hidden);
                return (
                  <Button
                    key={f}
                    variant={isPressed ? 'primary' : 'ghost'}
                    aria-pressed={isPressed ? 'true' : 'false'}
                    disabled={busy}
                    onClick={() => setFilter(f)}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          </div>

          {items.length === 0 ? (
            <p className="empty-state">{MESSAGES.owner.menu.emptyState}</p>
          ) : filteredItems.length === 0 ? (
            <p className="empty-state">{MESSAGES.owner.menu.emptyFilterState}</p>
          ) : (
            <div className="menu-sections">
              {groups.map((group) => (
                <section key={group.category} className="menu-section">
                  <h2 className="section-title">{group.category}</h2>
                  <div className="dish-grid">
                    {group.items.map((dish) => {
                      const dishNeedsReview = needsReview(dish);
                      const dishHidden = isHidden(dish);
                      const unrecognised = unknownAllergens(dish.allergens);
                      const hasBadTags =
                        unrecognised === null || unrecognised.length > 0;
                      const hasNoAllergens =
                        Array.isArray(dish.allergens) &&
                        dish.allergens.length === 0;

                      return (
                        <article key={dish.id} className="dish-card">
                          <div className="dish-card-header">
                            <h3 className="dish-name">{dish.name}</h3>
                            <span className="dish-price">
                              {formatPrice(dish.price)}
                            </span>
                          </div>

                          <div className="dish-meta">
                            <span className="dish-course">
                              {OPTION_LABELS.course[dish.course] || dish.course}
                            </span>
                            <span className="dish-meta-sep">·</span>
                            <span className="dish-cuisine">{dish.cuisine}</span>
                            <span className="dish-meta-sep">·</span>
                            <span className="dish-diet">
                              {dish.isVeg
                                ? MESSAGES.owner.menu.vegetarian
                                : MESSAGES.owner.menu.nonVegetarian}
                            </span>
                          </div>

                          {dish.description && (
                            <p className="dish-description">{dish.description}</p>
                          )}

                          <div className="dish-allergens-chips">
                            {hasBadTags ? (
                              <span className="chip chip--alert">
                                {MESSAGES.owner.menu.chipUnknownAllergens}
                              </span>
                            ) : hasNoAllergens ? (
                              <span className="chip">
                                {MESSAGES.owner.menu.chipNoAllergens}
                              </span>
                            ) : (
                              dish.allergens.map((tag) => {
                                const found = ALLERGENS.find(
                                  (a) => a.value === tag
                                );
                                return (
                                  <span key={tag} className="chip">
                                    {found ? found.label : tag}
                                  </span>
                                );
                              })
                            )}
                          </div>

                          <div className="dish-status-chips">
                            {dish.allergensConfirmed === true ? (
                              <span className="chip chip--ok">
                                {MESSAGES.owner.menu.chipConfirmed}
                              </span>
                            ) : dishNeedsReview ? (
                              <span className="chip chip--alert">
                                {MESSAGES.owner.menu.chipNeedsReview}
                              </span>
                            ) : null}

                            {dishHidden && (
                              <span className="chip chip--muted">
                                {MESSAGES.owner.menu.chipHidden}
                              </span>
                            )}
                          </div>

                          <div className="dish-actions">
                            <Button
                              variant="ghost"
                              disabled={busy}
                              onClick={() => {
                                clearAlerts();
                                setActiveModal({ type: 'edit', item: dish });
                              }}
                              aria-label={MESSAGES.owner.menu.actions.edit(
                                dish.name
                              )}
                            >
                              {MESSAGES.owner.menu.actions.edit(dish.name)}
                            </Button>

                            {dishNeedsReview && (
                              <Button
                                variant="ghost"
                                disabled={busy}
                                onClick={() => {
                                  clearAlerts();
                                  setActiveModal({
                                    type: 'review',
                                    item: dish,
                                  });
                                }}
                                aria-label={MESSAGES.owner.menu.actions.review(
                                  dish.name
                                )}
                              >
                                {MESSAGES.owner.menu.actions.review(dish.name)}
                              </Button>
                            )}

                            <Button
                              variant="ghost"
                              disabled={busy}
                              onClick={() => handleToggleAvailability(dish)}
                              aria-label={
                                dishHidden
                                  ? MESSAGES.owner.menu.actions.show(dish.name)
                                  : MESSAGES.owner.menu.actions.hide(dish.name)
                              }
                            >
                              {dishHidden
                                ? MESSAGES.owner.menu.actions.show(dish.name)
                                : MESSAGES.owner.menu.actions.hide(dish.name)}
                            </Button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add Modal */}
      {activeModal?.type === 'add' && (
        <Modal
          title={MESSAGES.owner.menu.modalAddTitle}
          busy={busy}
          onClose={() => {
            if (!busy) setActiveModal(null);
          }}
        >
          {modalError && <ErrorMessage>{modalError}</ErrorMessage>}
          <MenuForm
            mode="create"
            categories={categories}
            submitting={busy}
            onSubmit={handleAddSubmit}
            onCancel={() => setActiveModal(null)}
          />
        </Modal>
      )}

      {/* Edit Modal */}
      {activeModal?.type === 'edit' && activeModal.item && (
        <Modal
          title={MESSAGES.owner.menu.modalEditTitle(activeModal.item.name)}
          busy={busy}
          onClose={() => {
            if (!busy) setActiveModal(null);
          }}
        >
          {modalError && <ErrorMessage>{modalError}</ErrorMessage>}
          <MenuForm
            mode="edit"
            item={activeModal.item}
            categories={categories}
            submitting={busy}
            onSubmit={handleEditSubmit}
            onCancel={() => setActiveModal(null)}
          />
        </Modal>
      )}

      {/* Review Modal */}
      {activeModal?.type === 'review' && activeModal.item && (
        <Modal
          title={MESSAGES.owner.menu.modalReviewTitle(activeModal.item.name)}
          busy={busy}
          onClose={() => {
            if (!busy) setActiveModal(null);
          }}
        >
          {modalError && <ErrorMessage>{modalError}</ErrorMessage>}
          <AllergenTagReview
            item={activeModal.item}
            submitting={busy}
            onConfirm={handleReviewConfirm}
            onCancel={() => setActiveModal(null)}
          />
        </Modal>
      )}
    </div>
  );
};

export default MenuManager;
