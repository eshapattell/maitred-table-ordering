// generateQR.test.js: Unit tests for QR code and table URL generation
import { buildTableUrl, generateQR } from './generateQR.js';

describe('buildTableUrl', () => {
  test('constructs exact expected URL format', () => {
    const url = buildTableUrl({
      clientUrl: 'https://maitred.dining',
      restaurantId: 'rest123',
      tableNumber: 4,
      qrToken: 'abcxyz',
    });
    expect(url).toBe('https://maitred.dining/r/rest123/table/4?token=abcxyz');
  });

  test('removes trailing slash from clientUrl', () => {
    const url = buildTableUrl({
      clientUrl: 'https://maitred.dining/',
      restaurantId: 'rest123',
      tableNumber: 4,
      qrToken: 'abcxyz',
    });
    expect(url).toBe('https://maitred.dining/r/rest123/table/4?token=abcxyz');

    const multiSlashUrl = buildTableUrl({
      clientUrl: 'https://maitred.dining///',
      restaurantId: 'rest123',
      tableNumber: 4,
      qrToken: 'abcxyz',
    });
    expect(multiSlashUrl).toBe('https://maitred.dining/r/rest123/table/4?token=abcxyz');
  });

  test('blank and undefined clientUrl fall back to http://localhost:5173', () => {
    const urlBlank = buildTableUrl({
      clientUrl: '   ',
      restaurantId: 'rest123',
      tableNumber: 4,
      qrToken: 'abcxyz',
    });
    expect(urlBlank).toBe('http://localhost:5173/r/rest123/table/4?token=abcxyz');

    const urlUndef = buildTableUrl({
      clientUrl: undefined,
      restaurantId: 'rest123',
      tableNumber: 4,
      qrToken: 'abcxyz',
    });
    expect(urlUndef).toBe('http://localhost:5173/r/rest123/table/4?token=abcxyz');
  });

  test('values containing spaces or "&" are safely URL-encoded', () => {
    const url = buildTableUrl({
      clientUrl: 'https://maitred.dining',
      restaurantId: 'rest & bar',
      tableNumber: 'Table 4',
      qrToken: 'token&salt',
    });
    expect(url).toBe(
      'https://maitred.dining/r/rest%20%26%20bar/table/Table%204?token=token%26salt'
    );
  });
});

describe('generateQR', () => {
  test('returns a PNG data URL longer than 1000 characters', async () => {
    const dataUrl = await generateQR('https://maitred.dining/r/1/table/2');
    expect(typeof dataUrl).toBe('string');
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(dataUrl.length).toBeGreaterThan(1000);
  });

  test('throws for empty string, undefined, and non-string inputs', async () => {
    await expect(generateQR('')).rejects.toThrow();
    await expect(generateQR(undefined)).rejects.toThrow();
    await expect(generateQR(12345)).rejects.toThrow();
    await expect(generateQR(null)).rejects.toThrow();
  });
});
