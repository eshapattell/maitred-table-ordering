// errorMiddleware.test.js: Unit tests for central error handling
import { jest } from '@jest/globals';
import { notFound, errorHandler } from './errorMiddleware.js';

describe('errorMiddleware', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  let consoleErrorSpy;

  beforeEach(() => {
    // Silence console.error in tests that trigger logging
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
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

  test('errorHandler delegates to next(err) when headersSent is true without modifying response', () => {
    const err = new Error('Late stream error');
    const req = {};
    const res = {
      headersSent: true,
      statusCode: 200,
      status: jest.fn(),
      json: jest.fn(),
    };
    const next = jest.fn();

    errorHandler(err, req, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  test('errorHandler includes stack and real message for 500 when NODE_ENV is development', () => {
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

  test('errorHandler returns "Internal Server Error" and omits stack for 500 when NODE_ENV is not development', () => {
    process.env.NODE_ENV = 'production';

    const err = new Error('Sensitive database connection failure');
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
      message: 'Internal Server Error',
    });
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('stack');
  });

  test('errorHandler keeps err.message for 4xx status outside development', () => {
    process.env.NODE_ENV = 'production';

    const err = new Error('Invalid input details');
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
      message: 'Invalid input details',
    });
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('stack');
  });

  test('errorHandler respects err.status / err.statusCode when between 400 and 599', () => {
    process.env.NODE_ENV = 'production';

    const errWithStatus = new Error('Bad request');
    errWithStatus.status = 422;

    const res = {
      statusCode: 200,
      status: jest.fn(function (code) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn(),
    };
    const next = jest.fn();

    errorHandler(errWithStatus, {}, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ message: 'Bad request' });

    const errWithStatusCode = new Error('Service unavailable');
    errWithStatusCode.statusCode = 503;
    errorHandler(errWithStatusCode, {}, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ message: 'Internal Server Error' });
  });

  test('errorHandler handles err.type "entity.parse.failed" returning 400 { message: "Invalid JSON body" }', () => {
    process.env.NODE_ENV = 'production';

    const parseErr = new SyntaxError('Unexpected token in JSON at position 10');
    parseErr.type = 'entity.parse.failed';
    parseErr.status = 400;

    const res = {
      statusCode: 200,
      status: jest.fn(function (code) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn(),
    };
    const next = jest.fn();

    errorHandler(parseErr, {}, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid JSON body' });
  });

  test('errorHandler handles err.type "entity.too.large" returning 413 { message: "Payload too large" }', () => {
    process.env.NODE_ENV = 'production';

    const largeErr = new Error('request entity too large');
    largeErr.type = 'entity.too.large';
    largeErr.status = 413;

    const res = {
      statusCode: 200,
      status: jest.fn(function (code) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn(),
    };
    const next = jest.fn();

    errorHandler(largeErr, {}, res, next);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({ message: 'Payload too large' });
  });

  test('a 404 (notFound), a parse error (400) and a 413 produce NO console.error call', () => {
    // 1. 404 via notFound followed by errorHandler
    const notFoundReq = { originalUrl: '/api/nonexistent' };
    let notFoundErr;
    const notFoundRes = {
      statusCode: 200,
      status: jest.fn(function (code) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn(),
    };
    notFound(notFoundReq, notFoundRes, (err) => {
      notFoundErr = err;
    });
    expect(notFoundRes.statusCode).toBe(404);
    errorHandler(notFoundErr, notFoundReq, notFoundRes, jest.fn());
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    // 2. Parse error (400)
    const parseErr = new SyntaxError('Unexpected token');
    parseErr.type = 'entity.parse.failed';
    parseErr.status = 400;
    const res400 = {
      statusCode: 200,
      status: jest.fn(function (code) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn(),
    };
    errorHandler(parseErr, {}, res400, jest.fn());
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    // 3. Payload too large (413)
    const largeErr = new Error('request entity too large');
    largeErr.type = 'entity.too.large';
    largeErr.status = 413;
    const res413 = {
      statusCode: 200,
      status: jest.fn(function (code) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn(),
    };
    errorHandler(largeErr, {}, res413, jest.fn());
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  test('a 500 produces exactly one console.error call with "[maitred]" and message only; err.body "hunter2" is never leaked', () => {
    const sensitiveErr = new Error('Database query failure');
    sensitiveErr.body = '{"password":"hunter2"}';

    const res = {
      statusCode: 500,
      status: jest.fn(function (code) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn(),
    };
    const next = jest.fn();

    errorHandler(sensitiveErr, {}, res, next);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith('[maitred]', 'Database query failure');
    for (const callArgs of consoleErrorSpy.mock.calls) {
      for (const arg of callArgs) {
        expect(String(arg)).not.toContain('hunter2');
      }
    }
  });

  test('an error with no err.status: res.statusCode 201 answers 500, 302 answers 500, and 404 answers 404', () => {
    const err = new Error('Unhandled exception');

    // res.statusCode = 201 (success) -> must answer 500
    const res201 = {
      statusCode: 201,
      status: jest.fn(function (code) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn(),
    };
    errorHandler(err, {}, res201, jest.fn());
    expect(res201.status).toHaveBeenCalledWith(500);

    // res.statusCode = 302 (redirect) -> must answer 500
    const res302 = {
      statusCode: 302,
      status: jest.fn(function (code) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn(),
    };
    errorHandler(err, {}, res302, jest.fn());
    expect(res302.status).toHaveBeenCalledWith(500);

    // res.statusCode = 404 (client error) -> must answer 404
    const res404 = {
      statusCode: 404,
      status: jest.fn(function (code) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn(),
    };
    errorHandler(err, {}, res404, jest.fn());
    expect(res404.status).toHaveBeenCalledWith(404);
  });
});
