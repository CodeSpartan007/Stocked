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
import jwt from 'jsonwebtoken';
import { app } from '../index';
import {
  sequelize,
  User,
  Stock,
  Purchase,
  Sales,
  PerformanceTarget,
  UserSetting,
  DailyPrice,
} from '../models';
import { computeChronologicalHoldings } from '../routes/transactions';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-32-characters-minimum';

describe('Phase 3: Transaction Lifecycle, Target Management & FIFO Accounting', () => {
  let userA: User;
  let userB: User;
  let tokenA: string;
  let tokenB: string;
  let stockA: Stock;
  let stockB: Stock;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    userA = await User.create({
      id: '11111111-2222-3333-4444-555555555555',
      email: 'phase3-userA@example.com',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
      role: 'user',
    });

    userB = await User.create({
      id: '22222222-3333-4444-5555-666666666666',
      email: 'phase3-userB@example.com',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
      role: 'user',
    });

    tokenA = jwt.sign(
      { id: userA.id, email: userA.email, role: userA.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    tokenB = jwt.sign(
      { id: userB.id, email: userB.email, role: userB.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    stockA = await Stock.create({
      userId: userA.id,
      symbol: 'AAPL',
      name: 'Apple Inc.',
    });

    stockB = await Stock.create({
      userId: userB.id,
      symbol: 'MSFT',
      name: 'Microsoft Corp.',
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await Purchase.destroy({ where: {} });
    await Sales.destroy({ where: {} });
    await PerformanceTarget.destroy({ where: {} });
    await UserSetting.destroy({ where: {} });
    await DailyPrice.destroy({ where: {} });
  });

  describe('3.1 Transaction Edit & Deletion Endpoints [FR3, FR4]', () => {
    it('PUT /api/transactions/purchases/:id successfully updates purchase and recalculates sales P&L', async () => {
      // 1. Initial purchase: 100 shares @ $10 on 2026-01-01
      const buy = await Purchase.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      // 2. Sale: 50 shares @ $20 on 2026-01-10 -> P&L = 50 * (20 - 10) = $500
      const sale = await Sales.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 50,
        sellPrice: 20,
        saleDate: '2026-01-10',
        profitLoss: 500,
      });

      // 3. Edit purchase: change purchasePrice from $10 to $12
      const res = await request(app)
        .put(`/api/transactions/purchases/${buy.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          purchasePrice: 12,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Number(res.body.data.purchasePrice)).toBe(12);

      // Verify sale P&L was automatically recalculated: 50 * (20 - 12) = $400
      await sale.reload();
      expect(Number(sale.profitLoss)).toBe(400);
    });

    it('PUT /api/transactions/purchases/:id rejects update if quantity reduction causes negative inventory', async () => {
      const buy = await Purchase.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      await Sales.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 80,
        sellPrice: 20,
        saleDate: '2026-01-10',
        profitLoss: 800,
      });

      // Attempt to reduce purchase to 70 shares (leaving balance at -10 on 2026-01-10)
      const res = await request(app)
        .put(`/api/transactions/purchases/${buy.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          quantity: 70,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors[0].message).toContain('drop to -10 shares on 2026-01-10');

      // Ensure DB was unchanged
      await buy.reload();
      expect(Number(buy.quantity)).toBe(100);
    });

    it('PUT /api/transactions/purchases/:id rejects update if date is moved past subsequent sales', async () => {
      const buy = await Purchase.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      await Sales.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 50,
        sellPrice: 20,
        saleDate: '2026-01-10',
        profitLoss: 500,
      });

      // Attempt to move purchase date after the sale (to 2026-01-15)
      const res = await request(app)
        .put(`/api/transactions/purchases/${buy.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          purchaseDate: '2026-01-15',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors[0].message).toContain('drop to -50 shares on 2026-01-10');
    });

    it('PUT /api/transactions/purchases/:id enforces tenancy isolation', async () => {
      const buyA = await Purchase.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      // User B attempts to edit User A's purchase
      const res = await request(app)
        .put(`/api/transactions/purchases/${buyA.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          quantity: 200,
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('DELETE /api/transactions/purchases/:id rejects deletion if subsequent sales depend on those shares', async () => {
      const buy = await Purchase.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 50,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      await Sales.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 30,
        sellPrice: 20,
        saleDate: '2026-01-10',
        profitLoss: 300,
      });

      // Attempt to delete the only purchase
      const res = await request(app)
        .delete(`/api/transactions/purchases/${buy.id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors[0].message).toContain('drop to -30 shares on 2026-01-10');

      // Verify purchase was NOT deleted
      const checkBuy = await Purchase.findByPk(buy.id);
      expect(checkBuy).not.toBeNull();
    });

    it('DELETE /api/transactions/purchases/:id safely deletes purchase and recalculates sales P&L when inventory permits', async () => {
      // Purchase 1: 100 shares @ $10
      await Purchase.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      // Purchase 2: 50 shares @ $20 (avg cost before sale = 2000 / 150 = $13.3333)
      const buy2 = await Purchase.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 50,
        purchasePrice: 20,
        purchaseDate: '2026-01-05',
      });

      // Sale: 40 shares @ $30 -> P&L = 40 * (30 - 13.3333) = $666.67
      const sale = await Sales.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 40,
        sellPrice: 30,
        saleDate: '2026-01-10',
        profitLoss: 666.67,
      });

      // Safely delete Purchase 2 (100 shares from Purchase 1 is still enough to cover 40 share sale)
      const res = await request(app)
        .delete(`/api/transactions/purchases/${buy2.id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const checkBuy2 = await Purchase.findByPk(buy2.id);
      expect(checkBuy2).toBeNull();

      // Verify sale P&L recalculated against only Purchase 1 (@ $10): 40 * (30 - 10) = $800.00
      await sale.reload();
      expect(Number(sale.profitLoss)).toBe(800);
    });

    it('DELETE /api/transactions/purchases/:id enforces tenancy isolation', async () => {
      const buyA = await Purchase.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      const res = await request(app)
        .delete(`/api/transactions/purchases/${buyA.id}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
    });

    it('PUT /api/transactions/sales/:id updates sale quantity, price, and recalculates P&L', async () => {
      await Purchase.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      const sale = await Sales.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 20,
        sellPrice: 20,
        saleDate: '2026-01-10',
        profitLoss: 200,
      });

      // Update sale from 20 shares @ $20 to 50 shares @ $30
      const res = await request(app)
        .put(`/api/transactions/sales/${sale.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          quantity: 50,
          sellPrice: 30,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Number(res.body.data.quantity)).toBe(50);
      expect(Number(res.body.data.sellPrice)).toBe(30);

      // Verify P&L recalculated: 50 * (30 - 10) = $1,000.00
      await sale.reload();
      expect(Number(sale.profitLoss)).toBe(1000);
    });

    it('PUT /api/transactions/sales/:id rejects update if new quantity exceeds inventory', async () => {
      await Purchase.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 50,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      const sale = await Sales.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 20,
        sellPrice: 20,
        saleDate: '2026-01-10',
        profitLoss: 200,
      });

      // Try to sell 80 shares when only 50 exist
      const res = await request(app)
        .put(`/api/transactions/sales/${sale.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          quantity: 80,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors[0].message).toContain('drop to -30 shares on 2026-01-10');
    });

    it('PUT /api/transactions/sales/:id rejects date earlier than first purchase', async () => {
      await Purchase.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 50,
        purchasePrice: 10,
        purchaseDate: '2026-01-10',
      });

      const sale = await Sales.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 20,
        sellPrice: 20,
        saleDate: '2026-01-15',
        profitLoss: 200,
      });

      const res = await request(app)
        .put(`/api/transactions/sales/${sale.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          saleDate: '2026-01-05',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors[0].message).toContain('earlier than your first recorded purchase');
    });

    it('DELETE /api/transactions/sales/:id successfully restores inventory and recalculates remaining sales', async () => {
      await Purchase.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      const sale1 = await Sales.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 40,
        sellPrice: 20,
        saleDate: '2026-01-05',
        profitLoss: 400,
      });

      const sale2 = await Sales.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 30,
        sellPrice: 25,
        saleDate: '2026-01-10',
        profitLoss: 450,
      });

      // Check current holdings: 100 - 40 - 30 = 30 shares
      let holdings = await computeChronologicalHoldings(stockA.id, userA.id);
      expect(holdings.remainingShares).toBe(30);

      // Delete sale1
      const res = await request(app)
        .delete(`/api/transactions/sales/${sale1.id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const checkSale1 = await Sales.findByPk(sale1.id);
      expect(checkSale1).toBeNull();

      // Holdings should be restored: 100 - 30 = 70 shares
      holdings = await computeChronologicalHoldings(stockA.id, userA.id);
      expect(holdings.remainingShares).toBe(70);

      // Sale2 P&L remains intact: 30 * (25 - 10) = $450
      await sale2.reload();
      expect(Number(sale2.profitLoss)).toBe(450);
    });

    it('DELETE /api/transactions/sales/:id enforces tenancy isolation', async () => {
      await Purchase.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      const saleA = await Sales.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 20,
        sellPrice: 20,
        saleDate: '2026-01-10',
        profitLoss: 200,
      });

      const res = await request(app)
        .delete(`/api/transactions/sales/${saleA.id}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
    });
  });

  describe('3.2 Performance Targets CRUD Implementation [FR8.4]', () => {
    it('PUT /api/analytics/targets/:id updates target fields with validation', async () => {
      const target = await PerformanceTarget.create({
        userId: userA.id,
        targetName: 'Reach $100k',
        targetType: 'portfolio_value',
        targetValue: 100000,
        targetDate: '2026-12-31',
        isAchieved: false,
      });

      // Valid update
      const res = await request(app)
        .put(`/api/analytics/targets/${target.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          targetName: 'Reach $150k Milestone',
          targetValue: 150000,
          isAchieved: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.targetName).toBe('Reach $150k Milestone');
      expect(Number(res.body.data.targetValue)).toBe(150000);
      expect(res.body.data.isAchieved).toBe(true);

      // Verify validation: invalid targetType
      const invalidTypeRes = await request(app)
        .put(`/api/analytics/targets/${target.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          targetType: 'invalid_type',
        });

      expect(invalidTypeRes.status).toBe(400);
      expect(invalidTypeRes.body.success).toBe(false);

      // Verify validation: negative targetValue
      const invalidValRes = await request(app)
        .put(`/api/analytics/targets/${target.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          targetValue: -500,
        });

      expect(invalidValRes.status).toBe(400);
      expect(invalidValRes.body.success).toBe(false);
    });

    it('PUT /api/analytics/targets/:id enforces tenancy isolation', async () => {
      const targetA = await PerformanceTarget.create({
        userId: userA.id,
        targetName: 'User A Target',
        targetType: 'total_return',
        targetValue: 20,
        targetDate: '2026-12-31',
        isAchieved: false,
      });

      // User B attempts to edit User A's target
      const res = await request(app)
        .put(`/api/analytics/targets/${targetA.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          targetName: 'Hacked Target',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('DELETE /api/analytics/targets/:id removes target and enforces tenancy isolation', async () => {
      const targetA = await PerformanceTarget.create({
        userId: userA.id,
        targetName: 'To be deleted',
        targetType: 'annualized_return',
        targetValue: 15,
        targetDate: '2026-12-31',
        isAchieved: false,
      });

      // User B cannot delete User A's target
      const unauthorizedRes = await request(app)
        .delete(`/api/analytics/targets/${targetA.id}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(unauthorizedRes.status).toBe(404);

      // User A deletes successfully
      const res = await request(app)
        .delete(`/api/analytics/targets/${targetA.id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const checkTarget = await PerformanceTarget.findByPk(targetA.id);
      expect(checkTarget).toBeNull();
    });
  });

  describe('3.3 FIFO vs Average Cost Basis Accounting Engine [SRS Section 8.1]', () => {
    it('correctly calculates differing P&L between Average Cost and FIFO lot matching', async () => {
      // Buy 1: 100 shares @ $10 on 2026-01-01 ($1000)
      await Purchase.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      // Buy 2: 50 shares @ $20 on 2026-01-05 ($1000)
      // Total inventory: 150 shares, $2000 total cost
      await Purchase.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 50,
        purchasePrice: 20,
        purchaseDate: '2026-01-05',
      });

      // Check under Average Cost Basis:
      // Avg Cost = 2000 / 150 = $13.3333
      const avgHoldings = await computeChronologicalHoldings(
        stockA.id,
        userA.id,
        undefined,
        'average'
      );
      expect(avgHoldings.costBasisMethod).toBe('average');
      expect(avgHoldings.remainingShares).toBe(150);
      expect(avgHoldings.averageCost).toBe(13.3333);
      expect(avgHoldings.totalCostBasis).toBe(2000);

      // Sell 60 shares @ $30 under Average Cost:
      // Proceeds = 60 * 30 = $1800
      // Cost = 60 * 13.3333 = $800.00
      // P&L = 60 * (30 - 13.3333) = $1000.00
      const avgSaleProfit = avgHoldings.computeSaleProfit(60, 30);
      expect(avgSaleProfit.costBasis).toBe(800.00);
      expect(avgSaleProfit.profitLoss).toBe(1000.00);

      // Check under FIFO Cost Basis:
      // Lot 1: 100 @ $10, Lot 2: 50 @ $20
      const fifoHoldings = await computeChronologicalHoldings(
        stockA.id,
        userA.id,
        undefined,
        'fifo'
      );
      expect(fifoHoldings.costBasisMethod).toBe('fifo');
      expect(fifoHoldings.remainingShares).toBe(150);
      expect(fifoHoldings.totalCostBasis).toBe(2000);

      // Sell 60 shares @ $30 under FIFO:
      // 60 shares come entirely from Lot 1 (@ $10)
      // Cost = 60 * 10 = $600.00
      // Proceeds = 60 * 30 = $1800.00
      // P&L = 1800 - 600 = $1200.00
      const fifoSaleProfit = fifoHoldings.computeSaleProfit(60, 30);
      expect(fifoSaleProfit.costBasis).toBe(600.00);
      expect(fifoSaleProfit.profitLoss).toBe(1200.00);
    });

    it('FIFO accurately splits lots across multiple tranches when sale exceeds first lot', async () => {
      // Buy 1: 50 shares @ $10 on 2026-01-01 ($500)
      await Purchase.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 50,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      // Buy 2: 50 shares @ $20 on 2026-01-05 ($1000)
      await Purchase.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 50,
        purchasePrice: 20,
        purchaseDate: '2026-01-05',
      });

      // Sale: 70 shares @ $30 on 2026-01-10
      // FIFO consumes:
      // - 50 shares from Lot 1 @ $10 = $500
      // - 20 shares from Lot 2 @ $20 = $400
      // Total Cost Basis = $900
      // Proceeds = 70 * $30 = $2100
      // Realized P&L = 2100 - 900 = $1200.00
      const fifoHoldings = await computeChronologicalHoldings(
        stockA.id,
        userA.id,
        undefined,
        'fifo'
      );
      const saleEval = fifoHoldings.computeSaleProfit(70, 30);
      expect(saleEval.costBasis).toBe(900.00);
      expect(saleEval.profitLoss).toBe(1200.00);
    });

    it('POST /api/settings/feed toggles costBasisMethod and automatically recalculates all sales P&L', async () => {
      // 1. Setup user transactions:
      // Buy 1: 100 shares @ $10 on 2026-01-01
      await Purchase.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      // Buy 2: 50 shares @ $20 on 2026-01-05 (avg cost = $13.3333)
      await Purchase.create({
        userId: userA.id,
        stockId: stockA.id,
        quantity: 50,
        purchasePrice: 20,
        purchaseDate: '2026-01-05',
      });

      // Record a Sale via POST /api/transactions/sales under default Average cost
      const saleRes = await request(app)
        .post('/api/transactions/sales')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          stockId: stockA.id,
          quantity: 60,
          sellPrice: 30,
          saleDate: '2026-01-10',
        });

      expect(saleRes.status).toBe(201);
      const saleId = saleRes.body.data.id;
      // Under Average Cost: 60 * (30 - 13.3333) = $1000.00
      expect(Number(saleRes.body.data.profitLoss)).toBe(1000.00);

      // 2. Toggle cost-basis method to FIFO in Settings
      const settingsRes = await request(app)
        .post('/api/settings/feed')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          provider: 'manual',
          refreshInterval: 60,
          costBasisMethod: 'fifo',
        });

      expect(settingsRes.status).toBe(200);
      expect(settingsRes.body.data.costBasisMethod).toBe('fifo');

      // 3. Verify sale was automatically updated in DB to FIFO profit:
      // Under FIFO: 60 shares @ $10 cost basis -> P&L = (60 * 30) - 600 = $1200.00
      const saleInDb = await Sales.findByPk(saleId);
      expect(Number(saleInDb?.profitLoss)).toBe(1200.00);

      // 4. Verify GET /api/settings/feed returns updated setting
      const getSettingsRes = await request(app)
        .get('/api/settings/feed')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(getSettingsRes.status).toBe(200);
      expect(getSettingsRes.body.data.costBasisMethod).toBe('fifo');

      // 5. Toggle back to Average cost
      const revertSettingsRes = await request(app)
        .post('/api/settings/feed')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          provider: 'manual',
          refreshInterval: 60,
          costBasisMethod: 'average',
        });

      expect(revertSettingsRes.status).toBe(200);
      expect(revertSettingsRes.body.data.costBasisMethod).toBe('average');

      // 6. Verify sale P&L recalculated back to Average cost ($1000.00)
      await saleInDb?.reload();
      expect(Number(saleInDb?.profitLoss)).toBe(1000.00);
    });
  });
});
