import jwt from 'jsonwebtoken';
import { generateToken, verifyToken, assertJwtSecret } from './generateToken.js';

describe('generateToken and verifyToken', () => {
  const originalSecret = process.env.JWT_SECRET;
  const testSecret = 'super_secret_test_key_for_maitred_auth_32bytes';

  beforeEach(() => {
    process.env.JWT_SECRET = testSecret;
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  test('Round trip: correctly signs and decodes sub, role, and restaurantId', () => {
    const user = {
      _id: '507f1f77bcf86cd799439011',
      role: 'owner',
      restaurantId: '607f1f77bcf86cd799439022',
    };

    const token = generateToken(user);
    expect(typeof token).toBe('string');

    const decoded = verifyToken(token);
    expect(decoded.sub).toBe('507f1f77bcf86cd799439011');
    expect(decoded.role).toBe('owner');
    expect(decoded.restaurantId).toBe('607f1f77bcf86cd799439022');
  });

  test('Wrong secret is rejected', () => {
    const user = {
      id: '507f1f77bcf86cd799439011',
      role: 'kitchen',
      restaurantId: '607f1f77bcf86cd799439022',
    };
    const token = generateToken(user);

    process.env.JWT_SECRET = 'completely_different_test_secret_key_123';
    expect(() => verifyToken(token)).toThrow();
  });

  test('Expired token is rejected', () => {
    // Generate token with negative expiry
    const expiredToken = jwt.sign(
      { role: 'owner', restaurantId: '607f1f77bcf86cd799439022' },
      testSecret,
      { algorithm: 'HS256', subject: '507f1f77bcf86cd799439011', expiresIn: '-1s' }
    );
    expect(() => verifyToken(expiredToken)).toThrow();
  });

  test('Tampered payload is rejected', () => {
    const user = {
      id: '507f1f77bcf86cd799439011',
      role: 'kitchen',
      restaurantId: '607f1f77bcf86cd799439022',
    };
    const token = generateToken(user);
    const parts = token.split('.');
    // Tamper with payload (middle part)
    const tamperedPayload = Buffer.from(
      JSON.stringify({ role: 'owner', restaurantId: '607f1f77bcf86cd799439022' })
    ).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    expect(() => verifyToken(tamperedToken)).toThrow();
  });

  test('An alg "none" token is rejected', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: '507f1f77bcf86cd799439011', role: 'owner' })
    ).toString('base64url');
    const noneToken = `${header}.${payload}.`;

    expect(() => verifyToken(noneToken)).toThrow();
  });

  test('A token signed with HS512 and the same secret is rejected', () => {
    const hs512Token = jwt.sign(
      { role: 'owner', restaurantId: '607f1f77bcf86cd799439022' },
      testSecret,
      { algorithm: 'HS512', subject: '507f1f77bcf86cd799439011', expiresIn: '1h' }
    );
    expect(() => verifyToken(hs512Token)).toThrow();
  });

  test('Garbage strings are rejected', () => {
    expect(() => verifyToken('not-a-token')).toThrow();
    expect(() => verifyToken('abc.def.ghi')).toThrow();
    expect(() => verifyToken('')).toThrow();
  });

  test('Missing JWT_SECRET throws an error that mentions JWT_SECRET but never its value', () => {
    delete process.env.JWT_SECRET;
    const user = { id: 'u1', role: 'owner', restaurantId: 'r1' };

    expect(() => generateToken(user)).toThrow(/JWT_SECRET/);
    expect(() => verifyToken('valid.jwt.token')).toThrow(/JWT_SECRET/);
  });

  test('A 5-character JWT_SECRET throws an error that mentions JWT_SECRET but never its value', () => {
    process.env.JWT_SECRET = 'short';
    const user = { id: 'u1', role: 'owner', restaurantId: 'r1' };

    expect(() => generateToken(user)).toThrow(/JWT_SECRET/);
    expect(() => verifyToken('valid.jwt.token')).toThrow(/JWT_SECRET/);
  });

  describe('assertJwtSecret', () => {
    test('passes with a 16-character or longer secret', () => {
      process.env.JWT_SECRET = '1234567890123456';
      expect(() => assertJwtSecret()).not.toThrow();

      process.env.JWT_SECRET = 'a_very_long_secure_secret_key_exceeding_16_bytes';
      expect(() => assertJwtSecret()).not.toThrow();
    });

    test('throws for a missing secret with code JWT_SECRET_INVALID without leaking value', () => {
      delete process.env.JWT_SECRET;
      let thrownError;
      try {
        assertJwtSecret();
      } catch (err) {
        thrownError = err;
      }
      expect(thrownError).toBeDefined();
      expect(thrownError.code).toBe('JWT_SECRET_INVALID');
      expect(thrownError.message).toMatch(/JWT_SECRET/);
    });

    test('throws for an empty secret with code JWT_SECRET_INVALID without leaking value', () => {
      process.env.JWT_SECRET = '';
      let thrownError;
      try {
        assertJwtSecret();
      } catch (err) {
        thrownError = err;
      }
      expect(thrownError).toBeDefined();
      expect(thrownError.code).toBe('JWT_SECRET_INVALID');
      expect(thrownError.message).toMatch(/JWT_SECRET/);
    });

    test('throws for a 5-character secret with code JWT_SECRET_INVALID and never leaks secret value', () => {
      process.env.JWT_SECRET = 'short';
      let thrownError;
      try {
        assertJwtSecret();
      } catch (err) {
        thrownError = err;
      }
      expect(thrownError).toBeDefined();
      expect(thrownError.code).toBe('JWT_SECRET_INVALID');
      expect(thrownError.message).toMatch(/JWT_SECRET/);
      expect(thrownError.message).not.toContain('short');
    });
  });
});
