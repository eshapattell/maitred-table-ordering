import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AllergyForm from './AllergyForm.jsx';
import { ALLERGENS } from '../../utils/allergens.js';
import { ALLERGY_MESSAGES } from '../../utils/guestAllergies.js';

describe('AllergyForm component', () => {
  test('1. renders ten labelled allergen checkboxes and "I have no allergies"', () => {
    render(<AllergyForm onSubmit={vi.fn()} />);

    for (const { label } of ALLERGENS) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByLabelText('I have no allergies')).toBeInTheDocument();
  });

  test('2. both exact sentences are present in the document', () => {
    render(<AllergyForm onSubmit={vi.fn()} />);

    expect(
      screen.getByText(
        'Tell us about any allergies so we can mark the dishes that are not safe for you. We cannot know about allergies you do not tell us.'
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        'If you are unsure about a dish, please ask a member of staff.'
      )
    ).toBeInTheDocument();
  });

  test('3. ticking "I have no allergies" unchecks any previously checked allergies', () => {
    render(<AllergyForm onSubmit={vi.fn()} />);

    const peanutCheckbox = screen.getByLabelText('Peanut');
    const dairyCheckbox = screen.getByLabelText('Dairy');
    const noneCheckbox = screen.getByLabelText('I have no allergies');

    fireEvent.click(peanutCheckbox);
    fireEvent.click(dairyCheckbox);
    expect(peanutCheckbox).toBeChecked();
    expect(dairyCheckbox).toBeChecked();

    fireEvent.click(noneCheckbox);
    expect(noneCheckbox).toBeChecked();
    expect(peanutCheckbox).not.toBeChecked();
    expect(dairyCheckbox).not.toBeChecked();
  });

  test('4. ticking an allergen clears "I have no allergies"', () => {
    render(<AllergyForm onSubmit={vi.fn()} />);

    const noneCheckbox = screen.getByLabelText('I have no allergies');
    const soyCheckbox = screen.getByLabelText('Soy');

    fireEvent.click(noneCheckbox);
    expect(noneCheckbox).toBeChecked();

    fireEvent.click(soyCheckbox);
    expect(soyCheckbox).toBeChecked();
    expect(noneCheckbox).not.toBeChecked();
  });

  test('5. blank submit shows the "unanswered" message and sends nothing', () => {
    const handleSubmit = vi.fn();
    render(<AllergyForm onSubmit={handleSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show me the menu' }));

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(ALLERGY_MESSAGES.unanswered)).toBeInTheDocument();
  });

  test('6. a valid submit with allergens sends the canonical array', () => {
    const handleSubmit = vi.fn();
    render(<AllergyForm onSubmit={handleSubmit} />);

    // Tick Mustard (last in list) then Dairy (3rd in list)
    fireEvent.click(screen.getByLabelText('Mustard'));
    fireEvent.click(screen.getByLabelText('Dairy'));

    fireEvent.click(screen.getByRole('button', { name: 'Show me the menu' }));

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    // Canonical order in allergens.js: dairy comes before mustard
    expect(handleSubmit).toHaveBeenCalledWith(['dairy', 'mustard']);
  });

  test('7. "none" sends []', () => {
    const handleSubmit = vi.fn();
    render(<AllergyForm onSubmit={handleSubmit} />);

    fireEvent.click(screen.getByLabelText('I have no allergies'));
    fireEvent.click(screen.getByRole('button', { name: 'Show me the menu' }));

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(handleSubmit).toHaveBeenCalledWith([]);
  });

  test('8. error clears on toggling any checkbox', () => {
    render(<AllergyForm onSubmit={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show me the menu' }));
    expect(screen.getByText(ALLERGY_MESSAGES.unanswered)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Gluten'));
    expect(screen.queryByText(ALLERGY_MESSAGES.unanswered)).toBeNull();
  });

  test('9. submitting state disables button and sets aria-busy', () => {
    render(<AllergyForm onSubmit={vi.fn()} submitting={true} />);

    const btn = screen.getByRole('button', { name: 'Show me the menu' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  test('10. server error is displayed in an alert', () => {
    render(
      <AllergyForm
        onSubmit={vi.fn()}
        error="You must be approved by the host first"
      />
    );

    expect(
      screen.getByText('You must be approved by the host first')
    ).toBeInTheDocument();
  });
});
