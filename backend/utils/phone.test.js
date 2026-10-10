// phone.test.js: tests for the Indian mobile number helpers (no database needed).
import { normalisePhone, maskPhone } from './phone.js';

const mulberry32 = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('normalisePhone: accepted formats', () => {
  test.each([
    ['9824079988'],
    ['98240 79988'],
    ['  9824079988  '],
    ['+91 98240 79988'],
    ['+91-98240-79988'],
    ['+919824079988'],
    ['91 9824079988'],
    ['919824079988'],
    ['09824079988'],
    ['(98240) 79988'],
    ['+91 (982) 407-9988'],
  ])('%p becomes +919824079988', (input) => {
    expect(normalisePhone(input)).toBe('+919824079988');
  });
  test.each([['6000000000'], ['7000000000'], ['8000000000'], ['9000000000']])('accepts a number starting %p', (input) => {
    expect(normalisePhone(input)).toBe(`+91${input}`);
  });
  test('a 10 digit number that happens to start with 91 is not mistaken for a prefix', () => {
    expect(normalisePhone('9198765432')).toBe('+919198765432');
  });
  test('normalising twice changes nothing', () => {
    expect(normalisePhone(normalisePhone('98240 79988'))).toBe('+919824079988');
  });
});

describe('normalisePhone: rejected input', () => {
  test.each([
    [null], [undefined], [9824079988], [{}], [[]], [true],
    [''], ['   '],
    ['98240abcde'], ['98240-7998a'],
    ['982407998'], ['98240799888'], ['9824079988123'],
    ['5824079988'], ['0824079988'], ['1234567890'],
    ['+1 9824079988'], ['+44 7911 123456'], ['+0919824079988'],
    ['++919824079988'], ['9824079988+'], ['98+24079988'],
    ['+91 5824079988'], ['+91 98240 7998'],
    ['٩٨٢٤٠٧٩٩٨٨'], // Arabic-Indic digits
    ['9824079988; DROP TABLE'], ['<script>9824079988</script>'],
    ['9'.repeat(30)],
  ])('rejects %p', (input) => {
    expect(normalisePhone(input)).toBeNull();
  });
});

describe('normalisePhone: random numbers in random formats', () => {
  test('3000 valid numbers always come out as +91 plus the same 10 digits', () => {
    const rand = mulberry32(11);
    for (let i = 0; i < 3000; i++) {
      const digits = String(6 + Math.floor(rand() * 4)) + String(Math.floor(rand() * 1e9)).padStart(9, '0');
      const formats = [
        digits,
        `+91${digits}`,
        `91${digits}`,
        `0${digits}`,
        `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`,
        `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`,
        ` ${digits} `,
      ];
      const pick = formats[Math.floor(rand() * formats.length)];
      expect(normalisePhone(pick)).toBe(`+91${digits}`);
    }
  });
});

describe('maskPhone', () => {
  test('shows the first 2 and last 3 digits only', () => {
    expect(maskPhone('+919824079988')).toBe('+91 98••• ••988');
  });
  test.each([[null], [undefined], [''], ['9824079988'], ['+91982407998'], ['+915824079988'], [42], ['+9198240799881']])(
    'returns an empty string for %p',
    (value) => {
      expect(maskPhone(value)).toBe('');
    }
  );
  test('2000 random numbers: fixed length, the hidden five digits never appear', () => {
    const rand = mulberry32(5);
    for (let i = 0; i < 2000; i++) {
      const digits = String(6 + Math.floor(rand() * 4)) + String(Math.floor(rand() * 1e9)).padStart(9, '0');
      const masked = maskPhone(`+91${digits}`);
      expect([...masked].length).toBe(15);
      expect(masked.startsWith(`+91 ${digits.slice(0, 2)}`)).toBe(true);
      expect(masked.endsWith(digits.slice(7))).toBe(true);
      expect(masked).toContain('•••');
      expect(/\d/.test(masked.slice(6, 12))).toBe(false); // the hidden digits are replaced by bullets
    }
  });
});
