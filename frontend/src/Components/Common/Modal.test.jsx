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

  test('6. focus moves in on mount and returns to previously active element on close', () => {
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

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    // First focusable element inside the modal is the Close button in the header
    expect(document.activeElement).toBe(closeBtn);

    unmount();
    expect(document.activeElement).toBe(triggerButton);
    document.body.removeChild(triggerButton);
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
    const btnB = screen.getByTestId('btn-b');

    // Currently at closeBtn (the first focusable element)
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
});
