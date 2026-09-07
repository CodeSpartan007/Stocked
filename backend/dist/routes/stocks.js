"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTickerPriceQuery = handleTickerPriceQuery;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const sequelize_1 = require("sequelize");
const models_1 = require("../models");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const priceFeedService_1 = require("../services/priceFeedService");
const nseScraperService_1 = require("../services/nseScraperService");
const currencyService_1 = require("../services/currencyService");
/**
 * Zero-dependency concurrency-limiting runner that executes items using Promise.allSettled
 */
async function limitConcurrency(items, concurrency, fn) {
    const results = new Array(items.length);
    let index = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (index < items.length) {
            const i = index++;
            try {
                const value = await fn(items[i]);
                results[i] = { status: 'fulfilled', value };
            }
            catch (reason) {
                results[i] = { status: 'rejected', reason };
            }
        }
    });
    await Promise.all(workers);
    return results;
}
const router = (0, express_1.Router)();
// Helper to query live price using unified failover engine
async function handleTickerPriceQuery(symbol, userId, res) {
    if (!symbol || symbol.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'Symbol parameter is required.',
        });
    }
    const upperSymbol = symbol.trim().toUpperCase();
    const { baseCurrency, exchangeRate } = await (0, currencyService_1.getUserCurrencyContext)(userId);
    const existingStock = await models_1.Stock.findOne({
        where: { userId, symbol: upperSymbol },
    });
    const nativeCurrency = existingStock?.currency || ((0, nseScraperService_1.isNseSymbol)(upperSymbol) ? 'KES' : 'USD');
    try {
        const result = await (0, priceFeedService_1.fetchWithFailover)(upperSymbol, userId);
        const convertedPrice = (0, currencyService_1.convertPrice)(result.tickerData.price, nativeCurrency, baseCurrency, exchangeRate);
        const convertedChange = (0, currencyService_1.convertPrice)(result.tickerData.change, nativeCurrency, baseCurrency, exchangeRate);
        return res.status(200).json({
            success: true,
            data: {
                symbol: upperSymbol,
                price: Number(convertedPrice.toFixed(2)),
                change: Number(convertedChange.toFixed(2)),
                changePercent: result.tickerData.changePercent,
                volume: result.tickerData.volume,
                provider: result.provider,
                isFailover: result.isFailover,
                nativePrice: result.tickerData.price,
                nativeChange: result.tickerData.change,
                nativeCurrency,
                currency: baseCurrency,
                exchangeRate,
            },
        });
    }
    catch (error) {
        console.error(`Error querying ticker price for ${upperSymbol}:`, error);
        // If failover failed or provider not configured, check for previously recorded price
        const stock = existingStock || (await models_1.Stock.findOne({
            where: { userId, symbol: upperSymbol },
        }));
        if (stock) {
            const cached = await (0, priceFeedService_1.getLocalCachedPriceForStock)(stock, userId);
            if (cached && cached.price > 0) {
                const stockCurrency = stock.currency || nativeCurrency;
                const convertedPrice = (0, currencyService_1.convertPrice)(cached.price, stockCurrency, baseCurrency, exchangeRate);
                const convertedChange = (0, currencyService_1.convertPrice)(cached.change, stockCurrency, baseCurrency, exchangeRate);
                return res.status(200).json({
                    success: true,
                    data: {
                        symbol: upperSymbol,
                        price: Number(convertedPrice.toFixed(2)),
                        change: Number(convertedChange.toFixed(2)),
                        changePercent: cached.changePercent,
                        volume: 0,
                        provider: 'manual fallback',
                        isFailover: false,
                        nativePrice: cached.price,
                        nativeChange: cached.change,
                        nativeCurrency: stockCurrency,
                        currency: baseCurrency,
                        exchangeRate,
                    },
                });
            }
        }
        const msg = error?.message || 'Failed to fetch live price for ticker.';
        const isConfigError = msg.includes('not configured') ||
            msg.includes('manual mode') ||
            msg.includes('Real-time API key not configured');
        return res.status(400).json({
            success: false,
            message: isConfigError
                ? 'No market data API key configured in Settings. You can add the stock manually or configure Alpha Vantage / Polygon.'
                : msg,
        });
    }
}
// GET /api/stocks/live-prices -> View live price metadata for active tickers (from local cache)
router.get('/live-prices', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { baseCurrency, exchangeRate } = await (0, currencyService_1.getUserCurrencyContext)(userId);
        // Fetch all stock counters registered for this user
        const stocks = await models_1.Stock.findAll({
            where: { userId },
            order: [['symbol', 'ASC']],
        });
        // Resolve current cached prices in parallel from local DB logs
        const livePrices = await Promise.all(stocks.map(async (stock) => {
            const cached = await (0, priceFeedService_1.getLocalCachedPriceForStock)(stock, userId);
            const stockCurrency = stock.currency || 'USD';
            const convertedPrice = (0, currencyService_1.convertPrice)(cached.price, stockCurrency, baseCurrency, exchangeRate);
            const convertedChange = (0, currencyService_1.convertPrice)(cached.change, stockCurrency, baseCurrency, exchangeRate);
            return {
                ...cached,
                price: Number(convertedPrice.toFixed(2)),
                change: Number(convertedChange.toFixed(2)),
                nativePrice: cached.price,
                nativeChange: cached.change,
                nativeCurrency: stockCurrency,
                currency: baseCurrency,
                exchangeRate,
            };
        }));
        return res.status(200).json({
            success: true,
            data: livePrices,
        });
    }
    catch (error) {
        console.error('Error fetching cached stock prices:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve prices.',
        });
    }
});
// GET /api/stocks/ticker-price/:symbol -> Query live price for an arbitrary symbol using unified failover logic
router.get('/ticker-price/:symbol', auth_1.requireAuth, async (req, res) => {
    const userId = req.user.id;
    const { symbol } = req.params;
    return handleTickerPriceQuery(symbol, userId, res);
});
// GET /api/stocks/search-price?symbol=AAPL -> Query live price for an arbitrary symbol using unified failover logic
router.get('/search-price', auth_1.requireAuth, async (req, res) => {
    const userId = req.user.id;
    const symbol = req.query.symbol;
    return handleTickerPriceQuery(symbol, userId, res);
});
// GET /api/stocks/nse-catalog -> View directory of NSE Kenya listed equities with current prices
router.get('/nse-catalog', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { baseCurrency, exchangeRate } = await (0, currencyService_1.getUserCurrencyContext)(userId);
        let liveMap = null;
        try {
            liveMap = await (0, nseScraperService_1.fetchAllNseStocks)(false);
        }
        catch (err) {
            console.warn('[StocksRouter] Could not fetch live NSE snapshot for catalog:', err.message);
        }
        const catalog = nseScraperService_1.NSE_CATALOG.map((item) => {
            const live = liveMap?.get(item.symbol.toUpperCase());
            const nativePrice = live ? live.price : null;
            const convertedPrice = nativePrice !== null
                ? Number((0, currencyService_1.convertPrice)(nativePrice, 'KES', baseCurrency, exchangeRate).toFixed(2))
                : null;
            return {
                ...item,
                price: nativePrice,
                convertedPrice,
                currency: 'KES',
                baseCurrency,
                change: live ? live.change : null,
                changePercent: live ? live.changePercent : null,
                volume: live ? live.volume : null,
            };
        });
        return res.status(200).json({
            success: true,
            data: catalog,
        });
    }
    catch (error) {
        console.error('Error fetching NSE catalog:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve NSE catalog.',
        });
    }
});
// GET /api/stocks -> View all registered stocks with aggregated summary data
router.get('/', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { baseCurrency, exchangeRate } = await (0, currencyService_1.getUserCurrencyContext)(userId);
        // Fetch all stocks for the authenticated user
        const stocks = await models_1.Stock.findAll({
            where: { userId },
            order: [['symbol', 'ASC']],
        });
        const stocksWithSummaries = await Promise.all(stocks.map(async (stock) => {
            // Fetch all prices for this stock to aggregate metrics
            const prices = await models_1.DailyPrice.findAll({
                where: { stockId: stock.id, userId },
                order: [['date', 'DESC']],
            });
            const totalRecords = prices.length;
            let nativeLatestPrice = 0;
            let latestPriceDate = '';
            let nativeAveragePrice = 0;
            let nativeHighestPrice = 0;
            let nativeLowestPrice = 0;
            let nativePriceChange = 0;
            let priceChangePercent = 0;
            if (totalRecords > 0) {
                nativeLatestPrice = Number(prices[0].price);
                latestPriceDate = prices[0].date;
                const numericPrices = prices.map((p) => Number(p.price));
                const sum = numericPrices.reduce((acc, curr) => acc + curr, 0);
                nativeAveragePrice = sum / totalRecords;
                nativeHighestPrice = Math.max(...numericPrices);
                nativeLowestPrice = Math.min(...numericPrices);
                // Calculate change from first log (oldest) to latest log (newest)
                const firstPrice = Number(prices[totalRecords - 1].price);
                nativePriceChange = nativeLatestPrice - firstPrice;
                priceChangePercent = firstPrice !== 0 ? (nativePriceChange / firstPrice) * 100 : 0;
            }
            const stockCurrency = stock.currency || 'USD';
            const latestPrice = (0, currencyService_1.convertPrice)(nativeLatestPrice, stockCurrency, baseCurrency, exchangeRate);
            const averagePrice = (0, currencyService_1.convertPrice)(nativeAveragePrice, stockCurrency, baseCurrency, exchangeRate);
            const highestPrice = (0, currencyService_1.convertPrice)(nativeHighestPrice, stockCurrency, baseCurrency, exchangeRate);
            const lowestPrice = (0, currencyService_1.convertPrice)(nativeLowestPrice, stockCurrency, baseCurrency, exchangeRate);
            const priceChange = (0, currencyService_1.convertPrice)(nativePriceChange, stockCurrency, baseCurrency, exchangeRate);
            return {
                id: stock.id,
                name: stock.name,
                symbol: stock.symbol,
                description: stock.description,
                category: stock.category,
                currency: stock.currency,
                createdAt: stock.createdAt,
                updatedAt: stock.updatedAt,
                summary: {
                    totalPriceRecords: totalRecords,
                    latestPrice: Number(latestPrice.toFixed(2)),
                    nativeLatestPrice: Number(nativeLatestPrice.toFixed(2)),
                    latestPriceDate,
                    averagePrice: Number(averagePrice.toFixed(2)),
                    nativeAveragePrice: Number(nativeAveragePrice.toFixed(2)),
                    highestPrice: Number(highestPrice.toFixed(2)),
                    nativeHighestPrice: Number(nativeHighestPrice.toFixed(2)),
                    lowestPrice: Number(lowestPrice.toFixed(2)),
                    nativeLowestPrice: Number(nativeLowestPrice.toFixed(2)),
                    priceChange: Number(priceChange.toFixed(2)),
                    nativePriceChange: Number(nativePriceChange.toFixed(2)),
                    priceChangePercent: Number(priceChangePercent.toFixed(2)),
                    currency: baseCurrency,
                    nativeCurrency: stockCurrency,
                    source: prices[0]?.source === 'api' ? 'live' : 'manual fallback',
                    lastUpdated: prices[0]?.updatedAt ? prices[0].updatedAt.toISOString() : null,
                },
            };
        }));
        return res.status(200).json({
            success: true,
            data: stocksWithSummaries,
        });
    }
    catch (error) {
        console.error('Error fetching stocks:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve stocks.',
        });
    }
});
// POST /api/stocks -> Create a new stock counter
router.post('/', auth_1.requireAuth, [
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Stock name is required.'),
    (0, express_validator_1.body)('symbol')
        .trim()
        .notEmpty()
        .withMessage('Symbol is required.')
        .isAlphanumeric('en-US', { ignore: '.-' })
        .withMessage('Symbol must be alphanumeric.')
        .toUpperCase(),
    (0, express_validator_1.body)('description').optional().trim(),
    (0, express_validator_1.body)('category').optional().trim(),
    (0, express_validator_1.body)('currency')
        .optional()
        .trim()
        .isIn(['USD', 'KES'])
        .withMessage('Currency must be USD or KES.'),
], validate_1.handleValidationErrors, async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, symbol, description, category, currency } = req.body;
        // Check symbol uniqueness for this specific user
        const existingStock = await models_1.Stock.findOne({
            where: {
                userId,
                symbol,
            },
        });
        if (existingStock) {
            return res.status(400).json({
                success: false,
                errors: [
                    {
                        field: 'symbol',
                        message: `You have already registered a stock counter with symbol "${symbol}".`,
                    },
                ],
            });
        }
        const stockCurrency = currency || ((0, nseScraperService_1.isNseSymbol)(symbol) ? 'KES' : 'USD');
        const newStock = await models_1.Stock.create({
            userId,
            name,
            symbol,
            description: description || null,
            category: category || 'Other',
            currency: stockCurrency,
        });
        // Fetch and record the initial live price immediately so the stock has price data immediately
        try {
            await (0, priceFeedService_1.getLivePriceForStock)(newStock, userId);
        }
        catch (err) {
            console.warn(`[StocksRouter] Failed to fetch initial price for registered stock ${symbol}: ${err.message}`);
        }
        return res.status(201).json({
            success: true,
            message: 'Stock counter registered successfully.',
            data: {
                id: newStock.id,
                name: newStock.name,
                symbol: newStock.symbol,
                description: newStock.description,
                category: newStock.category,
                currency: newStock.currency,
            },
        });
    }
    catch (error) {
        console.error('Error creating stock:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to register stock counter.',
        });
    }
});
// PUT /api/stocks/:id -> Edit an existing stock counter's details
router.put('/:id', auth_1.requireAuth, [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid Stock ID.'),
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Stock name is required.'),
    (0, express_validator_1.body)('symbol')
        .trim()
        .notEmpty()
        .withMessage('Symbol is required.')
        .isAlphanumeric('en-US', { ignore: '.-' })
        .withMessage('Symbol must be alphanumeric.')
        .toUpperCase(),
    (0, express_validator_1.body)('description').optional().trim(),
    (0, express_validator_1.body)('category').optional().trim(),
    (0, express_validator_1.body)('currency')
        .optional()
        .trim()
        .isIn(['USD', 'KES'])
        .withMessage('Currency must be USD or KES.'),
], validate_1.handleValidationErrors, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { name, symbol, description, category, currency } = req.body;
        // Find the stock
        const stock = await models_1.Stock.findOne({
            where: { id, userId },
        });
        if (!stock) {
            return res.status(404).json({
                success: false,
                message: 'Stock counter not found.',
            });
        }
        // Check if symbol uniqueness is violated (if symbol has changed)
        if (symbol !== stock.symbol) {
            const existingStock = await models_1.Stock.findOne({
                where: {
                    userId,
                    symbol,
                    id: { [sequelize_1.Op.ne]: id },
                },
            });
            if (existingStock) {
                return res.status(400).json({
                    success: false,
                    errors: [
                        {
                            field: 'symbol',
                            message: `You have already registered a stock counter with symbol "${symbol}".`,
                        },
                    ],
                });
            }
        }
        // Check if currency has changed and if transactions/prices exist
        if (currency && currency !== stock.currency) {
            const purchasesCount = await models_1.Purchase.count({ where: { stockId: id, userId } });
            const salesCount = await models_1.Sales.count({ where: { stockId: id, userId } });
            const pricesCount = await models_1.DailyPrice.count({ where: { stockId: id, userId } });
            if (purchasesCount > 0 || salesCount > 0 || pricesCount > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot change stock currency because transactions or daily price records already exist for this counter.',
                    errors: [
                        {
                            field: 'currency',
                            message: 'Cannot change stock currency because transactions or daily price records already exist for this counter.',
                        },
                    ],
                });
            }
            stock.currency = currency;
        }
        // Update fields
        stock.name = name;
        stock.symbol = symbol;
        stock.description = description || null;
        stock.category = category || 'Other';
        await stock.save();
        return res.status(200).json({
            success: true,
            message: 'Stock counter updated successfully.',
            data: {
                id: stock.id,
                name: stock.name,
                symbol: stock.symbol,
                description: stock.description,
                category: stock.category,
                currency: stock.currency,
            },
        });
    }
    catch (error) {
        console.error('Error updating stock:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update stock counter.',
        });
    }
});
// DELETE /api/stocks/:id -> Delete stock and cascade records
router.delete('/:id', auth_1.requireAuth, [(0, express_validator_1.param)('id').isUUID().withMessage('Invalid Stock ID.')], validate_1.handleValidationErrors, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const stock = await models_1.Stock.findOne({
            where: { id, userId },
        });
        if (!stock) {
            return res.status(404).json({
                success: false,
                message: 'Stock counter not found or unauthorized.',
            });
        }
        // Delete the stock. SQLite foreign key constraints (ON DELETE CASCADE)
        // will cascadingly remove all DailyPrice entries associated with this stockId.
        await stock.destroy();
        return res.status(200).json({
            success: true,
            message: 'Stock counter and all associated price records deleted successfully.',
        });
    }
    catch (error) {
        console.error('Error deleting stock:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete stock counter.',
        });
    }
});
exports.default = router;
