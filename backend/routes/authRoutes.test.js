// authRoutes.test.js: Integration tests for authentication endpoints
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { app } from '../server.js';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../config/testDb.js';
import { generateToken, verifyToken } from '../utils/generateToken.js';

describe('Auth Routes (/api/auth)', () => {
  const testSecret = 'super_test_jwt_secret_key_123456789';
  const ownerPassword = 'OwnerPassword123';
  const kitchenPassword = 'KitchenPassword123';

  let restaurant;
  let ownerUser;
  let kitchenUser;
  let ownerToken;
  let kitchenToken;

  beforeAll(async () => {
    process.env.JWT_SECRET = testSecret;

    await connectTestDb();
    await clearTestDb();
    await User.init();

    restaurant = await Restaurant.create({ name: 'Le Maitre Dining' });

    ownerUser = await User.create({
      name: 'Executive Owner',
      email: 'owner@maitred.dining',
      passwordHash: bcrypt.hashSync(ownerPassword, 4),
      role: 'owner',
      restaurantId: restaurant._id,
    });

    restaurant.ownerId = ownerUser._id;
    await restaurant.save();

    kitchenUser = await User.create({
      name: 'Head Chef',
      email: 'kitchen@maitred.dining',
      passwordHash: bcrypt.hashSync(kitchenPassword, 4),
      role: 'kitchen',
      restaurantId: restaurant._id,
    });

    ownerToken = generateToken(ownerUser);
    kitchenToken = generateToken(kitchenUser);
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  describe('POST /api/auth/login', () => {
    test('owner login succeeds with 200, returns token and safe user payload', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'owner@maitred.dining', password: ownerPassword });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.role).toBe('owner');
      expect(res.body.user.email).toBe('owner@maitred.dining');
      expect(res.body.user.restaurantId).toBe(String(restaurant._id));

      // Ensure password and passwordHash are completely absent
      expect(res.body.passwordHash).toBeUndefined();
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain(ownerPassword);

      // Verify returned token payload
      const decoded = verifyToken(res.body.token);
      expect(decoded.sub).toBe(String(ownerUser._id));
      expect(decoded.role).toBe('owner');
      expect(decoded.restaurantId).toBe(String(restaurant._id));
    });

    test('kitchen login succeeds with 200 and role kitchen', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'kitchen@maitred.dining', password: kitchenPassword });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('kitchen');
    });

    test('email is case- and whitespace-insensitive', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: '  OWNER@Maitred.Dining  ', password: ownerPassword });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('owner@maitred.dining');
    });

    test('wrong password returns 401 with identical error message', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'owner@maitred.dining', password: 'WrongPassword999' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid email or password');
    });

    test('unknown email returns 401 with identical error message', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'unknown@maitred.dining', password: ownerPassword });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid email or password');
    });

    test('missing or empty credentials return 400', async () => {
      const res1 = await request(app)
        .post('/api/auth/login')
        .send({ password: ownerPassword });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post('/api/auth/login')
        .send({ email: 'owner@maitred.dining' });
      expect(res2.status).toBe(400);

      const res3 = await request(app)
        .post('/api/auth/login')
        .send({ email: '  ', password: '   ' });
      expect(res3.status).toBe(400);
    });

    test('email as an object { "$ne": null } returns 400 and yields no token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: { $ne: null }, password: ownerPassword });

      expect(res.status).toBe(400);
      expect(res.body.token).toBeUndefined();
    });

    test('password as a number or object returns 400', async () => {
      const res1 = await request(app)
        .post('/api/auth/login')
        .send({ email: 'owner@maitred.dining', password: 12345678 });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post('/api/auth/login')
        .send({ email: 'owner@maitred.dining', password: { secret: 'pass' } });
      expect(res2.status).toBe(400);
    });

    test('password longer than 72 bytes returns 400', async () => {
      const longPass = 'A'.repeat(73);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'owner@maitred.dining', password: longPass });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    test('valid token returns 200 with authenticated user', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.id).toBe(String(ownerUser._id));
      expect(res.body.user.email).toBe('owner@maitred.dining');
      expect(res.body.user.role).toBe('owner');
    });

    test('missing Authorization header returns 401', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Not authorised');
    });

    test('"Bearer" alone, "Token abc", and "Bearer not.a.jwt" return 401', async () => {
      const res1 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer ');
      expect(res1.status).toBe(401);

      const res2 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Token some_token_value');
      expect(res2.status).toBe(401);

      const res3 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not.a.jwt');
      expect(res3.status).toBe(401);
    });

    test('token signed with different secret returns 401', async () => {
      const badSecretToken = jwt.sign(
        { role: 'owner', restaurantId: String(restaurant._id) },
        'other_secret_at_least_16_chars_long',
        { algorithm: 'HS256', subject: String(ownerUser._id) }
      );
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${badSecretToken}`);
      expect(res.status).toBe(401);
    });

    test('expired token returns 401', async () => {
      const expiredToken = jwt.sign(
        { role: 'owner', restaurantId: String(restaurant._id) },
        testSecret,
        { algorithm: 'HS256', subject: String(ownerUser._id), expiresIn: '-1s' }
      );
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
    });

    test('alg "none" token returns 401', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({ sub: String(ownerUser._id), role: 'owner' })
      ).toString('base64url');
      const noneToken = `${header}.${payload}.`;

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${noneToken}`);
      expect(res.status).toBe(401);
    });

    test('valid token whose user was deleted returns 401', async () => {
      const tempUser = await User.create({
        name: 'Temporary User',
        email: 'temp@maitred.dining',
        passwordHash: 'dummy_hash',
        role: 'kitchen',
        restaurantId: restaurant._id,
      });
      const tempToken = generateToken(tempUser);
      await User.findByIdAndDelete(tempUser._id);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tempToken}`);
      expect(res.status).toBe(401);
    });

    test('token whose sub is not a valid ObjectId returns 401 without querying', async () => {
      const invalidSubToken = jwt.sign(
        { role: 'owner', restaurantId: String(restaurant._id) },
        testSecret,
        { algorithm: 'HS256', subject: 'not-an-objectid', expiresIn: '1h' }
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${invalidSubToken}`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/staff', () => {
    test('owner successfully creates a kitchen staff user', async () => {
      const staffEmail = 'newcook@maitred.dining';
      const staffPassword = 'CookPassword123';

      const res = await request(app)
        .post('/api/auth/staff')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Line Cook',
          email: staffEmail,
          password: staffPassword,
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.role).toBe('kitchen');
      expect(res.body.user.restaurantId).toBe(String(restaurant._id));
      expect(res.body.user.passwordHash).toBeUndefined();

      // Verify the stored hash matches password in database
      const dbUser = await User.findOne({ email: staffEmail });
      expect(dbUser).toBeDefined();
      expect(bcrypt.compareSync(staffPassword, dbUser.passwordHash)).toBe(true);

      // Verify new kitchen user can log in
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: staffEmail, password: staffPassword });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.token).toBeDefined();
    });

    test('kitchen token receives 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/auth/staff')
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({
          name: 'Sous Chef',
          email: 'sous@maitred.dining',
          password: 'Password123',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Forbidden');
    });

    test('missing token receives 401', async () => {
      const res = await request(app)
        .post('/api/auth/staff')
        .send({
          name: 'Sous Chef',
          email: 'sous2@maitred.dining',
          password: 'Password123',
        });

      expect(res.status).toBe(401);
    });

    test('token for kitchen user forged with role "owner" in payload still gets 403', async () => {
      // Craft token with subject = kitchenUser._id, but forged payload role = 'owner'
      const forgedToken = jwt.sign(
        { role: 'owner', restaurantId: String(restaurant._id) },
        testSecret,
        { algorithm: 'HS256', subject: String(kitchenUser._id), expiresIn: '1h' }
      );

      const res = await request(app)
        .post('/api/auth/staff')
        .set('Authorization', `Bearer ${forgedToken}`)
        .send({
          name: 'Sous Chef',
          email: 'sous3@maitred.dining',
          password: 'Password123',
        });

      // Role must be enforced from database record, not token payload
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Forbidden');
    });

    test('validation errors return 400 naming the invalid field', async () => {
      // Missing name
      const resName = await request(app)
        .post('/api/auth/staff')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'valid@maitred.dining', password: 'Password123' });
      expect(resName.status).toBe(400);
      expect(resName.body.message).toMatch(/name/i);

      // Bad email format
      const resEmail = await request(app)
        .post('/api/auth/staff')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Chef', email: 'not-an-email', password: 'Password123' });
      expect(resEmail.status).toBe(400);
      expect(resEmail.body.message).toMatch(/email/i);

      // Password shorter than 8 characters
      const resPass = await request(app)
        .post('/api/auth/staff')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Chef', email: 'valid@maitred.dining', password: 'short' });
      expect(resPass.status).toBe(400);
      expect(resPass.body.message).toMatch(/password/i);

      // Email as object
      const resObj = await request(app)
        .post('/api/auth/staff')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Chef', email: { $ne: null }, password: 'Password123' });
      expect(resObj.status).toBe(400);
      expect(resEmail.body.message).toMatch(/email/i);
    });

    test('duplicate email returns 409 Email already in use', async () => {
      const res = await request(app)
        .post('/api/auth/staff')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Duplicate Staff',
          email: 'owner@maitred.dining', // Already used by owner
          password: 'Password123',
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Email already in use');
    });

    test('extra fields in body (role "owner" and another restaurantId) are ignored', async () => {
      const staffEmail = 'ignored_fields@maitred.dining';
      const fakeRestaurantId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .post('/api/auth/staff')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Pantry Chef',
          email: staffEmail,
          password: 'Password123',
          role: 'owner', // Should be ignored
          restaurantId: String(fakeRestaurantId), // Should be ignored
        });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('kitchen');
      expect(res.body.user.restaurantId).toBe(String(restaurant._id));
    });
  });
});
