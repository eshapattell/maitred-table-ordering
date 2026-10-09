// restaurantRoutes.test.js: Integration tests for public restaurant endpoints
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../server.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../config/testDb.js';
import { createFixtures } from '../config/testFixtures.js';

describe('Restaurant Routes (/api/restaurants)', () => {
  let fixtures;

  beforeAll(async () => {
    await connectTestDb();
    await clearTestDb();
    fixtures = await createFixtures();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  test('GET /api/restaurants/:restaurantId with known id returns 200 with exactly { restaurant: { id, name } }', async () => {
    const res = await request(app).get(`/api/restaurants/${fixtures.restaurantA._id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      restaurant: {
        id: String(fixtures.restaurantA._id),
        name: fixtures.restaurantA.name,
      },
    });

    // Assert exact keys to ensure sensitive internal data like ownerId is strictly omitted
    expect(Object.keys(res.body.restaurant).sort()).toEqual(['id', 'name']);
    expect(res.body.restaurant.ownerId).toBeUndefined();
  });

  test('GET /api/restaurants/:restaurantId works publicly without any token', async () => {
    const res = await request(app).get(`/api/restaurants/${fixtures.restaurantA._id}`);
    expect(res.status).toBe(200);
  });

  test('GET /api/restaurants/:restaurantId with unknown but valid id returns 404', async () => {
    const unknownId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/restaurants/${unknownId}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Not found');
  });

  test('GET /api/restaurants/:restaurantId with invalid id formats ("not-an-id", "123") returns 404', async () => {
    const res1 = await request(app).get('/api/restaurants/not-an-id');
    expect(res1.status).toBe(404);
    expect(res1.body.message).toBe('Not found');

    const res2 = await request(app).get('/api/restaurants/123');
    expect(res2.status).toBe(404);
    expect(res2.body.message).toBe('Not found');
  });
});
