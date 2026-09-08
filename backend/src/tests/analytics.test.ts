process.env.NODE_ENV = 'test';

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import {
  calculateTwrVolatility,
  calculateAnnualizedReturn,
  getHoldingStateAt,
} from '../routes/analytics';
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

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-32-characters-minimum';

describe('Phase 6: Analytics, Performance Engine & Target Tracking Suite', () => {
  let userA: User;
  let userB: User;
  let tokenA: string;
  let tokenB: string;
  let stockA1: Stock;
  let stockA2: Stock;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    // User A
    userA = await User.create({
      id: 'aaaaaaaa-2222-4000-8000-aaaaaaaaaaaa',
      email: 'analytics-userA@example.com',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
      role: 'user',
    });

    await UserSetting.create({
      userId: userA.id,
      provider: 'manual',
      costBasisMethod: 'average',
      refreshInterval: 60,
    });

    tokenA = jwt.sign(
      { id: userA.id, email: userA.email, role: userA.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // User B (for isolation checks)
    userB = await User.create({
      id: 'bbbbbbbb-2222-4000-8000-bbbbbbbbbbbb',
      email: 'analytics-userB@example.com',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
      role: 'user',
    });

    await UserSetting.create({
      userId: userB.id,
      provider: 'manual',
      costBasisMethod: 'average',
      refreshInterval: 60,
    });

    tokenB = jwt.sign(
      { id: userB.id, email: userB.email, role: userB.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Seed Stocks for User A
    stockA1 = await Stock.create({
      id: '11111111-3333-4000-8000-111111111111',
      userId: userA.id,
      symbol: 'ALFA',
      name: 'Alfa Corp',
      category: 'Technology',
    });

    stockA2 = await Stock.create({
      id: '22222222-3333-4000-8000-222222222222',
      userId: userA.id,
      symbol: 'BETA',
      name: 'Beta Energy Inc',
      category: 'Energy',
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await Purchase.destroy({ where: {} });
    await Sales.destroy({ where: {} });
    await DailyPrice.destroy({ where: {} });
    await PerformanceTarget.destroy({ where: {} });
  });

  describe('1. TWR Return & Volatility Mathematical Engine [FR8.1]', () => {
    it('isolates external cash flows so capital injections do not inflate volatility', () => {
      // Day 1: $10,000 value
      // Day 2: User adds $10,000 cash flow and buys $10k stock. New value = $20,000.
      // Day 3: Market value stays $20,000.
      // Pure market return is 0% every day. Volatility must be 0%.
      const points = [
        { date: '2026-01-01', value: 10000, cashFlow: 0 },
        { date: '2026-01-02', value: 20000, cashFlow: 10000 },
        { date: '2026-01-03', value: 20000, cashFlow: 0 },
      ];

      const vol = calculateTwrVolatility(points);
      expect(vol).toBe(0.0);
    });

    it('calculates authentic sample standard deviation when asset values fluctuate without cash flows', () => {
      // Day 1: $10,000
      // Day 2: $11,000 (+10%)
      // Day 3: $9,900 (-10%)
      const points = [
        { date: '2026-01-01', value: 10000, cashFlow: 0 },
        { date: '2026-01-02', value: 11000, cashFlow: 0 },
        { date: '2026-01-03', value: 9900, cashFlow: 0 },
      ];

      const vol = calculateTwrVolatility(points);
      expect(vol).toBeGreaterThan(0);
      // Sample standard deviation of [+0.10, -0.10]:
      // mean = 0, diffs = [0.10, -0.10], sum sq = 0.01 + 0.01 = 0.02.
      // s = sqrt(0.02 / (2 - 1)) = sqrt(0.02) ≈ 0.141421 -> 14.14%
      expect(vol).toBeCloseTo(14.14, 1);
    });

    it('returns 0.0 for edge cases (less than 2 days or empty points)', () => {
      expect(calculateTwrVolatility([])).toBe(0.0);
      expect(calculateTwrVolatility([{ date: '2026-01-01', value: 10000, cashFlow: 0 }])).toBe(0.0);
    });
  });

  describe('2. Annualized Return Guardrails & Invariants [FR6.1, FR8.1]', () => {
    it('returns total return without annualization compounding for holding periods under 30 days', () => {
      // 5% return in 10 days would otherwise compound exponentially to an absurd figure
      const res = calculateAnnualizedReturn(5.0, 10, 5000);
      expect(res).toBe(5.0);
    });

    it('accurately annualizes returns for periods >= 30 days', () => {
      // 10% return over 365 days -> 10% annualized
      expect(calculateAnnualizedReturn(10.0, 365, 10000)).toBe(10.0);

      // 44% return over 730 days (2 years) -> (1.44)^0.5 - 1 = 0.20 -> 20% annualized
      expect(calculateAnnualizedReturn(44.0, 730, 10000)).toBe(20.0);
    });

    it('limits exponent to 12 to prevent numeric overflow on very high velocity returns', () => {
      const hugeReturn = calculateAnnualizedReturn(50.0, 30, 10000);
      expect(Number.isFinite(hugeReturn)).toBe(true);
      expect(isNaN(hugeReturn)).toBe(false);
    });

    it('handles total capital loss <= -100% safely by returning -100.00% without NaN', () => {
      const loss = calculateAnnualizedReturn(-105.0, 90, 10000);
      expect(loss).toBe(-100.0);
    });

    it('returns 0 if invested capital is zero', () => {
      expect(calculateAnnualizedReturn(20.0, 60, 0)).toBe(0);
    });
  });

  describe('3. Holding State Timeline Lookup [getHoldingStateAt]', () => {
    it('finds the correct historical holding point on or before target date', () => {
      const timeline = [
        { date: '2026-01-01', remainingShares: 100, averageCost: 10, cumulativeRealizedPL: 0 },
        { date: '2026-01-15', remainingShares: 150, averageCost: 15, cumulativeRealizedPL: 0 },
        { date: '2026-02-01', remainingShares: 50, averageCost: 15, cumulativeRealizedPL: 500 },
      ];

      // Exact match
      const exact = getHoldingStateAt(timeline, '2026-01-15');
      expect(exact.remainingShares).toBe(150);

      // Date between Jan 15 and Feb 1 -> should return Jan 15 holding
      const between = getHoldingStateAt(timeline, '2026-01-20');
      expect(between.remainingShares).toBe(150);

      // Date after Feb 1 -> should return Feb 1 holding
      const after = getHoldingStateAt(timeline, '2026-03-01');
      expect(after.remainingShares).toBe(50);

      // Date before any transactions -> should return zero holding
      const before = getHoldingStateAt(timeline, '2025-12-31');
      expect(before.remainingShares).toBe(0);
      expect(before.averageCost).toBe(0);
    });
  });

  describe('4. Target Progress Tracking & CRUD Lifecycle [FR8, FR8.4]', () => {
    it('creates performance targets for portfolio_value, total_return, and annualized_return', async () => {
      // 1. Portfolio Value target
      const valRes = await request(app)
        .post('/api/analytics/targets')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          targetName: 'Reach $50k Portfolio',
          targetType: 'portfolio_value',
          targetValue: 50000,
          targetDate: '2026-12-31',
        });

      expect(valRes.status).toBe(201);
      expect(valRes.body.success).toBe(true);
      expect(valRes.body.data.targetName).toBe('Reach $50k Portfolio');
      expect(Number(valRes.body.data.targetValue)).toBe(50000);

      // 2. Total Return target
      const retRes = await request(app)
        .post('/api/analytics/targets')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          targetName: 'Achieve 25% Return',
          targetType: 'total_return',
          targetValue: 25,
          targetDate: '2026-12-31',
        });

      expect(retRes.status).toBe(201);
      expect(retRes.body.data.targetType).toBe('total_return');

      // 3. Annualized Return target
      const annRes = await request(app)
        .post('/api/analytics/targets')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          targetName: 'Achieve 15% Annualized',
          targetType: 'annualized_return',
          targetValue: 15,
          targetDate: '2026-12-31',
        });

      expect(annRes.status).toBe(201);
      expect(annRes.body.data.targetType).toBe('annualized_return');
    });

    it('validates target inputs and rejects bad requests with 400', async () => {
      // Missing name
      const noNameRes = await request(app)
        .post('/api/analytics/targets')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ targetName: '', targetType: 'portfolio_value', targetValue: 1000, targetDate: '2026-12-31' });
      expect(noNameRes.status).toBe(400);

      // Invalid targetType
      const badTypeRes = await request(app)
        .post('/api/analytics/targets')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ targetName: 'Test', targetType: 'unsupported_type', targetValue: 1000, targetDate: '2026-12-31' });
      expect(badTypeRes.status).toBe(400);

      // Non-positive targetValue
      const badValRes = await request(app)
        .post('/api/analytics/targets')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ targetName: 'Test', targetType: 'portfolio_value', targetValue: -50, targetDate: '2026-12-31' });
      expect(badValRes.status).toBe(400);

      // Invalid date format
      const badDateRes = await request(app)
        .post('/api/analytics/targets')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ targetName: 'Test', targetType: 'portfolio_value', targetValue: 1000, targetDate: '12/31/2026' });
      expect(badDateRes.status).toBe(400);
    });

    it('computes current metric, progressPercent, and auto-achieves milestone when target is reached', async () => {
      // Setup portfolio data for User A:
      // Buy 100 shares of ALFA @ $50 ($5,000 invested)
      await Purchase.create({
        userId: userA.id,
        stockId: stockA1.id,
        quantity: 100,
        purchasePrice: 50,
        purchaseDate: '2026-01-01',
      });

      // Price moves to $100 -> Portfolio value = 100 * 100 = $10,000 (100% gain)
      await DailyPrice.create({
        userId: userA.id,
        stockId: stockA1.id,
        price: 100,
        volume: 1000,
        date: '2026-01-02',
      });

      // Target 1: $10,000 Portfolio Value (should be 100% progress and auto-achieved)
      await PerformanceTarget.create({
        userId: userA.id,
        targetName: 'Reach $10k',
        targetType: 'portfolio_value',
        targetValue: 10000,
        targetDate: '2026-12-31',
        isAchieved: false,
      });

      // Target 2: $20,000 Portfolio Value (should be 50% progress, not achieved)
      await PerformanceTarget.create({
        userId: userA.id,
        targetName: 'Reach $20k',
        targetType: 'portfolio_value',
        targetValue: 20000,
        targetDate: '2026-12-31',
        isAchieved: false,
      });

      const res = await request(app)
        .get('/api/analytics/targets')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);

      const t1 = res.body.data.find((t: any) => t.targetName === 'Reach $10k');
      expect(t1.currentValue).toBe(10000);
      expect(t1.progressPercent).toBe(100);
      expect(t1.isAchieved).toBe(true);

      const t2 = res.body.data.find((t: any) => t.targetName === 'Reach $20k');
      expect(t2.currentValue).toBe(10000);
      expect(t2.progressPercent).toBe(50);
      expect(t2.isAchieved).toBe(false);
    });

    it('clamps progressPercent to 0 when returns are negative', async () => {
      await Purchase.create({
        userId: userA.id,
        stockId: stockA1.id,
        quantity: 10,
        purchasePrice: 100,
        purchaseDate: '2026-01-01',
      });
      // Price drops to $50 (-50% return)
      await DailyPrice.create({
        userId: userA.id,
        stockId: stockA1.id,
        price: 50,
        volume: 100,
        date: '2026-01-02',
      });

      await PerformanceTarget.create({
        userId: userA.id,
        targetName: 'Achieve 20% Return',
        targetType: 'total_return',
        targetValue: 20,
        targetDate: '2026-12-31',
        isAchieved: false,
      });

      const res = await request(app)
        .get('/api/analytics/targets')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      const target = res.body.data.find((t: any) => t.targetName === 'Achieve 20% Return');
      expect(target.currentValue).toBe(-50);
      expect(target.progressPercent).toBe(0);
      expect(target.isAchieved).toBe(false);
    });

    it('updates and deletes targets with user isolation enforcement', async () => {
      // Create a target for User A
      const targetA = await PerformanceTarget.create({
        userId: userA.id,
        targetName: 'Target to edit',
        targetType: 'total_return',
        targetValue: 20,
        targetDate: '2026-12-31',
        isAchieved: false,
      });

      // User B cannot edit User A's target (404)
      const unauthorizedUpdate = await request(app)
        .put(`/api/analytics/targets/${targetA.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ targetName: 'Hacked target', targetValue: 30 });
      expect(unauthorizedUpdate.status).toBe(404);

      // User A edits their own target
      const validUpdate = await request(app)
        .put(`/api/analytics/targets/${targetA.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          targetName: 'Updated Target Name',
          targetValue: 30,
          targetDate: '2027-01-01',
          isAchieved: true,
        });

      expect(validUpdate.status).toBe(200);
      expect(validUpdate.body.data.targetName).toBe('Updated Target Name');
      expect(Number(validUpdate.body.data.targetValue)).toBe(30);
      expect(validUpdate.body.data.isAchieved).toBe(true);

      // User B cannot delete User A's target (404)
      const unauthorizedDelete = await request(app)
        .delete(`/api/analytics/targets/${targetA.id}`)
        .set('Authorization', `Bearer ${tokenB}`);
      expect(unauthorizedDelete.status).toBe(404);

      // User A deletes their target
      const validDelete = await request(app)
        .delete(`/api/analytics/targets/${targetA.id}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(validDelete.status).toBe(200);

      // Confirm deleted in DB
      const checkDb = await PerformanceTarget.findByPk(targetA.id);
      expect(checkDb).toBeNull();
    });
  });

  describe('5. Analytics Query Endpoints [Charts, Summary, Performance]', () => {
    beforeEach(async () => {
      // Setup complete portfolio scenario for User A
      // Stock 1: 100 shares @ $50 buy on Jan 1
      await Purchase.create({
        userId: userA.id,
        stockId: stockA1.id,
        quantity: 100,
        purchasePrice: 50,
        purchaseDate: '2026-01-01',
      });

      // Stock 2: 100 shares @ $100 buy on Jan 1
      await Purchase.create({
        userId: userA.id,
        stockId: stockA2.id,
        quantity: 100,
        purchasePrice: 100,
        purchaseDate: '2026-01-01',
      });

      // Prices on Jan 1
      await DailyPrice.create({
        userId: userA.id,
        stockId: stockA1.id,
        price: 50,
        volume: 1000,
        date: '2026-01-01',
        change: 0,
        changePercent: 0,
      });
      await DailyPrice.create({
        userId: userA.id,
        stockId: stockA2.id,
        price: 100,
        volume: 2000,
        date: '2026-01-01',
        change: 0,
        changePercent: 0,
      });

      // Prices on Jan 2: ALFA goes to $60 (+20%), BETA goes to $110 (+10%)
      await DailyPrice.create({
        userId: userA.id,
        stockId: stockA1.id,
        price: 60,
        volume: 1500,
        date: '2026-01-02',
        change: 10,
        changePercent: 20,
      });
      await DailyPrice.create({
        userId: userA.id,
        stockId: stockA2.id,
        price: 110,
        volume: 2500,
        date: '2026-01-02',
        change: 10,
        changePercent: 10,
      });

      // Partial sale on Jan 3: Sell 20 shares of ALFA @ $65
      await Sales.create({
        userId: userA.id,
        stockId: stockA1.id,
        quantity: 20,
        sellPrice: 65,
        saleDate: '2026-01-03',
        profitLoss: 300, // 20 * (65 - 50)
      });
    });

    it('GET /api/analytics/charts/:stockId returns price trend and cumulative performance for a stock', async () => {
      const res = await request(app)
        .get(`/api/analytics/charts/${stockA1.id}?startDate=2026-01-01&endDate=2026-01-05`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('priceTrend');
      expect(res.body.data).toHaveProperty('volumeTrend');
      expect(res.body.data).toHaveProperty('cumulativePerformance');
      expect(res.body.data.priceTrend.length).toBeGreaterThanOrEqual(2);
    });

    it('GET /api/analytics/charts/portfolio returns indexed portfolio curve', async () => {
      const res = await request(app)
        .get('/api/analytics/charts/portfolio')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('priceTrend');
      expect(res.body.data).toHaveProperty('cumulativePerformance');
    });

    it('rejects invalid date queries with 400 on charts endpoint', async () => {
      const res = await request(app)
        .get(`/api/analytics/charts/${stockA1.id}?startDate=bad-date`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Must be YYYY-MM-DD');
    });

    it('GET /api/analytics/advanced returns volatility, annualized return, and asset allocation', async () => {
      const res = await request(app)
        .get('/api/analytics/advanced')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;

      expect(data).toHaveProperty('totalPortfolioValue');
      expect(data).toHaveProperty('totalInvestedCapital');
      expect(data).toHaveProperty('totalReturnPercent');
      expect(data).toHaveProperty('annualizedReturnPercent');
      expect(data).toHaveProperty('volatility');
      expect(data).toHaveProperty('assetAllocation');
      expect(Array.isArray(data.assetAllocation)).toBe(true);
      expect(data.scopedStock).toBeNull();

      // Asset allocation should sum to approximately 100%
      const totalAlloc = data.assetAllocation.reduce((sum: number, item: any) => sum + item.percentage, 0);
      expect(totalAlloc).toBeCloseTo(100, 0);
    });

    it('GET /api/analytics/advanced?stockId=<id> returns scoped metrics for the requested stock', async () => {
      const res = await request(app)
        .get(`/api/analytics/advanced?stockId=${stockA1.id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;

      expect(data.scopedStock).toEqual({
        id: stockA1.id,
        symbol: 'ALFA',
        name: 'Alfa Corp',
      });
      expect(data.assetAllocation.length).toBe(1);
      expect(data.assetAllocation[0].stockId).toBe(stockA1.id);
      expect(data.assetAllocation[0].percentage).toBe(100);
      expect(data.totalPortfolioValue).toBeGreaterThan(0);
      expect(data.volatility).toBeGreaterThan(0);

      // Returns 404 for nonexistent stock
      const notFoundRes = await request(app)
        .get('/api/analytics/advanced?stockId=00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(notFoundRes.status).toBe(404);
    });

    it('GET /api/analytics/advanced?stockId=<id> computes stock price volatility even when purchased recently after prices exist', async () => {
      // Create a stock with 4 historical prices but purchase made on the last date
      const recentStock = await Stock.create({
        userId: userA.id,
        symbol: 'RCENT',
        name: 'Recent Stock',
        category: 'Tech',
        currency: 'USD',
      });

      await DailyPrice.create({ userId: userA.id, stockId: recentStock.id, price: 10, volume: 100, date: '2026-03-01' });
      await DailyPrice.create({ userId: userA.id, stockId: recentStock.id, price: 12, volume: 100, date: '2026-03-02' });
      await DailyPrice.create({ userId: userA.id, stockId: recentStock.id, price: 11, volume: 100, date: '2026-03-03' });
      await DailyPrice.create({ userId: userA.id, stockId: recentStock.id, price: 13, volume: 100, date: '2026-03-04' });

      // User only purchased on 2026-03-04
      await Purchase.create({
        userId: userA.id,
        stockId: recentStock.id,
        quantity: 5,
        purchasePrice: 13,
        purchaseDate: '2026-03-04',
      });

      const res = await request(app)
        .get(`/api/analytics/advanced?stockId=${recentStock.id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.volatility).toBeGreaterThan(0);
    });

    it('GET /api/analytics/charts/:stockId carries forward holdings and prices into subsequent date windows', async () => {
      // Stock was purchased and priced in Jan 2026. Query Feb 2026 window.
      const res = await request(app)
        .get(`/api/analytics/charts/${stockA1.id}?startDate=2026-02-01&endDate=2026-02-28`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;

      expect(data.cumulativePerformance.length).toBeGreaterThanOrEqual(2);
      expect(data.cumulativePerformance[0].date).toBe('2026-02-01');
      expect(data.cumulativePerformance[0].portfolioValue).toBeGreaterThan(0);
      expect(data.priceTrend.length).toBeGreaterThanOrEqual(1);
      expect(data.priceTrend[0].price).toBeGreaterThan(0);
    });

    it('GET /api/analytics/benchmark defaults cleanly to all-time without requiring dates', async () => {
      // Without dates: defaults cleanly without 400
      const res = await request(app)
        .get('/api/analytics/benchmark')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;

      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(2);
      expect(data[0]).toHaveProperty('symbol');
      expect(data[0]).toHaveProperty('performanceGain');
      expect(data[0]).toHaveProperty('insufficientHistory');

      // Rejects invalid date format
      const badDateRes = await request(app)
        .get('/api/analytics/benchmark?startDate=invalid-date')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(badDateRes.status).toBe(400);

      // Valid request with startDate and endDate
      const filteredRes = await request(app)
        .get('/api/analytics/benchmark?startDate=2026-01-01&endDate=2026-01-05')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(filteredRes.status).toBe(200);
      expect(filteredRes.body.success).toBe(true);
    });

    it('GET /api/portfolio/summary returns accurate valuation KPIs and realized/unrealized P&L', async () => {
      const res = await request(app)
        .get('/api/portfolio/summary')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;

      expect(data).toHaveProperty('totalPortfolioValue');
      expect(data).toHaveProperty('totalInvestedCapital');
      expect(data).toHaveProperty('realizedPL');
      expect(data).toHaveProperty('unrealizedPL');

      // Realized PL should be 300 from the partial sale
      expect(data.realizedPL).toBe(300);
      expect(data.totalPortfolioValue).toBeGreaterThan(0);
      expect(data.totalInvestedCapital).toBeGreaterThan(0);
    });
  });
});
