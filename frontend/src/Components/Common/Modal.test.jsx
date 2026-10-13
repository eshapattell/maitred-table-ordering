import React, { useState } from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from './Modal.jsx';

describe('Modal component', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  test('1. accessible name is linked to title heading via aria-labelledby', () => {
    render(
      <Modal title="Edit Item" onClose={vi.fn()}>
        <p>Modal content</p>
      </Modal>
    );

    const dialog = screen.getByRole('dialog', { name: 'Edit Item' });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const heading = screen.getByRole('heading', { level: 2, name: 'Edit Item' });
    expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);
  });

  test('2. Escape key calls onClose', () => {
    const handleClose = vi.fn();
    render(
      <Modal title="Confirmation" onClose={handleClose}>
        <p>Are you sure?</p>
      </Modal>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  test('3. click on backdrop calls onClose', () => {
    const handleClose = vi.fn();
    render(
      <Modal title="Confirmation" onClose={handleClose}>
        <p>Are you sure?</p>
      </Modal>
    );

    const backdrop = screen.getByTestId('modal-backdrop');
    fireEvent.click(backdrop);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  test('4. click inside dialog does not call onClose', () => {
    const handleClose = vi.fn();
    render(
      <Modal title="Confirmation" onClose={handleClose}>
        <button type="button">Inside Button</button>
      </Modal>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Inside Button' }));
    expect(handleClose).not.toHaveBeenCalled();
  });

  test('5. busy blocks Escape, backdrop click, and close button', () => {
    const handleClose = vi.fn();
    render(
      <Modal title="Saving..." onClose={handleClose} busy={true}>
        <p>Please wait</p>
      </Modal>
    );

    // Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).not.toHaveBeenCalled();

    // Backdrop click
    const backdrop = screen.getByTestId('modal-backdrop');
    fireEvent.click(backdrop);
    expect(handleClose).not.toHaveBeenCalled();

    // Close button click
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    expect(closeBtn).toBeDisabled();
    fireEvent.click(closeBtn);
    expect(handleClose).not.toHaveBeenCalled();
  });

  test('6. with a body that holds an input the input is focused, and focus returns to trigger on unmount', () => {
    const triggerButton = document.createElement('button');
    triggerButton.textContent = 'Open Dialog';
    document.body.appendChild(triggerButton);
    triggerButton.focus();
    expect(document.activeElement).toBe(triggerButton);

    const { unmount } = render(
      <Modal title="Dialog Focus" onClose={vi.fn()}>
        <input data-testid="first-input" />
        <button type="button">Inside</button>
      </Modal>
    );

    const input = screen.getByTestId('first-input');
    expect(document.activeElement).toBe(input);

    unmount();
    expect(document.activeElement).toBe(triggerButton);
    document.body.removeChild(triggerButton);
  });

  test('6b. with no focusable body content the Close button is focused', () => {
    render(
      <Modal title="No Focusable Content" onClose={vi.fn()}>
        <p>Just text content</p>
      </Modal>
    );

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    expect(document.activeElement).toBe(closeBtn);
  });

  test('7. Tab and Shift+Tab wrap focus inside dialog', () => {
    render(
      <Modal title="Wrap Test" onClose={vi.fn()}>
        <button type="button" data-testid="btn-a">
          Button A
        </button>
        <button type="button" data-testid="btn-b">
          Button B
        </button>
      </Modal>
    );

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    const btnA = screen.getByTestId('btn-a');
    const btnB = screen.getByTestId('btn-b');

    // On mount, btnA (first element in body) is focused
    expect(document.activeElement).toBe(btnA);

    // Focus closeBtn (first focusable element in dialog) to test Shift+Tab wrap
    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab from first element wraps to last element (btnB)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(btnB);

    // Tab from last element wraps to first element (closeBtn)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(closeBtn);
  });

  test('8. body scroll lock is applied on mount and previous value is restored on close', () => {
    document.body.style.overflow = 'auto';

    const { unmount } = render(
      <Modal title="Scroll Lock" onClose={vi.fn()}>
        <p>Locked</p>
      </Modal>
    );

    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  test('9. rendered under document.body via portal', () => {
    const { container } = render(
      <div data-testid="parent">
        <Modal title="Portal Test" onClose={vi.fn()}>
          <p>Portal content</p>
        </Modal>
      </div>
    );

    const parent = screen.getByTestId('parent');
    expect(parent.querySelector('[role="dialog"]')).toBeNull();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(document.body.contains(dialog)).toBe(true);
  });

  test('10. focuses data-autofocus element when present inside dialog', () => {
    render(
      <Modal title="Autofocus Test" onClose={vi.fn()}>
        <button type="button" data-testid="first-btn">
          First Button
        </button>
        <button type="button" data-autofocus="true" data-testid="cancel-btn">
          Cancel Button
        </button>
      </Modal>
    );

    const cancelBtn = screen.getByTestId('cancel-btn');
    expect(document.activeElement).toBe(cancelBtn);
  });

  test('11. falls back to first focusable element when no data-autofocus present', () => {
    render(
      <Modal title="Fallback Test" onClose={vi.fn()}>
        <button type="button" data-testid="first-btn">
          First Button
        </button>
        <button type="button" data-testid="second-btn">
          Second Button
        </button>
      </Modal>
    );

    const firstBtn = screen.getByTestId('first-btn');
    expect(document.activeElement).toBe(firstBtn);
  });

  test('12. ignores data-autofocus element outside dialog', () => {
    const outsideBtn = document.createElement('button');
    outsideBtn.setAttribute('data-autofocus', 'true');
    outsideBtn.textContent = 'Outside';
    document.body.appendChild(outsideBtn);

    render(
      <Modal title="Outside Autofocus Test" onClose={vi.fn()}>
        <button type="button" data-testid="dialog-first-btn">
          Dialog First Button
        </button>
      </Modal>
    );

    const dialogFirstBtn = screen.getByTestId('dialog-first-btn');
    expect(document.activeElement).toBe(dialogFirstBtn);
    expect(document.activeElement).not.toBe(outsideBtn);

    document.body.removeChild(outsideBtn);
  });
});
