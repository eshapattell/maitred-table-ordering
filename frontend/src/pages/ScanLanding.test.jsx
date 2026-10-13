import React from 'react';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ScanLanding from './ScanLanding.jsx';
import * as guestService from '../services/guestService.js';
import { JOIN_MESSAGES } from '../utils/guestJoin.js';
import { STORAGE_KEYS } from '../utils/constants.js';

vi.mock('../services/guestService.js', () => ({
  joinTable: vi.fn(),
  saveGuestToken: vi.fn(),
  readGuestToken: vi.fn(),
}));

const validRestaurantId = '0123456789abcdef01234567';
const validToken = '1234567890abcdef1234567890abcdef';
const validLink = `/r/${validRestaurantId}/table/4?token=${validToken}`;

const renderWithRoute = (path = validLink) => {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/r/:restaurantId/table/:tableNo" element={<ScanLanding />} />
        <Route path="/table" element={<div data-testid="guest-area">Guest Area</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('ScanLanding page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    guestService.readGuestToken.mockReturnValue('');
  });

  test('1. bad link (invalid restaurantId hex) shows tableNotFound message and no form', () => {
    renderWithRoute(`/r/not-a-valid-hex/table/4?token=${validToken}`);

    expect(screen.getByText(JOIN_MESSAGES.tableNotFound)).toBeInTheDocument();
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.queryByLabelText(/name/i)).toBeNull();
    expect(guestService.joinTable).not.toHaveBeenCalled();
  });

  test('2. bad link (tableNo not integer or out of bounds > 500) shows tableNotFound and no form', () => {
    renderWithRoute(`/r/${validRestaurantId}/table/501?token=${validToken}`);

    expect(screen.getByText(JOIN_MESSAGES.tableNotFound)).toBeInTheDocument();
    expect(screen.queryByLabelText(/name/i)).toBeNull();
  });

  test('3. bad link (token missing or not 32-hex) shows tableNotFound and no form', () => {
    renderWithRoute(`/r/${validRestaurantId}/table/4?token=short`);

    expect(screen.getByText(JOIN_MESSAGES.tableNotFound)).toBeInTheDocument();
    expect(screen.queryByLabelText(/name/i)).toBeNull();
  });

  test('4. form renders with labels, heading and the exact privacy note', () => {
    renderWithRoute();

    expect(screen.getByRole('heading', { level: 1, name: 'Table 4' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your name at the table')).toBeInTheDocument();
    expect(screen.getByLabelText('Mobile number')).toBeInTheDocument();
    expect(screen.getByText('+91')).toBeInTheDocument();
    expect(
      screen.getByText(
        'We use your number only to recognise you at this table. Other guests never see it, and it is erased when the table session ends.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join table' })).toBeInTheDocument();
  });

  test('5. existing token redirects immediately to /table without rendering form', () => {
    guestService.readGuestToken.mockReturnValue('already-stored-token');

    renderWithRoute();

    expect(screen.getByTestId('guest-area')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Table 4' })).toBeNull();
  });

  test('6. a blank submit shows both errors, focuses the name and sends nothing', () => {
    renderWithRoute();

    const nameInput = screen.getByLabelText('Your name at the table');
    const phoneInput = screen.getByLabelText('Mobile number');
    const submitBtn = screen.getByRole('button', { name: 'Join table' });

    fireEvent.click(submitBtn);

    expect(guestService.joinTable).not.toHaveBeenCalled();
    expect(screen.getByText(JOIN_MESSAGES.nicknameMissing)).toBeInTheDocument();
    expect(screen.getByText(JOIN_MESSAGES.phoneMissing)).toBeInTheDocument();
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(phoneInput).toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(nameInput);
  });

  test('7. invalid phone value shows phoneInvalid error message', () => {
    renderWithRoute();

    fireEvent.change(screen.getByLabelText('Your name at the table'), {
      target: { value: 'Aarav' },
    });
    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join table' }));

    expect(screen.getByText(JOIN_MESSAGES.phoneInvalid)).toBeInTheDocument();
    expect(guestService.joinTable).not.toHaveBeenCalled();
  });

  test('8. invalid nickname value shows nicknameInvalid error message', () => {
    renderWithRoute();

    fireEvent.change(screen.getByLabelText('Your name at the table'), {
      target: { value: '??***##' },
    });
    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '98240 79988' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join table' }));

    expect(screen.getByText(JOIN_MESSAGES.nicknameInvalid)).toBeInTheDocument();
    expect(guestService.joinTable).not.toHaveBeenCalled();
  });

  test('9. a valid submit sends exact body with numeric tableNumber, +91 number and Hindi name', async () => {
    guestService.joinTable.mockResolvedValueOnce({
      token: 'jwt-guest-token',
      session: { id: 's1' },
    });

    renderWithRoute();

    fireEvent.change(screen.getByLabelText('Your name at the table'), {
      target: { value: 'रोहन' },
    });
    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '98240 79988' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Join table' }));

    await waitFor(() => {
      expect(guestService.joinTable).toHaveBeenCalledTimes(1);
    });

    expect(guestService.joinTable).toHaveBeenCalledWith({
      restaurantId: validRestaurantId,
      tableNumber: 4,
      qrToken: validToken,
      phone: '+919824079988',
      nickname: 'रोहन',
    });
  });

  test('10. success stores the token, navigates, and sessionStorage holds only guest token key', async () => {
    guestService.joinTable.mockResolvedValueOnce({
      token: 'session-jwt-token-999',
    });
    // Implement real saveGuestToken behavior for this test to inspect storage
    guestService.saveGuestToken.mockImplementationOnce((tok) => {
      sessionStorage.setItem(STORAGE_KEYS.GUEST_TOKEN, tok);
    });

    renderWithRoute();

    fireEvent.change(screen.getByLabelText('Your name at the table'), {
      target: { value: 'Priya' },
    });
    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '9824079988' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Join table' }));

    await waitFor(() => {
      expect(screen.getByTestId('guest-area')).toBeInTheDocument();
    });

    expect(guestService.saveGuestToken).toHaveBeenCalledWith('session-jwt-token-999');
    expect(sessionStorage.getItem(STORAGE_KEYS.GUEST_TOKEN)).toBe('session-jwt-token-999');
    expect(sessionStorage.length).toBe(1);
    // Ensure no phone digits in storage values
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      expect(sessionStorage.getItem(key)).not.toContain('9824079988');
    }
  });

  test('11. server error TABLE_NOT_FOUND shows friendly message and preserves typed values', async () => {
    guestService.joinTable.mockRejectedValueOnce({
      response: {
        status: 404,
        data: { code: 'TABLE_NOT_FOUND', message: 'Table does not exist' },
      },
    });

    renderWithRoute();

    fireEvent.change(screen.getByLabelText('Your name at the table'), {
      target: { value: 'Anita' },
    });
    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '9824079988' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join table' }));

    expect(await screen.findByText(JOIN_MESSAGES.tableNotFound)).toBeInTheDocument();
    expect(screen.queryByText('Table does not exist')).toBeNull();
    expect(screen.getByLabelText('Your name at the table')).toHaveValue('Anita');
    expect(screen.getByLabelText('Mobile number')).toHaveValue('9824079988');
  });

  test('12. server error PHONE_ACTIVE_ELSEWHERE shows friendly message and preserves typed values', async () => {
    guestService.joinTable.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { code: 'PHONE_ACTIVE_ELSEWHERE' },
      },
    });

    renderWithRoute();

    fireEvent.change(screen.getByLabelText('Your name at the table'), {
      target: { value: 'Anita' },
    });
    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '9824079988' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join table' }));

    expect(await screen.findByText(JOIN_MESSAGES.phoneElsewhere)).toBeInTheDocument();
  });

  test('13. server error ALREADY_JOINED shows friendly message and preserves typed values', async () => {
    guestService.joinTable.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { code: 'ALREADY_JOINED' },
      },
    });

    renderWithRoute();

    fireEvent.change(screen.getByLabelText('Your name at the table'), {
      target: { value: 'Anita' },
    });
    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '9824079988' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join table' }));

    expect(await screen.findByText(JOIN_MESSAGES.alreadyJoined)).toBeInTheDocument();
  });

  test('14. server error TABLE_FULL shows friendly message and preserves typed values', async () => {
    guestService.joinTable.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { code: 'TABLE_FULL' },
      },
    });

    renderWithRoute();

    fireEvent.change(screen.getByLabelText('Your name at the table'), {
      target: { value: 'Anita' },
    });
    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '9824079988' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join table' }));

    expect(await screen.findByText(JOIN_MESSAGES.tableFull)).toBeInTheDocument();
  });

  test('15. server error TRY_AGAIN shows friendly message', async () => {
    guestService.joinTable.mockRejectedValueOnce({
      response: {
        status: 503,
        data: { code: 'TRY_AGAIN' },
      },
    });

    renderWithRoute();

    fireEvent.change(screen.getByLabelText('Your name at the table'), {
      target: { value: 'Anita' },
    });
    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '9824079988' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join table' }));

    expect(await screen.findByText(JOIN_MESSAGES.tryAgain)).toBeInTheDocument();
  });

  test('16. server error INVALID_INPUT shows friendly message', async () => {
    guestService.joinTable.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { code: 'INVALID_INPUT' },
      },
    });

    renderWithRoute();

    fireEvent.change(screen.getByLabelText('Your name at the table'), {
      target: { value: 'Anita' },
    });
    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '9824079988' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join table' }));

    expect(await screen.findByText(JOIN_MESSAGES.invalidInput)).toBeInTheDocument();
  });

  test('17. server error 429 too many attempts shows matching wording', async () => {
    guestService.joinTable.mockRejectedValueOnce({
      response: { status: 429 },
    });

    renderWithRoute();

    fireEvent.change(screen.getByLabelText('Your name at the table'), {
      target: { value: 'Anita' },
    });
    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '9824079988' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join table' }));

    expect(await screen.findByText(JOIN_MESSAGES.tooMany)).toBeInTheDocument();
  });

  test('18. server error 500 shows generic message', async () => {
    guestService.joinTable.mockRejectedValueOnce({
      response: { status: 500 },
    });

    renderWithRoute();

    fireEvent.change(screen.getByLabelText('Your name at the table'), {
      target: { value: 'Anita' },
    });
    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '9824079988' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join table' }));

    expect(await screen.findByText(JOIN_MESSAGES.generic)).toBeInTheDocument();
  });

  test('19. plain network error shows network message', async () => {
    guestService.joinTable.mockRejectedValueOnce(new Error('Network Error'));

    renderWithRoute();

    fireEvent.change(screen.getByLabelText('Your name at the table'), {
      target: { value: 'Anita' },
    });
    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '9824079988' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join table' }));

    expect(await screen.findByText(JOIN_MESSAGES.network)).toBeInTheDocument();
  });

  test('20. while request runs button is disabled and aria-busy, and second submit sends nothing', async () => {
    let resolveJoin;
    guestService.joinTable.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveJoin = resolve;
      })
    );

    renderWithRoute();

    fireEvent.change(screen.getByLabelText('Your name at the table'), {
      target: { value: 'Anita' },
    });
    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '9824079988' },
    });

    const submitBtn = screen.getByRole('button', { name: 'Join table' });
    fireEvent.click(submitBtn);

    expect(submitBtn).toBeDisabled();
    expect(submitBtn).toHaveAttribute('aria-busy', 'true');

    // Second click during submission does nothing
    fireEvent.click(submitBtn);
    expect(guestService.joinTable).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      resolveJoin({ token: 'tok' });
    });
  });

  test('21. field errors clear when guest changes respective field', () => {
    renderWithRoute();

    fireEvent.click(screen.getByRole('button', { name: 'Join table' }));
    expect(screen.getByText(JOIN_MESSAGES.nicknameMissing)).toBeInTheDocument();
    expect(screen.getByText(JOIN_MESSAGES.phoneMissing)).toBeInTheDocument();

    // Type in name -> nickname error disappears, phone error stays
    fireEvent.change(screen.getByLabelText('Your name at the table'), {
      target: { value: 'A' },
    });
    expect(screen.queryByText(JOIN_MESSAGES.nicknameMissing)).toBeNull();
    expect(screen.getByText(JOIN_MESSAGES.phoneMissing)).toBeInTheDocument();

    // Type in phone -> phone error disappears
    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '9' },
    });
    expect(screen.queryByText(JOIN_MESSAGES.phoneMissing)).toBeNull();
  });
});
