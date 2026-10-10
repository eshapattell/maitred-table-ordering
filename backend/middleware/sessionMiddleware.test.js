// sessionMiddleware.test.js: Unit tests for session authentication and role guards (no database)
import { jest } from '@jest/globals';
import {
  guestAuth,
  requireHost,
  requireAllergiesDeclared,
} from './sessionMiddleware.js';

describe('sessionMiddleware Unit Tests', () => {
  const originalSecret = process.env.JWT_SECRET;
  const testSecret = 'super_secret_test_key_for_maitred_auth_32bytes';

  beforeEach(() => {
    process.env.JWT_SECRET = testSecret;
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  describe('guestAuth header and token branches (no db)', () => {
    test('missing Authorization header returns 401 INVALID_TOKEN', async () => {
      const req = { headers: {} };
      const res = mockRes();
      const next = jest.fn();

      await guestAuth()(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Not authorised',
        code: 'INVALID_TOKEN',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('malformed Authorization header without "Bearer " returns 401 INVALID_TOKEN', async () => {
      const req = { headers: { authorization: 'Basic 12345' } };
      const res = mockRes();
      const next = jest.fn();

      await guestAuth()(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Not authorised',
        code: 'INVALID_TOKEN',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('"Bearer " with empty token string returns 401 INVALID_TOKEN', async () => {
      const req = { headers: { authorization: 'Bearer   ' } };
      const res = mockRes();
      const next = jest.fn();

      await guestAuth()(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Not authorised',
        code: 'INVALID_TOKEN',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('invalid/garbage token returns 401 INVALID_TOKEN', async () => {
      const req = { headers: { authorization: 'Bearer invalid.garbage.token' } };
      const res = mockRes();
      const next = jest.fn();

      await guestAuth()(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Not authorised',
        code: 'INVALID_TOKEN',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('JWT_SECRET_INVALID error from verifyGuestToken is forwarded to next(err)', async () => {
      const origSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      const req = { headers: { authorization: 'Bearer some.token.value' } };
      const res = mockRes();
      const next = jest.fn();

      await guestAuth()(req, res, next);

      expect(next).toHaveBeenCalled();
      const passedError = next.mock.calls[0][0];
      expect(passedError).toBeDefined();
      expect(passedError.code).toBe('JWT_SECRET_INVALID');
      expect(res.status).not.toHaveBeenCalled();

      process.env.JWT_SECRET = origSecret;
    });

    test('payload with invalid sid (not an ObjectId) returns 401 INVALID_TOKEN', async () => {
      const secret = process.env.JWT_SECRET || 'test_secret_for_guest_auth_tokens_32b';
      process.env.JWT_SECRET = secret;

      const jwt = (await import('jsonwebtoken')).default;
      const invalidSidToken = jwt.sign(
        { sid: 'not-an-objectid' },
        secret,
        {
          algorithm: 'HS256',
          audience: 'maitred-guest',
          subject: 'participant-1',
          expiresIn: '1h',
        }
      );

      const req = { headers: { authorization: `Bearer ${invalidSidToken}` } };
      const res = mockRes();
      const next = jest.fn();

      await guestAuth()(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Not authorised',
        code: 'INVALID_TOKEN',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('payload with missing sub returns 401 INVALID_TOKEN', async () => {
      const secret = process.env.JWT_SECRET || 'test_secret_for_guest_auth_tokens_32b';
      process.env.JWT_SECRET = secret;

      const jwt = (await import('jsonwebtoken')).default;
      const missingSubToken = jwt.sign(
        { sid: '507f1f77bcf86cd799439011' },
        secret,
        {
          algorithm: 'HS256',
          audience: 'maitred-guest',
          subject: '',
          expiresIn: '1h',
        }
      );

      const req = { headers: { authorization: `Bearer ${missingSubToken}` } };
      const res = mockRes();
      const next = jest.fn();

      await guestAuth()(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Not authorised',
        code: 'INVALID_TOKEN',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireHost guard', () => {
    test('missing req.guest returns 403 NOT_HOST', () => {
      const req = {};
      const res = mockRes();
      const next = jest.fn();

      requireHost(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Only the host can do this',
        code: 'NOT_HOST',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('a participant with role "guest" returns 403 NOT_HOST', () => {
      const req = {
        guest: {
          session: {
            status: 'open',
            participants: [{ id: 'p1', role: 'guest', status: 'approved' }],
          },
          participant: { id: 'p1', role: 'guest', status: 'approved' },
        },
      };
      const res = mockRes();
      const next = jest.fn();

      requireHost(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Only the host can do this',
        code: 'NOT_HOST',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('a host participant with status "pending" returns 403 NOT_HOST', () => {
      const req = {
        guest: {
          session: {
            status: 'open',
            participants: [{ id: 'p1', role: 'host', status: 'pending' }],
          },
          participant: { id: 'p1', role: 'host', status: 'pending' },
        },
      };
      const res = mockRes();
      const next = jest.fn();

      requireHost(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Only the host can do this',
        code: 'NOT_HOST',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('an approved host in an open session passes to next()', () => {
      const req = {
        guest: {
          session: {
            status: 'open',
            participants: [{ id: 'p1', role: 'host', status: 'approved' }],
          },
          participant: { id: 'p1', role: 'host', status: 'approved' },
        },
      };
      const res = mockRes();
      const next = jest.fn();

      requireHost(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('requireAllergiesDeclared guard', () => {
    test('missing req.guest returns 403 ALLERGIES_REQUIRED', () => {
      const req = {};
      const res = mockRes();
      const next = jest.fn();

      requireAllergiesDeclared(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Please tell us about any allergies first',
        code: 'ALLERGIES_REQUIRED',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('allergiesDeclared false returns 403 ALLERGIES_REQUIRED', () => {
      const req = {
        guest: {
          participant: { id: 'p1', allergiesDeclared: false },
        },
      };
      const res = mockRes();
      const next = jest.fn();

      requireAllergiesDeclared(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Please tell us about any allergies first',
        code: 'ALLERGIES_REQUIRED',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('allergiesDeclared true calls next()', () => {
      const req = {
        guest: {
          participant: { id: 'p1', allergiesDeclared: true },
        },
      };
      const res = mockRes();
      const next = jest.fn();

      requireAllergiesDeclared(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('allergiesDeclared undefined returns 403 ALLERGIES_REQUIRED', () => {
      const req = {
        guest: {
          participant: { id: 'p1' },
        },
      };
      const res = mockRes();
      const next = jest.fn();

      requireAllergiesDeclared(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Please tell us about any allergies first',
        code: 'ALLERGIES_REQUIRED',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('guestAuth additional token validation branches', () => {
    test('lowercase "bearer " prefix fails with 401 INVALID_TOKEN', async () => {
      const req = { headers: { authorization: 'bearer valid.token.value' } };
      const res = mockRes();
      const next = jest.fn();

      await guestAuth()(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Not authorised',
        code: 'INVALID_TOKEN',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('whitespace-only sub in payload returns 401 INVALID_TOKEN', async () => {
      const jwt = (await import('jsonwebtoken')).default;
      const whitespaceSubToken = jwt.sign(
        { sid: '507f1f77bcf86cd799439011' },
        testSecret,
        {
          algorithm: 'HS256',
          audience: 'maitred-guest',
          subject: '   ',
          expiresIn: '1h',
        }
      );

      const req = { headers: { authorization: `Bearer ${whitespaceSubToken}` } };
      const res = mockRes();
      const next = jest.fn();

      await guestAuth()(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Not authorised',
        code: 'INVALID_TOKEN',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('token signed with different algorithm (HS512) returns 401 INVALID_TOKEN', async () => {
      const jwt = (await import('jsonwebtoken')).default;
      const hs512Token = jwt.sign(
        { sid: '507f1f77bcf86cd799439011' },
        testSecret,
        {
          algorithm: 'HS512',
          audience: 'maitred-guest',
          subject: 'p1',
          expiresIn: '1h',
        }
      );

      const req = { headers: { authorization: `Bearer ${hs512Token}` } };
      const res = mockRes();
      const next = jest.fn();

      await guestAuth()(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Not authorised',
        code: 'INVALID_TOKEN',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
