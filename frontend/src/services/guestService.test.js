import { describe, test, expect, beforeEach, vi } from 'vitest';
import guestApi from './guestApi.js';
import {
  joinTable,
  fetchMyTable,
  declareAllergies,
  fetchGuestMenu,
  approveGuest,
  rejectGuest,
  saveGuestToken,
  readGuestToken,
  clearGuestToken,
} from './guestService.js';
import { STORAGE_KEYS } from '../utils/constants.js';

describe('guestService', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  test('1. joinTable posts /sessions/join with exact body and returns data', async () => {
    const mockData = {
      token: 'jwt-123',
      participant: { id: 'p1', nickname: 'Aarav' },
      session: { id: 's1', tableNumber: 4, status: 'open' },
    };
    vi.spyOn(guestApi, 'post').mockResolvedValueOnce({ data: mockData });

    const payload = {
      restaurantId: '654321654321654321654321',
      tableNumber: 4,
      qrToken: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
      phone: '+919876543210',
      nickname: 'Aarav',
    };

    const result = await joinTable(payload);

    expect(guestApi.post).toHaveBeenCalledTimes(1);
    expect(guestApi.post).toHaveBeenCalledWith('/sessions/join', payload);
    expect(result).toEqual(mockData);
  });

  test('2. fetchMyTable calls GET /sessions/me and returns data', async () => {
    const mockData = {
      session: { id: 's1', tableNumber: 4, status: 'open' },
      me: { id: 'p1', nickname: 'Aarav', role: 'host', status: 'approved' },
      participants: [],
      pending: [],
    };
    vi.spyOn(guestApi, 'get').mockResolvedValueOnce({ data: mockData });

    const result = await fetchMyTable();

    expect(guestApi.get).toHaveBeenCalledWith('/sessions/me');
    expect(result).toEqual(mockData);
  });

  test('3. declareAllergies posts /sessions/allergies with exact { allergies } key and returns data', async () => {
    const mockData = {
      me: { id: 'p1', allergiesDeclared: true },
    };
    vi.spyOn(guestApi, 'post').mockResolvedValueOnce({ data: mockData });

    const allergyList = ['dairy', 'gluten'];
    const result = await declareAllergies(allergyList);

    expect(guestApi.post).toHaveBeenCalledWith('/sessions/allergies', {
      allergies: allergyList,
    });
    expect(result).toEqual(mockData);
  });

  test('4. fetchGuestMenu calls GET /sessions/menu and returns items array', async () => {
    const mockItems = [
      { id: 'd1', name: 'Dal Tadka', safe: true },
      { id: 'd2', name: 'Paneer Tikka', safe: false },
    ];
    vi.spyOn(guestApi, 'get').mockResolvedValueOnce({
      data: { items: mockItems },
    });

    const result = await fetchGuestMenu();

    expect(guestApi.get).toHaveBeenCalledWith('/sessions/menu');
    expect(result).toEqual(mockItems);
  });

  test('5. fetchGuestMenu returns [] when items is missing or not an array', async () => {
    vi.spyOn(guestApi, 'get').mockResolvedValueOnce({ data: {} });
    const res1 = await fetchGuestMenu();
    expect(res1).toEqual([]);

    vi.spyOn(guestApi, 'get').mockResolvedValueOnce({ data: { items: null } });
    const res2 = await fetchGuestMenu();
    expect(res2).toEqual([]);
  });

  test('6. approveGuest posts to /sessions/participants/<encoded id>/approve with encoded ID and returns data', async () => {
    const mockData = { ok: true };
    vi.spyOn(guestApi, 'post').mockResolvedValueOnce({ data: mockData });

    const strangeId = 'user/123?abc';
    const result = await approveGuest(strangeId);

    expect(guestApi.post).toHaveBeenCalledWith(
      `/sessions/participants/${encodeURIComponent(strangeId)}/approve`
    );
    expect(result).toEqual(mockData);
  });

  test('7. rejectGuest posts to /sessions/participants/<encoded id>/reject with encoded ID and returns data', async () => {
    const mockData = { ok: true };
    vi.spyOn(guestApi, 'post').mockResolvedValueOnce({ data: mockData });

    const strangeId = 'user/456#xyz';
    const result = await rejectGuest(strangeId);

    expect(guestApi.post).toHaveBeenCalledWith(
      `/sessions/participants/${encodeURIComponent(strangeId)}/reject`
    );
    expect(result).toEqual(mockData);
  });

  test('8. saveGuestToken stores only non-empty string under STORAGE_KEYS.GUEST_TOKEN', () => {
    saveGuestToken('valid-token-string');
    expect(sessionStorage.getItem(STORAGE_KEYS.GUEST_TOKEN)).toBe('valid-token-string');
  });

  test('9. saveGuestToken ignores empty string, whitespace and non-string inputs', () => {
    saveGuestToken('');
    expect(sessionStorage.getItem(STORAGE_KEYS.GUEST_TOKEN)).toBeNull();

    saveGuestToken('   ');
    expect(sessionStorage.getItem(STORAGE_KEYS.GUEST_TOKEN)).toBeNull();

    saveGuestToken(null);
    expect(sessionStorage.getItem(STORAGE_KEYS.GUEST_TOKEN)).toBeNull();

    saveGuestToken(12345);
    expect(sessionStorage.getItem(STORAGE_KEYS.GUEST_TOKEN)).toBeNull();

    saveGuestToken({});
    expect(sessionStorage.getItem(STORAGE_KEYS.GUEST_TOKEN)).toBeNull();
  });

  test('10. saveGuestToken never touches any other storage key', () => {
    sessionStorage.setItem('otherKey', 'preserve-me');
    saveGuestToken('token-123');

    expect(sessionStorage.getItem('otherKey')).toBe('preserve-me');
    expect(sessionStorage.getItem(STORAGE_KEYS.GUEST_TOKEN)).toBe('token-123');
    expect(sessionStorage.length).toBe(2);
  });

  test('11. readGuestToken returns stored token or empty string', () => {
    expect(readGuestToken()).toBe('');

    sessionStorage.setItem(STORAGE_KEYS.GUEST_TOKEN, 'tok-abc');
    expect(readGuestToken()).toBe('tok-abc');
  });

  test('12. clearGuestToken removes guest token', () => {
    sessionStorage.setItem(STORAGE_KEYS.GUEST_TOKEN, 'tok-xyz');
    clearGuestToken();
    expect(sessionStorage.getItem(STORAGE_KEYS.GUEST_TOKEN)).toBeNull();
  });

  test('13. errors propagate unchanged from guestApi', async () => {
    const customError = new Error('Network failure');
    vi.spyOn(guestApi, 'get').mockRejectedValueOnce(customError);

    await expect(fetchMyTable()).rejects.toThrow('Network failure');
  });
});
