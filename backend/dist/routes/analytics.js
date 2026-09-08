"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHoldingStateAt = getHoldingStateAt;
exports.calculateAnnualizedReturn = calculateAnnualizedReturn;
exports.calculateTwrVolatility = calculateTwrVolatility;
const express_1 = require("express");
const sequelize_1 = require("sequelize");
const auth_1 = require("../middleware/auth");
const models_1 = require("../models");
const currencyService_1 = require("../services/currencyService");
const router = (0, express_1.Router)();
function parseOptionalDate(dateStr) {
    if (!dateStr)
        return null;
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
function getDatesInRange(startDate, endDate) {
    const dates = [];
    const curr = new Date(startDate);
    while (curr <= endDate) {
        dates.push(curr.toISOString().split('T')[0]);
        curr.setDate(curr.getDate() + 1);
    }
    return dates;
}
function computeStockHoldingsTimeline(purchases, sales, costBasisMethod = 'average') {
    const transactions = [
        ...purchases.map((p) => ({
            type: 'BUY',
            quantity: Number(p.quantity),
            price: Number(p.purchasePrice),
            date: p.purchaseDate,
            createdAt: p.createdAt,
        })),
        ...sales.map((s) => ({
            type: 'SELL',
            quantity: Number(s.quantity),
            price: Number(s.sellPrice),
            date: s.saleDate,
            createdAt: s.createdAt,
        })),
    ];
    // Chronological sort: by date first (BUY before SELL on same date), then createdAt
    transactions.sort((a, b) => {
        if (a.date !== b.date)
            return a.date.localeCompare(b.date);
        if (a.type !== b.type)
            return a.type === 'BUY' ? -1 : 1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    const timeline = [];
    if (costBasisMethod === 'fifo') {
        const lots = [];
        let cumulativeRealizedPL = 0;
        for (const tx of transactions) {
            if (tx.type === 'BUY') {
                lots.push({ quantity: tx.quantity, price: tx.price });
            }
            else {
                let needed = tx.quantity;
                let saleCost = 0;
                while (needed > 0 && lots.length > 0) {
                    const lot = lots[0];
                    if (lot.quantity <= needed + 1e-9) {
                        saleCost += lot.quantity * lot.price;
                        needed -= lot.quantity;
                        lots.shift();
                    }
                    else {
                        saleCost += needed * lot.price;
                        lot.quantity -= needed;
                        needed = 0;
                    }
                }
                const profitLoss = (tx.quantity * tx.price) - saleCost;
                cumulativeRealizedPL += profitLoss;
            }
            const remainingShares = lots.reduce((acc, l) => acc + l.quantity, 0);
            const totalCostBasis = lots.reduce((acc, l) => acc + l.quantity * l.price, 0);
            const averageCost = remainingShares > 0 ? totalCostBasis / remainingShares : 0;
            timeline.push({
                date: tx.date,
                remainingShares: Number(remainingShares.toFixed(4)),
                averageCost: Number(averageCost.toFixed(4)),
                cumulativeRealizedPL: Number(cumulativeRealizedPL.toFixed(2)),
            });
        }
    }
    else {
        let remainingShares = 0;
        let totalCostBasis = 0;
        let averageCost = 0;
        let cumulativeRealizedPL = 0;
        for (const tx of transactions) {
            if (tx.type === 'BUY') {
                remainingShares += tx.quantity;
                totalCostBasis += tx.quantity * tx.price;
                averageCost = remainingShares > 0 ? totalCostBasis / remainingShares : 0;
            }
            else {
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
    }
    return timeline;
}
// Find holding state on a given target date
function getHoldingStateAt(timeline, targetDate) {
    let matched = { remainingShares: 0, averageCost: 0, cumulativeRealizedPL: 0 };
    for (const point of timeline) {
        if (point.date <= targetDate) {
            matched = point;
        }
        else {
            break;
        }
    }
    return matched;
}
/**
 * Calculates the annualized return percentage with standard quantitative financial guardrails [FR6.1, FR8.1].
 * Protects against Math domain errors (clamping negative bases) and exponential explosion for holding periods < 30 days.
 */
function calculateAnnualizedReturn(totalReturnPercent, daysHeld, totalInvestedCapital) {
    if (totalInvestedCapital <= 0) {
        return 0.00;
    }
    let annualizedReturnPercent = 0;
    if (daysHeld >= 30) {
        const r = totalReturnPercent / 100;
        if (r <= -1) {
            annualizedReturnPercent = -100.00;
        }
        else {
            const exponent = Math.min(365 / daysHeld, 12); // Limit exponent to prevent astronomical multi-year compounding overflow
            annualizedReturnPercent = Number(((Math.pow(1 + r, exponent) - 1) * 100).toFixed(2));
        }
    }
    else {
        annualizedReturnPercent = Number(totalReturnPercent.toFixed(2)); // For periods under 30 days, annualized equals absolute period return
    }
    return annualizedReturnPercent;
}
/**
 * Calculates sample standard deviation of cash-flow adjusted daily returns (Time-Weighted Return) [FR8.1].
 * R_t = (V_t - C_t - V_{t-1}) / V_{t-1}
 * where C_t is net external capital cash flow (purchases - sales) executed on day t.
 */
function calculateTwrVolatility(dailyValPoints) {
    const dailyReturns = [];
    for (let i = 1; i < dailyValPoints.length; i++) {
        const prev = dailyValPoints[i - 1];
        const cur = dailyValPoints[i];
        if (prev.value > 0) {
            const r = (cur.value - cur.cashFlow - prev.value) / prev.value;
            dailyReturns.push(r);
        }
    }
    let volatility = 0;
    if (dailyReturns.length >= 2) {
        const n = dailyReturns.length;
        const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / n;
        const varianceSum = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0);
        const sampleVariance = varianceSum / (n - 1);
        volatility = Math.sqrt(sampleVariance) * 100; // Represented as a percentage
    }
    return Number(volatility.toFixed(4));
}
// GET /api/analytics/charts/:stockId -> Line, Bar, and Cumulative P&L [FR6]
router.get('/charts/:stockId', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { baseCurrency, exchangeRate } = await (0, currencyService_1.getUserCurrencyContext)(userId);
        const { stockId } = req.params;
        const { startDate, endDate } = req.query;
        let sDate;
        let eDate;
        if (startDate && typeof startDate === 'string' && startDate.trim() !== '') {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())) {
                return res.status(400).json({ success: false, message: 'Invalid startDate format. Must be YYYY-MM-DD.' });
            }
            sDate = startDate.trim();
        }
        if (endDate && typeof endDate === 'string' && endDate.trim() !== '') {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())) {
                return res.status(400).json({ success: false, message: 'Invalid endDate format. Must be YYYY-MM-DD.' });
            }
            eDate = endDate.trim();
        }
        // 1. Fetch user's stocks
        const userStocks = await models_1.Stock.findAll({ where: { userId } });
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
        const priceWhereClause = { stockId: targetStockIds };
        if (sDate || eDate) {
            priceWhereClause.date = {};
            if (sDate)
                priceWhereClause.date[sequelize_1.Op.gte] = sDate;
            if (eDate)
                priceWhereClause.date[sequelize_1.Op.lte] = eDate;
        }
        // 2. Extract historical closing prices & volume
        const dailyPrices = await models_1.DailyPrice.findAll({
            where: { ...priceWhereClause, userId },
            order: [['date', 'ASC']],
        });
        // Price Trend Line Chart & Volume Trend Bar Chart buckets
        const priceTrendMap = {};
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
        // For an individual stock, if no prices exist in the selected window, check for latest prior price to carry forward
        if (stockId !== 'portfolio' && stockId !== 'all') {
            if (dailyPrices.length === 0 && sDate) {
                const priorPrice = await models_1.DailyPrice.findOne({
                    where: {
                        stockId: targetStockIds,
                        userId,
                        date: { [sequelize_1.Op.lt]: sDate },
                    },
                    order: [['date', 'DESC']],
                });
                if (priorPrice) {
                    priceTrendMap[sDate] = {
                        date: sDate,
                        priceSum: Number(priorPrice.price),
                        count: 1,
                        volumeSum: 0,
                    };
                    if (eDate && eDate !== sDate) {
                        priceTrendMap[eDate] = {
                            date: eDate,
                            priceSum: Number(priorPrice.price),
                            count: 1,
                            volumeSum: 0,
                        };
                    }
                }
            }
        }
        const volumeTrend = Object.values(priceTrendMap)
            .map((item) => ({
            date: item.date,
            volume: item.volumeSum,
        }))
            .sort((a, b) => (a.date < b.date ? -1 : 1));
        // 3. Cumulative Portfolio Performance Timeline
        // Query all transactions
        const purchases = await models_1.Purchase.findAll({
            where: { stockId: targetStockIds, userId },
            order: [['purchaseDate', 'ASC']],
        });
        const sales = await models_1.Sales.findAll({
            where: { stockId: targetStockIds, userId },
            order: [['saleDate', 'ASC']],
        });
        // Calculate in-memory holdings timelines per stock
        const userSetting = await models_1.UserSetting.findByPk(userId);
        const costBasisMethod = userSetting?.costBasisMethod === 'fifo' ? 'fifo' : 'average';
        const stockTimelines = {};
        targetStocks.forEach((stock) => {
            const stockPurchases = purchases.filter((p) => p.stockId === stock.id);
            const stockSales = sales.filter((s) => s.stockId === stock.id);
            stockTimelines[stock.id] = computeStockHoldingsTimeline(stockPurchases, stockSales, costBasisMethod);
        });
        // Query all daily prices for cumulative matching
        const allDailyPrices = await models_1.DailyPrice.findAll({
            where: { stockId: targetStockIds, userId },
            order: [['date', 'ASC']],
        });
        // Sort price feeds by stockId and date for easy lookup
        const stockPriceMap = {};
        const stockPriceDates = {};
        targetStockIds.forEach((id) => {
            stockPriceMap[id] = {};
            stockPriceDates[id] = [];
        });
        allDailyPrices.forEach((dp) => {
            stockPriceMap[dp.stockId][dp.date] = Number(dp.price);
            stockPriceDates[dp.stockId].push(dp.date);
        });
        // Helper to find stock price on or before target date
        const getStockPriceAt = (stId, targetD, fallbackPrice) => {
            if (stockPriceMap[stId][targetD] !== undefined) {
                return stockPriceMap[stId][targetD];
            }
            const dates = stockPriceDates[stId];
            let lastPrice = fallbackPrice;
            for (const d of dates) {
                if (d <= targetD) {
                    lastPrice = stockPriceMap[stId][d];
                }
                else {
                    break;
                }
            }
            return lastPrice;
        };
        // Determine cumulative timeline dates: union of all price dates and transaction dates
        const allUniqueDatesSet = new Set();
        allDailyPrices.forEach((dp) => allUniqueDatesSet.add(dp.date));
        purchases.forEach((p) => allUniqueDatesSet.add(p.purchaseDate));
        sales.forEach((s) => allUniqueDatesSet.add(s.saleDate));
        // Carry-forward resolution for date ranges:
        // If history exists on or before sDate, include sDate in the timeline
        if (sDate && Array.from(allUniqueDatesSet).some((d) => d <= sDate)) {
            allUniqueDatesSet.add(sDate);
        }
        // If history exists on or before eDate, include eDate in the timeline
        if (eDate && Array.from(allUniqueDatesSet).some((d) => d <= eDate)) {
            allUniqueDatesSet.add(eDate);
        }
        let allUniqueDates = Array.from(allUniqueDatesSet).sort();
        // Apply range filters if provided
        if (sDate) {
            allUniqueDates = allUniqueDates.filter((d) => d >= sDate);
        }
        if (eDate) {
            allUniqueDates = allUniqueDates.filter((d) => d <= eDate);
        }
        // If only 1 cumulative point exists in history, duplicate across boundary to today/endDate
        // so Recharts does not collapse line/area visualizations
        const todayStr = new Date().toISOString().split('T')[0];
        if (allUniqueDates.length === 1) {
            if (allUniqueDates[0] < todayStr && (!eDate || eDate >= todayStr)) {
                allUniqueDates.push(todayStr);
            }
            else if (eDate && eDate > allUniqueDates[0]) {
                allUniqueDates.push(eDate);
            }
        }
        // Build the cumulative points
        const cumulativePerformance = allUniqueDates.map((dStr) => {
            let dailyPortfolioValue = 0;
            let dailyInvestedCapital = 0;
            let dailyCumulativeRealizedPL = 0;
            targetStocks.forEach((stock) => {
                const hTimeline = stockTimelines[stock.id] || [];
                const holdingState = getHoldingStateAt(hTimeline, dStr);
                const stockCurrency = stock.currency || 'USD';
                // Get price of this stock at this date
                const price = getStockPriceAt(stock.id, dStr, holdingState.averageCost);
                const rawMarketValue = holdingState.remainingShares * price;
                const rawCostBasis = holdingState.remainingShares * holdingState.averageCost;
                const rawRealizedPL = holdingState.cumulativeRealizedPL;
                const marketValue = (0, currencyService_1.convertPrice)(rawMarketValue, stockCurrency, baseCurrency, exchangeRate);
                const costBasis = (0, currencyService_1.convertPrice)(rawCostBasis, stockCurrency, baseCurrency, exchangeRate);
                const realizedPL = (0, currencyService_1.convertPrice)(rawRealizedPL, stockCurrency, baseCurrency, exchangeRate);
                dailyPortfolioValue += marketValue;
                dailyInvestedCapital += costBasis;
                dailyCumulativeRealizedPL += realizedPL;
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
        // Price Trend Line Chart [FR6.1]:
        // When viewing portfolio/all, plot total portfolio valuation curve over time to replace
        // the unweighted average of nominal share prices. For individual stocks, plot specific price history.
        const isPortfolio = stockId === 'portfolio' || stockId === 'all';
        const targetStockCurrency = targetStocks[0]?.currency || 'USD';
        const priceTrend = isPortfolio
            ? cumulativePerformance.map((item) => ({
                date: item.date,
                price: item.portfolioValue,
            }))
            : Object.values(priceTrendMap)
                .map((item) => {
                const rawPrice = item.priceSum / item.count;
                const convertedPrice = (0, currencyService_1.convertPrice)(rawPrice, targetStockCurrency, baseCurrency, exchangeRate);
                return {
                    date: item.date,
                    price: Number(convertedPrice.toFixed(2)),
                };
            })
                .sort((a, b) => (a.date < b.date ? -1 : 1));
        return res.status(200).json({
            success: true,
            data: {
                priceTrend,
                volumeTrend,
                cumulativePerformance,
                currency: baseCurrency,
                exchangeRate,
            },
        });
    }
    catch (error) {
        console.error('Error fetching analytics charts:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to aggregate time-series financial chart data.',
        });
    }
});
// GET /api/analytics/advanced -> Quantitative Financial Analytics [FR8]
router.get('/advanced', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { baseCurrency, exchangeRate } = await (0, currencyService_1.getUserCurrencyContext)(userId);
        const { stockId, startDate, endDate } = req.query;
        let sDate;
        let eDate;
        if (startDate && typeof startDate === 'string' && startDate.trim() !== '') {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())) {
                return res.status(400).json({ success: false, message: 'Invalid startDate format. Must be YYYY-MM-DD.' });
            }
            sDate = startDate.trim();
        }
        if (endDate && typeof endDate === 'string' && endDate.trim() !== '') {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())) {
                return res.status(400).json({ success: false, message: 'Invalid endDate format. Must be YYYY-MM-DD.' });
            }
            eDate = endDate.trim();
        }
        // 1. Fetch user's stocks
        const userStocks = await models_1.Stock.findAll({ where: { userId } });
        if (userStocks.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    totalReturnPercent: 0,
                    annualizedReturnPercent: 0,
                    volatility: 0,
                    assetAllocation: [],
                    totalPortfolioValue: 0,
                    totalInvestedCapital: 0,
                    scopedStock: null,
                    currency: baseCurrency,
                    exchangeRate,
                },
            });
        }
        // Stock Scoping: if stockId is specified and not 'portfolio'/'all', scope metrics to that stock
        let targetStocks = userStocks;
        let scopedStock = null;
        if (stockId && stockId !== 'portfolio' && stockId !== 'all') {
            const found = userStocks.find((s) => s.id === stockId);
            if (!found) {
                return res.status(404).json({ success: false, message: 'Stock not found or unauthorized.' });
            }
            targetStocks = [found];
            scopedStock = {
                id: found.id,
                symbol: found.symbol,
                name: found.name,
            };
        }
        const targetStockIds = targetStocks.map((s) => s.id);
        // Fetch all purchases & sales for target stocks
        const purchases = await models_1.Purchase.findAll({ where: { stockId: targetStockIds, userId }, order: [['purchaseDate', 'ASC']] });
        const sales = await models_1.Sales.findAll({ where: { stockId: targetStockIds, userId }, order: [['saleDate', 'ASC']] });
        // Compute in-memory holdings timelines per stock
        const userSetting = await models_1.UserSetting.findByPk(userId);
        const costBasisMethod = userSetting?.costBasisMethod === 'fifo' ? 'fifo' : 'average';
        const stockTimelines = {};
        targetStocks.forEach((stock) => {
            const stockPurchases = purchases.filter((p) => p.stockId === stock.id);
            const stockSales = sales.filter((s) => s.stockId === stock.id);
            stockTimelines[stock.id] = computeStockHoldingsTimeline(stockPurchases, stockSales, costBasisMethod);
        });
        // Query latest price records for valuation & asset allocation
        const latestPrices = await Promise.all(targetStocks.map(async (stock) => {
            const lp = await models_1.DailyPrice.findOne({
                where: { stockId: stock.id, userId },
                order: [['date', 'DESC'], ['createdAt', 'DESC']],
            });
            return { stockId: stock.id, price: lp ? Number(lp.price) : 0 };
        }));
        const latestPriceMap = latestPrices.reduce((acc, cur) => {
            acc[cur.stockId] = cur.price;
            return acc;
        }, {});
        // 2. Compute current Valuation
        let totalPortfolioValue = 0;
        let totalInvestedCapital = 0;
        const activeHoldings = [];
        targetStocks.forEach((stock) => {
            const timeline = stockTimelines[stock.id] || [];
            const currentHolding = timeline[timeline.length - 1] || { remainingShares: 0, averageCost: 0, cumulativeRealizedPL: 0 };
            if (currentHolding.remainingShares > 0) {
                const stockCurrency = stock.currency || 'USD';
                const currentPrice = latestPriceMap[stock.id] || currentHolding.averageCost;
                const rawMarketValue = currentHolding.remainingShares * currentPrice;
                const rawCostBasis = currentHolding.remainingShares * currentHolding.averageCost;
                const marketValue = (0, currencyService_1.convertPrice)(rawMarketValue, stockCurrency, baseCurrency, exchangeRate);
                const costBasis = (0, currencyService_1.convertPrice)(rawCostBasis, stockCurrency, baseCurrency, exchangeRate);
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
        // Formula: ((Current Valuation - Total Invested Capital) / Total Invested Capital) * 100
        let totalReturnPercent = 0;
        if (totalInvestedCapital > 0) {
            totalReturnPercent = ((totalPortfolioValue - totalInvestedCapital) / totalInvestedCapital) * 100;
        }
        // 5. Calculate Annualized Return (%) [FR8.1]
        let annualizedReturnPercent = 0;
        if (purchases.length > 0) {
            const oldestPurchase = purchases[0]; // Sorted ASC by date
            const purchaseDate = new Date(oldestPurchase.purchaseDate);
            const today = new Date();
            const diffTime = Math.abs(today.getTime() - purchaseDate.getTime());
            const daysHeld = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
            annualizedReturnPercent = calculateAnnualizedReturn(totalReturnPercent, daysHeld, totalInvestedCapital);
        }
        // 6. Calculate Volatility (Sample Standard Deviation of Cash-Flow Adjusted TWR Daily Returns) [FR8.1]
        const allDailyPrices = await models_1.DailyPrice.findAll({
            where: { stockId: targetStockIds, userId },
            order: [['date', 'ASC']],
        });
        // Group prices by stock and date
        const stockPriceMap = {};
        const stockPriceDates = {};
        targetStockIds.forEach((id) => {
            stockPriceMap[id] = {};
            stockPriceDates[id] = [];
        });
        allDailyPrices.forEach((dp) => {
            stockPriceMap[dp.stockId][dp.date] = Number(dp.price);
            stockPriceDates[dp.stockId].push(dp.date);
        });
        const getStockPriceAt = (stId, targetD, fallbackPrice) => {
            if (stockPriceMap[stId][targetD] !== undefined) {
                return stockPriceMap[stId][targetD];
            }
            const dates = stockPriceDates[stId];
            let lastPrice = fallbackPrice;
            for (const d of dates) {
                if (d <= targetD) {
                    lastPrice = stockPriceMap[stId][d];
                }
                else {
                    break;
                }
            }
            return lastPrice;
        };
        const uniquePriceDatesSet = new Set();
        allDailyPrices.forEach((dp) => uniquePriceDatesSet.add(dp.date));
        purchases.forEach((p) => uniquePriceDatesSet.add(p.purchaseDate));
        sales.forEach((s) => uniquePriceDatesSet.add(s.saleDate));
        let uniquePriceDates = Array.from(uniquePriceDatesSet).sort();
        // Filter by date range if provided
        if (sDate)
            uniquePriceDates = uniquePriceDates.filter((d) => d >= sDate);
        if (eDate)
            uniquePriceDates = uniquePriceDates.filter((d) => d <= eDate);
        const stockCurrencyMap = new Map(targetStocks.map((s) => [s.id, s.currency || 'USD']));
        const dailyValPoints = [];
        uniquePriceDates.forEach((dStr) => {
            let dayVal = 0;
            targetStocks.forEach((stock) => {
                const hTimeline = stockTimelines[stock.id] || [];
                const holdingState = getHoldingStateAt(hTimeline, dStr);
                const price = getStockPriceAt(stock.id, dStr, holdingState.averageCost);
                const stockCurrency = stockCurrencyMap.get(stock.id) || 'USD';
                const rawVal = holdingState.remainingShares * price;
                dayVal += (0, currencyService_1.convertPrice)(rawVal, stockCurrency, baseCurrency, exchangeRate);
            });
            // External capital cash flows Ct = Purchases_t - Sales_t executed on day t
            let dayCashFlow = 0;
            purchases.forEach((p) => {
                if (p.purchaseDate === dStr) {
                    const curr = stockCurrencyMap.get(p.stockId) || 'USD';
                    dayCashFlow += (0, currencyService_1.convertPrice)(Number(p.quantity) * Number(p.purchasePrice), curr, baseCurrency, exchangeRate);
                }
            });
            sales.forEach((s) => {
                if (s.saleDate === dStr) {
                    const curr = stockCurrencyMap.get(s.stockId) || 'USD';
                    dayCashFlow -= (0, currencyService_1.convertPrice)(Number(s.quantity) * Number(s.sellPrice), curr, baseCurrency, exchangeRate);
                }
            });
            if (dayVal > 0 || dayCashFlow !== 0) {
                dailyValPoints.push({
                    date: dStr,
                    value: dayVal,
                    cashFlow: dayCashFlow,
                });
            }
        });
        let volatility = 0;
        if (scopedStock) {
            // For an individual scoped stock, volatility represents the stock's price volatility over the selected period [FR8.1]
            let stockPrices = allDailyPrices.filter((dp) => (!sDate || dp.date >= sDate) && (!eDate || dp.date <= eDate));
            if (sDate && stockPrices.length > 0) {
                const priorPrices = allDailyPrices.filter((dp) => dp.date < sDate);
                if (priorPrices.length > 0) {
                    const lastPrior = priorPrices[priorPrices.length - 1];
                    stockPrices = [lastPrior, ...stockPrices];
                }
            }
            if (stockPrices.length >= 3) {
                const pricePoints = stockPrices.map((dp) => ({
                    date: dp.date,
                    value: Number(dp.price),
                    cashFlow: 0,
                }));
                volatility = calculateTwrVolatility(pricePoints);
            }
            else {
                volatility = calculateTwrVolatility(dailyValPoints);
            }
        }
        else {
            volatility = calculateTwrVolatility(dailyValPoints);
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
                scopedStock,
                currency: baseCurrency,
                exchangeRate,
            },
        });
    }
    catch (error) {
        console.error('Error fetching advanced analytics:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to calculate advanced quantitative financial metrics.',
        });
    }
});
// GET /api/analytics/benchmark -> Benchmark relative performance [FR8]
router.get('/benchmark', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { baseCurrency, exchangeRate } = await (0, currencyService_1.getUserCurrencyContext)(userId);
        const { startDate, endDate } = req.query;
        let sDate = typeof startDate === 'string' && startDate.trim() !== '' ? startDate.trim() : null;
        let eDate = typeof endDate === 'string' && endDate.trim() !== '' ? endDate.trim() : null;
        if (sDate && !/^\d{4}-\d{2}-\d{2}$/.test(sDate)) {
            return res.status(400).json({ success: false, message: 'Invalid startDate format. Must be YYYY-MM-DD.' });
        }
        if (eDate && !/^\d{4}-\d{2}-\d{2}$/.test(eDate)) {
            return res.status(400).json({ success: false, message: 'Invalid endDate format. Must be YYYY-MM-DD.' });
        }
        // If either date is omitted, default sDate to user's earliest price/purchase date and eDate to today
        if (!sDate) {
            const earliestPrice = await models_1.DailyPrice.findOne({
                where: { userId },
                order: [['date', 'ASC']],
            });
            const earliestPurchase = await models_1.Purchase.findOne({
                where: { userId },
                order: [['purchaseDate', 'ASC']],
            });
            const candidates = [];
            if (earliestPrice?.date)
                candidates.push(earliestPrice.date);
            if (earliestPurchase?.purchaseDate)
                candidates.push(earliestPurchase.purchaseDate);
            if (candidates.length > 0) {
                candidates.sort();
                sDate = candidates[0];
            }
            else {
                sDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            }
        }
        if (!eDate) {
            eDate = new Date().toISOString().split('T')[0];
        }
        const userStocks = await models_1.Stock.findAll({ where: { userId } });
        const benchmarks = [];
        for (const stock of userStocks) {
            const stockCurrency = stock.currency || 'USD';
            // Count total daily price records for this stock to detect single-point baselines
            const totalDailyPriceCount = await models_1.DailyPrice.count({
                where: { stockId: stock.id, userId },
            });
            // Find price at or latest before sDate
            let startPriceRecord = await models_1.DailyPrice.findOne({
                where: {
                    stockId: stock.id,
                    date: {
                        [sequelize_1.Op.lte]: sDate,
                    },
                    userId,
                },
                order: [['date', 'DESC']],
            });
            // Fallback to the earliest price within the range if no prior price exists
            if (!startPriceRecord) {
                startPriceRecord = await models_1.DailyPrice.findOne({
                    where: {
                        stockId: stock.id,
                        date: {
                            [sequelize_1.Op.gte]: sDate,
                            [sequelize_1.Op.lte]: eDate,
                        },
                        userId,
                    },
                    order: [['date', 'ASC']],
                });
            }
            // Find price at or latest before eDate and on or after sDate
            const endPriceRecord = await models_1.DailyPrice.findOne({
                where: {
                    stockId: stock.id,
                    date: {
                        [sequelize_1.Op.gte]: sDate,
                        [sequelize_1.Op.lte]: eDate,
                    },
                    userId,
                },
                order: [['date', 'DESC']],
            });
            if (startPriceRecord && endPriceRecord) {
                const pStart = Number(startPriceRecord.price);
                const pEnd = Number(endPriceRecord.price);
                const isSinglePrice = totalDailyPriceCount <= 1 || startPriceRecord.date === endPriceRecord.date;
                const performanceGain = pStart > 0 ? ((pEnd - pStart) / pStart) * 100 : 0;
                const convertedStart = Number((0, currencyService_1.convertPrice)(pStart, stockCurrency, baseCurrency, exchangeRate).toFixed(2));
                const convertedEnd = Number((0, currencyService_1.convertPrice)(pEnd, stockCurrency, baseCurrency, exchangeRate).toFixed(2));
                benchmarks.push({
                    stockId: stock.id,
                    symbol: stock.symbol,
                    name: stock.name,
                    currency: stockCurrency,
                    baseCurrency,
                    startPrice: convertedStart,
                    endPrice: convertedEnd,
                    nativeStartPrice: pStart,
                    nativeEndPrice: pEnd,
                    performanceGain: Number(performanceGain.toFixed(2)),
                    insufficientHistory: isSinglePrice,
                });
            }
            else {
                benchmarks.push({
                    stockId: stock.id,
                    symbol: stock.symbol,
                    name: stock.name,
                    currency: stockCurrency,
                    baseCurrency,
                    startPrice: null,
                    endPrice: null,
                    nativeStartPrice: null,
                    nativeEndPrice: null,
                    performanceGain: 0,
                    insufficientHistory: true,
                });
            }
        }
        // Sort by highest performance gain descending
        benchmarks.sort((a, b) => b.performanceGain - a.performanceGain);
        return res.status(200).json({
            success: true,
            data: benchmarks,
        });
    }
    catch (error) {
        console.error('Error fetching benchmarking data:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to perform benchmark relative stock comparison.',
        });
    }
});
// GET /api/analytics/targets -> Fetch performance targets [FR8]
router.get('/targets', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        // 1. Fetch all targets
        const targets = await models_1.PerformanceTarget.findAll({
            where: { userId },
            order: [['targetDate', 'ASC']],
        });
        // 2. Fetch current portfolio valuation and metrics for comparison
        const userStocks = await models_1.Stock.findAll({ where: { userId } });
        const stockIds = userStocks.map((s) => s.id);
        let totalPortfolioValue = 0;
        let totalInvestedCapital = 0;
        let totalReturnPercent = 0;
        let annualizedReturnPercent = 0;
        const { baseCurrency, exchangeRate } = await (0, currencyService_1.getUserCurrencyContext)(userId);
        if (stockIds.length > 0) {
            const purchases = await models_1.Purchase.findAll({ where: { stockId: stockIds, userId }, order: [['purchaseDate', 'ASC']] });
            const sales = await models_1.Sales.findAll({ where: { stockId: stockIds, userId }, order: [['saleDate', 'ASC']] });
            const userSetting = await models_1.UserSetting.findByPk(userId);
            const costBasisMethod = userSetting?.costBasisMethod === 'fifo' ? 'fifo' : 'average';
            const stockTimelines = {};
            userStocks.forEach((stock) => {
                const stockPurchases = purchases.filter((p) => p.stockId === stock.id);
                const stockSales = sales.filter((s) => s.stockId === stock.id);
                stockTimelines[stock.id] = computeStockHoldingsTimeline(stockPurchases, stockSales, costBasisMethod);
            });
            const latestPrices = await Promise.all(userStocks.map(async (stock) => {
                const lp = await models_1.DailyPrice.findOne({
                    where: { stockId: stock.id, userId },
                    order: [['date', 'DESC'], ['createdAt', 'DESC']],
                });
                return { stockId: stock.id, price: lp ? Number(lp.price) : 0 };
            }));
            const latestPriceMap = latestPrices.reduce((acc, cur) => {
                acc[cur.stockId] = cur.price;
                return acc;
            }, {});
            userStocks.forEach((stock) => {
                const timeline = stockTimelines[stock.id] || [];
                const currentHolding = timeline[timeline.length - 1] || { remainingShares: 0, averageCost: 0, cumulativeRealizedPL: 0 };
                if (currentHolding.remainingShares > 0) {
                    const stockCurrency = stock.currency || 'USD';
                    const currentPrice = latestPriceMap[stock.id] || currentHolding.averageCost;
                    const rawMarketValue = currentHolding.remainingShares * currentPrice;
                    const rawCostBasis = currentHolding.remainingShares * currentHolding.averageCost;
                    totalPortfolioValue += (0, currencyService_1.convertPrice)(rawMarketValue, stockCurrency, baseCurrency, exchangeRate);
                    totalInvestedCapital += (0, currencyService_1.convertPrice)(rawCostBasis, stockCurrency, baseCurrency, exchangeRate);
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
                annualizedReturnPercent = calculateAnnualizedReturn(totalReturnPercent, daysHeld, totalInvestedCapital);
            }
        }
        // Compute progress & achievement status for each target
        const targetsWithProgress = await Promise.all(targets.map(async (t) => {
            let currentMetric = 0;
            let progressPercent = 0;
            const targetCurrency = t.currency || 'USD';
            const targetVal = Number(t.targetValue);
            let normalizedTargetVal = targetVal;
            if (t.targetType === 'portfolio_value') {
                currentMetric = totalPortfolioValue;
                normalizedTargetVal = (0, currencyService_1.convertPrice)(targetVal, targetCurrency, baseCurrency, exchangeRate);
            }
            else if (t.targetType === 'total_return') {
                currentMetric = totalReturnPercent;
            }
            else if (t.targetType === 'annualized_return') {
                currentMetric = annualizedReturnPercent;
            }
            if (normalizedTargetVal > 0) {
                progressPercent = Math.max(0, Math.min(100, (currentMetric / normalizedTargetVal) * 100));
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
                currency: targetCurrency,
                baseCurrency,
                normalizedTargetValue: Number(normalizedTargetVal.toFixed(2)),
                targetDate: t.targetDate,
                isAchieved: t.isAchieved,
                currentValue: Number(currentMetric.toFixed(2)),
                progressPercent: Number(progressPercent.toFixed(2)),
            };
        }));
        return res.status(200).json({
            success: true,
            data: targetsWithProgress,
        });
    }
    catch (error) {
        console.error('Error fetching targets:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve user performance targets tracker.',
        });
    }
});
// POST /api/analytics/targets -> Record performance target [FR8]
router.post('/targets', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { targetName, targetType, targetValue, targetDate, currency } = req.body;
        const { baseCurrency } = await (0, currencyService_1.getUserCurrencyContext)(userId);
        const targetCurrency = (currency === 'KES' || currency === 'USD') ? currency : baseCurrency;
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
        const target = await models_1.PerformanceTarget.create({
            userId,
            targetName: targetName.trim(),
            targetType,
            targetValue: tValue,
            targetDate,
            currency: targetCurrency,
            isAchieved: false,
        });
        return res.status(201).json({
            success: true,
            message: 'Performance target registered successfully.',
            data: target,
        });
    }
    catch (error) {
        console.error('Error creating target:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to save new performance target profile.',
        });
    }
});
// PUT /api/analytics/targets/:id -> Update performance target [FR8.4]
router.put('/targets/:id', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { targetName, targetType, targetValue, targetDate, isAchieved, currency } = req.body;
        const target = await models_1.PerformanceTarget.findOne({
            where: { id, userId },
        });
        if (!target) {
            return res.status(404).json({
                success: false,
                message: 'Performance target not found or unauthorized.',
            });
        }
        if (currency !== undefined && (currency === 'USD' || currency === 'KES')) {
            target.currency = currency;
        }
        if (targetName !== undefined) {
            if (typeof targetName !== 'string' || targetName.trim().length === 0) {
                return res.status(400).json({ success: false, message: 'Target name cannot be empty.' });
            }
            target.targetName = targetName.trim();
        }
        if (targetType !== undefined) {
            if (!['portfolio_value', 'total_return', 'annualized_return'].includes(targetType)) {
                return res.status(400).json({ success: false, message: 'Invalid target type.' });
            }
            target.targetType = targetType;
        }
        if (targetValue !== undefined) {
            const tValue = Number(targetValue);
            if (isNaN(tValue) || tValue <= 0) {
                return res.status(400).json({ success: false, message: 'Target value must be a positive number.' });
            }
            target.targetValue = tValue;
        }
        if (targetDate !== undefined) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
                return res.status(400).json({ success: false, message: 'Target date must be in YYYY-MM-DD format.' });
            }
            target.targetDate = targetDate;
        }
        if (isAchieved !== undefined) {
            target.isAchieved = Boolean(isAchieved);
        }
        await target.save();
        return res.status(200).json({
            success: true,
            message: 'Performance target updated successfully.',
            data: target,
        });
    }
    catch (error) {
        console.error('Error updating target:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update performance target profile.',
        });
    }
});
// DELETE /api/analytics/targets/:id -> Delete performance target [FR8.4]
router.delete('/targets/:id', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const target = await models_1.PerformanceTarget.findOne({
            where: { id, userId },
        });
        if (!target) {
            return res.status(404).json({
                success: false,
                message: 'Performance target not found or unauthorized.',
            });
        }
        await target.destroy();
        return res.status(200).json({
            success: true,
            message: 'Performance target deleted successfully.',
        });
    }
    catch (error) {
        console.error('Error deleting target:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete performance target profile.',
        });
    }
});
exports.default = router;
