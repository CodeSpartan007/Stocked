import { Router, Response } from 'express';
import { Op } from 'sequelize';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { Stock, DailyPrice, Purchase, Sales, ExportLogs, PerformanceTarget } from '../models';
import { computeStockHoldings } from './transactions';

const router = Router();

// Helper to compute a stock's transaction timeline in memory for analytics
interface HoldingPoint {
  date: string;
  remainingShares: number;
  averageCost: number;
  cumulativeRealizedPL: number;
}

interface UnifiedTx {
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  date: string;
  createdAt: Date;
}

function computeStockHoldingsTimeline(purchases: Purchase[], sales: Sales[]): HoldingPoint[] {
  const transactions: UnifiedTx[] = [
    ...purchases.map((p) => ({
      type: 'BUY' as const,
      quantity: Number(p.quantity),
      price: Number(p.purchasePrice),
      date: p.purchaseDate,
      createdAt: p.createdAt,
    })),
    ...sales.map((s) => ({
      type: 'SELL' as const,
      quantity: Number(s.quantity),
      price: Number(s.sellPrice),
      date: s.saleDate,
      createdAt: s.createdAt,
    })),
  ];

  // Chronological sort
  transactions.sort((a, b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  let remainingShares = 0;
  let totalCostBasis = 0;
  let averageCost = 0;
  let cumulativeRealizedPL = 0;

  const timeline: HoldingPoint[] = [];

  for (const tx of transactions) {
    if (tx.type === 'BUY') {
      remainingShares += tx.quantity;
      totalCostBasis += tx.quantity * tx.price;
      averageCost = remainingShares > 0 ? totalCostBasis / remainingShares : 0;
    } else {
      averageCost = remainingShares > 0 ? totalCostBasis / remainingShares : 0;
      const saleQty = Math.min(tx.quantity, remainingShares);
      const profitLoss = saleQty * (tx.price - averageCost);
      cumulativeRealizedPL += profitLoss;

      remainingShares -= saleQty;
      totalCostBasis = remainingShares * averageCost;
    }
    timeline.push({
      date: tx.date,
      remainingShares: Number(remainingShares.toFixed(4)),
      averageCost: Number(averageCost.toFixed(4)),
      cumulativeRealizedPL: Number(cumulativeRealizedPL.toFixed(2)),
    });
  }

  return timeline;
}

function getHoldingStateAt(timeline: HoldingPoint[], targetDate: string) {
  let matched = { remainingShares: 0, averageCost: 0, cumulativeRealizedPL: 0 };
  for (const point of timeline) {
    if (point.date <= targetDate) {
      matched = point;
    } else {
      break;
    }
  }
  return matched;
}

// POST /api/exports/generate -> Generate and Stream Reports [FR10]
router.post(
  '/generate',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    let auditLog: ExportLogs | null = null;
    try {
      const userId = req.user!.id;
      const { reportType, format, stockId, startDate, endDate } = req.body;

      // Validate inputs
      if (!['summary', 'transactions', 'analytics'].includes(reportType)) {
        return res.status(400).json({ success: false, message: 'Invalid reportType. Options: summary, transactions, analytics.' });
      }
      if (!['PDF', 'XLSX'].includes(format)) {
        return res.status(400).json({ success: false, message: 'Invalid format. Options: PDF, XLSX.' });
      }

      // Coerce empty strings to undefined to skip filters cleanly
      const parsedStartDate = startDate === '' || !startDate ? undefined : startDate;
      const parsedEndDate = endDate === '' || !endDate ? undefined : endDate;

      // Strict date formatting validations (YYYY-MM-DD pattern regex)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (parsedStartDate && !dateRegex.test(parsedStartDate)) {
        return res.status(400).json({ success: false, message: 'Invalid startDate format. Must be YYYY-MM-DD.' });
      }
      if (parsedEndDate && !dateRegex.test(parsedEndDate)) {
        return res.status(400).json({ success: false, message: 'Invalid endDate format. Must be YYYY-MM-DD.' });
      }

      // 1. Resolve stockCounter token for naming and filtering
      let stockCounter = 'PORTFOLIO';
      let targetStock: Stock | null = null;
      if (stockId && stockId !== 'portfolio' && stockId !== 'all') {
        targetStock = await Stock.findOne({ where: { id: stockId, userId } });
        if (!targetStock) {
          return res.status(404).json({ success: false, message: 'Stock not found or unauthorized.' });
        }
        stockCounter = targetStock.symbol;
      }

      // 2. Fetch specific dataset based on reportType
      let summaryData: any = null;
      let transactionData: any[] = [];
      let analyticsData: any = null;

      const userStocks = await Stock.findAll({ where: { userId } });
      const userStockIds = userStocks.map((s) => s.id);

      if (reportType === 'summary') {
        let totalInvestedCapital = 0;
        let totalRealizedPL = 0;
        let totalUnrealizedPL = 0;
        let totalPortfolioValue = 0;

        // Realized P&L: Sum of all profitLoss in Sales
        const activeIds = targetStock ? [targetStock.id] : userStockIds;
        if (activeIds.length > 0) {
          const salesSum = await Sales.sum('profitLoss', {
            where: { stockId: activeIds },
          });
          totalRealizedPL = Number(salesSum || 0);
        }

        const activeHoldings: any[] = [];
        const stocksToCompute = targetStock ? [targetStock] : userStocks;

        const holdingsAndPrices = await Promise.all(
          stocksToCompute.map(async (stock) => {
            const holdings = await computeStockHoldings(stock.id);
            if (holdings.remainingShares <= 0 && targetStock === null) return null;

            const latestPriceRecord = await DailyPrice.findOne({
              where: { stockId: stock.id },
              order: [['date', 'DESC'], ['createdAt', 'DESC']],
            });
            return { stock, holdings, latestPriceRecord };
          })
        );

        for (const item of holdingsAndPrices) {
          if (!item) continue;
          const { stock, holdings, latestPriceRecord } = item;

          const currentPrice = latestPriceRecord ? Number(latestPriceRecord.price) : holdings.averageCost;
          const remainingShares = holdings.remainingShares;
          const averageCost = holdings.averageCost;

          const costBasis = remainingShares * averageCost;
          const marketValue = remainingShares * currentPrice;
          const unrealizedPL = marketValue - costBasis;

          totalInvestedCapital += costBasis;
          totalUnrealizedPL += unrealizedPL;
          totalPortfolioValue += marketValue;

          activeHoldings.push({
            symbol: stock.symbol,
            name: stock.name,
            category: stock.category,
            remainingShares: Number(remainingShares.toFixed(4)),
            averageCost: Number(averageCost.toFixed(2)),
            currentPrice: Number(currentPrice.toFixed(2)),
            costBasis: Number(costBasis.toFixed(2)),
            marketValue: Number(marketValue.toFixed(2)),
            unrealizedPL: Number(unrealizedPL.toFixed(2)),
          });
        }

        summaryData = {
          totalPortfolioValue: Number(totalPortfolioValue.toFixed(2)),
          totalInvestedCapital: Number(totalInvestedCapital.toFixed(2)),
          realizedPL: Number(totalRealizedPL.toFixed(2)),
          unrealizedPL: Number(totalUnrealizedPL.toFixed(2)),
          holdings: activeHoldings,
        };
      } else if (reportType === 'transactions') {
        const activeIds = targetStock ? [targetStock.id] : userStockIds;

        const purchases = await Purchase.findAll({
          where: { stockId: activeIds },
          include: [{ model: Stock, as: 'Stock', attributes: ['symbol', 'name'] }],
        });

        const sales = await Sales.findAll({
          where: { stockId: activeIds },
          include: [{ model: Stock, as: 'Stock', attributes: ['symbol', 'name'] }],
        });

        let combined: any[] = [
          ...purchases.map((p) => ({
            id: p.id,
            type: 'BUY',
            symbol: p.Stock?.symbol || 'UNKNOWN',
            name: p.Stock?.name || 'Unknown',
            quantity: Number(p.quantity),
            price: Number(p.purchasePrice),
            date: p.purchaseDate,
            profitLoss: null,
            createdAt: p.createdAt,
          })),
          ...sales.map((s) => ({
            id: s.id,
            type: 'SELL',
            symbol: s.Stock?.symbol || 'UNKNOWN',
            name: s.Stock?.name || 'Unknown',
            quantity: Number(s.quantity),
            price: Number(s.sellPrice),
            date: s.saleDate,
            profitLoss: Number(s.profitLoss),
            createdAt: s.createdAt,
          })),
        ];

        if (parsedStartDate) {
          combined = combined.filter((tx) => tx.date >= (parsedStartDate as string));
        }
        if (parsedEndDate) {
          combined = combined.filter((tx) => tx.date <= (parsedEndDate as string));
        }

        combined.sort((a, b) => {
          if (a.date < b.date) return 1;
          if (a.date > b.date) return -1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        transactionData = combined;
      } else if (reportType === 'analytics') {
        // Volatility & returns over filtered period
        const activeIds = targetStock ? [targetStock.id] : userStockIds;
        if (activeIds.length === 0) {
          analyticsData = { totalReturnPercent: 0, annualizedReturnPercent: 0, volatility: 0, assetAllocation: [], benchmarks: [], targets: [] };
        } else {
          const purchases = await Purchase.findAll({ where: { stockId: activeIds }, order: [['purchaseDate', 'ASC']] });
          const sales = await Sales.findAll({ where: { stockId: activeIds }, order: [['saleDate', 'ASC']] });

          const stockTimelines: { [stockId: string]: HoldingPoint[] } = {};
          const stocksToProcess = targetStock ? [targetStock] : userStocks;
          stocksToProcess.forEach((stock) => {
            const stockPurchases = purchases.filter((p) => p.stockId === stock.id);
            const stockSales = sales.filter((s) => s.stockId === stock.id);
            stockTimelines[stock.id] = computeStockHoldingsTimeline(stockPurchases, stockSales);
          });

          const latestPrices = await Promise.all(
            stocksToProcess.map(async (stock) => {
              const lp = await DailyPrice.findOne({
                where: { stockId: stock.id },
                order: [['date', 'DESC'], ['createdAt', 'DESC']],
              });
              return { stockId: stock.id, price: lp ? Number(lp.price) : 0 };
            })
          );
          const latestPriceMap = latestPrices.reduce((acc, cur) => {
            acc[cur.stockId] = cur.price;
            return acc;
          }, {} as { [id: string]: number });

          let totalPortfolioValue = 0;
          let totalInvestedCapital = 0;
          const activeHoldings: any[] = [];

          stocksToProcess.forEach((stock) => {
            const timeline = stockTimelines[stock.id] || [];
            const currentHolding = timeline[timeline.length - 1] || { remainingShares: 0, averageCost: 0, cumulativeRealizedPL: 0 };

            if (currentHolding.remainingShares > 0) {
              const currentPrice = latestPriceMap[stock.id] || currentHolding.averageCost;
              const marketValue = currentHolding.remainingShares * currentPrice;
              const costBasis = currentHolding.remainingShares * currentHolding.averageCost;

              totalPortfolioValue += marketValue;
              totalInvestedCapital += costBasis;

              activeHoldings.push({
                symbol: stock.symbol,
                name: stock.name,
                category: stock.category,
                marketValue,
                shares: currentHolding.remainingShares,
              });
            }
          });

          const assetAllocation = activeHoldings.map((h) => ({
            symbol: h.symbol,
            name: h.name,
            category: h.category,
            marketValue: Number(h.marketValue.toFixed(2)),
            percentage: totalPortfolioValue > 0 ? Number(((h.marketValue / totalPortfolioValue) * 100).toFixed(2)) : 0,
          }));

          let totalReturnPercent = 0;
          if (totalInvestedCapital > 0) {
            totalReturnPercent = ((totalPortfolioValue - totalInvestedCapital) / totalInvestedCapital) * 100;
          }

          let annualizedReturnPercent = 0;
          if (purchases.length > 0) {
            const oldestPurchase = purchases[0];
            const purchaseDate = new Date(oldestPurchase.purchaseDate);
            const today = new Date();
            const diffTime = Math.abs(today.getTime() - purchaseDate.getTime());
            const daysHeld = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
            const totalReturnDecimal = totalReturnPercent / 100;
            
            // NAN protection guard before exponential Math.pow calculation [FR8]
            if (totalReturnDecimal <= -1) {
              annualizedReturnPercent = -100; // Floor return rate limit to prevent imaginary root errors
            } else {
              annualizedReturnPercent = (Math.pow(1 + totalReturnDecimal, 365 / daysHeld) - 1) * 100;
            }
          }

          // Volatility
          const allDailyPrices = await DailyPrice.findAll({
            where: { stockId: activeIds },
            order: [['date', 'ASC']],
          });

          const stockPriceMap: { [stockId: string]: { [date: string]: number } } = {};
          const stockPriceDates: { [stockId: string]: string[] } = {};
          activeIds.forEach((id) => {
            stockPriceMap[id] = {};
            stockPriceDates[id] = [];
          });
          allDailyPrices.forEach((dp) => {
            stockPriceMap[dp.stockId][dp.date] = Number(dp.price);
            stockPriceDates[dp.stockId].push(dp.date);
          });

          const getStockPriceAt = (stId: string, targetD: string, fallbackPrice: number): number => {
            if (stockPriceMap[stId][targetD] !== undefined) {
              return stockPriceMap[stId][targetD];
            }
            const dates = stockPriceDates[stId];
            let lastPrice = fallbackPrice;
            for (const d of dates) {
              if (d <= targetD) {
                lastPrice = stockPriceMap[stId][d];
              } else {
                break;
              }
            }
            return lastPrice;
          };

          const uniquePriceDatesSet = new Set<string>();
          allDailyPrices.forEach((dp) => uniquePriceDatesSet.add(dp.date));
          let uniquePriceDates = Array.from(uniquePriceDatesSet).sort();

          if (parsedStartDate) uniquePriceDates = uniquePriceDates.filter((d) => d >= (parsedStartDate as string));
          if (parsedEndDate) uniquePriceDates = uniquePriceDates.filter((d) => d <= (parsedEndDate as string));

          const dailyPortfolioValues: number[] = [];
          uniquePriceDates.forEach((dStr) => {
            let dayVal = 0;
            stocksToProcess.forEach((stock) => {
              const hTimeline = stockTimelines[stock.id] || [];
              const holdingState = getHoldingStateAt(hTimeline, dStr);
              const price = getStockPriceAt(stock.id, dStr, holdingState.averageCost);
              dayVal += holdingState.remainingShares * price;
            });
            if (dayVal > 0) {
              dailyPortfolioValues.push(dayVal);
            }
          });

          const dailyReturns: number[] = [];
          for (let i = 1; i < dailyPortfolioValues.length; i++) {
            const valPrev = dailyPortfolioValues[i - 1];
            const valCur = dailyPortfolioValues[i];
            if (valPrev > 0) {
              dailyReturns.push((valCur - valPrev) / valPrev);
            }
          }

          let volatility = 0;
          if (dailyReturns.length >= 2) {
            const n = dailyReturns.length;
            const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / n;
            const varianceSum = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0);
            volatility = Math.sqrt(varianceSum / (n - 1)) * 100;
          }

          // Benchmarking returns
          const benchmarks: any[] = [];
          if (parsedStartDate && parsedEndDate) {
            const parsedStart = new Date(parsedStartDate as string);
            const parsedEnd = new Date(parsedEndDate as string);
            for (const stock of stocksToProcess) {
              const startPriceRecord = await DailyPrice.findOne({
                where: { stockId: stock.id, date: { [Op.gte]: parsedStart } },
                order: [['date', 'ASC']],
              });
              const endPriceRecord = await DailyPrice.findOne({
                where: { stockId: stock.id, date: { [Op.lte]: parsedEnd } },
                order: [['date', 'DESC']],
              });
              if (startPriceRecord && endPriceRecord) {
                const pStart = Number(startPriceRecord.price);
                const pEnd = Number(endPriceRecord.price);
                const gain = pStart > 0 ? ((pEnd - pStart) / pStart) * 100 : 0;
                benchmarks.push({ symbol: stock.symbol, name: stock.name, startPrice: pStart, endPrice: pEnd, gain: Number(gain.toFixed(2)) });
              } else {
                benchmarks.push({ symbol: stock.symbol, name: stock.name, startPrice: null, endPrice: null, gain: 0 });
              }
            }
            benchmarks.sort((a, b) => b.gain - a.gain);
          }

          // Targets progress
          const dbTargets = await PerformanceTarget.findAll({ where: { userId }, order: [['targetDate', 'ASC']] });
          const targets = dbTargets.map((t) => {
            let currentMetric = 0;
            if (t.targetType === 'portfolio_value') currentMetric = totalPortfolioValue;
            else if (t.targetType === 'total_return') currentMetric = totalReturnPercent;
            else if (t.targetType === 'annualized_return') currentMetric = annualizedReturnPercent;

            const targetVal = Number(t.targetValue);
            const progress = targetVal > 0 ? Math.min(100, (currentMetric / targetVal) * 100) : 0;
            return {
              name: t.targetName,
              type: t.targetType,
              targetValue: targetVal,
              currentValue: Number(currentMetric.toFixed(2)),
              progressPercent: Number(progress.toFixed(2)),
              isAchieved: progress >= 100,
            };
          });

          analyticsData = {
            totalReturnPercent: Number(totalReturnPercent.toFixed(2)),
            annualizedReturnPercent: Number(annualizedReturnPercent.toFixed(2)),
            volatility: Number(volatility.toFixed(4)),
            totalPortfolioValue: Number(totalPortfolioValue.toFixed(2)),
            totalInvestedCapital: Number(totalInvestedCapital.toFixed(2)),
            assetAllocation,
            benchmarks,
            targets,
          };
        }
      }

      // 3. Apply the Strict File Naming Convention
      const startStr = parsedStartDate ? parsedStartDate : 'ALL_TIME';
      const endStr = parsedEndDate ? parsedEndDate : new Date().toISOString().split('T')[0];
      const dateRangeStr = `${startStr}_to_${endStr}`;
      const baseFilename = `${stockCounter}_${reportType.toUpperCase()}_${dateRangeStr}`;
      const ext = format === 'PDF' ? 'pdf' : 'xlsx';
      const filename = `${baseFilename}.${ext}`;
      
      // Strict filename header-injection validation filter
      const sanitizedFilename = filename.replace(/[^A-Za-z0-9._-]/g, '_');

      // Create provisional DB log early with "pending" status to ensure failures are tracked
      try {
        auditLog = await ExportLogs.create({
          userId,
          reportType,
          exportType: format,
          status: 'pending',
          filename: sanitizedFilename,
        });
      } catch (dbErr) {
        console.error('Provisional audit log creation failed:', dbErr);
      }

      // 4. Generate report streams and write audit log
      if (format === 'PDF') {
        const doc = new PDFDocument({ bufferPages: true, margins: { top: 60, bottom: 65, left: 50, right: 50 } });

        // Set response headers for stream attachment using sanitized filename
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
        doc.pipe(res);

        // Header Branding [FR10.4]
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#1e1b4b').text('STOCKED', { continued: true });
        doc.fontSize(12).font('Helvetica').fillColor('#64748b').text(' - Capital Market Management', 50, 67);
        doc.moveDown(1.5);

        // Metadata row - REDACT raw userId for PII privacy protection
        doc.fontSize(9).fillColor('#64748b');
        doc.text(`Generated By User Token: REDACTED`);
        doc.text(`Timestamp: ${new Date().toUTCString()}`);
        doc.text(`Query Range: ${startStr} to ${endStr}`);
        doc.moveDown(1.5);

        // Title and section
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e1b4b').text(`${reportType.toUpperCase()} REPORT`, { underline: true });
        doc.moveDown(1);

        if (reportType === 'summary' && summaryData) {
          // Display Valuation summary KPIs
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e1b4b').text('PORTFOLIO KPI SUMMARY:');
          doc.fontSize(9).font('Helvetica').fillColor('#334155');
          doc.text(`Total Portfolio Market Value: $${summaryData.totalPortfolioValue.toLocaleString()}`);
          doc.text(`Total Invested Capital Cost: $${summaryData.totalInvestedCapital.toLocaleString()}`);
          doc.text(`Total Realized P&L Earnings: $${summaryData.realizedPL.toLocaleString()}`);
          doc.text(`Total Unrealized Paper P&L: $${summaryData.unrealizedPL.toLocaleString()}`);
          doc.moveDown(2);

          // Grid active assets list header
          doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e1b4b').text('ACTIVE STOCKS GRID LEDGER:');
          doc.moveDown(0.5);

          // Table Draw
          let startY = doc.y;
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#1e1b4b');
          doc.text('Ticker', 50, startY);
          doc.text('Shares', 100, startY);
          doc.text('Avg Cost', 160, startY);
          doc.text('Live Price', 220, startY);
          doc.text('Net Cost ($)', 280, startY);
          doc.text('Market Val ($)', 350, startY);
          doc.text('Unrealized P&L ($)', 430, startY);

          // Horizontal rule
          doc.moveTo(50, startY + 12).lineTo(550, startY + 12).strokeColor('#cbd5e1').lineWidth(1).stroke();
          doc.moveDown(0.8);

          doc.fontSize(8).font('Helvetica').fillColor('#334155');
          summaryData.holdings.forEach((h: any) => {
            const rowY = doc.y;
            // Page break safety check
            if (rowY > 700) {
              doc.addPage();
              doc.fontSize(8).font('Helvetica-Bold').fillColor('#1e1b4b');
              const newY = doc.y;
              doc.text('Ticker', 50, newY);
              doc.text('Shares', 100, newY);
              doc.text('Avg Cost', 160, newY);
              doc.text('Live Price', 220, newY);
              doc.text('Net Cost ($)', 280, newY);
              doc.text('Market Val ($)', 350, newY);
              doc.text('Unrealized P&L ($)', 430, newY);
              doc.moveTo(50, newY + 12).lineTo(550, newY + 12).strokeColor('#cbd5e1').stroke();
              doc.fontSize(8).font('Helvetica').fillColor('#334155');
              doc.moveDown(0.8);
            }

            const curY = doc.y;
            doc.text(h.symbol, 50, curY);
            doc.text(h.remainingShares.toLocaleString(), 100, curY);
            doc.text(`$${h.averageCost.toFixed(2)}`, 160, curY);
            doc.text(`$${h.currentPrice.toFixed(2)}`, 220, curY);
            doc.text(`$${h.costBasis.toLocaleString()}`, 280, curY);
            doc.text(`$${h.marketValue.toLocaleString()}`, 350, curY);
            
            const plText = `${h.unrealizedPL >= 0 ? '+' : ''}$${h.unrealizedPL.toLocaleString()}`;
            const plColor = h.unrealizedPL >= 0 ? '#10b981' : '#f43f5e';
            doc.fillColor(plColor).text(plText, 430, curY).fillColor('#334155');
            doc.moveDown(1.2);
          });
        } else if (reportType === 'transactions' && transactionData) {
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e1b4b').text('CHRONOLOGICAL TRADE HISTORIES:');
          doc.moveDown(0.5);

          let startY = doc.y;
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#1e1b4b');
          doc.text('Date', 50, startY);
          doc.text('Type', 110, startY);
          doc.text('Ticker', 160, startY);
          doc.text('Quantity', 220, startY);
          doc.text('Price ($)', 300, startY);
          doc.text('Realized P&L ($)', 380, startY);

          doc.moveTo(50, startY + 12).lineTo(550, startY + 12).strokeColor('#cbd5e1').lineWidth(1).stroke();
          doc.moveDown(0.8);

          doc.fontSize(8).font('Helvetica').fillColor('#334155');
          transactionData.forEach((tx: any) => {
            const rowY = doc.y;
            if (rowY > 700) {
              doc.addPage();
              doc.fontSize(8).font('Helvetica-Bold').fillColor('#1e1b4b');
              const newY = doc.y;
              doc.text('Date', 50, newY);
              doc.text('Type', 110, newY);
              doc.text('Ticker', 160, newY);
              doc.text('Quantity', 220, newY);
              doc.text('Price ($)', 300, newY);
              doc.text('Realized P&L ($)', 380, newY);
              doc.moveTo(50, newY + 12).lineTo(550, newY + 12).strokeColor('#cbd5e1').stroke();
              doc.fontSize(8).font('Helvetica').fillColor('#334155');
              doc.moveDown(0.8);
            }

            const curY = doc.y;
            doc.text(tx.date, 50, curY);
            
            const isBuy = tx.type === 'BUY';
            doc.fillColor(isBuy ? '#10b981' : '#f43f5e').text(tx.type, 110, curY).fillColor('#334155');
            doc.text(tx.symbol, 160, curY);
            doc.text(tx.quantity.toLocaleString(), 220, curY);
            doc.text(`$${tx.price.toFixed(2)}`, 300, curY);
            
            if (tx.profitLoss !== null) {
              const plText = `${tx.profitLoss >= 0 ? '+' : ''}$${tx.profitLoss.toFixed(2)}`;
              doc.fillColor(tx.profitLoss >= 0 ? '#10b981' : '#f43f5e').text(plText, 380, curY).fillColor('#334155');
            } else {
              doc.text('—', 380, curY);
            }
            doc.moveDown(1.2);
          });
        } else if (reportType === 'analytics' && analyticsData) {
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e1b4b').text('QUANTITATIVE PERFORMANCE METRICS:');
          doc.fontSize(9).font('Helvetica').fillColor('#334155');
          doc.text(`Total Period Return (%): ${analyticsData.totalReturnPercent.toFixed(2)}%`);
          doc.text(`Annualized CAGR Return (%): ${analyticsData.annualizedReturnPercent.toFixed(2)}%`);
          doc.text(`Portfolio Daily Volatility (σ): ${analyticsData.volatility.toFixed(4)}%`);
          doc.text(`Total Valuation: $${analyticsData.totalPortfolioValue.toLocaleString()}`);
          doc.text(`Net Invested Capital: $${analyticsData.totalInvestedCapital.toLocaleString()}`);
          doc.moveDown(1.5);

          // Allocation Grid
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e1b4b').text('DIVERSIFICATION WEIGHTS:');
          doc.moveDown(0.5);

          let startY = doc.y;
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#1e1b4b');
          doc.text('Symbol', 50, startY);
          doc.text('Asset Name', 110, startY);
          doc.text('Category', 250, startY);
          doc.text('Market Valuation ($)', 370, startY);
          doc.text('Portfolio Weight (%)', 480, startY);

          doc.moveTo(50, startY + 12).lineTo(550, startY + 12).strokeColor('#cbd5e1').stroke();
          doc.moveDown(0.8);

          doc.fontSize(8).font('Helvetica').fillColor('#334155');
          analyticsData.assetAllocation.forEach((alloc: any) => {
            const curY = doc.y;
            doc.text(alloc.symbol, 50, curY);
            doc.text(alloc.name, 110, curY);
            doc.text(alloc.category || 'N/A', 250, curY);
            doc.text(`$${alloc.marketValue.toLocaleString()}`, 370, curY);
            doc.text(`${alloc.percentage.toFixed(2)}%`, 480, curY);
            doc.moveDown(1.2);
          });
          doc.moveDown(1.5);

          // Benchmarks
          if (analyticsData.benchmarks && analyticsData.benchmarks.length > 0) {
            doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e1b4b').text('ASSET COMPARATIVE BENCHMARKS:');
            doc.moveDown(0.5);

            let bY = doc.y;
            doc.fontSize(8).font('Helvetica-Bold').fillColor('#1e1b4b');
            doc.text('Symbol', 50, bY);
            doc.text('Start Price ($)', 120, bY);
            doc.text('End Price ($)', 220, bY);
            doc.text('Comparative Yield (%)', 320, bY);

            doc.moveTo(50, bY + 12).lineTo(550, bY + 12).strokeColor('#cbd5e1').stroke();
            doc.moveDown(0.8);

            doc.fontSize(8).font('Helvetica').fillColor('#334155');
            analyticsData.benchmarks.forEach((bench: any) => {
              const curY = doc.y;
              doc.text(bench.symbol, 50, curY);
              doc.text(bench.startPrice !== null ? `$${bench.startPrice.toFixed(2)}` : 'N/A', 120, curY);
              doc.text(bench.endPrice !== null ? `$${bench.endPrice.toFixed(2)}` : 'N/A', 220, curY);
              
              const gText = `${bench.gain >= 0 ? '+' : ''}${bench.gain.toFixed(2)}%`;
              doc.fillColor(bench.gain >= 0 ? '#10b981' : '#f43f5e').text(gText, 320, curY).fillColor('#334155');
              doc.moveDown(1.2);
            });
            doc.moveDown(1.5);
          }

          // Targets Checklist
          if (analyticsData.targets && analyticsData.targets.length > 0) {
            doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e1b4b').text('PERFORMANCE GOAL TRACKERS:');
            doc.moveDown(0.5);

            let tY = doc.y;
            doc.fontSize(8).font('Helvetica-Bold').fillColor('#1e1b4b');
            doc.text('Goal Milestone Name', 50, tY);
            doc.text('Target Type', 180, tY);
            doc.text('Target Value', 280, tY);
            doc.text('Current Value', 360, tY);
            doc.text('Progress (%)', 440, tY);
            doc.text('Status', 500, tY);

            doc.moveTo(50, tY + 12).lineTo(550, tY + 12).strokeColor('#cbd5e1').stroke();
            doc.moveDown(0.8);

            doc.fontSize(8).font('Helvetica').fillColor('#334155');
            analyticsData.targets.forEach((target: any) => {
              const curY = doc.y;
              doc.text(target.name, 50, curY);
              doc.text(target.type.replace('_', ' '), 180, curY);
              doc.text(target.targetValue.toLocaleString(), 280, curY);
              doc.text(target.currentValue.toLocaleString(), 360, curY);
              doc.text(`${target.progressPercent}%`, 440, curY);
              
              doc.fillColor(target.isAchieved ? '#10b981' : '#3b82f6')
                .text(target.isAchieved ? 'ACHIEVED' : 'ACTIVE', 500, curY)
                .fillColor('#334155');
              doc.moveDown(1.2);
            });
          }
        }

        // Apply Dynamic Footers and Headers to PDF Pages [FR10.4]
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          
          // Draw thin subtle border border lines
          doc.rect(20, 20, 572, 752).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

          // Header line
          doc.fontSize(7).fillColor('#94a3b8').font('Helvetica');
          doc.text('STOCKED CAPITAL PORTFOLIO LEDGER SYSTEM', 50, 32);
          doc.moveTo(50, 42).lineTo(550, 42).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

          // Footer line
          doc.moveTo(50, 742).lineTo(550, 742).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
          doc.fontSize(7).fillColor('#94a3b8').text('CONFIDENTIAL - SYSTEM INTERNAL AUDIT COMPLIANCE REPORT', 50, 749);
          doc.text(`Page ${i + 1} of ${range.count}`, 50, 749, { align: 'right' });
        }

        // Hook up response finish callback to update the provisional db log to success
        res.on('finish', async () => {
          if (auditLog) {
            try {
              auditLog.status = 'success';
              await auditLog.save();
            } catch (saveErr) {
              console.error('Audit status success update failed:', saveErr);
            }
          }
        });

        doc.end();
      } else if (format === 'XLSX') {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`${reportType.toUpperCase()} Report`);

        // Sticky headers and freeze panes [FR10.4]
        worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

        const headerStyle = {
          font: { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Segoe UI', size: 10 },
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } }, // Dark Indigo
          alignment: { horizontal: 'left', vertical: 'middle' },
        };

        if (reportType === 'summary' && summaryData) {
          // Define Columns - Fix 'Ticker Ticker' typo to 'Ticker Symbol' (Issue 3)
          worksheet.columns = [
            { header: 'Ticker Symbol', key: 'symbol', width: 12 },
            { header: 'Security Name', key: 'name', width: 25 },
            { header: 'Category Name', key: 'category', width: 15 },
            { header: 'Remaining Quantity', key: 'shares', width: 20 },
            { header: 'Average Buy Price', key: 'avgCost', width: 20 },
            { header: 'Current Active Price', key: 'curPrice', width: 20 },
            { header: 'Net Cost Basis ($)', key: 'costBasis', width: 20 },
            { header: 'Market Valuation ($)', key: 'marketValue', width: 20 },
            { header: 'Unrealized Paper P&L ($)', key: 'unrealizedPL', width: 22 },
          ];

          summaryData.holdings.forEach((h: any) => {
            worksheet.addRow({
              symbol: h.symbol,
              name: h.name,
              category: h.category || 'N/A',
              shares: h.remainingShares,
              avgCost: h.averageCost,
              curPrice: h.currentPrice,
              costBasis: h.costBasis,
              marketValue: h.marketValue,
              unrealizedPL: h.unrealizedPL,
            });
          });

          // Style rows
          worksheet.getRow(1).eachCell((cell) => {
            cell.font = headerStyle.font;
            cell.fill = headerStyle.fill as any;
            cell.alignment = headerStyle.alignment as any;
          });

          worksheet.eachRow((row, rowNum) => {
            if (rowNum > 1) {
              row.getCell('shares').numFmt = '#,##0.0000';
              row.getCell('avgCost').numFmt = '$#,##0.00';
              row.getCell('curPrice').numFmt = '$#,##0.00';
              row.getCell('costBasis').numFmt = '$#,##0.00';
              row.getCell('marketValue').numFmt = '$#,##0.00';
              row.getCell('unrealizedPL').numFmt = '$#,##0.00;($#,##0.00);"-"';
            }
          });
        } else if (reportType === 'transactions' && transactionData) {
          worksheet.columns = [
            { header: 'Execution Date', key: 'date', width: 15 },
            { header: 'Transaction Type', key: 'type', width: 18 },
            { header: 'Ticker Symbol', key: 'symbol', width: 14 },
            { header: 'Shares Quantity', key: 'quantity', width: 18 },
            { header: 'Execution Price', key: 'price', width: 18 },
            { header: 'Realized Gains P&L', key: 'profitLoss', width: 22 },
          ];

          transactionData.forEach((tx: any) => {
            worksheet.addRow({
              date: tx.date,
              type: tx.type,
              symbol: tx.symbol,
              quantity: tx.quantity,
              price: tx.price,
              profitLoss: tx.profitLoss !== null ? tx.profitLoss : '',
            });
          });

          worksheet.getRow(1).eachCell((cell) => {
            cell.font = headerStyle.font;
            cell.fill = headerStyle.fill as any;
            cell.alignment = headerStyle.alignment as any;
          });

          worksheet.eachRow((row, rowNum) => {
            if (rowNum > 1) {
              row.getCell('quantity').numFmt = '#,##0.0000';
              row.getCell('price').numFmt = '$#,##0.00';
              const plCell = row.getCell('profitLoss');
              if (plCell.value !== '') {
                plCell.numFmt = '$#,##0.00;($#,##0.00);"-"';
              }
            }
          });
        } else if (reportType === 'analytics' && analyticsData) {
          // Allocation
          worksheet.columns = [
            { header: 'Asset Ticker', key: 'symbol', width: 14 },
            { header: 'Asset Name', key: 'name', width: 25 },
            { header: 'Category Name', key: 'category', width: 16 },
            { header: 'Current Valuation', key: 'val', width: 20 },
            { header: 'Portfolio Weight (%)', key: 'percentage', width: 20 },
          ];

          analyticsData.assetAllocation.forEach((alloc: any) => {
            worksheet.addRow({
              symbol: alloc.symbol,
              name: alloc.name,
              category: alloc.category || 'N/A',
              val: alloc.marketValue,
              percentage: alloc.percentage,
            });
          });

          worksheet.getRow(1).eachCell((cell) => {
            cell.font = headerStyle.font;
            cell.fill = headerStyle.fill as any;
            cell.alignment = headerStyle.alignment as any;
          });

          worksheet.eachRow((row, rowNum) => {
            if (rowNum > 1) {
              row.getCell('val').numFmt = '$#,##0.00';
              row.getCell('percentage').numFmt = '0.00"%"';
            }
          });
        }

        // Set response headers for stream attachment using sanitized filename
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);

        // Setup finish listener to update state to success
        res.on('finish', async () => {
          if (auditLog) {
            try {
              auditLog.status = 'success';
              await auditLog.save();
            } catch (saveErr) {
              console.error('Audit status success update failed:', saveErr);
            }
          }
        });

        await workbook.xlsx.write(res);
        res.end();
      }

      console.log(`[AUDIT LOG] ${new Date().toISOString()}: Report "${sanitizedFilename}" generated successfully for audit entry.`);
    } catch (error: any) {
      console.error('Error generating reporting export stream:', error);
      // Mark provisional audit status to failed upon throw/catch triggers
      if (auditLog) {
        try {
          auditLog.status = 'failed';
          await auditLog.save();
        } catch (saveErr) {
          console.error('Audit status failed update failed:', saveErr);
        }
      }
      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: 'Critical error rendering reports stream pipelines.',
        });
      }
    }
  }
);

// GET /api/exports/logs -> Fetch internal system export history ledger
router.get(
  '/logs',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const logs = await ExportLogs.findAll({
        where: { userId },
        order: [['generatedAt', 'DESC']],
      });
      return res.status(200).json({ success: true, data: logs });
    } catch (error: any) {
      console.error('Error retrieving export logs:', error);
      return res.status(500).json({ success: false, message: 'Failed to retrieve system export audit trails.' });
    }
  }
);

export default router;
