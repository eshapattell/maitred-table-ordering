// AllergyForm.jsx: Allergy declaration form for guests
import React, { useState, useId } from 'react';
import { ALLERGENS } from '../../utils/allergens.js';
import { validateAllergyAnswer } from '../../utils/guestAllergies.js';
import Button from '../Common/Button.jsx';
import ErrorMessage from '../Common/ErrorMessage.jsx';
import { MESSAGES } from '../../utils/messages.js';

export const AllergyForm = ({
  onSubmit,
  submitting = false,
  error: serverError = null,
  onCancel,
}) => {
  const [ticked, setTicked] = useState([]);
  const [hasNoAllergies, setHasNoAllergies] = useState(false);
  const [formError, setFormError] = useState(null);

  const legendId = useId();
  const errorId = `${legendId}-error`;

  const handleAllergyToggle = (value, checked) => {
    setFormError(null);
    setHasNoAllergies(false);
    setTicked((prev) => (checked ? [...prev, value] : prev.filter((item) => item !== value)));
  };

  const handleNoneToggle = (checked) => {
    setFormError(null);
    setHasNoAllergies(checked);
    if (checked) {
      setTicked([]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;

    const validation = validateAllergyAnswer({
      allergens: ticked,
      none: hasNoAllergies,
    });

    if (!validation.valid) {
      setFormError(validation.error);
      return;
    }

    setFormError(null);
    if (onSubmit) {
      onSubmit(validation.allergies);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="allergy-form">
      <h2 className="allergy-title">Before you see the menu</h2>
      <p className="allergy-intro">
        Tell us about any allergies so we can mark the dishes that are not safe for you. We cannot know about allergies you do not tell us.
      </p>

      {serverError && <ErrorMessage>{serverError}</ErrorMessage>}

      <fieldset
        className="field-group allergy-fieldset"
        aria-describedby={formError ? errorId : undefined}
      >
        <legend id={legendId} className="field-label">
          Your allergies
        </legend>

        <div className="checkbox-grid">
          {ALLERGENS.map(({ value, label }) => (
            <label key={value} className="check-label">
              <input
                type="checkbox"
                checked={ticked.includes(value)}
                onChange={(e) => handleAllergyToggle(value, e.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>

        <div className="checkbox-single none-checkbox-wrap">
          <label className="check-label">
            <input
              type="checkbox"
              checked={hasNoAllergies}
              onChange={(e) => handleNoneToggle(e.target.checked)}
            />
            I have no allergies
          </label>
        </div>

        {formError && (
          <div id={errorId} role="alert" className="field-error">
            {formError}
          </div>
        )}
      </fieldset>

      <p className="staff-help-note">
        If you are unsure about a dish, please ask a member of staff.
      </p>

      <div className="allergy-actions">
        <Button
          type="submit"
          variant="primary"
          disabled={submitting}
          aria-busy={submitting ? 'true' : undefined}
          className="btn--full"
        >
          Show me the menu
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            disabled={submitting}
            onClick={onCancel}
            className="btn--full"
          >
            {MESSAGES.guest.backToMenu}
          </Button>
        )}
      </div>
    </form>
  );
};

export default AllergyForm;

