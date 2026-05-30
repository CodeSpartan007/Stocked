"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchFromAlphaVantage = fetchFromAlphaVantage;
exports.fetchFromPolygon = fetchFromPolygon;
exports.getLivePriceForStock = getLivePriceForStock;
exports.startPriceSyncPoller = startPriceSyncPoller;
exports.stopPriceSyncPoller = stopPriceSyncPoller;
const models_1 = require("../models");
// Global variable to keep track of the background sync interval
let syncIntervalId = null;
let currentIntervalSeconds = 60;
/**
 * Fetch from Alpha Vantage using the Global Quote API
 */
async function fetchFromAlphaVantage(symbol, apiKey) {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Alpha Vantage HTTP error! Status: ${response.status}`);
    }
    const data = (await response.json());
    const quote = data['Global Quote'];
    if (!quote || Object.keys(quote).length === 0) {
        // If we hit API limits or key issues, Alpha Vantage returns a message
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
/**
 * Fetch from Polygon.io using the Previous Close API (highly reliable on free tier)
 */
async function fetchFromPolygon(symbol, apiKey) {
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`;
    const response = await fetch(url);
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
/**
 * Core wrapper that retrieves the live price for a stock with resilient cache fallback.
 */
async function getLivePriceForStock(stock, userId) {
    // 1. Resolve Provider and API Key
    let provider = process.env.PRICE_FEED_PROVIDER || 'manual';
    let apiKey = process.env.MARKET_API_KEY || '';
    try {
        const settings = await models_1.UserSetting.findByPk(userId);
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
    // 2. If provider is manual, immediately fallback to local DailyPrices table
    if (provider === 'manual' || !apiKey) {
        return fetchLocalFallback(stock, 'manual fallback');
    }
    // 3. Try to fetch from external provider
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
        // 4. On successful fetch, upsert into DailyPrices
        const [dailyPrice] = await models_1.DailyPrice.upsert({
            stockId: stock.id,
            date: todayStr,
            price: tickerData.price,
            volume: tickerData.volume,
            source: 'api',
        });
        console.log(`[PriceFeedService] Live price cached for ${stock.symbol}: $${tickerData.price} (Source: ${provider})`);
        // Fetch the updated entry to get the exact high-resolution database updatedAt timestamp
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
        // 5. Intercept error, trigger a warning console alert, and fallback gracefully
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
 * Perform a full update loop of all active stock symbols
 */
async function syncAllPrices() {
    console.log(`[PriceSyncPoller] Starting background pricing cycle...`);
    try {
        const stocks = await models_1.Stock.findAll();
        if (stocks.length === 0) {
            console.log(`[PriceSyncPoller] No stocks registered. Skipping loop.`);
            return;
        }
        // Sync prices for each stock. Since we might have multiple users, 
        // we use 'mock-user-123' as default.
        for (const stock of stocks) {
            try {
                await getLivePriceForStock(stock, stock.userId);
            }
            catch (err) {
                console.error(`[PriceSyncPoller] Error syncing ${stock.symbol}:`, err.message);
            }
        }
        console.log(`[PriceSyncPoller] Pricing cycle completed successfully.`);
    }
    catch (error) {
        console.error(`[PriceSyncPoller] Global error in synchronizer loop:`, error.message);
    }
}
/**
 * Start background price synchronization loop
 */
function startPriceSyncPoller(intervalSeconds) {
    if (intervalSeconds) {
        currentIntervalSeconds = intervalSeconds;
    }
    stopPriceSyncPoller();
    console.log(`⏱️ [PriceSyncPoller] Starting background synchronizer with interval: ${currentIntervalSeconds}s`);
    // Run immediately once
    syncAllPrices();
    // Schedule interval
    syncIntervalId = setInterval(() => {
        syncAllPrices();
    }, currentIntervalSeconds * 1000);
}
/**
 * Stop background price synchronization loop
 */
function stopPriceSyncPoller() {
    if (syncIntervalId) {
        console.log(`🛑 [PriceSyncPoller] Stopping current background synchronizer.`);
        clearInterval(syncIntervalId);
        syncIntervalId = null;
    }
}
