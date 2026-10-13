// MenuForm.jsx: Owner dish create and edit form with allergen validation
import React, { useState, useId, useRef } from 'react';
import Button from '../Common/Button.jsx';
import ErrorMessage from '../Common/ErrorMessage.jsx';
import { ALLERGENS } from '../../utils/allergens.js';
import {
  COURSES,
  PORTION_SIZES,
  FLAVOUR_TAGS,
  SPICE_LEVELS,
  OPTION_LABELS,
} from '../../utils/menuOptions.js';
import {
  emptyMenuForm,
  menuFormFromItem,
  validateMenuForm,
  unknownAllergens,
} from '../../utils/menuForm.js';
import { MESSAGES } from '../../utils/messages.js';

export const MenuForm = ({
  mode = 'create',
  item = null,
  categories = [],
  submitting = false,
  onSubmit,
  onCancel,
}) => {
  const [values, setValues] = useState(() =>
    mode === 'edit' && item ? menuFormFromItem(item) : emptyMenuForm()
  );
  const [errors, setErrors] = useState({});

  const nameId = useId();
  const descId = useId();
  const priceId = useId();
  const categoryId = useId();
  const datalistId = useId();
  const courseId = useId();
  const cuisineId = useId();
  const portionId = useId();
  const prepId = useId();
  const spiceId = useId();
  const vegId = useId();
  const nonVegId = useId();
  const allergensLegendId = useId();
  const flavoursLegendId = useId();

  const fieldRefs = {
    name: useRef(null),
    description: useRef(null),
    price: useRef(null),
    category: useRef(null),
    isVeg: useRef(null),
    allergens: useRef(null),
    spiceLevel: useRef(null),
    flavourTags: useRef(null),
    cuisine: useRef(null),
    course: useRef(null),
    portionSize: useRef(null),
    prepMinutes: useRef(null),
  };

  const hasUnknownAllergens =
    mode === 'edit' &&
    item &&
    (unknownAllergens(item.allergens) === null ||
      unknownAllergens(item.allergens).length > 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    const result = validateMenuForm(values);
    if (!result.valid) {
      setErrors(result.errors);
      const fieldOrder = [
        'name',
        'description',
        'price',
        'category',
        'isVeg',
        'allergens',
        'spiceLevel',
        'flavourTags',
        'cuisine',
        'course',
        'portionSize',
        'prepMinutes',
      ];
      const firstInvalidField = fieldOrder.find((field) => result.errors[field]);
      if (firstInvalidField && fieldRefs[firstInvalidField]?.current) {
        fieldRefs[firstInvalidField].current.focus();
      }
      return;
    }

    setErrors({});
    if (onSubmit) {
      onSubmit(result.payload);
    }
  };

  const clearFieldError = (field) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const { [field]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const handleFieldChange = (field, value) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    clearFieldError(field);
  };

  const handleAllergenToggle = (tag, checked) => {
    setValues((prev) => {
      const nextAllergens = checked
        ? [...prev.allergens, tag]
        : prev.allergens.filter((t) => t !== tag);
      return {
        ...prev,
        allergens: nextAllergens,
        noAllergens: false,
      };
    });
    clearFieldError('allergens');
  };

  const handleNoneToggle = (checked) => {
    setValues((prev) => ({
      ...prev,
      noAllergens: checked,
      allergens: checked ? [] : prev.allergens,
    }));
    clearFieldError('allergens');
  };

  const handleFlavourToggle = (tag, checked) => {
    setValues((prev) => {
      const nextFlavours = checked
        ? [...prev.flavourTags, tag]
        : prev.flavourTags.filter((t) => t !== tag);
      return {
        ...prev,
        flavourTags: nextFlavours,
      };
    });
    clearFieldError('flavourTags');
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="menu-form">
      {hasUnknownAllergens && (
        <ErrorMessage>{MESSAGES.owner.menu.reviewUnknownTags}</ErrorMessage>
      )}

      {/* Name */}
      <div className="field">
        <label htmlFor={nameId} className="field-label">
          {MESSAGES.owner.menu.fields.name}
        </label>
        <input
          ref={fieldRefs.name}
          id={nameId}
          type="text"
          className="field-input"
          value={values.name}
          aria-invalid={errors.name ? 'true' : undefined}
          aria-describedby={errors.name ? `${nameId}-error` : undefined}
          onChange={(e) => handleFieldChange('name', e.target.value)}
        />
        {errors.name && (
          <div id={`${nameId}-error`} role="alert" className="field-error">
            {errors.name}
          </div>
        )}
      </div>

      {/* Description */}
      <div className="field">
        <label htmlFor={descId} className="field-label">
          {MESSAGES.owner.menu.fields.description}
        </label>
        <textarea
          ref={fieldRefs.description}
          id={descId}
          className="field-input field-textarea"
          value={values.description}
          aria-invalid={errors.description ? 'true' : undefined}
          aria-describedby={errors.description ? `${descId}-error` : undefined}
          onChange={(e) => handleFieldChange('description', e.target.value)}
        />
        {errors.description && (
          <div id={`${descId}-error`} role="alert" className="field-error">
            {errors.description}
          </div>
        )}
      </div>

      {/* Price */}
      <div className="field">
        <label htmlFor={priceId} className="field-label">
          {MESSAGES.owner.menu.fields.price}
        </label>
        <input
          ref={fieldRefs.price}
          id={priceId}
          type="text"
          inputMode="numeric"
          className="field-input"
          value={values.price}
          aria-invalid={errors.price ? 'true' : undefined}
          aria-describedby={errors.price ? `${priceId}-error` : undefined}
          onChange={(e) => handleFieldChange('price', e.target.value)}
        />
        {errors.price && (
          <div id={`${priceId}-error`} role="alert" className="field-error">
            {errors.price}
          </div>
        )}
      </div>

      {/* Section (Category) */}
      <div className="field">
        <label htmlFor={categoryId} className="field-label">
          {MESSAGES.owner.menu.fields.category}
        </label>
        <input
          ref={fieldRefs.category}
          id={categoryId}
          type="text"
          list={datalistId}
          className="field-input"
          value={values.category}
          aria-invalid={errors.category ? 'true' : undefined}
          aria-describedby={errors.category ? `${categoryId}-error` : undefined}
          onChange={(e) => handleFieldChange('category', e.target.value)}
        />
        <datalist id={datalistId}>
          {categories.map((cat) => (
            <option key={cat} value={cat} />
          ))}
        </datalist>
        {errors.category && (
          <div id={`${categoryId}-error`} role="alert" className="field-error">
            {errors.category}
          </div>
        )}
      </div>

      {/* Course */}
      <div className="field">
        <label htmlFor={courseId} className="field-label">
          {MESSAGES.owner.menu.fields.course}
        </label>
        <select
          ref={fieldRefs.course}
          id={courseId}
          className="field-input"
          value={values.course}
          aria-invalid={errors.course ? 'true' : undefined}
          aria-describedby={errors.course ? `${courseId}-error` : undefined}
          onChange={(e) => handleFieldChange('course', e.target.value)}
        >
          <option value="">{MESSAGES.owner.menu.fields.coursePlaceholder}</option>
          {COURSES.map((c) => (
            <option key={c} value={c}>
              {OPTION_LABELS.course[c]}
            </option>
          ))}
        </select>
        {errors.course && (
          <div id={`${courseId}-error`} role="alert" className="field-error">
            {errors.course}
          </div>
        )}
      </div>

      {/* Cuisine */}
      <div className="field">
        <label htmlFor={cuisineId} className="field-label">
          {MESSAGES.owner.menu.fields.cuisine}
        </label>
        <input
          ref={fieldRefs.cuisine}
          id={cuisineId}
          type="text"
          className="field-input"
          value={values.cuisine}
          aria-invalid={errors.cuisine ? 'true' : undefined}
          aria-describedby={errors.cuisine ? `${cuisineId}-error` : undefined}
          onChange={(e) => handleFieldChange('cuisine', e.target.value)}
        />
        {errors.cuisine && (
          <div id={`${cuisineId}-error`} role="alert" className="field-error">
            {errors.cuisine}
          </div>
        )}
      </div>

      {/* Portion size */}
      <div className="field">
        <label htmlFor={portionId} className="field-label">
          {MESSAGES.owner.menu.fields.portionSize}
        </label>
        <select
          ref={fieldRefs.portionSize}
          id={portionId}
          className="field-input"
          value={values.portionSize}
          aria-invalid={errors.portionSize ? 'true' : undefined}
          aria-describedby={errors.portionSize ? `${portionId}-error` : undefined}
          onChange={(e) => handleFieldChange('portionSize', e.target.value)}
        >
          {PORTION_SIZES.map((ps) => (
            <option key={ps} value={ps}>
              {OPTION_LABELS.portionSize[ps]}
            </option>
          ))}
        </select>
        {errors.portionSize && (
          <div id={`${portionId}-error`} role="alert" className="field-error">
            {errors.portionSize}
          </div>
        )}
      </div>

      {/* Prep minutes */}
      <div className="field">
        <label htmlFor={prepId} className="field-label">
          {MESSAGES.owner.menu.fields.prepMinutes}
        </label>
        <input
          ref={fieldRefs.prepMinutes}
          id={prepId}
          type="text"
          inputMode="numeric"
          className="field-input"
          value={values.prepMinutes}
          aria-invalid={errors.prepMinutes ? 'true' : undefined}
          aria-describedby={errors.prepMinutes ? `${prepId}-error` : undefined}
          onChange={(e) => handleFieldChange('prepMinutes', e.target.value)}
        />
        {errors.prepMinutes && (
          <div id={`${prepId}-error`} role="alert" className="field-error">
            {errors.prepMinutes}
          </div>
        )}
      </div>

      {/* Spice level */}
      <div className="field">
        <label htmlFor={spiceId} className="field-label">
          {MESSAGES.owner.menu.fields.spiceLevel}
        </label>
        <select
          ref={fieldRefs.spiceLevel}
          id={spiceId}
          className="field-input"
          value={values.spiceLevel}
          aria-invalid={errors.spiceLevel ? 'true' : undefined}
          aria-describedby={errors.spiceLevel ? `${spiceId}-error` : undefined}
          onChange={(e) => handleFieldChange('spiceLevel', e.target.value)}
        >
          {SPICE_LEVELS.map((lvl) => (
            <option key={lvl} value={String(lvl)}>
              {lvl} - {OPTION_LABELS.spice[lvl]}
            </option>
          ))}
        </select>
        {errors.spiceLevel && (
          <div id={`${spiceId}-error`} role="alert" className="field-error">
            {errors.spiceLevel}
          </div>
        )}
      </div>

      {/* Vegetarian / Non-vegetarian */}
      <fieldset className="field-group">
        <legend className="field-label">{MESSAGES.owner.menu.fields.diet}</legend>
        <div className="radio-group">
          <label className="check-label">
            <input
              ref={fieldRefs.isVeg}
              id={vegId}
              type="radio"
              name="isVeg"
              checked={values.isVeg === true}
              aria-invalid={errors.isVeg ? 'true' : undefined}
              aria-describedby={errors.isVeg ? `${vegId}-error` : undefined}
              onChange={() => handleFieldChange('isVeg', true)}
            />
            {MESSAGES.owner.menu.vegetarian}
          </label>
          <label className="check-label">
            <input
              id={nonVegId}
              type="radio"
              name="isVeg"
              checked={values.isVeg === false}
              aria-invalid={errors.isVeg ? 'true' : undefined}
              aria-describedby={errors.isVeg ? `${vegId}-error` : undefined}
              onChange={() => handleFieldChange('isVeg', false)}
            />
            {MESSAGES.owner.menu.nonVegetarian}
          </label>
        </div>
        {errors.isVeg && (
          <div id={`${vegId}-error`} role="alert" className="field-error">
            {errors.isVeg}
          </div>
        )}
      </fieldset>

      {/* Flavours */}
      <fieldset
        className="field-group"
        aria-describedby={errors.flavourTags ? `${flavoursLegendId}-error` : undefined}
      >
        <legend id={flavoursLegendId} className="field-label">
          {MESSAGES.owner.menu.fields.flavours}
        </legend>
        <div className="checkbox-grid">
          {FLAVOUR_TAGS.map((tag, idx) => (
            <label key={tag} className="check-label">
              <input
                ref={idx === 0 ? fieldRefs.flavourTags : undefined}
                type="checkbox"
                checked={values.flavourTags.includes(tag)}
                onChange={(e) => handleFlavourToggle(tag, e.target.checked)}
              />
              {OPTION_LABELS.flavour[tag]}
            </label>
          ))}
        </div>
        {errors.flavourTags && (
          <div id={`${flavoursLegendId}-error`} role="alert" className="field-error">
            {errors.flavourTags}
          </div>
        )}
      </fieldset>

      {/* Allergens fieldset */}
      <fieldset
        className="field-group allergens-fieldset"
        aria-describedby={errors.allergens ? `${allergensLegendId}-error` : undefined}
      >
        <legend id={allergensLegendId} className="field-label">
          {MESSAGES.owner.menu.fields.allergensLegend}
        </legend>
        <p className="field-hint">{MESSAGES.owner.menu.allergenHint}</p>
        <div className="checkbox-grid">
          {ALLERGENS.map(({ value, label }, index) => (
            <label key={value} className="check-label">
              <input
                ref={index === 0 ? fieldRefs.allergens : undefined}
                type="checkbox"
                checked={values.allergens.includes(value)}
                onChange={(e) => handleAllergenToggle(value, e.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="checkbox-single">
          <label className="check-label none-check-label">
            <input
              type="checkbox"
              checked={values.noAllergens}
              onChange={(e) => handleNoneToggle(e.target.checked)}
            />
            {MESSAGES.owner.menu.noneCheckbox}
          </label>
        </div>
        {errors.allergens && (
          <div
            id={`${allergensLegendId}-error`}
            role="alert"
            className="field-error"
          >
            {errors.allergens}
          </div>
        )}
      </fieldset>

      {/* Form buttons */}
      <div className="form-actions">
        <Button
          type="submit"
          variant="primary"
          loading={submitting}
          disabled={submitting}
        >
          {mode === 'create'
            ? MESSAGES.owner.menu.addDishSubmit
            : MESSAGES.owner.menu.saveChangesSubmit}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={submitting}
          onClick={onCancel}
        >
          {MESSAGES.common.cancel}
        </Button>
      </div>
    </form>
  );
};

export default MenuForm;
