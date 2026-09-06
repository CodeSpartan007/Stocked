process.env.NODE_ENV = 'test';

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import {
  computeChronologicalHoldings,
  computeStockHoldings,
  validateTimelineBalance,
  recalculateStockSales,
  recalculateAllUserSales,
} from '../routes/transactions';
import {
  calculateAnnualizedReturn,
  calculateTwrVolatility,
} from '../routes/analytics';
import {
  recalculateStockPriceHistory,
} from '../utils/recalculate';
import { getLocalCachedPriceForStock } from '../services/priceFeedService';
import { sequelize, User, Stock, Purchase, Sales, DailyPrice, UserSetting } from '../models';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-32-characters-minimum';

describe('Phase 6: Accounting Calculations & Financial Verification Suite', () => {
  let testUser: User;
  let testStock: Stock;
  let authToken: string;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    testUser = await User.create({
      id: 'aaaaaaaa-1111-4000-8000-111111111111',
      email: 'accounting-test@example.com',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
      role: 'user',
    });

    await UserSetting.create({
      userId: testUser.id,
      provider: 'manual',
      costBasisMethod: 'average',
      refreshInterval: 60,
    });

    testStock = await Stock.create({
      id: 'bbbbbbbb-2222-4000-8000-222222222222',
      userId: testUser.id,
      symbol: 'TEST',
      name: 'Test Accounting Corp',
      category: 'Technology',
    });

    authToken = jwt.sign(
      { id: testUser.id, email: testUser.email, role: testUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await Purchase.destroy({ where: {} });
    await Sales.destroy({ where: {} });
    await DailyPrice.destroy({ where: {} });
    await UserSetting.update({ costBasisMethod: 'average' }, { where: { userId: testUser.id } });
  });

  describe('1. Average Cost & FIFO Cost Basis Calculations', () => {
    it('accurately computes average cost basis across multiple purchases chronologically', async () => {
      // Purchase 1: 100 shares @ $10 on 2026-01-01 (Cost = $1,000)
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      // Purchase 2: 50 shares @ $20 on 2026-01-10 (Cost = $1,000)
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 50,
        purchasePrice: 20,
        purchaseDate: '2026-01-10',
      });

      // Overall: 150 shares, $2,000 total cost basis, avg cost = $13.3333
      const allHoldings = await computeChronologicalHoldings(testStock.id, testUser.id);
      expect(allHoldings.remainingShares).toBe(150);
      expect(allHoldings.averageCost).toBe(13.3333);
      expect(allHoldings.totalCostBasis).toBe(2000);

      // Verify backward-compatible computeStockHoldings
      const aliasHoldings = await computeStockHoldings(testStock.id, testUser.id);
      expect(aliasHoldings.remainingShares).toBe(150);
      expect(aliasHoldings.averageCost).toBe(13.3333);
    });

    it('isolates historical cost basis asOfDate so future purchases do not distort historical cost basis', async () => {
      // Purchase 1: 100 shares @ $10 on 2026-01-01
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      // Purchase 2 in future: 100 shares @ $100 on 2026-02-01
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 100,
        purchasePrice: 100,
        purchaseDate: '2026-02-01',
      });

      // Point-in-time check as of 2026-01-15: Must strictly be 100 shares @ $10, not affected by Feb 1 buy
      const historicalHoldings = await computeChronologicalHoldings(
        testStock.id,
        testUser.id,
        '2026-01-15'
      );

      expect(historicalHoldings.remainingShares).toBe(100);
      expect(historicalHoldings.averageCost).toBe(10);
      expect(historicalHoldings.totalCostBasis).toBe(1000);
    });

    it('handles empty portfolio when computing holdings', async () => {
      const emptyHoldings = await computeChronologicalHoldings(testStock.id, testUser.id);
      expect(emptyHoldings.remainingShares).toBe(0);
      expect(emptyHoldings.averageCost).toBe(0);
      expect(emptyHoldings.totalCostBasis).toBe(0);
    });

    it('throws error when userId is missing from computeChronologicalHoldings', async () => {
      await expect(computeChronologicalHoldings(testStock.id, '')).rejects.toThrow(
        'computeChronologicalHoldings requires a valid non-empty userId for secure scoping.'
      );
    });

    it('correctly calculates FIFO cost basis and realizes P&L against oldest acquisition lots', async () => {
      // Lot 1: 100 shares @ $10 on 2026-01-01 ($1,000)
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      // Lot 2: 100 shares @ $30 on 2026-01-10 ($3,000)
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 100,
        purchasePrice: 30,
        purchaseDate: '2026-01-10',
      });

      // Under FIFO: Selling 100 shares @ $40 consumes Lot 1 (cost = 100 * 10 = $1,000)
      // Realized P&L = 4,000 - 1,000 = $3,000
      const fifoHoldings = await computeChronologicalHoldings(
        testStock.id,
        testUser.id,
        undefined,
        'fifo'
      );
      expect(fifoHoldings.costBasisMethod).toBe('fifo');
      const saleResult = fifoHoldings.computeSaleProfit(100, 40);
      expect(saleResult.costBasis).toBe(1000);
      expect(saleResult.profitLoss).toBe(3000);

      // Under Average Cost: Selling 100 shares @ $40 uses avg cost of $20 (cost = 100 * 20 = $2,000)
      // Realized P&L = 4,000 - 2,000 = $2,000
      const avgHoldings = await computeChronologicalHoldings(
        testStock.id,
        testUser.id,
        undefined,
        'average'
      );
      expect(avgHoldings.costBasisMethod).toBe('average');
      const avgSaleResult = avgHoldings.computeSaleProfit(100, 40);
      expect(avgSaleResult.costBasis).toBe(2000);
      expect(avgSaleResult.profitLoss).toBe(2000);
    });

    it('accurately consumes multiple lots sequentially in FIFO mode across chronological sales', async () => {
      // Lot 1: 50 @ $10 on Jan 1
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 50,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      // Lot 2: 100 @ $20 on Jan 2
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 100,
        purchasePrice: 20,
        purchaseDate: '2026-01-02',
      });

      // Sale: 70 @ $30 on Jan 3 (consumes 50 of Lot 1, 20 of Lot 2)
      // Realized PL = (50 * (30 - 10)) + (20 * (30 - 20)) = 1000 + 200 = 1200
      await Sales.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 70,
        sellPrice: 30,
        saleDate: '2026-01-03',
        profitLoss: 0, // intentionally 0 to test recalculation
      });

      // Point-in-time check before sale (Jan 2)
      const asOfJan2 = await computeChronologicalHoldings(testStock.id, testUser.id, '2026-01-02', 'fifo');
      expect(asOfJan2.remainingShares).toBe(150);

      // Current holdings under FIFO after sale
      const postSaleHoldings = await computeChronologicalHoldings(testStock.id, testUser.id, undefined, 'fifo');
      expect(postSaleHoldings.remainingShares).toBe(80);
      expect(postSaleHoldings.averageCost).toBe(20);
      expect(postSaleHoldings.totalCostBasis).toBe(1600);

      // Test recalculateStockSales in FIFO mode
      await recalculateStockSales(testStock.id, testUser.id, undefined, 'fifo');
      const reloadedSale = await Sales.findOne({ where: { stockId: testStock.id, userId: testUser.id } });
      expect(Number(reloadedSale!.profitLoss)).toBe(1200);
    });
  });

  describe('2. Realized P&L Accuracy on Partial and Complete Sales', () => {
    it('calculates realized P&L accurately on partial sales and preserves point-in-time cost basis', async () => {
      // 1. Buy 100 shares @ $20 on 2026-01-01
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 100,
        purchasePrice: 20,
        purchaseDate: '2026-01-01',
      });

      // 2. Buy 100 shares @ $30 on 2026-01-10 -> Avg cost = $25
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 100,
        purchasePrice: 30,
        purchaseDate: '2026-01-10',
      });

      // 3. Sell 50 shares @ $40 on 2026-01-15
      // Avg cost on 2026-01-15 is $25. Realized P&L = 50 * ($40 - $25) = $750.
      const holdingsOnJan15 = await computeChronologicalHoldings(
        testStock.id,
        testUser.id,
        '2026-01-15'
      );
      expect(holdingsOnJan15.averageCost).toBe(25);
      const profitLoss = Number((50 * (40 - holdingsOnJan15.averageCost)).toFixed(2));
      expect(profitLoss).toBe(750);

      await Sales.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 50,
        sellPrice: 40,
        saleDate: '2026-01-15',
        profitLoss,
      });

      // Remaining holdings: 150 shares @ $25 = $3,750 cost basis
      const currentHoldings = await computeChronologicalHoldings(testStock.id, testUser.id);
      expect(currentHoldings.remainingShares).toBe(150);
      expect(currentHoldings.averageCost).toBe(25);
      expect(currentHoldings.totalCostBasis).toBe(3750);
    });

    it('calculates realized P&L accurately on complete liquidation (100% sale) and resets cost basis to zero', async () => {
      // Buy 100 shares @ $50 ($5,000 cost basis)
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 100,
        purchasePrice: 50,
        purchaseDate: '2026-01-01',
      });

      // Complete sale: 100 shares @ $75 ($7,500 proceeds)
      // Realized P&L = 100 * (75 - 50) = $2,500
      const holdings = await computeChronologicalHoldings(testStock.id, testUser.id, '2026-01-10');
      const profitLoss = Number((100 * (75 - holdings.averageCost)).toFixed(2));
      expect(profitLoss).toBe(2500);

      await Sales.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 100,
        sellPrice: 75,
        saleDate: '2026-01-10',
        profitLoss,
      });

      // Position should be completely closed: 0 shares, $0 average cost, $0 cost basis
      const postSaleHoldings = await computeChronologicalHoldings(testStock.id, testUser.id);
      expect(postSaleHoldings.remainingShares).toBe(0);
      expect(postSaleHoldings.averageCost).toBe(0);
      expect(postSaleHoldings.totalCostBasis).toBe(0);

      // Re-buying after full liquidation should start a completely fresh cost basis
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 50,
        purchasePrice: 90,
        purchaseDate: '2026-01-20',
      });

      const freshHoldings = await computeChronologicalHoldings(testStock.id, testUser.id);
      expect(freshHoldings.remainingShares).toBe(50);
      expect(freshHoldings.averageCost).toBe(90);
      expect(freshHoldings.totalCostBasis).toBe(4500);
    });

    it('handles multi-tier sequential partial sales leading to complete liquidation', async () => {
      // Buy 100 shares @ $10 on Jan 1
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      // Buy 100 shares @ $20 on Jan 5 (avg cost = $15)
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 100,
        purchasePrice: 20,
        purchaseDate: '2026-01-05',
      });

      // Partial sale 1: 50 shares @ $30 on Jan 10
      // P&L = 50 * (30 - 15) = $750. Remaining = 150 shares @ $15.
      await Sales.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 50,
        sellPrice: 30,
        saleDate: '2026-01-10',
        profitLoss: 750,
      });

      // Partial sale 2: 150 shares @ $25 on Jan 15 (liquidates remaining position)
      // P&L = 150 * (25 - 15) = $1,500. Remaining = 0 shares.
      await Sales.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 150,
        sellPrice: 25,
        saleDate: '2026-01-15',
        profitLoss: 1500,
      });

      const finalHoldings = await computeChronologicalHoldings(testStock.id, testUser.id);
      expect(finalHoldings.remainingShares).toBe(0);
      expect(finalHoldings.averageCost).toBe(0);
      expect(finalHoldings.totalCostBasis).toBe(0);

      // Verify total realized P&L
      const totalPL = await Sales.sum('profitLoss', { where: { stockId: testStock.id, userId: testUser.id } });
      expect(totalPL).toBe(2250);
    });

    it('recalculates sales P&L accurately when recalculateStockSales and recalculateAllUserSales are invoked', async () => {
      // Setup: 100 @ $10, 100 @ $20. Sale of 50 @ $30.
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 100,
        purchasePrice: 20,
        purchaseDate: '2026-01-05',
      });

      // Intentionally insert sale with wrong profitLoss to test recalculation
      const sale = await Sales.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 50,
        sellPrice: 30,
        saleDate: '2026-01-10',
        profitLoss: 0,
      });

      // Recalculate stock sales with average cost
      await recalculateStockSales(testStock.id, testUser.id, undefined, 'average');
      await sale.reload();
      expect(Number(sale.profitLoss)).toBe(750); // 50 * (30 - 15)

      // Recalculate with FIFO
      await recalculateStockSales(testStock.id, testUser.id, undefined, 'fifo');
      await sale.reload();
      expect(Number(sale.profitLoss)).toBe(1000); // 50 * (30 - 10)

      // Test recalculateAllUserSales
      await recalculateAllUserSales(testUser.id, undefined, 'average');
      await sale.reload();
      expect(Number(sale.profitLoss)).toBe(750);
    });
  });

  describe('3. Chronological Short-Selling Rejection & Timeline Invariant [FR4.3]', () => {
    it('detects point-in-time unavailability before any purchases', async () => {
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 50,
        purchasePrice: 10,
        purchaseDate: '2026-01-10',
      });

      const priorHoldings = await computeChronologicalHoldings(
        testStock.id,
        testUser.id,
        '2026-01-05'
      );
      expect(priorHoldings.remainingShares).toBe(0);
    });

    it('detects subsequent balance overdrawing with validateTimelineBalance', () => {
      const purchases = [{ quantity: 100, date: '2026-01-01' }];
      const sales = [{ quantity: 100, date: '2026-01-10' }];

      expect(validateTimelineBalance(purchases, sales).valid).toBe(true);

      const invalidSales = [...sales, { quantity: 20, date: '2026-01-05' }];
      const result = validateTimelineBalance(purchases, invalidSales);

      expect(result.valid).toBe(false);
      expect(result.errorDate).toBe('2026-01-10');
      expect(result.balance).toBe(-20);
    });

    it('rejects chronological short-selling via POST /api/transactions/sales endpoint', async () => {
      // Purchase 50 shares on 2026-01-10
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 50,
        purchasePrice: 10,
        purchaseDate: '2026-01-10',
      });

      // 1. Attempt backdated sale before purchase date (2026-01-05)
      const backdatedRes = await request(app)
        .post('/api/transactions/sales')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          stockId: testStock.id,
          quantity: 10,
          sellPrice: 15,
          saleDate: '2026-01-05',
        });

      expect(backdatedRes.status).toBe(400);
      expect(backdatedRes.body.success).toBe(false);
      const backdatedMsg = backdatedRes.body.message || backdatedRes.body.errors[0]?.message;
      expect(backdatedMsg).toContain('cannot be earlier than your first recorded purchase');

      // 2. Attempt sale exceeding available shares on that date (e.g. 60 shares when only 50 available)
      const excessRes = await request(app)
        .post('/api/transactions/sales')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          stockId: testStock.id,
          quantity: 60,
          sellPrice: 15,
          saleDate: '2026-01-15',
        });

      expect(excessRes.status).toBe(400);
      expect(excessRes.body.success).toBe(false);
      const excessMsg = excessRes.body.message || excessRes.body.errors[0]?.message;
      expect(excessMsg).toContain('Not enough shares to sell on');

      // 3. Valid sale succeeds
      const validRes = await request(app)
        .post('/api/transactions/sales')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          stockId: testStock.id,
          quantity: 50,
          sellPrice: 20,
          saleDate: '2026-01-15',
        });

      expect(validRes.status).toBe(201);
      expect(validRes.body.success).toBe(true);
      expect(validRes.body.data.profitLoss).toBe(500); // 50 * (20 - 10)
    });

    it('rejects deleting or editing a purchase if doing so causes subsequent sales to go negative', async () => {
      // Purchase 100 on Jan 1
      const p1 = await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      // Sale 80 on Jan 10
      await Sales.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 80,
        sellPrice: 20,
        saleDate: '2026-01-10',
        profitLoss: 800,
      });

      // Deleting purchase p1 would leave remaining balance at -80 on Jan 10 -> MUST BE REJECTED
      const deleteRes = await request(app)
        .delete(`/api/transactions/purchases/${p1.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteRes.status).toBe(400);
      expect(deleteRes.body.success).toBe(false);
      const deleteMsg = deleteRes.body.message || deleteRes.body.errors[0]?.message;
      expect(deleteMsg).toContain('Deleting this purchase would cause your share balance to drop');

      // Editing purchase p1 to reduce quantity from 100 to 50 would also cause negative balance -> REJECTED
      const editRes = await request(app)
        .put(`/api/transactions/purchases/${p1.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          stockId: testStock.id,
          quantity: 50,
          purchasePrice: 10,
          purchaseDate: '2026-01-01',
        });

      expect(editRes.status).toBe(400);
      expect(editRes.body.success).toBe(false);
      const editMsg = editRes.body.message || editRes.body.errors[0]?.message;
      expect(editMsg).toContain('Updating this purchase would cause your share balance to drop');
    });

    it('manages full purchase and sale lifecycle via CRUD endpoints with automatic P&L recalculation', async () => {
      // 1. Record purchase via API
      const purchaseRes = await request(app)
        .post('/api/transactions/purchases')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          stockId: testStock.id,
          quantity: 100,
          purchasePrice: 20,
          purchaseDate: '2026-01-01',
        });

      expect(purchaseRes.status).toBe(201);
      expect(purchaseRes.body.success).toBe(true);
      const purchaseId = purchaseRes.body.data.id;

      // 2. Record sale via API
      const saleRes = await request(app)
        .post('/api/transactions/sales')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          stockId: testStock.id,
          quantity: 40,
          sellPrice: 30,
          saleDate: '2026-01-10',
        });

      expect(saleRes.status).toBe(201);
      expect(saleRes.body.data.profitLoss).toBe(400); // 40 * (30 - 20)
      const saleId = saleRes.body.data.id;

      // 3. Update purchase price via API (e.g. price was actually $25 instead of $20)
      // Recalculates sale P&L automatically: 40 * (30 - 25) = 200
      const updatePurchaseRes = await request(app)
        .put(`/api/transactions/purchases/${purchaseId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          stockId: testStock.id,
          quantity: 100,
          purchasePrice: 25,
          purchaseDate: '2026-01-01',
        });

      expect(updatePurchaseRes.status).toBe(200);

      // Verify sale P&L was updated to $200
      const reloadedSale = await Sales.findByPk(saleId);
      expect(Number(reloadedSale?.profitLoss)).toBe(200);

      // 4. Update sale via API (e.g. sold 50 shares instead of 40)
      const updateSaleRes = await request(app)
        .put(`/api/transactions/sales/${saleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          quantity: 50,
          sellPrice: 35,
          saleDate: '2026-01-10',
        });

      expect(updateSaleRes.status).toBe(200);
      expect(Number(updateSaleRes.body.data.profitLoss)).toBe(500); // 50 * (35 - 25)

      // 5. Delete sale via API
      const deleteSaleRes = await request(app)
        .delete(`/api/transactions/sales/${saleId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteSaleRes.status).toBe(200);
      expect(deleteSaleRes.body.success).toBe(true);

      // Holdings restored to full 100 shares
      const restoredHoldings = await computeChronologicalHoldings(testStock.id, testUser.id);
      expect(restoredHoldings.remainingShares).toBe(100);

      // 6. Delete purchase via API (now valid since no dependent sales exist)
      const deletePurchaseRes = await request(app)
        .delete(`/api/transactions/purchases/${purchaseId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deletePurchaseRes.status).toBe(200);
      expect(deletePurchaseRes.body.success).toBe(true);

      const finalHoldings = await computeChronologicalHoldings(testStock.id, testUser.id);
      expect(finalHoldings.remainingShares).toBe(0);
    });

    it('rejects invalid inputs on transaction CRUD endpoints with 400 or 404', async () => {
      // 404 for non-existent purchase
      const missingPurchaseRes = await request(app)
        .put('/api/transactions/purchases/99999999-9999-4000-8000-999999999999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ stockId: testStock.id, quantity: 10, purchasePrice: 10, purchaseDate: '2026-01-01' });
      expect(missingPurchaseRes.status).toBe(404);

      // 404 for non-existent sale
      const missingSaleRes = await request(app)
        .delete('/api/transactions/sales/99999999-9999-4000-8000-999999999999')
        .set('Authorization', `Bearer ${authToken}`);
      expect(missingSaleRes.status).toBe(404);

      // Validation errors on purchase create
      const invalidPurchaseRes = await request(app)
        .post('/api/transactions/purchases')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ stockId: testStock.id, quantity: -5, purchasePrice: 0, purchaseDate: 'invalid-date' });
      expect(invalidPurchaseRes.status).toBe(400);

      // Validation errors on sale create
      const invalidSaleRes = await request(app)
        .post('/api/transactions/sales')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ stockId: testStock.id, quantity: 0, sellPrice: -10, saleDate: 'not-a-date' });
      expect(invalidSaleRes.status).toBe(400);
    });

    it('rejects purchases and sales with future dates or non-existent stock IDs', async () => {
      // Future purchase date
      const futurePurchaseRes = await request(app)
        .post('/api/transactions/purchases')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          stockId: testStock.id,
          quantity: 10,
          purchasePrice: 10,
          purchaseDate: '2099-01-01',
        });
      expect(futurePurchaseRes.status).toBe(400);

      // Non-existent stock on purchase
      const missingStockPurchase = await request(app)
        .post('/api/transactions/purchases')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          stockId: '99999999-9999-4000-8000-999999999999',
          quantity: 10,
          purchasePrice: 10,
          purchaseDate: '2026-01-01',
        });
      expect(missingStockPurchase.status).toBe(404);

      // Non-existent stock on sale
      const missingStockSale = await request(app)
        .post('/api/transactions/sales')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          stockId: '99999999-9999-4000-8000-999999999999',
          quantity: 10,
          sellPrice: 10,
          saleDate: '2026-01-01',
        });
      expect(missingStockSale.status).toBe(404);

      // Selling stock with zero purchases
      const unboughtStock = await Stock.create({
        userId: testUser.id,
        symbol: 'UNBOUGHT',
        name: 'Unbought Corp',
      });
      const zeroPurchaseSale = await request(app)
        .post('/api/transactions/sales')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          stockId: unboughtStock.id,
          quantity: 10,
          sellPrice: 10,
          saleDate: '2026-01-01',
        });
      expect(zeroPurchaseSale.status).toBe(400);
      expect(zeroPurchaseSale.body.errors[0].message).toContain('no purchase history for this stock');

      // Future sale date
      const futureSaleRes = await request(app)
        .post('/api/transactions/sales')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          stockId: testStock.id,
          quantity: 10,
          sellPrice: 10,
          saleDate: '2099-01-01',
        });
      expect(futureSaleRes.status).toBe(400);

      // PUT sale with future date
      const existingSale = await Sales.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 10,
        sellPrice: 10,
        saleDate: '2026-01-01',
        profitLoss: 0,
      });
      const putFutureSale = await request(app)
        .put(`/api/transactions/sales/${existingSale.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ saleDate: '2099-01-01' });
      expect(putFutureSale.status).toBe(400);

      // PUT sale for non-existent sale
      const putMissingSale = await request(app)
        .put('/api/transactions/sales/99999999-9999-4000-8000-999999999999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ quantity: 5 });
      expect(putMissingSale.status).toBe(404);
    });

    it('rejects backdated sale when it overdraws subsequent sale timeline', async () => {
      // Purchase 100 on Jan 1
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      // Sale 80 on Jan 10
      await Sales.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 80,
        sellPrice: 20,
        saleDate: '2026-01-10',
        profitLoss: 800,
      });

      // Attempt to insert backdated sale of 30 on Jan 5
      // Leaves balance on Jan 10 at 100 - 30 - 80 = -10 (negative!)
      const overdrawRes = await request(app)
        .post('/api/transactions/sales')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          stockId: testStock.id,
          quantity: 30,
          sellPrice: 20,
          saleDate: '2026-01-05',
        });

      expect(overdrawRes.status).toBe(400);
      expect(overdrawRes.body.errors[0].message).toContain('Recording this sale would cause your share balance to drop');
    });
  });

  describe('4. Day-Over-Day Price Change Recalculation [FR2, FR7]', () => {
    it('computes day-over-day price change relative to previous record, not first record in history', async () => {
      // Day 1: $100.00
      await DailyPrice.create({
        userId: testUser.id,
        stockId: testStock.id,
        price: 100.0,
        volume: 1000,
        date: '2026-01-01',
        change: 0,
        changePercent: 0,
      });

      // Day 2: $105.00 (+5.00, +5.00%)
      await DailyPrice.create({
        userId: testUser.id,
        stockId: testStock.id,
        price: 105.0,
        volume: 1200,
        date: '2026-01-02',
        change: 0,
        changePercent: 0,
      });

      // Day 3: $94.50 (-10.50 relative to Day 2, -10.00%)
      await DailyPrice.create({
        userId: testUser.id,
        stockId: testStock.id,
        price: 94.5,
        volume: 1500,
        date: '2026-01-03',
        change: 0,
        changePercent: 0,
      });

      await recalculateStockPriceHistory(testStock.id, testUser.id);

      const updatedPrices = await DailyPrice.findAll({
        where: { stockId: testStock.id, userId: testUser.id },
        order: [['date', 'ASC']],
      });

      expect(updatedPrices).toHaveLength(3);

      // Day 1: Baseline
      expect(Number(updatedPrices[0].change)).toBe(0.0);
      expect(Number(updatedPrices[0].changePercent)).toBe(0.0);

      // Day 2: +5.00 (+5.00%)
      expect(Number(updatedPrices[1].change)).toBe(5.0);
      expect(Number(updatedPrices[1].changePercent)).toBe(5.0);

      // Day 3: -10.50 (-10.00% compared to Day 2's $105)
      expect(Number(updatedPrices[2].change)).toBe(-10.5);
      expect(Number(updatedPrices[2].changePercent)).toBe(-10.0);
    });

    it('handles empty prices in recalculateStockPriceHistory gracefully', async () => {
      await expect(recalculateStockPriceHistory(testStock.id, testUser.id)).resolves.not.toThrow();
    });

    it('verifies day-over-day price calculation in getLocalCachedPriceForStock', async () => {
      // Insert Day 1 and Day 2
      await DailyPrice.create({
        userId: testUser.id,
        stockId: testStock.id,
        price: 150.0,
        volume: 1000,
        date: '2026-01-01',
      });
      await DailyPrice.create({
        userId: testUser.id,
        stockId: testStock.id,
        price: 165.0,
        volume: 1200,
        date: '2026-01-02',
      });

      const cached = await getLocalCachedPriceForStock(testStock, testUser.id);
      expect(cached.symbol).toBe('TEST');
      expect(cached.price).toBe(165.0);
      expect(cached.change).toBe(15.0);
      expect(cached.changePercent).toBe(10.0); // (165 - 150) / 150 = 10%
    });
  });

  describe('5. Transaction Ledger & Unified History [FR5]', () => {
    it('returns combined, chronologically sorted transaction history with date filters', async () => {
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      await Sales.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 50,
        sellPrice: 20,
        saleDate: '2026-01-15',
        profitLoss: 500,
      });

      // All time
      const allRes = await request(app)
        .get('/api/transactions/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(allRes.status).toBe(200);
      expect(allRes.body.success).toBe(true);
      expect(allRes.body.data).toHaveLength(2);
      expect(allRes.body.data[0].type).toBe('SELL'); // Newest first
      expect(allRes.body.data[1].type).toBe('BUY');

      // Filter with startDate
      const filteredRes = await request(app)
        .get('/api/transactions/history?startDate=2026-01-10')
        .set('Authorization', `Bearer ${authToken}`);

      expect(filteredRes.status).toBe(200);
      expect(filteredRes.body.data).toHaveLength(1);
      expect(filteredRes.body.data[0].type).toBe('SELL');
    });

    it('filters transaction history with endDate and handles same-day sorting', async () => {
      // Buy 100 on Jan 1
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 100,
        purchasePrice: 10,
        purchaseDate: '2026-01-01',
      });

      // Buy 50 on Jan 15 and Sell 20 on Jan 15 (same date)
      await Purchase.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 50,
        purchasePrice: 12,
        purchaseDate: '2026-01-15',
      });
      await Sales.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 20,
        sellPrice: 20,
        saleDate: '2026-01-15',
        profitLoss: 200,
      });

      // Sell 10 on Jan 20
      await Sales.create({
        userId: testUser.id,
        stockId: testStock.id,
        quantity: 10,
        sellPrice: 25,
        saleDate: '2026-01-20',
        profitLoss: 150,
      });

      // Filter with endDate=2026-01-15
      const endRes = await request(app)
        .get('/api/transactions/history?endDate=2026-01-15')
        .set('Authorization', `Bearer ${authToken}`);

      expect(endRes.status).toBe(200);
      expect(endRes.body.data).toHaveLength(3);
      expect(endRes.body.data.every((tx: any) => tx.date <= '2026-01-15')).toBe(true);
    });

    it('returns empty array when user has no stocks', async () => {
      const otherUser = await User.create({
        id: 'cccccccc-3333-4000-8000-333333333333',
        email: 'empty-user@example.com',
        passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
        role: 'user',
      });

      const otherToken = jwt.sign(
        { id: otherUser.id, email: otherUser.email, role: otherUser.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      const res = await request(app)
        .get('/api/transactions/history')
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('6. Time-Weighted Return (TWR) & Cash-Flow Adjusted Volatility [FR8.1]', () => {
    it('isolates external capital inflows so deposits do not artificially inflate volatility', () => {
      const dailyPoints = [
        { date: '2026-01-01', value: 10000, cashFlow: 0 },
        { date: '2026-01-02', value: 20000, cashFlow: 10000 },
        { date: '2026-01-03', value: 20000, cashFlow: 0 },
      ];

      const volatility = calculateTwrVolatility(dailyPoints);
      expect(volatility).toBe(0.0);
    });

    it('measures authentic market volatility when asset prices change without external cash flow', () => {
      const dailyPoints = [
        { date: '2026-01-01', value: 10000, cashFlow: 0 },
        { date: '2026-01-02', value: 11000, cashFlow: 0 }, // +10%
        { date: '2026-01-03', value: 9900, cashFlow: 0 },  // -10%
      ];

      const volatility = calculateTwrVolatility(dailyPoints);
      expect(volatility).toBeGreaterThan(0);
    });
  });

  describe('7. Annualized Return Guardrails [FR6.1, FR8.1]', () => {
    it('does not artificially compound returns for short holding periods under 30 days', () => {
      const result = calculateAnnualizedReturn(5.0, 5, 10000);
      expect(result).toBe(5.0);
    });

    it('accurately annualizes standard holding periods >= 30 days', () => {
      const resultOneYear = calculateAnnualizedReturn(10.0, 365, 10000);
      expect(resultOneYear).toBe(10.0);

      const resultTwoYears = calculateAnnualizedReturn(21.0, 730, 10000);
      expect(resultTwoYears).toBe(10.0);
    });

    it('protects against Math domain errors and NaN when total return is <= -100%', () => {
      const catastrophicLoss = calculateAnnualizedReturn(-120.0, 60, 10000);
      expect(catastrophicLoss).toBe(-100.0);
      expect(isNaN(catastrophicLoss)).toBe(false);
    });

    it('returns 0 when total invested capital is 0', () => {
      const zeroCapital = calculateAnnualizedReturn(0, 50, 0);
      expect(zeroCapital).toBe(0);
    });
  });
});
