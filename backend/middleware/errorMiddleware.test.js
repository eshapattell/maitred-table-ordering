// errorMiddleware.test.js: Unit tests for central error handling
import { jest } from '@jest/globals';
import { notFound, errorHandler } from './errorMiddleware.js';

describe('errorMiddleware', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  test('notFound sets 404 status and passes error to next()', () => {
    const req = { originalUrl: '/api/nonexistent' };
    const res = {
      statusCode: 200,
      status: jest.fn(function (code) {
        this.statusCode = code;
        return this;
      }),
    };
    const next = jest.fn();

    notFound(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe('Not Found - /api/nonexistent');
  });

  test('errorHandler includes stack when NODE_ENV is development', () => {
    process.env.NODE_ENV = 'development';

    const err = new Error('Development error');
    const req = {};
    const res = {
      statusCode: 500,
      status: jest.fn(function (code) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn(),
    };
    const next = jest.fn();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Development error',
      stack: err.stack,
    });
  });

  test('errorHandler returns only message and omits stack when NODE_ENV is not development', () => {
    process.env.NODE_ENV = 'production';

    const err = new Error('Production error');
    const req = {};
    const res = {
      statusCode: 400,
      status: jest.fn(function (code) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn(),
    };
    const next = jest.fn();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Production error',
    });
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('stack');
  });
});
