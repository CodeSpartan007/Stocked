import { Router, Response } from 'express';
import { Op } from 'sequelize';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { Stock, DailyPrice, Purchase, Sales, PerformanceTarget } from '../models';

const router = Router();

function parseOptionalDate(dateStr: any): Date | null {
  if (!dateStr) return null;
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('Invalid date format. Must be YYYY-MM-DD.');
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date.');
  }
  return date;
}

// Helper to find all dates in YYYY-MM-DD between start and end
function getDatesInRange(startStr: string, endStr: string): string[] {
  const dates: string[] = [];
  const start = new Date(startStr);
  const end = new Date(endStr);
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// Helper to compute a stock's transaction timeline in memory
interface UnifiedTx {
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  date: string;
  createdAt: Date;
}

interface HoldingPoint {
  date: string;
  remainingShares: number;
  averageCost: number;
  cumulativeRealizedPL: number;
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
      if (tx.quantity > remainingShares) {
        console.error(
          `[DATA INTEGRITY ERROR] ${new Date().toISOString()}: Sales transaction quantity (${tx.quantity}) exceeds remaining shares (${remainingShares}) for transaction date ${tx.date} (createdAt: ${tx.createdAt}). Capping saleQty to remainingShares.`
        );
      }
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

// Find holding state on a given target date
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

// GET /api/analytics/charts/:stockId -> Line, Bar, and Cumulative P&L [FR6]
router.get(
  '/charts/:stockId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { stockId } = req.params;
      const { startDate, endDate } = req.query;

      let parsedStart: Date | null = null;
      let parsedEnd: Date | null = null;
      try {
        parsedStart = parseOptionalDate(startDate);
        parsedEnd = parseOptionalDate(endDate);
      } catch (err: any) {
        return res.status(400).json({ success: false, message: err.message });
      }

      // 1. Fetch user's stocks
      const userStocks = await Stock.findAll({ where: { userId } });
      const stockIds = userStocks.map((s) => s.id);

      if (stockIds.length === 0) {
        return res.status(200).json({
          success: true,
          data: { priceTrend: [], volumeTrend: [], cumulativePerformance: [] },
        });
      }

      // Determine active stock list
      let targetStocks = userStocks;
      if (stockId !== 'portfolio' && stockId !== 'all') {
        targetStocks = userStocks.filter((s) => s.id === stockId);
        if (targetStocks.length === 0) {
          return res.status(404).json({ success: false, message: 'Stock not found or unauthorized.' });
        }
      }

      const targetStockIds = targetStocks.map((s) => s.id);

      // Date range filtering
      const priceWhereClause: any = { stockId: targetStockIds };
      if (parsedStart || parsedEnd) {
        priceWhereClause.date = {};
        if (parsedStart) priceWhereClause.date[Op.gte] = parsedStart;
        if (parsedEnd) priceWhereClause.date[Op.lte] = parsedEnd;
      }

      // 2. Extract historical closing prices & volume
      const dailyPrices = await DailyPrice.findAll({
        where: { ...priceWhereClause, userId },
        order: [['date', 'ASC']],
      });

      // Price Trend Line Chart & Volume Trend Bar Chart buckets
      const priceTrendMap: { [date: string]: { date: string; priceSum: number; count: number; volumeSum: number } } = {};
      dailyPrices.forEach((dp) => {
        const dStr = dp.date;
        const price = Number(dp.price);
        const volume = Number(dp.volume);
        if (!priceTrendMap[dStr]) {
          priceTrendMap[dStr] = { date: dStr, priceSum: 0, count: 0, volumeSum: 0 };
        }
        priceTrendMap[dStr].priceSum += price;
        priceTrendMap[dStr].count += 1;
        priceTrendMap[dStr].volumeSum += volume;
      });

      const priceTrend = Object.values(priceTrendMap)
        .map((item) => ({
          date: item.date,
          price: Number((item.priceSum / item.count).toFixed(2)), // Average if multiple, or exact price
        }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));

      const volumeTrend = Object.values(priceTrendMap)
        .map((item) => ({
          date: item.date,
          volume: item.volumeSum,
        }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));

      // 3. Cumulative Portfolio Performance Timeline
      // Query all transactions
      const purchases = await Purchase.findAll({
        where: { stockId: targetStockIds, userId },
        order: [['purchaseDate', 'ASC']],
      });
      const sales = await Sales.findAll({
        where: { stockId: targetStockIds, userId },
        order: [['saleDate', 'ASC']],
      });

      // Calculate in-memory holdings timelines per stock
      const stockTimelines: { [stockId: string]: HoldingPoint[] } = {};
      targetStocks.forEach((stock) => {
        const stockPurchases = purchases.filter((p) => p.stockId === stock.id);
        const stockSales = sales.filter((s) => s.stockId === stock.id);
        stockTimelines[stock.id] = computeStockHoldingsTimeline(stockPurchases, stockSales);
      });

      // Query all daily prices for cumulative matching
      const allDailyPrices = await DailyPrice.findAll({
        where: { stockId: targetStockIds, userId },
        order: [['date', 'ASC']],
      });

      // Sort price feeds by stockId and date for easy lookup
      const stockPriceMap: { [stockId: string]: { [date: string]: number } } = {};
      const stockPriceDates: { [stockId: string]: string[] } = {};
      targetStockIds.forEach((id) => {
        stockPriceMap[id] = {};
        stockPriceDates[id] = [];
      });

      allDailyPrices.forEach((dp) => {
        stockPriceMap[dp.stockId][dp.date] = Number(dp.price);
        stockPriceDates[dp.stockId].push(dp.date);
      });

      // Helper to find stock price on or before target date
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

      // Determine cumulative timeline dates: union of all price dates and transaction dates
      const allUniqueDatesSet = new Set<string>();
      allDailyPrices.forEach((dp) => allUniqueDatesSet.add(dp.date));
      purchases.forEach((p) => allUniqueDatesSet.add(p.purchaseDate));
      sales.forEach((s) => allUniqueDatesSet.add(s.saleDate));

      let allUniqueDates = Array.from(allUniqueDatesSet).sort();

      // Apply range filters if provided
      if (parsedStart) {
        allUniqueDates = allUniqueDates.filter((d) => new Date(d) >= parsedStart!);
      }
      if (parsedEnd) {
        allUniqueDates = allUniqueDates.filter((d) => new Date(d) <= parsedEnd!);
      }

      // Build the cumulative points
      const cumulativePerformance = allUniqueDates.map((dStr) => {
        let dailyPortfolioValue = 0;
        let dailyInvestedCapital = 0;
        let dailyCumulativeRealizedPL = 0;

        targetStocks.forEach((stock) => {
          const hTimeline = stockTimelines[stock.id] || [];
          const holdingState = getHoldingStateAt(hTimeline, dStr);

          // Get price of this stock at this date
          const price = getStockPriceAt(stock.id, dStr, holdingState.averageCost);

          const marketValue = holdingState.remainingShares * price;
          const costBasis = holdingState.remainingShares * holdingState.averageCost;

          dailyPortfolioValue += marketValue;
          dailyInvestedCapital += costBasis;
          dailyCumulativeRealizedPL += holdingState.cumulativeRealizedPL;
        });

        const dailyUnrealizedPL = dailyPortfolioValue - dailyInvestedCapital;
        const totalPL = dailyUnrealizedPL + dailyCumulativeRealizedPL;

        return {
          date: dStr,
          portfolioValue: Number(dailyPortfolioValue.toFixed(2)),
          investedCapital: Number(dailyInvestedCapital.toFixed(2)),
          realizedPL: Number(dailyCumulativeRealizedPL.toFixed(2)),
          unrealizedPL: Number(dailyUnrealizedPL.toFixed(2)),
          totalPL: Number(totalPL.toFixed(2)),
        };
      });

      return res.status(200).json({
        success: true,
        data: {
          priceTrend,
          volumeTrend,
          cumulativePerformance,
        },
      });
    } catch (error: any) {
      console.error('Error fetching analytics charts:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to aggregate time-series financial chart data.',
      });
    }
  }
);

// GET /api/analytics/advanced -> Quantitative Financial Analytics [FR8]
router.get(
  '/advanced',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { startDate, endDate } = req.query;

      let parsedStart: Date | null = null;
      let parsedEnd: Date | null = null;
      try {
        parsedStart = parseOptionalDate(startDate);
        parsedEnd = parseOptionalDate(endDate);
      } catch (err: any) {
        return res.status(400).json({ success: false, message: err.message });
      }

      // 1. Fetch user's stocks
      const userStocks = await Stock.findAll({ where: { userId } });
      const stockIds = userStocks.map((s) => s.id);

      if (stockIds.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            totalReturnPercent: 0,
            annualizedReturnPercent: 0,
            volatility: 0,
            assetAllocation: [],
            totalPortfolioValue: 0,
            totalInvestedCapital: 0,
          },
        });
      }

      // Fetch all purchases & sales
      const purchases = await Purchase.findAll({ where: { stockId: stockIds, userId }, order: [['purchaseDate', 'ASC']] });
      const sales = await Sales.findAll({ where: { stockId: stockIds, userId }, order: [['saleDate', 'ASC']] });

      // Compute in-memory holdings timelines per stock
      const stockTimelines: { [stockId: string]: HoldingPoint[] } = {};
      userStocks.forEach((stock) => {
        const stockPurchases = purchases.filter((p) => p.stockId === stock.id);
        const stockSales = sales.filter((s) => s.stockId === stock.id);
        stockTimelines[stock.id] = computeStockHoldingsTimeline(stockPurchases, stockSales);
      });

      // Query latest price records for asset allocation
      const latestPrices = await Promise.all(
        userStocks.map(async (stock) => {
          const lp = await DailyPrice.findOne({
            where: { stockId: stock.id, userId },
            order: [['date', 'DESC'], ['createdAt', 'DESC']],
          });
          return { stockId: stock.id, price: lp ? Number(lp.price) : 0 };
        })
      );
      const latestPriceMap = latestPrices.reduce((acc, cur) => {
        acc[cur.stockId] = cur.price;
        return acc;
      }, {} as { [id: string]: number });

      // 2. Compute current Portfolio Valuation
      let totalPortfolioValue = 0;
      let totalInvestedCapital = 0;
      const activeHoldings: any[] = [];

      userStocks.forEach((stock) => {
        const timeline = stockTimelines[stock.id] || [];
        const currentHolding = timeline[timeline.length - 1] || { remainingShares: 0, averageCost: 0, cumulativeRealizedPL: 0 };

        if (currentHolding.remainingShares > 0) {
          const currentPrice = latestPriceMap[stock.id] || currentHolding.averageCost;
          const marketValue = currentHolding.remainingShares * currentPrice;
          const costBasis = currentHolding.remainingShares * currentHolding.averageCost;

          totalPortfolioValue += marketValue;
          totalInvestedCapital += costBasis;

          activeHoldings.push({
            stockId: stock.id,
            symbol: stock.symbol,
            name: stock.name,
            category: stock.category,
            marketValue,
            shares: currentHolding.remainingShares,
          });
        }
      });

      // 3. Asset Allocation Breakdowns
      const assetAllocation = activeHoldings.map((h) => ({
        stockId: h.stockId,
        symbol: h.symbol,
        name: h.name,
        category: h.category,
        marketValue: Number(h.marketValue.toFixed(2)),
        percentage: totalPortfolioValue > 0 ? Number(((h.marketValue / totalPortfolioValue) * 100).toFixed(2)) : 0,
      }));

      // 4. Calculate Total Return (%)
      // Formula: ((Current Portfolio Value - Total Invested Capital) / Total Invested Capital) * 100
      let totalReturnPercent = 0;
      if (totalInvestedCapital > 0) {
        totalReturnPercent = ((totalPortfolioValue - totalInvestedCapital) / totalInvestedCapital) * 100;
      }

      // 5. Calculate Annualized Return (%)
      // Formula: ((1 + Total Return)^ (365 / Days Portfolio Held) - 1) * 100
      let annualizedReturnPercent = 0;
      if (purchases.length > 0) {
        const oldestPurchase = purchases[0]; // Sorted ASC by date
        const purchaseDate = new Date(oldestPurchase.purchaseDate);
        const today = new Date();
        const diffTime = Math.abs(today.getTime() - purchaseDate.getTime());
        const daysHeld = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

        const totalReturnDecimal = totalReturnPercent / 100;
        annualizedReturnPercent = (Math.pow(1 + totalReturnDecimal, 365 / daysHeld) - 1) * 100;
      }

      // 6. Calculate Volatility (Sample Standard Deviation of daily returns)
      // We need to build a chronological timeline of portfolio values to get daily returns.
      const allDailyPrices = await DailyPrice.findAll({
        where: { stockId: stockIds, userId },
        order: [['date', 'ASC']],
      });

      // Group prices by stock and date
      const stockPriceMap: { [stockId: string]: { [date: string]: number } } = {};
      const stockPriceDates: { [stockId: string]: string[] } = {};
      stockIds.forEach((id) => {
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

      // Filter by date range if provided
      if (parsedStart) uniquePriceDates = uniquePriceDates.filter((d) => new Date(d) >= parsedStart!);
      if (parsedEnd) uniquePriceDates = uniquePriceDates.filter((d) => new Date(d) <= parsedEnd!);

      const dailyPortfolioValues: number[] = [];
      uniquePriceDates.forEach((dStr) => {
        let dayVal = 0;
        userStocks.forEach((stock) => {
          const hTimeline = stockTimelines[stock.id] || [];
          const holdingState = getHoldingStateAt(hTimeline, dStr);
          const price = getStockPriceAt(stock.id, dStr, holdingState.averageCost);
          dayVal += holdingState.remainingShares * price;
        });
        if (dayVal > 0) {
          dailyPortfolioValues.push(dayVal);
        }
      });

      // Calculate Returns Series
      const dailyReturns: number[] = [];
      for (let i = 1; i < dailyPortfolioValues.length; i++) {
        const valPrev = dailyPortfolioValues[i - 1];
        const valCur = dailyPortfolioValues[i];
        if (valPrev > 0) {
          dailyReturns.push((valCur - valPrev) / valPrev);
        }
      }

      // Compute sample standard deviation
      let volatility = 0;
      if (dailyReturns.length >= 2) {
        const n = dailyReturns.length;
        const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / n;
        const varianceSum = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0);
        const sampleVariance = varianceSum / (n - 1);
        volatility = Math.sqrt(sampleVariance) * 100; // Represented as a percentage
      }

      return res.status(200).json({
        success: true,
        data: {
          totalReturnPercent: Number(totalReturnPercent.toFixed(2)),
          annualizedReturnPercent: Number(annualizedReturnPercent.toFixed(2)),
          volatility: Number(volatility.toFixed(4)),
          assetAllocation,
          totalPortfolioValue: Number(totalPortfolioValue.toFixed(2)),
          totalInvestedCapital: Number(totalInvestedCapital.toFixed(2)),
        },
      });
    } catch (error: any) {
      console.error('Error fetching advanced analytics:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to calculate advanced quantitative financial metrics.',
      });
    }
  }
);

// GET /api/analytics/benchmark -> Benchmark relative performance [FR8]
router.get(
  '/benchmark',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { startDate, endDate } = req.query;

      let parsedStart: Date;
      let parsedEnd: Date;
      try {
        const start = parseOptionalDate(startDate);
        const end = parseOptionalDate(endDate);
        if (!start || !end) {
          throw new Error('Both startDate and endDate query parameters are required for benchmarking.');
        }
        parsedStart = start;
        parsedEnd = end;
      } catch (err: any) {
        return res.status(400).json({ success: false, message: err.message });
      }

      const userStocks = await Stock.findAll({ where: { userId } });
      const benchmarks: any[] = [];

      for (const stock of userStocks) {
        // Find price at or earliest after startDate
        const startPriceRecord = await DailyPrice.findOne({
          where: {
            stockId: stock.id,
            date: { [Op.gte]: parsedStart },
            userId,
          },
          order: [['date', 'ASC']],
        });

        // Find price at or latest before endDate
        const endPriceRecord = await DailyPrice.findOne({
          where: {
            stockId: stock.id,
            date: { [Op.lte]: parsedEnd },
            userId,
          },
          order: [['date', 'DESC']],
        });

        if (startPriceRecord && endPriceRecord) {
          const pStart = Number(startPriceRecord.price);
          const pEnd = Number(endPriceRecord.price);
          const performanceGain = pStart > 0 ? ((pEnd - pStart) / pStart) * 100 : 0;

          benchmarks.push({
            stockId: stock.id,
            symbol: stock.symbol,
            name: stock.name,
            startPrice: pStart,
            endPrice: pEnd,
            performanceGain: Number(performanceGain.toFixed(2)),
          });
        } else {
          benchmarks.push({
            stockId: stock.id,
            symbol: stock.symbol,
            name: stock.name,
            startPrice: null,
            endPrice: null,
            performanceGain: 0,
          });
        }
      }

      // Sort by highest performance gain descending
      benchmarks.sort((a, b) => b.performanceGain - a.performanceGain);

      return res.status(200).json({
        success: true,
        data: benchmarks,
      });
    } catch (error: any) {
      console.error('Error fetching benchmarking data:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to perform benchmark relative stock comparison.',
      });
    }
  }
);

// GET /api/analytics/targets -> Fetch performance targets [FR8]
router.get(
  '/targets',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      // 1. Fetch all targets
      const targets = await PerformanceTarget.findAll({
        where: { userId },
        order: [['targetDate', 'ASC']],
      });

      // 2. Fetch current portfolio valuation and metrics for comparison
      const userStocks = await Stock.findAll({ where: { userId } });
      const stockIds = userStocks.map((s) => s.id);

      let totalPortfolioValue = 0;
      let totalInvestedCapital = 0;
      let totalReturnPercent = 0;
      let annualizedReturnPercent = 0;

      if (stockIds.length > 0) {
        const purchases = await Purchase.findAll({ where: { stockId: stockIds, userId }, order: [['purchaseDate', 'ASC']] });
        const sales = await Sales.findAll({ where: { stockId: stockIds, userId }, order: [['saleDate', 'ASC']] });

        const stockTimelines: { [stockId: string]: HoldingPoint[] } = {};
        userStocks.forEach((stock) => {
          const stockPurchases = purchases.filter((p) => p.stockId === stock.id);
          const stockSales = sales.filter((s) => s.stockId === stock.id);
          stockTimelines[stock.id] = computeStockHoldingsTimeline(stockPurchases, stockSales);
        });

        const latestPrices = await Promise.all(
          userStocks.map(async (stock) => {
            const lp = await DailyPrice.findOne({
              where: { stockId: stock.id, userId },
              order: [['date', 'DESC'], ['createdAt', 'DESC']],
            });
            return { stockId: stock.id, price: lp ? Number(lp.price) : 0 };
          })
        );
        const latestPriceMap = latestPrices.reduce((acc, cur) => {
          acc[cur.stockId] = cur.price;
          return acc;
        }, {} as { [id: string]: number });

        userStocks.forEach((stock) => {
          const timeline = stockTimelines[stock.id] || [];
          const currentHolding = timeline[timeline.length - 1] || { remainingShares: 0, averageCost: 0, cumulativeRealizedPL: 0 };

          if (currentHolding.remainingShares > 0) {
            const currentPrice = latestPriceMap[stock.id] || currentHolding.averageCost;
            totalPortfolioValue += currentHolding.remainingShares * currentPrice;
            totalInvestedCapital += currentHolding.remainingShares * currentHolding.averageCost;
          }
        });

        if (totalInvestedCapital > 0) {
          totalReturnPercent = ((totalPortfolioValue - totalInvestedCapital) / totalInvestedCapital) * 100;
        }

        if (purchases.length > 0) {
          const oldestPurchase = purchases[0];
          const purchaseDate = new Date(oldestPurchase.purchaseDate);
          const today = new Date();
          const diffTime = Math.abs(today.getTime() - purchaseDate.getTime());
          const daysHeld = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
          annualizedReturnPercent = (Math.pow(1 + totalReturnPercent / 100, 365 / daysHeld) - 1) * 100;
        }
      }

      // Compute progress & achievement status for each target
      const targetsWithProgress = await Promise.all(
        targets.map(async (t) => {
          let currentMetric = 0;
          let progressPercent = 0;

          if (t.targetType === 'portfolio_value') {
            currentMetric = totalPortfolioValue;
          } else if (t.targetType === 'total_return') {
            currentMetric = totalReturnPercent;
          } else if (t.targetType === 'annualized_return') {
            currentMetric = annualizedReturnPercent;
          }

          const targetVal = Number(t.targetValue);
          if (targetVal > 0) {
            progressPercent = Math.min(100, (currentMetric / targetVal) * 100);
          }

          const achieved = progressPercent >= 100;

          // If target achieves milestone now and was not marked achieved, update DB silently
          if (achieved && !t.isAchieved) {
            t.isAchieved = true;
            await t.save();
          }

          return {
            id: t.id,
            targetName: t.targetName,
            targetType: t.targetType,
            targetValue: targetVal,
            targetDate: t.targetDate,
            isAchieved: t.isAchieved,
            currentValue: Number(currentMetric.toFixed(2)),
            progressPercent: Number(progressPercent.toFixed(2)),
          };
        })
      );

      return res.status(200).json({
        success: true,
        data: targetsWithProgress,
      });
    } catch (error: any) {
      console.error('Error fetching targets:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve user performance targets tracker.',
      });
    }
  }
);

// POST /api/analytics/targets -> Record performance target [FR8]
router.post(
  '/targets',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { targetName, targetType, targetValue, targetDate } = req.body;

      // Manual request validation
      if (!targetName || typeof targetName !== 'string' || targetName.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'Target name is required.' });
      }

      if (!['portfolio_value', 'total_return', 'annualized_return'].includes(targetType)) {
        return res.status(400).json({ success: false, message: 'Invalid target type.' });
      }

      const tValue = Number(targetValue);
      if (isNaN(tValue) || tValue <= 0) {
        return res.status(400).json({ success: false, message: 'Target value must be a positive number.' });
      }

      if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        return res.status(400).json({ success: false, message: 'Target date must be in YYYY-MM-DD format.' });
      }

      // Record Target
      const target = await PerformanceTarget.create({
        userId,
        targetName: targetName.trim(),
        targetType,
        targetValue: tValue,
        targetDate,
        isAchieved: false,
      });

      return res.status(201).json({
        success: true,
        message: 'Performance target registered successfully.',
        data: target,
      });
    } catch (error: any) {
      console.error('Error creating target:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to save new performance target profile.',
      });
    }
  }
);

export default router;
