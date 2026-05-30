"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchFromAlphaVantage = fetchFromAlphaVantage;
exports.fetchFromPolygon = fetchFromPolygon;
exports.getLivePriceForStock = getLivePriceForStock;
exports.getLivePriceWithRetry = getLivePriceWithRetry;
exports.startPriceSyncPoller = startPriceSyncPoller;
exports.stopPriceSyncPoller = stopPriceSyncPoller;
exports.initializeAllPollers = initializeAllPollers;
const models_1 = require("../models");
// Multi-user scheduler maps
const timersByUser = new Map();
const intervalByUser = new Map();
const isSyncRunningByUser = new Map();
/**
 * Fetch from Alpha Vantage using the Global Quote API with AbortController and symbol encoding
 */
async function fetchFromAlphaVantage(symbol, apiKey) {
    const encodedSymbol = encodeURIComponent(symbol);
    const encodedApiKey = encodeURIComponent(apiKey);
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodedSymbol}&apikey=${encodedApiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout limit
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`Alpha Vantage HTTP error! Status: ${response.status}`);
        }
        const data = (await response.json());
        const quote = data['Global Quote'];
        if (!quote || Object.keys(quote).length === 0) {
            const errorMsg = data['Note'] || data['Error Message'] || 'Invalid response from Alpha Vantage';
            throw new Error(errorMsg);
        }
        const price = parseFloat(quote['05. price']);
        const change = parseFloat(quote['09. change']);
        const changePercentStr = quote['10. change percent'] || '0%';
        const changePercent = parseFloat(changePercentStr.replace('%', ''));
        const volume = parseInt(quote['06. volume'], 10) || 0;
        if (isNaN(price)) {
            throw new Error(`Failed to parse Alpha Vantage quote: ${JSON.stringify(data)}`);
        }
        return { price, change, changePercent, volume };
    }
    catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Request to Alpha Vantage timed out after 10000ms');
        }
        throw error;
    }
}
/**
 * Fetch from Polygon.io using the Previous Close API with AbortController and symbol encoding
 */
async function fetchFromPolygon(symbol, apiKey) {
    const encodedSymbol = encodeURIComponent(symbol);
    const encodedApiKey = encodeURIComponent(apiKey);
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodedSymbol}/prev?adjusted=true&apiKey=${encodedApiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout limit
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`Polygon.io HTTP error! Status: ${response.status}`);
        }
        const data = (await response.json());
        if (data.status !== 'OK' || !data.results || data.results.length === 0) {
            const errorMsg = data.error || 'Invalid response from Polygon.io or no ticker matches';
            throw new Error(errorMsg);
        }
        const res = data.results[0];
        const close = parseFloat(res.c);
        const open = parseFloat(res.o);
        const price = close;
        const change = close - open;
        const changePercent = open !== 0 ? (change / open) * 100 : 0;
        const volume = parseInt(res.v, 10) || 0;
        if (isNaN(price)) {
            throw new Error(`Failed to parse Polygon.io agg: ${JSON.stringify(data)}`);
        }
        return { price, change, changePercent, volume };
    }
    catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Request to Polygon.io timed out after 10000ms');
        }
        throw error;
    }
}
/**
 * Core wrapper that retrieves the live price for a stock with resilient cache fallback.
 */
async function getLivePriceForStock(stock, userId) {
    let provider = process.env.PRICE_FEED_PROVIDER || 'manual';
    let apiKey = process.env.MARKET_API_KEY || '';
    try {
        const settings = await models_1.UserSetting.scope('withApiKey').findByPk(userId);
        if (settings) {
            provider = settings.provider;
            if (settings.apiKey) {
                apiKey = settings.apiKey;
            }
        }
    }
    catch (err) {
        console.error(`[PriceFeedService] Failed to load UserSetting for user ${userId}:`, err);
    }
    const todayStr = new Date().toISOString().split('T')[0];
    if (provider === 'manual' || !apiKey) {
        return fetchLocalFallback(stock, 'manual fallback');
    }
    try {
        let tickerData;
        if (provider === 'alphavantage') {
            tickerData = await fetchFromAlphaVantage(stock.symbol, apiKey);
        }
        else if (provider === 'polygon') {
            tickerData = await fetchFromPolygon(stock.symbol, apiKey);
        }
        else {
            throw new Error(`Unsupported price feed provider: ${provider}`);
        }
        const [dailyPrice] = await models_1.DailyPrice.upsert({
            stockId: stock.id,
            date: todayStr,
            price: tickerData.price,
            volume: tickerData.volume,
            source: 'api',
        });
        console.log(`[PriceFeedService] Live price cached for ${stock.symbol}: $${tickerData.price} (Source: ${provider})`);
        const fetchedPrice = await models_1.DailyPrice.findOne({
            where: { stockId: stock.id, date: todayStr }
        });
        return {
            symbol: stock.symbol,
            price: tickerData.price,
            change: tickerData.change,
            changePercent: tickerData.changePercent,
            source: 'live',
            lastUpdated: fetchedPrice ? fetchedPrice.updatedAt.toISOString() : new Date().toISOString(),
        };
    }
    catch (error) {
        console.warn(`⚠️ [PriceFeedService ALERT] Failed fetching ${stock.symbol} from ${provider}. Error: ${error.message}. Falling back to cache.`);
        return fetchLocalFallback(stock, 'manual fallback');
    }
}
/**
 * Fetch the latest price available locally in the database.
 */
async function fetchLocalFallback(stock, fallbackLabel) {
    const latestPrices = await models_1.DailyPrice.findAll({
        where: { stockId: stock.id },
        order: [['date', 'DESC'], ['createdAt', 'DESC']],
        limit: 2,
    });
    if (latestPrices.length === 0) {
        return {
            symbol: stock.symbol,
            price: 0,
            change: 0,
            changePercent: 0,
            source: fallbackLabel,
            lastUpdated: new Date().toISOString(),
        };
    }
    const latest = latestPrices[0];
    let change = 0;
    let changePercent = 0;
    if (latestPrices.length > 1) {
        const prev = latestPrices[1];
        change = Number(latest.price) - Number(prev.price);
        changePercent = Number(prev.price) !== 0 ? (change / Number(prev.price)) * 100 : 0;
    }
    return {
        symbol: stock.symbol,
        price: Number(latest.price),
        change: Number(change.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2)),
        source: fallbackLabel,
        lastUpdated: latest.updatedAt.toISOString(),
    };
}
/**
 * Fetch live prices using exponential backoff retry.
 */
async function getLivePriceWithRetry(stock, userId, retries = 2, delayMs = 1000) {
    try {
        return await getLivePriceForStock(stock, userId);
    }
    catch (error) {
        if (retries > 0) {
            console.warn(`[PriceFeedService] Retrying live fetch for ${stock.symbol} in ${delayMs}ms. Retries remaining: ${retries}`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            return getLivePriceWithRetry(stock, userId, retries - 1, delayMs * 2);
        }
        throw error;
    }
}
/**
 * Perform a full update loop of all stock symbols owned by a specific user with rate-limiting pauses and re-entrancy locks.
 */
async function syncUserPrices(userId) {
    // Re-entrancy guard
    if (isSyncRunningByUser.get(userId)) {
        console.log(`[PriceSyncPoller] Pricing cycle already running for user ${userId}. Skipping this execution.`);
        return;
    }
    isSyncRunningByUser.set(userId, true);
    try {
        console.log(`[PriceSyncPoller] Starting background sync cycle for user ${userId}...`);
        // Fetch only stocks associated with the actual stock.userId
        const stocks = await models_1.Stock.findAll({ where: { userId } });
        if (stocks.length === 0) {
            console.log(`[PriceSyncPoller] No stocks registered for user ${userId}. skipping sync cycle.`);
            return;
        }
        for (const stock of stocks) {
            try {
                await getLivePriceWithRetry(stock, userId);
                // Pause 1 second between requests to satisfy API provider rate limit thresholds
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
            catch (err) {
                console.error(`[PriceSyncPoller] Error syncing ${stock.symbol} for user ${userId}:`, err.message);
            }
        }
        console.log(`[PriceSyncPoller] Pricing cycle for user ${userId} completed successfully.`);
    }
    catch (error) {
        console.error(`[PriceSyncPoller] Global error in user ${userId} sync cycle:`, error.message);
    }
    finally {
        isSyncRunningByUser.set(userId, false);
    }
}
/**
 * Start background price synchronization loop for a specific user.
 */
function startPriceSyncPoller(userId, intervalSeconds) {
    if (intervalSeconds) {
        intervalByUser.set(userId, intervalSeconds);
    }
    // Cancel any existing scheduler before registering a new one
    stopPriceSyncPoller(userId);
    const seconds = intervalByUser.get(userId) || 60;
    console.log(`⏱️ [PriceSyncPoller] Registering background synchronizer for user ${userId} at interval: ${seconds}s`);
    // Run cycle immediately
    syncUserPrices(userId);
    // Set up repeating scheduler
    const intervalId = setInterval(() => {
        syncUserPrices(userId);
    }, seconds * 1000);
    timersByUser.set(userId, intervalId);
}
/**
 * Stop background price synchronization loop for a specific user.
 */
function stopPriceSyncPoller(userId) {
    const intervalId = timersByUser.get(userId);
    if (intervalId) {
        console.log(`🛑 [PriceSyncPoller] Stopping current background synchronizer for user ${userId}.`);
        clearInterval(intervalId);
        timersByUser.delete(userId);
    }
}
/**
 * Initialize all user schedulers on startup
 */
async function initializeAllPollers() {
    try {
        console.log(`🚀 [PriceSyncPoller] Initializing active user synchronization timers on system startup...`);
        const settings = await models_1.UserSetting.scope('withApiKey').findAll();
        for (const setting of settings) {
            if (setting.provider !== 'manual' && setting.apiKey) {
                startPriceSyncPoller(setting.userId, setting.refreshInterval);
            }
        }
    }
    catch (error) {
        console.error(`[PriceSyncPoller] Startup initialization error:`, error.message);
    }
}
