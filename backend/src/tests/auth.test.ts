process.env.NODE_ENV = 'test';

import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { authRateLimiter } from '../middleware/rateLimiter';
import { sequelize, User, UserSetting, Stock, ExportLogs } from '../models';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-32-characters-minimum';

describe('Phase 6: Authentication, Session Management & RBAC Security Suite', () => {
  let standardUser: User;
  let adminUser: User;
  let standardToken: string;
  let adminToken: string;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    // Standard user
    const standardHash = await bcrypt.hash('StandardPass123!', 10);
    standardUser = await User.create({
      id: '11111111-aaaa-4000-8000-aaaaaaaaaaaa',
      email: 'standard-user@example.com',
      passwordHash: standardHash,
      role: 'user',
    });

    await UserSetting.create({
      userId: standardUser.id,
      provider: 'manual',
      costBasisMethod: 'average',
      refreshInterval: 60,
    });

    // Admin user
    const adminHash = await bcrypt.hash('AdminPass123!', 10);
    adminUser = await User.create({
      id: '22222222-bbbb-4000-8000-bbbbbbbbbbbb',
      email: 'admin-user@example.com',
      passwordHash: adminHash,
      role: 'admin',
    });

    await UserSetting.create({
      userId: adminUser.id,
      provider: 'manual',
      costBasisMethod: 'average',
      refreshInterval: 60,
    });

    standardToken = jwt.sign(
      { id: standardUser.id, email: standardUser.email, role: standardUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    adminToken = jwt.sign(
      { id: adminUser.id, email: adminUser.email, role: adminUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    // Reset rate limiter keys before every test so tests don't pollute each other
    await authRateLimiter.resetKey('::ffff:127.0.0.1');
    await authRateLimiter.resetKey('127.0.0.1');
    await authRateLimiter.resetKey('::1');
  });

  afterEach(async () => {
    await authRateLimiter.resetKey('::ffff:127.0.0.1');
    await authRateLimiter.resetKey('127.0.0.1');
    await authRateLimiter.resetKey('::1');
  });

  describe('1. Signup & Registration [POST /api/auth/register]', () => {
    it('successfully registers a new user with bcrypt-hashed password and default settings', async () => {
      const email = 'new-registered-user@example.com';
      const password = 'StrongPassword123!';

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email, password });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Account registered successfully.');
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user.email).toBe(email);
      expect(res.body.user.role).toBe('user');
      expect(res.body.user.passwordHash).toBeUndefined(); // Never expose password hash

      // Verify token cookie was issued
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('token=');
      expect(cookies[0]).toContain('HttpOnly');

      // Verify DB state
      const createdUser = await User.findOne({ where: { email } });
      expect(createdUser).not.toBeNull();
      expect(createdUser!.email).toBe(email);
      expect(createdUser!.passwordHash.startsWith('$2b$')).toBe(true);

      // Verify bcrypt can verify the original password against the stored hash
      const isValid = await bcrypt.compare(password, createdUser!.passwordHash);
      expect(isValid).toBe(true);

      // Verify default user setting creation
      const setting = await UserSetting.findByPk(createdUser!.id);
      expect(setting).not.toBeNull();
      expect(setting!.provider).toBe('manual');
    });

    it('rejects duplicate email registration with 400 status', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'standard-user@example.com', // Already registered
          password: 'AnotherPassword123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors[0].message).toContain('already registered');
    });

    it('validates email format and rejects invalid emails with 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'not-a-valid-email-address',
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors.some((e: any) => e.field === 'email')).toBe(true);
    });

    it('enforces password complexity constraints (min 8 chars, uppercase, lowercase, number, symbol)', async () => {
      // Too short (< 8 chars)
      const shortRes = await request(app)
        .post('/api/auth/register')
        .send({ email: 'valid-test1@example.com', password: 'P1!' });
      expect(shortRes.status).toBe(400);
      expect(shortRes.body.errors.some((e: any) => e.message.includes('at least 8 characters'))).toBe(true);

      // Missing uppercase
      const noUpperRes = await request(app)
        .post('/api/auth/register')
        .send({ email: 'valid-test2@example.com', password: 'password123!' });
      expect(noUpperRes.status).toBe(400);
      expect(noUpperRes.body.errors.some((e: any) => e.message.includes('uppercase letter'))).toBe(true);

      // Missing lowercase
      const noLowerRes = await request(app)
        .post('/api/auth/register')
        .send({ email: 'valid-test3@example.com', password: 'PASSWORD123!' });
      expect(noLowerRes.status).toBe(400);
      expect(noLowerRes.body.errors.some((e: any) => e.message.includes('lowercase letter'))).toBe(true);

      // Missing digit
      const noDigitRes = await request(app)
        .post('/api/auth/register')
        .send({ email: 'valid-test4@example.com', password: 'Password!@#' });
      expect(noDigitRes.status).toBe(400);
      expect(noDigitRes.body.errors.some((e: any) => e.message.includes('numeric digit'))).toBe(true);

      // Missing special character
      const noSymbolRes = await request(app)
        .post('/api/auth/register')
        .send({ email: 'valid-test5@example.com', password: 'Password123' });
      expect(noSymbolRes.status).toBe(400);
      expect(noSymbolRes.body.errors.some((e: any) => e.message.includes('special character'))).toBe(true);
    });
  });

  describe('2. Login & Credential Verification [POST /api/auth/login]', () => {
    it('authenticates valid credentials and issues JWT token cookie', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'standard-user@example.com',
          password: 'StandardPass123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Logged in successfully.');
      expect(res.body.user.id).toBe(standardUser.id);
      expect(res.body.user.email).toBe(standardUser.email);
      expect(res.body.user.role).toBe('user');
      expect(res.body.user.passwordHash).toBeUndefined();

      // Cookie check
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('token=');
      expect(cookies[0]).toContain('HttpOnly');
    });

    it('rejects incorrect password with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'standard-user@example.com',
          password: 'IncorrectPassword999!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email address or password credentials.');
    });

    it('rejects unregistered email with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent-user@example.com',
          password: 'StandardPass123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email address or password credentials.');
    });

    it('validates required fields on login', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });
  });

  describe('3. Session Hydration & Logout [GET /api/auth/me & POST /api/auth/logout]', () => {
    it('hydrates user session using Bearer authorization header', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${standardToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.id).toBe(standardUser.id);
      expect(res.body.user.email).toBe(standardUser.email);
      expect(res.body.user.role).toBe('user');
    });

    it('hydrates user session using cookie', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`token=${standardToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.id).toBe(standardUser.id);
    });

    it('denies access when no authentication token is provided', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Access Denied. Authentication token not found');
    });

    it('denies access when token is invalid or corrupted', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer totally-invalid-token-string');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Authentication token is invalid or expired');
    });

    it('clears authentication cookie on logout', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${standardToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('User session logged out successfully.');

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      // Cleared cookie has expires in the past or empty token
      expect(cookies[0]).toMatch(/token=;|token=deleted|Expires=Thu, 01 Jan 1970/);
    });
  });

  describe('4. Role Enforcement & Access Control (RBAC) [Admin Routes]', () => {
    it('blocks standard non-admin users from accessing GET /api/admin with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/admin')
        .set('Authorization', `Bearer ${standardToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Forbidden. You do not possess the required privilege level');
    });

    it('blocks standard non-admin users from modifying user roles', async () => {
      const res = await request(app)
        .put(`/api/admin/users/${standardUser.id}/role`)
        .set('Authorization', `Bearer ${standardToken}`)
        .send({ role: 'admin' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('blocks standard non-admin users from deleting accounts via admin endpoint', async () => {
      const res = await request(app)
        .delete(`/api/admin/users/${standardUser.id}`)
        .set('Authorization', `Bearer ${standardToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('allows admin users to view all system accounts with metadata metric summaries', async () => {
      const res = await request(app)
        .get('/api/admin')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('users');
      expect(res.body.data).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data.users)).toBe(true);
      expect(res.body.data.users.length).toBeGreaterThanOrEqual(2);

      // Verify metadata presence
      const firstUser = res.body.data.users[0];
      expect(firstUser).toHaveProperty('id');
      expect(firstUser).toHaveProperty('email');
      expect(firstUser).toHaveProperty('role');
      expect(firstUser.metadata).toHaveProperty('totalStocks');
      expect(firstUser.metadata).toHaveProperty('totalLogs');
    });

    it('prevents admin from demoting their own active session with 400 guard error', async () => {
      const res = await request(app)
        .put(`/api/admin/users/${adminUser.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'user' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Security Guard: You are not allowed to demote your own active administrative session');
    });

    it('prevents admin from deleting their own active administrative session with 400 guard error', async () => {
      const res = await request(app)
        .delete(`/api/admin/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Security Guard: You are not allowed to delete your own administrative session');
    });

    it('allows admin to promote a user to admin role', async () => {
      // Create a candidate user to promote
      const candidate = await User.create({
        email: 'promote-candidate@example.com',
        passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
        role: 'user',
      });

      const res = await request(app)
        .put(`/api/admin/users/${candidate.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'admin' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe('admin');

      // Verify in DB
      await candidate.reload();
      expect(candidate.role).toBe('admin');
    });

    it('allows admin to delete another user with cascaded data deletion', async () => {
      // Create a user with associated data (Stock, ExportLog)
      const doomedUser = await User.create({
        email: 'doomed-user@example.com',
        passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
        role: 'user',
      });

      const userStock = await Stock.create({
        userId: doomedUser.id,
        symbol: 'DOOM',
        name: 'Doomed Security Corp',
      });

      const userLog = await ExportLogs.create({
        userId: doomedUser.id,
        reportType: 'summary',
        exportType: 'PDF',
        status: 'completed',
        filename: 'doom.pdf',
      });

      const res = await request(app)
        .delete(`/api/admin/users/${doomedUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('deleted successfully');

      // Verify user was destroyed
      const deletedUser = await User.findByPk(doomedUser.id);
      expect(deletedUser).toBeNull();

      // Verify cascaded deletion
      const deletedStock = await Stock.findByPk(userStock.id);
      expect(deletedStock).toBeNull();

      const deletedLog = await ExportLogs.findByPk(userLog.id);
      expect(deletedLog).toBeNull();
    });
  });

  describe('5. Rate Limiting Verification [NFR4.1]', () => {
    it('triggers 429 Too Many Requests when login threshold is exceeded', async () => {
      // Send 20 requests (max allowance)
      for (let i = 0; i < 20; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: 'unknown-ratelimit@example.com', password: 'wrong' });
        expect(res.status).not.toBe(429);
      }

      // 21st request must be rate limited with 429
      const blockedRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'unknown-ratelimit@example.com', password: 'wrong' });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.success).toBe(false);
      expect(blockedRes.body.message).toContain('Too many authentication attempts');
      expect(blockedRes.headers).toHaveProperty('ratelimit-limit');
    });
  });
});
