// server.test.js: HTTP endpoint tests using supertest
import request from 'supertest';
import { app } from './server.js';

describe('Server & Health Check Endpoints', () => {
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
});
