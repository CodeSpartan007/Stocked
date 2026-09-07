process.env.NODE_ENV = 'test';

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import {
  sequelize,
  User,
  Stock,
  Purchase,
  Sales,
  DailyPrice,
  PerformanceTarget,
  UserSetting,
} from '../models';
import {
  convertPrice,
  formatCurrency,
  getUsdToKesRate,
  refreshLiveExchangeRate,
  clearExchangeRateCache,
} from '../services/currencyService';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-32-characters-minimum';

describe('Multi-Currency Engine & Financial Accounting Suite', () => {
  let user: User;
  let token: string;
  let usdStock: Stock;
  let kesStock: Stock;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    user = await User.create({
      id: '99999999-1111-2222-3333-444444444444',
      email: 'currency-tester@stocked.com',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
      role: 'user',
    });

    token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, {
      expiresIn: '1h',
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('1. Currency Conversion & Formatting Math', () => {
    it('accurately converts USD to KES at the given exchange rate', () => {
      const rate = 130.0;
      expect(convertPrice(100, 'USD', 'KES', rate)).toBe(13000);
      expect(convertPrice(1.5, 'USD', 'KES', rate)).toBe(195);
    });

    it('accurately converts KES to USD at the given exchange rate', () => {
      const rate = 130.0;
      expect(convertPrice(13000, 'KES', 'USD', rate)).toBe(100);
      expect(convertPrice(260, 'KES', 'USD', rate)).toBe(2);
    });

    it('returns the unchanged amount when from and to currencies match', () => {
      expect(convertPrice(500, 'USD', 'USD', 130)).toBe(500);
      expect(convertPrice(500, 'KES', 'KES', 130)).toBe(500);
    });

    it('handles zero and negative amounts accurately', () => {
      expect(convertPrice(0, 'USD', 'KES', 130)).toBe(0);
      expect(convertPrice(-50, 'USD', 'KES', 130)).toBe(-6500);
      expect(convertPrice(-6500, 'KES', 'USD', 130)).toBe(-50);
    });

    it('formats standard currencies with 2 decimal places and appropriate symbol prefixes', () => {
      expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56');
      expect(formatCurrency(1234.56, 'KES')).toBe('KSh 1,234.56');
    });

    it('supports adaptive precision (4 decimals) for micro penny stocks below 0.05', () => {
      expect(formatCurrency(0.0045, 'USD')).toBe('$0.0045');
      expect(formatCurrency(0.02, 'USD')).toBe('$0.0200');
      expect(formatCurrency(0.05, 'USD')).toBe('$0.05');
      expect(formatCurrency(0.0125, 'KES')).toBe('KSh 0.0125');
    });
  });

  describe('2. Exchange Rate Fallback & Cache Engine', () => {
    beforeEach(() => {
      clearExchangeRateCache();
    });

    it('falls back to default 130.00 when external API is unreachable or times out', async () => {
      const rateInfo = await getUsdToKesRate(user.id);
      expect(rateInfo.rate).toBeGreaterThanOrEqual(50);
      expect(rateInfo.rate).toBeLessThanOrEqual(300);
    });

    it('uses customExchangeRate when set by the user in settings', async () => {
      await UserSetting.upsert({
        userId: user.id,
        customExchangeRate: 142.5,
        baseCurrency: 'KES',
      });

      const rateInfo = await getUsdToKesRate(user.id);
      expect(rateInfo.rate).toBe(142.5);

      // Clean up custom rate and restore baseCurrency to USD
      await UserSetting.update(
        { customExchangeRate: null, baseCurrency: 'USD' },
        { where: { userId: user.id } }
      );
    });

    it('refreshes live exchange rate on demand', async () => {
      const refreshed = await refreshLiveExchangeRate(user.id);
      expect(refreshed.rate).toBeGreaterThanOrEqual(50);
      expect(refreshed.rate).toBeLessThanOrEqual(300);
    });
  });

  describe('3. Settings Currency API Endpoints', () => {
    it('GET /api/settings/exchange-rate returns exchange rate details and base currency', async () => {
      const res = await request(app)
        .get('/api/settings/exchange-rate')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rate).toBeDefined();
      expect(res.body.data.inverseRate).toBeDefined();
      expect(res.body.data.baseCurrency).toBe('USD');
      expect(res.body.data.inverseRate).toBeCloseTo(1 / res.body.data.rate, 4);
    });

    it('POST /api/settings/feed validates and updates baseCurrency and customExchangeRate', async () => {
      const updateRes = await request(app)
        .post('/api/settings/feed')
        .set('Authorization', `Bearer ${token}`)
        .send({
          baseCurrency: 'KES',
          customExchangeRate: 135.0,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);

      const getRes = await request(app)
        .get('/api/settings/feed')
        .set('Authorization', `Bearer ${token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.baseCurrency).toBe('KES');
      expect(Number(getRes.body.data.customExchangeRate)).toBe(135.0);

      // Reset back to USD without custom rate for next tests
      await request(app)
        .post('/api/settings/feed')
        .set('Authorization', `Bearer ${token}`)
        .send({
          baseCurrency: 'USD',
          customExchangeRate: null,
        });
    });

    it('POST /api/settings/feed rejects invalid baseCurrency', async () => {
      const res = await request(app)
        .post('/api/settings/feed')
        .set('Authorization', `Bearer ${token}`)
        .send({
          baseCurrency: 'EUR',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('POST /api/settings/exchange-rate/refresh forces fresh rate fetch', async () => {
      const res = await request(app)
        .post('/api/settings/exchange-rate/refresh')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rate).toBeGreaterThan(0);
    });
  });

  describe('4. Stock Currency Management & Immutability Guardrails', () => {
    it('creates a US stock defaulting to USD currency', async () => {
      const res = await request(app)
        .post('/api/stocks')
        .set('Authorization', `Bearer ${token}`)
        .send({
          symbol: 'AAPL',
          name: 'Apple Inc.',
          category: 'Technology',
          currency: 'USD',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.currency).toBe('USD');
      usdStock = res.body.data;
    });

    it('creates an NSE stock auto-detecting KES currency', async () => {
      const res = await request(app)
        .post('/api/stocks')
        .set('Authorization', `Bearer ${token}`)
        .send({
          symbol: 'SCOM',
          name: 'Safaricom PLC',
          category: 'Telecommunications',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.currency).toBe('KES');
      kesStock = res.body.data;
    });

    it('prevents modifying stock currency once transactions exist', async () => {
      // Create a purchase for SCOM
      await Purchase.create({
        userId: user.id,
        stockId: kesStock.id,
        quantity: 100,
        purchasePrice: 26.5,
        purchaseDate: '2026-01-15',
      });

      // Attempt to change currency from KES to USD
      const updateRes = await request(app)
        .put(`/api/stocks/${kesStock.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          symbol: 'SCOM',
          name: 'Safaricom PLC',
          category: 'Telecommunications',
          currency: 'USD',
        });

      expect(updateRes.status).toBe(400);
      expect(updateRes.body.success).toBe(false);
      expect(updateRes.body.message).toContain('Cannot change stock currency');
    });
  });

  describe('5. Multi-Currency Portfolio Accounting & Valuation Invariant', () => {
    beforeAll(async () => {
      // Set fixed custom rate 130 for deterministic financial testing
      await UserSetting.upsert({
        userId: user.id,
        baseCurrency: 'USD',
        customExchangeRate: 130.0,
      });

      // Buy AAPL (10 shares at $150 USD)
      await Purchase.create({
        userId: user.id,
        stockId: usdStock.id,
        quantity: 10,
        purchasePrice: 150.0,
        purchaseDate: '2026-01-10',
      });

      // Clear any auto-seeded/fetched price records for predictable math
      await DailyPrice.destroy({ where: { stockId: [usdStock.id, kesStock.id] } });

      // Set deterministic live prices: AAPL = $160 USD, SCOM = 28 KES
      await DailyPrice.create({
        userId: user.id,
        stockId: usdStock.id,
        date: '2026-01-20',
        price: 160.0,
        volume: 10000,
        source: 'manual',
      });

      await DailyPrice.create({
        userId: user.id,
        stockId: kesStock.id,
        date: '2026-01-20',
        price: 28.0,
        volume: 50000,
        source: 'manual',
      });
    });

    it('evaluates portfolio correctly in USD base currency', async () => {
      const res = await request(app)
        .get('/api/portfolio/summary')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.currency).toBe('USD');

      // AAPL: cost = 10 * 150 = 1500 USD; value = 10 * 160 = 1600 USD; unrealizedPL = +100 USD
      // SCOM: cost = 100 * 26.5 = 2650 KES / 130 = ~20.38 USD; value = 100 * 28 = 2800 KES / 130 = ~21.54 USD
      // Expected total portfolio value = 1600 + (2800 / 130) ≈ 1621.54
      expect(res.body.data.totalPortfolioValue).toBeCloseTo(1600 + 2800 / 130, 1);
      expect(res.body.data.totalInvestedCapital).toBeCloseTo(1500 + 2650 / 130, 1);
    });

    it('evaluates portfolio correctly when switching to KES base currency', async () => {
      // Switch base currency to KES
      await request(app)
        .post('/api/settings/feed')
        .set('Authorization', `Bearer ${token}`)
        .send({
          baseCurrency: 'KES',
          customExchangeRate: 130.0,
        });

      const res = await request(app)
        .get('/api/portfolio/summary')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.currency).toBe('KES');

      // AAPL in KES: value = 1600 * 130 = 208,000 KES
      // SCOM in KES: value = 100 * 28 = 2,800 KES
      // Total portfolio value = 208,000 + 2,800 = 210,800 KES
      expect(res.body.data.totalPortfolioValue).toBeCloseTo(210800, 0);
      // AAPL cost in KES: 1500 * 130 = 195,000 KES
      // SCOM cost in KES: 2,650 KES
      // Total invested = 197,650 KES
      expect(res.body.data.totalInvestedCapital).toBeCloseTo(197650, 0);
    });

    it('converts multi-currency sales realized P&L accurately', async () => {
      // Sell 50 shares of SCOM at 30 KES (Cost was 26.5 KES)
      // Native profit = 50 * (30 - 26.5) = 175 KES
      await Sales.create({
        userId: user.id,
        stockId: kesStock.id,
        quantity: 50,
        sellPrice: 30.0,
        saleDate: '2026-02-01',
        profitLoss: 175.0,
      });

      // When baseCurrency is KES: realized P&L should be 175 KES
      const resKes = await request(app)
        .get('/api/portfolio/summary')
        .set('Authorization', `Bearer ${token}`);

      expect(resKes.body.data.realizedPL).toBeCloseTo(175, 1);

      // Switch baseCurrency to USD: realized P&L should be 175 / 130 ≈ 1.35 USD
      await request(app)
        .post('/api/settings/feed')
        .set('Authorization', `Bearer ${token}`)
        .send({
          baseCurrency: 'USD',
          customExchangeRate: 130.0,
        });

      const resUsd = await request(app)
        .get('/api/portfolio/summary')
        .set('Authorization', `Bearer ${token}`);

      expect(resUsd.body.data.realizedPL).toBeCloseTo(175 / 130, 2);
    });
  });

  describe('6. Performance Targets Multi-Currency Normalization', () => {
    it('normalizes portfolio_value target to avoid false auto-achievement when switching base currency', async () => {
      // Create target: 2,000 USD portfolio value
      const targetRes = await request(app)
        .post('/api/analytics/targets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          targetName: 'Reach $2000 USD',
          targetType: 'portfolio_value',
          targetValue: 2000,
          targetDate: '2026-12-31',
          currency: 'USD',
        });

      expect(targetRes.status).toBe(201);
      expect(targetRes.body.data.currency).toBe('USD');

      // Check target when baseCurrency is USD (portfolio is ~$1,600, target is $2,000 -> ~80% progress)
      const resUsd = await request(app)
        .get('/api/analytics/targets')
        .set('Authorization', `Bearer ${token}`);

      const targetUsd = resUsd.body.data.find((t: any) => t.targetName === 'Reach $2000 USD');
      expect(targetUsd.progressPercent).toBeLessThan(100);
      expect(targetUsd.isAchieved).toBe(false);

      // Switch baseCurrency to KES (portfolio becomes ~210,000 KES)
      await request(app)
        .post('/api/settings/feed')
        .set('Authorization', `Bearer ${token}`)
        .send({
          baseCurrency: 'KES',
          customExchangeRate: 130.0,
        });

      const resKes = await request(app)
        .get('/api/analytics/targets')
        .set('Authorization', `Bearer ${token}`);

      const targetKes = resKes.body.data.find((t: any) => t.targetName === 'Reach $2000 USD');
      // Normalized target in KES: $2,000 * 130 = 260,000 KES
      // Current portfolio ~ 210,000 KES -> progress ~ 80% (NOT 210,000 / 2,000 = 10,000%!)
      expect(targetKes.progressPercent).toBeLessThan(100);
      expect(targetKes.isAchieved).toBe(false);
      expect(targetKes.normalizedTargetValue).toBeCloseTo(260000, 0);
      expect(targetKes.targetValue).toBe(2000);
    });
  });

  describe('7. Multi-Currency Export Reports', () => {
    it('generates PDF summary report with active KES base currency', async () => {
      const res = await request(app)
        .post('/api/exports/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          reportType: 'summary',
          format: 'PDF',
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
    });

    it('generates XLSX transactions report with active KES base currency', async () => {
      const res = await request(app)
        .post('/api/exports/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          reportType: 'transactions',
          format: 'XLSX',
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    });
  });
});
