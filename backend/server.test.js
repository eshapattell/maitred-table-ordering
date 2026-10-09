import { jest } from '@jest/globals';
import request from 'supertest';
import { app } from './server.js';

describe('Server & Health Check Endpoints', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // Viva note: Supertest binds the Express app to an ephemeral port in memory,
  // making an HTTP request to verify the route returns 200 and the expected JSON payload.
  test('GET /api/health returns 200 and { status: "ok", app: "maitred" }', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ok', app: 'maitred' });
  });

  // Viva note: Any route not explicitly registered triggers our notFound middleware,
  // which produces a 404 status code and a descriptive JSON error message.
  test('GET /api/unknown returns 404 with a message that contains "Not Found - /api/unknown"', async () => {
    const res = await request(app).get('/api/unknown');
    expect(res.statusCode).toBe(404);
    expect(res.body.message).toContain('Not Found - /api/unknown');
  });

  test('POST /api/auth/login with malformed JSON gives 400 { message: "Invalid JSON body" } without parser leakage', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'Invalid JSON body' });
    expect(res.text).not.toContain('position');
    expect(res.text).not.toContain('Unexpected');
  });

  test('POST /api/auth/login with 200 KB body gives 413 { message: "Payload too large" }', async () => {
    const largePayload = JSON.stringify({ data: 'x'.repeat(200 * 1024) });
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(largePayload);

    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ message: 'Payload too large' });
  });

  test('POST /api/auth/login with empty JSON object {} gives 400 "Email and password are required"', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'Email and password are required' });
  });
});
