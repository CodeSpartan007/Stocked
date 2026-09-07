process.env.NODE_ENV = 'test';

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import {
  sequelize,
  User,
  Stock,
  DailyPrice,
  UserSetting,
} from '../models';
import {
  fetchWithFailover,
  getLivePriceForStock,
  getOrUpdateApiStatus,
  cooldownsByUserAndProvider,
  setCooldown,
  clearCooldown,
  getCooldown,
  stopPriceSyncPoller,
  isNetworkError,
  shouldFailover,
} from '../services/priceFeedService';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-32-characters-minimum';

describe('API Switching & Rate-Limit Failover Implementation', () => {
  let user: User;
  let token: string;
  let testStock: Stock;
  let originalFetch: typeof global.fetch;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    user = await User.create({
      id: '55555555-6666-7777-8888-999999999999',
      email: 'failover-test@stocked.com',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
      role: 'user',
    });

    token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    testStock = await Stock.create({
      userId: user.id,
      symbol: 'AAPL',
      name: 'Apple Inc.',
    });

    originalFetch = global.fetch;
  });

  afterAll(async () => {
    stopPriceSyncPoller(user.id);
    global.fetch = originalFetch;
    await sequelize.close();
  });

  beforeEach(async () => {
    stopPriceSyncPoller(user.id);
    clearCooldown(user.id);
    await DailyPrice.destroy({ where: {} });
    await UserSetting.destroy({ where: {} });
  });

  describe('1. Primary provider succeeds -> verify no failover triggered', () => {
    it('queries primary provider (alphavantage) directly without calling secondary', async () => {
      await UserSetting.create({
        userId: user.id,
        provider: 'alphavantage',
        alphaVantageApiKey: 'mock-av-key-123',
        polygonApiKey: 'mock-polygon-key-456',
        autoSwitchOnRateLimit: true,
      });

      const fetchMock = jest.fn().mockImplementation((url: string) => {
        if (url.includes('alphavantage.co')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              'Global Quote': {
                '05. price': '175.50',
                '09. change': '2.50',
                '10. change percent': '1.45%',
                '06. volume': '1000000',
              },
            }),
          });
        }
        if (url.includes('polygon.io')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              status: 'OK',
              results: [{ c: 176.0, o: 174.0, v: 2000000 }],
            }),
          });
        }
        return Promise.reject(new Error('Unknown URL in fetchMock'));
      });
      global.fetch = fetchMock as any;

      const result = await fetchWithFailover('AAPL', user.id);

      expect(result.isFailover).toBe(false);
      expect(result.provider).toBe('alphavantage');
      expect(result.tickerData.price).toBe(175.5);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('alphavantage.co');
      expect(getCooldown(user.id, 'alphavantage')).toBeNull();
    });
  });

  describe('2. Primary provider returns rate-limit -> verify automatic switch to secondary', () => {
    it('seamlessly fails over to polygon when alphavantage returns a rate-limit Note and saves price', async () => {
      await UserSetting.create({
        userId: user.id,
        provider: 'alphavantage',
        alphaVantageApiKey: 'mock-av-key-123',
        polygonApiKey: 'mock-polygon-key-456',
        autoSwitchOnRateLimit: true,
      });

      const fetchMock = jest.fn().mockImplementation((url: string) => {
        if (url.includes('alphavantage.co')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              Note: 'Thank you for visiting Alpha Vantage! Our standard API call frequency is 25 requests per day.',
            }),
          });
        }
        if (url.includes('polygon.io')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              status: 'OK',
              results: [{ c: 182.25, o: 180.0, v: 5000000 }],
            }),
          });
        }
        return Promise.reject(new Error('Unknown URL in fetchMock'));
      });
      global.fetch = fetchMock as any;

      const priceResult = await getLivePriceForStock(testStock, user.id);

      expect(priceResult.source).toBe('live');
      expect(priceResult.price).toBe(182.25);

      // Verify cooldown is set on primary provider
      const primaryCd = getCooldown(user.id, 'alphavantage');
      expect(primaryCd).not.toBeNull();
      expect(primaryCd!.reason).toContain('rate limit');

      // Verify status endpoint reflects failover state
      const status = await getOrUpdateApiStatus(user.id);
      expect(status.connected).toBe(true);
      expect(status.isFailoverActive).toBe(true);
      expect(status.activeProvider).toBe('polygon');
      expect(status.statusText).toBe('Failover Active');
      expect(status.failoverMessage).toContain('Failover Active');

      // Verify saved in DailyPrice
      const todayStr = new Date().toISOString().split('T')[0];
      const savedPrice = await DailyPrice.findOne({
        where: { stockId: testStock.id, userId: user.id, date: todayStr },
      });
      expect(savedPrice).not.toBeNull();
      expect(Number(savedPrice!.price)).toBe(182.25);
    });
  });

  describe('3. Subsequent call within cooldown window -> skips primary provider', () => {
    it('calls backup provider directly without hitting rate-limited primary', async () => {
      await UserSetting.create({
        userId: user.id,
        provider: 'alphavantage',
        alphaVantageApiKey: 'mock-av-key-123',
        polygonApiKey: 'mock-polygon-key-456',
        autoSwitchOnRateLimit: true,
      });

      // Manually simulate active cooldown on alphavantage
      setCooldown(user.id, 'alphavantage', 60000, 'Simulated rate limit');

      const fetchMock = jest.fn().mockImplementation((url: string) => {
        if (url.includes('polygon.io')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              status: 'OK',
              results: [{ c: 185.0, o: 183.0, v: 4000000 }],
            }),
          });
        }
        return Promise.reject(new Error('Primary should not be called'));
      });
      global.fetch = fetchMock as any;

      const result = await fetchWithFailover('AAPL', user.id);

      expect(result.isFailover).toBe(true);
      expect(result.provider).toBe('polygon');
      expect(result.tickerData.price).toBe(185.0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('polygon.io');
    });
  });

  describe('4. After cooldown window expires -> primary provider is re-attempted', () => {
    it('retries primary provider once cooldownUntil timestamp is in the past', async () => {
      await UserSetting.create({
        userId: user.id,
        provider: 'alphavantage',
        alphaVantageApiKey: 'mock-av-key-123',
        polygonApiKey: 'mock-polygon-key-456',
        autoSwitchOnRateLimit: true,
      });

      // Set cooldown expired 5 seconds ago
      cooldownsByUserAndProvider.set(`${user.id}:alphavantage`, {
        cooldownUntil: new Date(Date.now() - 5000),
        reason: 'Expired cooldown',
      });

      const fetchMock = jest.fn().mockImplementation((url: string) => {
        if (url.includes('alphavantage.co')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              'Global Quote': {
                '05. price': '188.00',
                '09. change': '3.00',
                '10. change percent': '1.62%',
                '06. volume': '3000000',
              },
            }),
          });
        }
        return Promise.reject(new Error('Polygon should not be called when primary recovers'));
      });
      global.fetch = fetchMock as any;

      const result = await fetchWithFailover('AAPL', user.id);

      expect(result.isFailover).toBe(false);
      expect(result.provider).toBe('alphavantage');
      expect(result.tickerData.price).toBe(188.0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('alphavantage.co');
    });
  });

  describe('5. Both providers rate-limited -> graceful fallback to database cache', () => {
    it('falls back to cached daily price when primary and secondary are rate limited', async () => {
      await UserSetting.create({
        userId: user.id,
        provider: 'alphavantage',
        alphaVantageApiKey: 'mock-av-key-123',
        polygonApiKey: 'mock-polygon-key-456',
        autoSwitchOnRateLimit: true,
      });

      // Seed local cached price
      await DailyPrice.create({
        userId: user.id,
        stockId: testStock.id,
        date: '2026-09-06',
        price: 155.0,
        volume: 1000,
        source: 'manual',
        change: 0,
        changePercent: 0,
      });

      const fetchMock = jest.fn().mockImplementation((url: string) => {
        if (url.includes('alphavantage.co')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              Note: 'Alpha Vantage call frequency exceeded',
            }),
          });
        }
        if (url.includes('polygon.io')) {
          return Promise.resolve({
            ok: false,
            status: 429,
            json: async () => ({
              status: 'ERROR',
              error: 'Polygon.io 429 Too Many Requests',
            }),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });
      global.fetch = fetchMock as any;

      const result = await getLivePriceForStock(testStock, user.id);

      expect(result.source).toBe('cache');
      expect(result.price).toBe(155.0);

      // Both providers should now have cooldowns
      expect(getCooldown(user.id, 'alphavantage')).not.toBeNull();
      expect(getCooldown(user.id, 'polygon')).not.toBeNull();

      // Verify status shows rate limited
      const status = await getOrUpdateApiStatus(user.id);
      expect(status.statusText).toBe('Rate Limited');
      expect(status.isFailoverActive).toBe(false);
    });
  });

  describe('6. autoSwitchOnRateLimit: false -> verify failover is skipped and local cache used', () => {
    it('does not call backup provider when auto-switch is disabled', async () => {
      await UserSetting.create({
        userId: user.id,
        provider: 'alphavantage',
        alphaVantageApiKey: 'mock-av-key-123',
        polygonApiKey: 'mock-polygon-key-456',
        autoSwitchOnRateLimit: false, // Disabled
      });

      // Seed local cached price
      await DailyPrice.create({
        userId: user.id,
        stockId: testStock.id,
        date: '2026-09-06',
        price: 160.0,
        volume: 1000,
        source: 'manual',
        change: 0,
        changePercent: 0,
      });

      const fetchMock = jest.fn().mockImplementation((url: string) => {
        if (url.includes('alphavantage.co')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              Note: 'Alpha Vantage limit reached',
            }),
          });
        }
        if (url.includes('polygon.io')) {
          throw new Error('Polygon should NOT be called when auto-switch is false!');
        }
        return Promise.reject(new Error('Unknown URL'));
      });
      global.fetch = fetchMock as any;

      const result = await getLivePriceForStock(testStock, user.id);

      expect(result.source).toBe('cache');
      expect(result.price).toBe(160.0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('alphavantage.co');
    });
  });

  describe('7. API Routes Integration (/api/settings and /api/stocks)', () => {
    it('GET /api/settings/feed returns masked keys and autoSwitchOnRateLimit', async () => {
      await UserSetting.create({
        userId: user.id,
        provider: 'alphavantage',
        alphaVantageApiKey: 'my-av-secret',
        polygonApiKey: 'my-polygon-secret',
        autoSwitchOnRateLimit: true,
        refreshInterval: 30,
      });

      const res = await request(app)
        .get('/api/settings/feed')
        .set('Cookie', `token=${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.alphaVantageApiKey).toBe('••••••••••••••••');
      expect(res.body.data.polygonApiKey).toBe('••••••••••••••••');
      expect(res.body.data.apiKey).toBe('••••••••••••••••');
      expect(res.body.data.autoSwitchOnRateLimit).toBe(true);
      expect(res.body.data.provider).toBe('alphavantage');
    });

    it('POST /api/settings/feed saves both keys and autoSwitchOnRateLimit', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          'Global Quote': {
            '05. price': '150.00',
            '09. change': '1.00',
            '10. change percent': '0.5%',
            '06. volume': '500000',
          },
        }),
      }) as any;

      const res = await request(app)
        .post('/api/settings/feed')
        .set('Cookie', `token=${token}`)
        .send({
          provider: 'alphavantage',
          alphaVantageApiKey: 'new-av-key-999',
          polygonApiKey: 'new-polygon-key-888',
          autoSwitchOnRateLimit: true,
          refreshInterval: 45,
          costBasisMethod: 'average',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const saved = await UserSetting.scope('withApiKey').findByPk(user.id);
      expect(saved!.alphaVantageApiKey).toBe('new-av-key-999');
      expect(saved!.polygonApiKey).toBe('new-polygon-key-888');
      expect(saved!.autoSwitchOnRateLimit).toBe(true);
    });

    it('POST /api/settings/test-connection tests individual providers', async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('polygon.io')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              status: 'OK',
              results: [{ c: 190.0, o: 188.0, v: 1000000 }],
            }),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      }) as any;

      const res = await request(app)
        .post('/api/settings/test-connection')
        .set('Cookie', `token=${token}`)
        .send({
          provider: 'polygon',
          apiKey: 'test-polygon-key',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Polygon.io');
    });

    it('GET /api/stocks/ticker-price/:symbol returns live data with failover metadata', async () => {
      await UserSetting.create({
        userId: user.id,
        provider: 'alphavantage',
        alphaVantageApiKey: 'av-key',
        polygonApiKey: 'poly-key',
        autoSwitchOnRateLimit: true,
      });

      // Primary rate limits, secondary succeeds
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('alphavantage.co')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              Note: 'Standard API call frequency exceeded',
            }),
          });
        }
        if (url.includes('polygon.io')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              status: 'OK',
              results: [{ c: 195.5, o: 193.0, v: 2500000 }],
            }),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      }) as any;

      const res = await request(app)
        .get('/api/stocks/ticker-price/AAPL')
        .set('Cookie', `token=${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.symbol).toBe('AAPL');
      expect(res.body.data.price).toBe(195.5);
      expect(res.body.data.provider).toBe('polygon');
      expect(res.body.data.isFailover).toBe(true);
    });
  });

  describe('8. Network Error Failover & Autoswitch', () => {
    it('isNetworkError correctly identifies timeout, connection errors, and 5xx errors', () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      expect(isNetworkError(abortErr)).toBe(true);

      const connErr: any = new Error('TypeError: fetch failed');
      connErr.cause = { code: 'ECONNREFUSED' };
      expect(isNetworkError(connErr)).toBe(true);

      expect(isNetworkError(new Error('getaddrinfo ENOTFOUND api.alphavantage.co'))).toBe(true);
      expect(isNetworkError(new Error('socket hang up'))).toBe(true);
      expect(isNetworkError(new Error('Status: 504 Gateway Timeout'))).toBe(true);

      // Business errors should not be network errors
      expect(isNetworkError(new Error('Invalid API Key'))).toBe(false);
      expect(isNetworkError(new Error('Symbol not found'))).toBe(false);

      expect(shouldFailover(abortErr)).toBe(true);
      expect(shouldFailover(new Error('429 Too Many Requests'))).toBe(true);
      expect(shouldFailover(new Error('Invalid API Key'))).toBe(false);
    });

    it('seamlessly fails over to polygon when primary provider encounters an AbortError timeout', async () => {
      await UserSetting.create({
        userId: user.id,
        provider: 'alphavantage',
        alphaVantageApiKey: 'mock-av-key-123',
        polygonApiKey: 'mock-polygon-key-456',
        autoSwitchOnRateLimit: true,
      });

      const abortError = new Error('Request to Alpha Vantage timed out after 10000ms');
      abortError.name = 'AbortError';

      const fetchMock = jest.fn().mockImplementation((url: string) => {
        if (url.includes('alphavantage.co')) {
          return Promise.reject(abortError);
        }
        if (url.includes('polygon.io')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              status: 'OK',
              results: [{ c: 199.5, o: 198.0, v: 3000000 }],
            }),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });
      global.fetch = fetchMock as any;

      const result = await fetchWithFailover('AAPL', user.id);

      expect(result.isFailover).toBe(true);
      expect(result.provider).toBe('polygon');
      expect(result.tickerData.price).toBe(199.5);

      // Verify cooldown set on primary provider with "Network error"
      const cd = getCooldown(user.id, 'alphavantage');
      expect(cd).not.toBeNull();
      expect(cd!.reason).toContain('Network error');

      // Verify status endpoint reflects network failover
      const status = await getOrUpdateApiStatus(user.id);
      expect(status.connected).toBe(true);
      expect(status.isFailoverActive).toBe(true);
      expect(status.statusText).toBe('Failover Active');
      expect(status.failoverMessage).toContain('Network Error');
    });

    it('seamlessly fails over to polygon when primary provider throws connection drop (fetch failed / ECONNREFUSED)', async () => {
      await UserSetting.create({
        userId: user.id,
        provider: 'alphavantage',
        alphaVantageApiKey: 'mock-av-key-123',
        polygonApiKey: 'mock-polygon-key-456',
        autoSwitchOnRateLimit: true,
      });

      const fetchMock = jest.fn().mockImplementation((url: string) => {
        if (url.includes('alphavantage.co')) {
          const connErr: any = new Error('TypeError: fetch failed');
          connErr.cause = { code: 'ECONNREFUSED' };
          return Promise.reject(connErr);
        }
        if (url.includes('polygon.io')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              status: 'OK',
              results: [{ c: 205.0, o: 202.0, v: 4000000 }],
            }),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });
      global.fetch = fetchMock as any;

      const result = await fetchWithFailover('AAPL', user.id);

      expect(result.isFailover).toBe(true);
      expect(result.provider).toBe('polygon');
      expect(result.tickerData.price).toBe(205.0);

      const cd = getCooldown(user.id, 'alphavantage');
      expect(cd).not.toBeNull();
      expect(cd!.reason).toContain('Network error');
    });

    it('skips primary provider and routes directly to secondary when cooldown from network error is active', async () => {
      await UserSetting.create({
        userId: user.id,
        provider: 'alphavantage',
        alphaVantageApiKey: 'mock-av-key-123',
        polygonApiKey: 'mock-polygon-key-456',
        autoSwitchOnRateLimit: true,
      });

      // Active cooldown due to previous network timeout
      setCooldown(user.id, 'alphavantage', 60000, 'Network error: Request to Alpha Vantage timed out');

      const fetchMock = jest.fn().mockImplementation((url: string) => {
        if (url.includes('polygon.io')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              status: 'OK',
              results: [{ c: 210.0, o: 208.0, v: 1500000 }],
            }),
          });
        }
        return Promise.reject(new Error('Primary should not have been called!'));
      });
      global.fetch = fetchMock as any;

      const result = await fetchWithFailover('AAPL', user.id);

      expect(result.isFailover).toBe(true);
      expect(result.provider).toBe('polygon');
      expect(result.tickerData.price).toBe(210.0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('polygon.io');
    });

    it('falls back to database cache when both providers fail with network error', async () => {
      await UserSetting.create({
        userId: user.id,
        provider: 'alphavantage',
        alphaVantageApiKey: 'mock-av-key-123',
        polygonApiKey: 'mock-polygon-key-456',
        autoSwitchOnRateLimit: true,
      });

      // Seed local cached price
      await DailyPrice.create({
        userId: user.id,
        stockId: testStock.id,
        date: '2026-09-06',
        price: 172.5,
        volume: 5000,
        source: 'manual',
        change: 0,
        changePercent: 0,
      });

      const fetchMock = jest.fn().mockImplementation((url: string) => {
        if (url.includes('alphavantage.co')) {
          return Promise.reject(new Error('ETIMEDOUT: Connection timed out'));
        }
        if (url.includes('polygon.io')) {
          return Promise.reject(new Error('ENOTFOUND: api.polygon.io'));
        }
        return Promise.reject(new Error('Unknown URL'));
      });
      global.fetch = fetchMock as any;

      const result = await getLivePriceForStock(testStock, user.id);

      expect(result.source).toBe('cache');
      expect(result.price).toBe(172.5);

      // Both providers have cooldown set
      expect(getCooldown(user.id, 'alphavantage')).not.toBeNull();
      expect(getCooldown(user.id, 'polygon')).not.toBeNull();
    });
  });

  describe('9. API Route Alias & Stock Fallback Tests (/api/settings/price/:symbol)', () => {
    it('GET /api/settings/price/:symbol returns identical response to GET /api/stocks/ticker-price/:symbol', async () => {
      await UserSetting.create({
        userId: user.id,
        provider: 'alphavantage',
        alphaVantageApiKey: 'av-key',
        polygonApiKey: 'poly-key',
        autoSwitchOnRateLimit: true,
      });

      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('alphavantage.co')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              'Global Quote': {
                '05. price': '225.00',
                '09. change': '5.00',
                '10. change percent': '2.27%',
                '06. volume': '800000',
              },
            }),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      }) as any;

      // Request canonical endpoint
      const canonicalRes = await request(app)
        .get('/api/stocks/ticker-price/AAPL')
        .set('Cookie', `token=${token}`);

      // Request alias endpoint
      const aliasRes = await request(app)
        .get('/api/settings/price/AAPL')
        .set('Cookie', `token=${token}`);

      expect(canonicalRes.status).toBe(200);
      expect(aliasRes.status).toBe(200);
      expect(aliasRes.body).toEqual(canonicalRes.body);
      expect(aliasRes.body.data.price).toBe(225.0);
      expect(aliasRes.body.data.symbol).toBe('AAPL');
    });

    it('GET /api/stocks/ticker-price/:symbol returns manual fallback from DB when provider is manual and price exists', async () => {
      await UserSetting.create({
        userId: user.id,
        provider: 'manual',
        apiKey: null,
      });

      // Seed cached price
      await DailyPrice.create({
        userId: user.id,
        stockId: testStock.id,
        date: '2026-09-06',
        price: 180.0,
        volume: 0,
        source: 'manual',
        change: 1.5,
        changePercent: 0.84,
      });

      const res = await request(app)
        .get('/api/stocks/ticker-price/AAPL')
        .set('Cookie', `token=${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.price).toBe(180.0);
      expect(res.body.data.provider).toBe('manual fallback');
    });

    it('GET /api/settings/price/:symbol returns helpful error when provider is manual and no cache exists', async () => {
      await UserSetting.create({
        userId: user.id,
        provider: 'manual',
        apiKey: null,
      });

      const res = await request(app)
        .get('/api/settings/price/UNKNOWN')
        .set('Cookie', `token=${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('No market data API key configured in Settings');
    });
  });
});
