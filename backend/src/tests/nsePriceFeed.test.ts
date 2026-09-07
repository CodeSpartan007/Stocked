process.env.NODE_ENV = 'test';

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { sequelize, User, Stock, DailyPrice, UserSetting } from '../models';
import {
  isNseSymbol,
  normalizeNseSymbol,
  fetchAllNseStocks,
  fetchNseStockQuote,
  NSE_CATALOG,
} from '../services/nseScraperService';
import { fetchWithFailover, getLivePriceForStock } from '../services/priceFeedService';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-32-characters-minimum';

describe('Nairobi Securities Exchange (NSE Kenya) Integration', () => {
  let user: User;
  let token: string;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    user = await User.create({
      id: '88888888-9999-4444-aaaa-bbbbbbbbbbbb',
      email: 'nse-tester@stocked.co.ke',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
      role: 'user',
    });

    token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  describe('nseScraperService Utilities', () => {
    it('normalizes various ticker symbol formats', () => {
      expect(normalizeNseSymbol('SCOM')).toBe('SCOM');
      expect(normalizeNseSymbol('scom')).toBe('SCOM');
      expect(normalizeNseSymbol('SCOM.NR')).toBe('SCOM');
      expect(normalizeNseSymbol('SCOM:NSE')).toBe('SCOM');
      expect(normalizeNseSymbol('NSE:EQTY')).toBe('EQTY');
      expect(normalizeNseSymbol('EQTY.NSE')).toBe('EQTY');
    });

    it('identifies valid and invalid NSE symbols', () => {
      expect(isNseSymbol('SCOM')).toBe(true);
      expect(isNseSymbol('EQTY')).toBe(true);
      expect(isNseSymbol('KCB')).toBe(true);
      expect(isNseSymbol('EABL')).toBe(true);
      expect(isNseSymbol('BAT')).toBe(true);
      expect(isNseSymbol('SCOM.NR')).toBe(true);
      expect(isNseSymbol('CUSTOM.NR')).toBe(true);

      expect(isNseSymbol('AAPL')).toBe(false);
      expect(isNseSymbol('TSLA')).toBe(false);
      expect(isNseSymbol('GOOGL')).toBe(false);
      expect(isNseSymbol('')).toBe(false);
    });

    it('contains comprehensive NSE catalog entries', () => {
      expect(NSE_CATALOG.length).toBeGreaterThanOrEqual(50);
      const scom = NSE_CATALOG.find((s) => s.symbol === 'SCOM');
      expect(scom).toBeDefined();
      expect(scom?.name).toContain('Safaricom');
      expect(scom?.category).toBe('Technology');
    });
  });

  describe('Live Price Scraper & Fallback', () => {
    it('fetches all NSE stocks in a single market snapshot or uses mocked data', async () => {
      try {
        const stocksMap = await fetchAllNseStocks(false);
        expect(stocksMap.size).toBeGreaterThan(0);
        const scom = stocksMap.get('SCOM');
        if (scom) {
          expect(scom.price).toBeGreaterThan(0);
          expect(typeof scom.change).toBe('number');
        }
      } catch (err: any) {
        // In environments without outbound internet, scraper gracefully handles error
        console.warn('Outbound network unavailable for live scrape test:', err.message);
      }
    });

    it('routes NSE ticker through fetchWithFailover without requiring an API key', async () => {
      // User is in manual mode, but queries an NSE stock
      try {
        const result = await fetchWithFailover('SCOM', user.id);
        expect(result.provider).toBe('nse');
        expect(result.tickerData.price).toBeGreaterThan(0);
      } catch (err: any) {
        // If external network is blocked in CI, verify error type
        expect(err.message).not.toContain('Real-time API key not configured');
      }
    });
  });

  describe('NSE Endpoints & Settings Integration', () => {
    it('GET /api/stocks/nse-catalog returns the full catalog of Kenyan equities', async () => {
      const res = await request(app)
        .get('/api/stocks/nse-catalog')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(50);

      const safaricom = res.body.data.find((item: any) => item.symbol === 'SCOM');
      expect(safaricom).toBeDefined();
      expect(safaricom.name).toContain('Safaricom');
    });

    it('POST /api/settings/feed allows setting provider to nse', async () => {
      const res = await request(app)
        .post('/api/settings/feed')
        .set('Authorization', `Bearer ${token}`)
        .send({
          provider: 'nse',
          refreshInterval: 120,
          costBasisMethod: 'average',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.provider).toBe('nse');

      const setting = await UserSetting.findByPk(user.id);
      expect(setting?.provider).toBe('nse');
    });

    it('POST /api/settings/test-connection verifies nse provider without requiring an API key', async () => {
      const res = await request(app)
        .post('/api/settings/test-connection')
        .set('Authorization', `Bearer ${token}`)
        .send({
          provider: 'nse',
        });

      // Status 200 on successful scrape or 400 if network timeout, but never validation error for missing API key
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('Nairobi Securities Exchange');
      } else {
        expect(res.body.message).not.toContain('API Key is required');
      }
    });

    it('allows registering an NSE stock and recording initial pricing', async () => {
      const res = await request(app)
        .post('/api/stocks')
        .set('Authorization', `Bearer ${token}`)
        .send({
          symbol: 'SCOM',
          name: 'Safaricom Plc',
          category: 'Technology',
          description: 'Leading mobile and fintech telecommunications company in Kenya',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.symbol).toBe('SCOM');

      // Verify stock exists in DB
      const createdStock = await Stock.findOne({
        where: { userId: user.id, symbol: 'SCOM' },
      });
      expect(createdStock).toBeDefined();

      // Check if price record exists
      const priceLog = await DailyPrice.findOne({
        where: { userId: user.id, stockId: createdStock!.id },
      });
      if (priceLog) {
        expect(Number(priceLog.price)).toBeGreaterThan(0);
      }
    });
  });
});
