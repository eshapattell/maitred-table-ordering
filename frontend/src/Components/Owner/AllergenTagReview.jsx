// AllergenTagReview.jsx: Review and confirm stored dish allergens
import React, { useState } from 'react';
import Button from '../Common/Button.jsx';
import ErrorMessage from '../Common/ErrorMessage.jsx';
import { ALLERGENS } from '../../utils/allergens.js';
import { unknownAllergens } from '../../utils/menuForm.js';
import { MESSAGES } from '../../utils/messages.js';

export const AllergenTagReview = ({
  item,
  submitting = false,
  onConfirm,
  onCancel,
}) => {
  const [confirmedChecked, setConfirmedChecked] = useState(false);

  const allergensList = Array.isArray(item?.allergens) ? item.allergens : null;
  const unrecognised = unknownAllergens(item?.allergens);
  const isUnreadable = unrecognised === null || unrecognised.length > 0;
  const isEmpty = allergensList !== null && allergensList.length === 0;

  const handleConfirm = () => {
    if (onConfirm && !isUnreadable && confirmedChecked) {
      onConfirm([...(item?.allergens || [])]);
    }
  };

  return (
    <div className="allergen-tag-review">
      <h3 className="review-dish-name">{item?.name}</h3>
      {item?.description && (
        <p className="review-dish-desc">{item.description}</p>
      )}

      {isUnreadable ? (
        <ErrorMessage>{MESSAGES.owner.menu.reviewUnknownTags}</ErrorMessage>
      ) : isEmpty ? (
        <p className="field-hint review-empty-hint">
          {MESSAGES.owner.menu.reviewEmptyList}
        </p>
      ) : (
        <ul className="allergen-tags-list">
          {allergensList.map((tag, idx) => {
            const found = ALLERGENS.find((a) => a.value === tag);
            const label = found ? found.label : tag;
            return <li key={idx} className="allergen-tag-item">{label}</li>;
          })}
        </ul>
      )}

      <div className="review-confirm-checkbox">
        <label className="check-label">
          <input
            type="checkbox"
            checked={confirmedChecked}
            disabled={submitting || isUnreadable}
            onChange={(e) => setConfirmedChecked(e.target.checked)}
          />
          {MESSAGES.owner.menu.reviewCheckbox}
        </label>
      </div>

      <div className="form-actions">
        <Button
          variant="primary"
          disabled={!confirmedChecked || submitting || isUnreadable}
          loading={submitting}
          onClick={handleConfirm}
        >
          {MESSAGES.owner.menu.actions.confirm}
        </Button>
        <Button
          variant="ghost"
          disabled={submitting}
          onClick={onCancel}
        >
          {MESSAGES.common.cancel}
        </Button>
      </div>
    </div>
  );
};

export default AllergenTagReview;
