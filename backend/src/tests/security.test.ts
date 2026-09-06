process.env.NODE_ENV = 'test';

jest.mock('../services/priceFeedService', () => {
  const actual = jest.requireActual('../services/priceFeedService');
  return {
    ...actual,
    fetchFromAlphaVantage: jest.fn().mockResolvedValue({
      price: 150,
      change: 1,
      changePercent: 0.5,
      source: 'Alpha Vantage',
    }),
    fetchFromPolygon: jest.fn().mockResolvedValue({
      price: 150,
      change: 1,
      changePercent: 0.5,
      source: 'Polygon.io',
    }),
  };
});

import request from 'supertest';
import zlib from 'zlib';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { getEncryptionSecret, encrypt, decrypt } from '../utils/crypto';
import { authRateLimiter, apiTestRateLimiter } from '../middleware/rateLimiter';
import { sequelize, User, UserSetting } from '../models';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-32-characters-minimum';

function extractPdfText(pdfBuffer: Buffer): string {
  let combinedText = '';
  let idx = 0;
  while ((idx = pdfBuffer.indexOf(Buffer.from('stream'), idx)) !== -1) {
    let start = idx + 6;
    while (pdfBuffer[start] === 0x0d || pdfBuffer[start] === 0x0a) start++;
    const end = pdfBuffer.indexOf(Buffer.from('endstream'), start);
    if (end !== -1) {
      let slice = pdfBuffer.subarray(start, end);
      while (slice.length > 0 && (slice[slice.length - 1] === 0x0d || slice[slice.length - 1] === 0x0a)) {
        slice = slice.subarray(0, slice.length - 1);
      }
      try {
        const decomp = zlib.inflateSync(slice).toString('utf8');
        const hexMatches = decomp.match(/<([0-9a-fA-F]+)>/g);
        if (hexMatches) {
          combinedText += hexMatches.map((h) => Buffer.from(h.slice(1, -1), 'hex').toString('utf8')).join('');
        }
        const plainMatches = decomp.match(/\(([^)]+)\)/g);
        if (plainMatches) {
          combinedText += plainMatches.map((p) => p.slice(1, -1)).join('');
        }
      } catch {}
      idx = end + 9;
    } else {
      break;
    }
  }
  return combinedText;
}

describe('Phase 2: Security & Cryptographic Hardening Verification', () => {
  let testUser: User;
  let authToken: string;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    testUser = await User.create({
      id: '98765432-1111-2222-3333-444455556666',
      email: 'security-audit@example.com',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
      role: 'user',
    });

    authToken = jwt.sign(
      { id: testUser.id, email: testUser.email, role: testUser.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('2.1 Enforce Strict Environment Secrets & Dynamic Salts [NFR4.3]', () => {
    const originalSecret = process.env.ENCRYPTION_SECRET;

    afterEach(() => {
      process.env.ENCRYPTION_SECRET = originalSecret;
    });

    it('throws fatal error on initialization if ENCRYPTION_SECRET is missing or empty', () => {
      delete process.env.ENCRYPTION_SECRET;
      expect(() => getEncryptionSecret()).toThrow(/FATAL SECURITY ERROR: ENCRYPTION_SECRET environment variable is missing/);

      process.env.ENCRYPTION_SECRET = '   ';
      expect(() => getEncryptionSecret()).toThrow(/FATAL SECURITY ERROR: ENCRYPTION_SECRET environment variable is missing/);
    });

    it('throws fatal error if ENCRYPTION_SECRET is shorter than 32 characters', () => {
      process.env.ENCRYPTION_SECRET = 'too-short-secret';
      expect(() => getEncryptionSecret()).toThrow(/FATAL SECURITY ERROR: ENCRYPTION_SECRET must be at least 32 characters long/);
    });

    it('encrypts and decrypts accurately using dynamic per-user salt', () => {
      const plainApiKey = 'sk_live_1234567890abcdef';
      const userId = 'user-uuid-1234';

      const encrypted = encrypt(plainApiKey, userId);
      expect(encrypted).not.toBeNull();
      expect(encrypted).toContain(':');

      const decrypted = decrypt(encrypted, userId);
      expect(decrypted).toBe(plainApiKey);
    });

    it('prevents decryption if a different userId salt is supplied', () => {
      const plainApiKey = 'sk_live_super_secret_market_key';
      const userA = 'user-uuid-aaaa';
      const userB = 'user-uuid-bbbb';

      const encryptedForUserA = encrypt(plainApiKey, userA);
      expect(encryptedForUserA).not.toBeNull();

      // Attempting to decrypt with User B's salt fails or returns null
      const decryptedWithUserB = decrypt(encryptedForUserA, userB);
      expect(decryptedWithUserB).toBeNull();
    });

    it('falls back to master salt and legacy salt for backward compatibility', () => {
      const plainText = 'legacy_api_key_data';
      const secret = getEncryptionSecret();

      // Manually encrypt with legacy salt 'stocked_salt'
      const crypto = require('crypto');
      const iv = crypto.randomBytes(16);
      const legacyKey = crypto.scryptSync(secret, 'stocked_salt', 32);
      const cipher = crypto.createCipheriv('aes-256-cbc', legacyKey, iv);
      let enc = cipher.update(plainText, 'utf8', 'hex');
      enc += cipher.final('hex');
      const legacyEncrypted = `${iv.toString('hex')}:${enc}`;

      // Decrypting with user ID should successfully fallback to legacy salt
      const recovered = decrypt(legacyEncrypted, 'some-new-user-id');
      expect(recovered).toBe(plainText);
    });

    it('handles null/empty values cleanly without throwing', () => {
      expect(encrypt(null)).toBeNull();
      expect(decrypt(null)).toBeNull();
      expect(decrypt('')).toBeNull();
    });

    it('integrates seamlessly with UserSetting model getter and setter', async () => {
      const plainKey = 'alphavantage_key_secure_99';
      const setting = await UserSetting.create({
        userId: testUser.id,
        provider: 'alphavantage',
        apiKey: plainKey,
        refreshInterval: 60,
      });

      // Directly check dataValue in DB (must be encrypted ciphertext)
      const rawStored = setting.getDataValue('apiKey');
      expect(rawStored).not.toBe(plainKey);
      expect(rawStored).toContain(':');

      // Getter should decrypt using instance userId
      expect(setting.apiKey).toBe(plainKey);

      // Re-query from database
      const loaded = await UserSetting.scope('withApiKey').findByPk(testUser.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.apiKey).toBe(plainKey);
    });
  });

  describe('2.2 Express Rate Limiting [NFR4.1]', () => {
    beforeEach(async () => {
      // Reset rate limit counters for local test runner IP
      await authRateLimiter.resetKey('::ffff:127.0.0.1');
      await authRateLimiter.resetKey('127.0.0.1');
      await authRateLimiter.resetKey('::1');

      await apiTestRateLimiter.resetKey('::ffff:127.0.0.1');
      await apiTestRateLimiter.resetKey('127.0.0.1');
      await apiTestRateLimiter.resetKey('::1');
    });

    it('enforces authRateLimiter on /api/auth/login after 20 requests', async () => {
      // Send 20 requests
      for (let i = 0; i < 20; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: 'unknown@example.com', password: 'wrongpassword' });
        // The first 20 requests pass rate limiter (may return 401 for bad creds)
        expect(res.status).not.toBe(429);
      }

      // 21st request must be blocked by rate limiter with 429
      const blockedRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'unknown@example.com', password: 'wrongpassword' });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.success).toBe(false);
      expect(blockedRes.body.message).toContain('Too many authentication attempts');
      expect(blockedRes.headers).toHaveProperty('ratelimit-limit');
    });

    it('enforces authRateLimiter on /api/auth/register', async () => {
      // Send 20 requests to hit limit
      for (let i = 0; i < 20; i++) {
        const res = await request(app)
          .post('/api/auth/register')
          .send({ email: 'invalid-email', password: 'short' });
        expect(res.status).not.toBe(429);
      }

      // 21st request must trigger 429
      const blockedRes = await request(app)
        .post('/api/auth/register')
        .send({ email: 'valid@example.com', password: 'Password123!' });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.success).toBe(false);
      expect(blockedRes.body.message).toContain('Too many authentication attempts');
    });

    it('enforces apiTestRateLimiter on /api/settings/test-connection after 5 requests', async () => {
      // Send 5 requests
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/settings/test-connection')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ provider: 'alphavantage', apiKey: 'test-key' });
        expect(res.status).not.toBe(429);
      }

      // 6th request must be rate limited with 429
      const blockedRes = await request(app)
        .post('/api/settings/test-connection')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ provider: 'alphavantage', apiKey: 'test-key' });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.success).toBe(false);
      expect(blockedRes.body.message).toContain('Rate limit exceeded for connection verification');
    });
  });

  describe('2.3 Compliance with FR10.4 PDF User Identification', () => {
    it('includes authenticated user email and truncated ID in generated PDF and replaces REDACTED', async () => {
      const res = await request(app)
        .post('/api/exports/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reportType: 'summary',
          format: 'PDF',
        })
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');

      const pdfBuffer = Buffer.from(res.body);
      const text = extractPdfText(pdfBuffer);

      // Verify the expected identifier: email + truncated 8-character ID
      const expectedIdentifier = `${testUser.email} (${testUser.id.substring(0, 8)})`;
      expect(text).toContain('Generated By:');
      expect(text).toContain(expectedIdentifier);

      // Verify REDACTED is completely gone
      expect(text).not.toContain('REDACTED');
    });
  });
});
