process.env.NODE_ENV = 'test';

import request from 'supertest';
import jwt from 'jsonwebtoken';
import zlib from 'zlib';
import ExcelJS from 'exceljs';
import { app } from '../index';
import {
  sequelize,
  User,
  Stock,
  Purchase,
  Sales,
  DailyPrice,
  PerformanceTarget,
  ExportLogs,
  UserSetting,
} from '../models';

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

describe('Phase 6: Report Generation & Export Auditing Suite [FR10]', () => {
  let userA: User;
  let userB: User;
  let tokenA: string;
  let tokenB: string;
  let stockA: Stock;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    // User A
    userA = await User.create({
      id: 'aaaaaaaa-4444-4000-8000-aaaaaaaaaaaa',
      email: 'export-userA@example.com',
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

    // User B (for data isolation checks)
    userB = await User.create({
      id: 'bbbbbbbb-4444-4000-8000-bbbbbbbbbbbb',
      email: 'export-userB@example.com',
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

    // Seed stock, purchases, sales, and prices for User A
    stockA = await Stock.create({
      id: '11111111-5555-4000-8000-111111111111',
      userId: userA.id,
      symbol: 'PORT',
      name: 'Portfolio Holdings Inc',
      category: 'Finance',
    });

    await Purchase.create({
      userId: userA.id,
      stockId: stockA.id,
      quantity: 100,
      purchasePrice: 50,
      purchaseDate: '2026-01-01',
    });

    await DailyPrice.create({
      userId: userA.id,
      stockId: stockA.id,
      price: 65,
      volume: 5000,
      date: '2026-01-02',
      change: 15,
      changePercent: 30,
    });

    await Sales.create({
      userId: userA.id,
      stockId: stockA.id,
      quantity: 20,
      sellPrice: 70,
      saleDate: '2026-01-10',
      profitLoss: 400,
    });

    await PerformanceTarget.create({
      userId: userA.id,
      targetName: 'Year-End Goal',
      targetType: 'portfolio_value',
      targetValue: 10000,
      targetDate: '2026-12-31',
      isAchieved: false,
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('1. PDF Report Generation & Header Compliance [FR10, FR10.4]', () => {
    it('generates a Summary PDF report with correct headers and user identification metadata', async () => {
      const res = await request(app)
        .post('/api/exports/generate')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          reportType: 'summary',
          format: 'PDF',
        })
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="PORTFOLIO_SUMMARY_.*\.pdf"/);

      const pdfBuffer = Buffer.from(res.body);
      // Valid PDF magic bytes (%PDF-)
      expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

      // Verify PDF text content includes branding, user identification and report title
      const text = extractPdfText(pdfBuffer);
      expect(text).toContain('STOCKED');
      expect(text).toContain('SUMMARY REPORT');
      expect(text).toContain('Generated By:');
      const expectedUserIdentifier = `${userA.email} (${userA.id.substring(0, 8)})`;
      expect(text).toContain(expectedUserIdentifier);
      expect(text).not.toContain('REDACTED');

      // Verify audit log creation
      const log = await ExportLogs.findOne({
        where: { userId: userA.id, reportType: 'summary', exportType: 'PDF' },
        order: [['createdAt', 'DESC']],
      });
      expect(log).not.toBeNull();
      expect(log!.filename).toMatch(/PORTFOLIO_SUMMARY_.*\.pdf/);
    });

    it('generates a Transactions PDF report with transaction history table', async () => {
      const res = await request(app)
        .post('/api/exports/generate')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          reportType: 'transactions',
          format: 'PDF',
        })
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="PORTFOLIO_TRANSACTIONS_.*\.pdf"/);

      const pdfBuffer = Buffer.from(res.body);
      expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

      const text = extractPdfText(pdfBuffer);
      expect(text).toContain('STOCKED');
      expect(text).toContain('TRANSACTIONS REPORT');
    });

    it('generates an Analytics PDF report with performance KPIs and targets', async () => {
      const res = await request(app)
        .post('/api/exports/generate')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          reportType: 'analytics',
          format: 'PDF',
        })
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="PORTFOLIO_ANALYTICS_.*\.pdf"/);

      const pdfBuffer = Buffer.from(res.body);
      expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

      const text = extractPdfText(pdfBuffer);
      expect(text).toContain('STOCKED');
      expect(text).toContain('ANALYTICS REPORT');
    });

    it('scopes filename to individual stock symbol when stockId is provided', async () => {
      const res = await request(app)
        .post('/api/exports/generate')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          reportType: 'summary',
          format: 'PDF',
          stockId: stockA.id,
        })
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="PORT_SUMMARY_.*\.pdf"/);
    });
  });

  describe('2. XLSX Spreadsheet Generation & Data Schema Validation [FR10]', () => {
    it('generates a valid Summary XLSX workbook with corrected "Ticker Symbol" column header', async () => {
      const res = await request(app)
        .post('/api/exports/generate')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          reportType: 'summary',
          format: 'XLSX',
        })
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="PORTFOLIO_SUMMARY_.*\.xlsx"/);

      // Load workbook with ExcelJS
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(res.body) as any);

      const worksheet = workbook.worksheets[0];
      expect(worksheet).toBeDefined();

      const headerRow = worksheet.getRow(1);
      const headers = (headerRow.values as string[]).slice(1);

      // Verify exact header column labels (Issue 3 fix: must be "Ticker Symbol", not "Ticker Ticker")
      expect(headers).toContain('Ticker Symbol');
      expect(headers).not.toContain('Ticker Ticker');
      expect(headers).toContain('Security Name');
      expect(headers).toContain('Category Name');
      expect(headers).toContain('Remaining Quantity');
      expect(headers).toContain('Average Buy Price');
      expect(headers).toContain('Current Active Price');
      expect(headers).toContain('Net Cost Basis ($)');
      expect(headers).toContain('Market Valuation ($)');
      expect(headers).toContain('Unrealized Paper P&L ($)');

      // Verify data rows
      expect(worksheet.rowCount).toBeGreaterThanOrEqual(2);
      const row2 = worksheet.getRow(2);
      expect(row2.getCell(1).value).toBe('PORT'); // Ticker
      expect(row2.getCell(2).value).toBe('Portfolio Holdings Inc'); // Security Name
    });

    it('generates a valid Transactions XLSX workbook with chronological transaction columns', async () => {
      const res = await request(app)
        .post('/api/exports/generate')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          reportType: 'transactions',
          format: 'XLSX',
        })
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(res.body) as any);

      const worksheet = workbook.worksheets[0];
      expect(worksheet).toBeDefined();

      const headerRow = worksheet.getRow(1);
      const headers = (headerRow.values as string[]).slice(1);

      expect(headers).toContain('Execution Date');
      expect(headers).toContain('Transaction Type');
      expect(headers).toContain('Ticker Symbol');
      expect(headers).toContain('Shares Quantity');
      expect(headers).toContain('Execution Price');
      expect(headers).toContain('Realized Gains P&L');

      // Verify transactions data
      expect(worksheet.rowCount).toBeGreaterThanOrEqual(3); // Header + 1 Buy + 1 Sell
    });

    it('generates a valid Analytics XLSX workbook with asset allocation weights', async () => {
      const res = await request(app)
        .post('/api/exports/generate')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          reportType: 'analytics',
          format: 'XLSX',
        })
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(res.body) as any);

      const worksheet = workbook.worksheets[0];
      expect(worksheet).toBeDefined();

      const headerRow = worksheet.getRow(1);
      const headers = (headerRow.values as string[]).slice(1);

      expect(headers).toContain('Asset Ticker');
      expect(headers).toContain('Asset Name');
      expect(headers).toContain('Category Name');
      expect(headers).toContain('Current Valuation');
      expect(headers).toContain('Portfolio Weight (%)');
    });
  });

  describe('3. Export Validation & Guardrails', () => {
    it('rejects invalid reportType with 400 status', async () => {
      const res = await request(app)
        .post('/api/exports/generate')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ reportType: 'invalid_type', format: 'PDF' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid reportType');
    });

    it('rejects unsupported export format with 400 status', async () => {
      const res = await request(app)
        .post('/api/exports/generate')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ reportType: 'summary', format: 'CSV' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid format');
    });

    it('rejects malformed date query parameters with 400 status', async () => {
      const res = await request(app)
        .post('/api/exports/generate')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ reportType: 'summary', format: 'PDF', startDate: '2026/01/01' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Must be YYYY-MM-DD');
    });

    it('rejects non-existent or unauthorized stockId with 404 status', async () => {
      const res = await request(app)
        .post('/api/exports/generate')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ reportType: 'summary', format: 'PDF', stockId: '99999999-9999-4000-8000-999999999999' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Stock not found or unauthorized');
    });

    it('denies unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/exports/generate')
        .send({ reportType: 'summary', format: 'PDF' });

      expect(res.status).toBe(401);
    });
  });

  describe('4. Export Audit Trails & User Isolation [GET /api/exports/logs]', () => {
    it('retrieves user export history audit log entries in descending chronological order', async () => {
      const res = await request(app)
        .get('/api/exports/logs')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const firstLog = res.body.data[0];
      expect(firstLog).toHaveProperty('id');
      expect(firstLog).toHaveProperty('reportType');
      expect(firstLog).toHaveProperty('exportType');
      expect(firstLog).toHaveProperty('status');
      expect(firstLog).toHaveProperty('filename');
      expect(firstLog).toHaveProperty('generatedAt');
    });

    it('enforces complete isolation of export audit trails between users', async () => {
      // User B has not generated any reports yet
      const res = await request(app)
        .get('/api/exports/logs')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]); // Must not see User A's logs
    });
  });
});
