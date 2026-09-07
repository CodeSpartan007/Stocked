"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cooldownsByUserAndProvider = void 0;
exports.getCooldownKey = getCooldownKey;
exports.getCooldown = getCooldown;
exports.setCooldown = setCooldown;
exports.clearCooldown = clearCooldown;
exports.isRateLimitError = isRateLimitError;
exports.isNetworkError = isNetworkError;
exports.shouldFailover = shouldFailover;
exports.resolveProviderCredentials = resolveProviderCredentials;
exports.getOrUpdateApiStatus = getOrUpdateApiStatus;
exports.fetchFromAlphaVantage = fetchFromAlphaVantage;
exports.fetchFromPolygon = fetchFromPolygon;
exports.fetchWithFailover = fetchWithFailover;
exports.getLivePriceForStock = getLivePriceForStock;
exports.getLocalCachedPriceForStock = getLocalCachedPriceForStock;
exports.getLivePriceWithRetry = getLivePriceWithRetry;
exports.startPriceSyncPoller = startPriceSyncPoller;
exports.stopPriceSyncPoller = stopPriceSyncPoller;
exports.initializeAllPollers = initializeAllPollers;
const models_1 = require("../models");
const recalculate_1 = require("../utils/recalculate");
// Multi-user scheduler maps
const timersByUser = new Map();
const intervalByUser = new Map();
const isSyncRunningByUser = new Map();
// In-memory Circuit Breaker / Cooldown Tracker: key is `${userId}:${provider}`
exports.cooldownsByUserAndProvider = new Map();
function getCooldownKey(userId, provider) {
    return `${userId}:${provider}`;
}
function getCooldown(userId, provider) {
    const key = getCooldownKey(userId, provider);
    const cd = exports.cooldownsByUserAndProvider.get(key);
    if (!cd)
        return null;
    if (cd.cooldownUntil.getTime() <= Date.now()) {
        exports.cooldownsByUserAndProvider.delete(key);
        return null;
    }
    return cd;
}
function setCooldown(userId, provider, durationMs = 60000, reason = 'Rate limit reached') {
    const key = getCooldownKey(userId, provider);
    exports.cooldownsByUserAndProvider.set(key, {
        cooldownUntil: new Date(Date.now() + durationMs),
        reason,
    });
}
function clearCooldown(userId, provider) {
    if (provider) {
        exports.cooldownsByUserAndProvider.delete(getCooldownKey(userId, provider));
    }
    else {
        for (const key of exports.cooldownsByUserAndProvider.keys()) {
            if (key.startsWith(`${userId}:`)) {
                exports.cooldownsByUserAndProvider.delete(key);
            }
        }
    }
}
function isRateLimitError(error) {
    if (!error)
        return false;
    const msg = (error.message || String(error)).toLowerCase();
    return (msg.includes('rate limit') ||
        msg.includes('thank you for visiting alpha vantage') ||
        msg.includes('429') ||
        msg.includes('standard api rate limit') ||
        msg.includes('call frequency') ||
        msg.includes('too many requests') ||
        msg.includes('maximum number of requests') ||
        msg.includes('request limit reached') ||
        msg.includes('too many times in a short period'));
}
function isNetworkError(error) {
    if (!error)
        return false;
    const msg = (error.message || String(error)).toLowerCase();
    const name = (error.name || '').toLowerCase();
    const code = ((error.code || (error.cause && error.cause.code)) || '').toLowerCase();
    return (name === 'aborterror' ||
        name === 'typeerror' ||
        code === 'enotfound' ||
        code === 'econnrefused' ||
        code === 'econnreset' ||
        code === 'etimedout' ||
        code === 'ehostunreach' ||
        code === 'enetunreach' ||
        msg.includes('timed out') ||
        msg.includes('timeout') ||
        msg.includes('abort') ||
        msg.includes('fetch failed') ||
        msg.includes('network') ||
        msg.includes('enotfound') ||
        msg.includes('econnrefused') ||
        msg.includes('econnreset') ||
        msg.includes('etimedout') ||
        msg.includes('socket hang up') ||
        msg.includes('connection error') ||
        msg.includes('status: 5') ||
        msg.includes('500') ||
        msg.includes('502') ||
        msg.includes('503') ||
        msg.includes('504') ||
        msg.includes('ehostunreach') ||
        msg.includes('enetunreach'));
}
function shouldFailover(error) {
    return isRateLimitError(error) || isNetworkError(error);
}
const apiStatusByUser = new Map();
async function resolveProviderCredentials(userId) {
    let primaryProvider = process.env.PRICE_FEED_PROVIDER || 'manual';
    let autoSwitchOnRateLimit = true;
    let alphaVantageKey = process.env.ALPHAVANTAGE_API_KEY ||
        (primaryProvider === 'alphavantage' ? process.env.MARKET_API_KEY || null : null);
    let polygonApiKey = process.env.POLYGON_API_KEY ||
        (primaryProvider === 'polygon' ? process.env.MARKET_API_KEY || null : null);
    try {
        const settings = await models_1.UserSetting.scope('withApiKey').findByPk(userId);
        if (settings) {
            primaryProvider = settings.provider;
            autoSwitchOnRateLimit = settings.autoSwitchOnRateLimit ?? true;
            if (settings.alphaVantageApiKey) {
                alphaVantageKey = settings.alphaVantageApiKey;
            }
            else if (settings.provider === 'alphavantage' && settings.apiKey) {
                alphaVantageKey = settings.apiKey;
            }
            if (settings.polygonApiKey) {
                polygonApiKey = settings.polygonApiKey;
            }
            else if (settings.provider === 'polygon' && settings.apiKey) {
                polygonApiKey = settings.apiKey;
            }
        }
    }
    catch (err) {
        console.error(`[PriceFeedService] Failed to load UserSetting for user ${userId}:`, err);
    }
    const backupProvider = primaryProvider === 'alphavantage'
        ? 'polygon'
        : primaryProvider === 'polygon'
            ? 'alphavantage'
            : null;
    const primaryKey = primaryProvider === 'alphavantage'
        ? alphaVantageKey
        : primaryProvider === 'polygon'
            ? polygonApiKey
            : null;
    const backupKey = backupProvider === 'alphavantage'
        ? alphaVantageKey
        : backupProvider === 'polygon'
            ? polygonApiKey
            : null;
    return {
        primaryProvider,
        backupProvider,
        autoSwitchOnRateLimit,
        alphaVantageKey,
        polygonApiKey,
        primaryKey,
        backupKey,
    };
}
async function getOrUpdateApiStatus(userId) {
    const creds = await resolveProviderCredentials(userId);
    const now = new Date();
    if (creds.primaryProvider === 'manual' || (!creds.primaryKey && !creds.backupKey)) {
        return {
            provider: creds.primaryProvider,
            connected: false,
            statusText: 'Disconnected',
            message: 'No live data provider configured.',
            callsRemainingText: '',
            activeProvider: creds.primaryProvider,
            isFailoverActive: false,
            failoverMessage: '',
            primaryStatus: {
                provider: creds.primaryProvider,
                inCooldown: false,
            },
            backupStatus: {
                provider: creds.backupProvider || 'none',
                inCooldown: false,
                configured: false,
            },
        };
    }
    const primaryCooldown = getCooldown(userId, creds.primaryProvider);
    const backupCooldown = creds.backupProvider ? getCooldown(userId, creds.backupProvider) : null;
    const primaryLabel = creds.primaryProvider === 'alphavantage' ? 'Alpha Vantage' : 'Polygon.io';
    const backupLabel = creds.backupProvider === 'alphavantage' ? 'Alpha Vantage' : 'Polygon.io';
    // Case 1: Primary provider is in active cooldown
    if (primaryCooldown) {
        const primaryCdSec = Math.max(0, Math.ceil((primaryCooldown.cooldownUntil.getTime() - now.getTime()) / 1000));
        const isNetwork = primaryCooldown.reason.toLowerCase().includes('network');
        const failoverType = isNetwork ? 'Network Error' : 'Rate Limited';
        const failoverTypeMsg = isNetwork ? 'connection error' : 'rate limited';
        if (creds.autoSwitchOnRateLimit && creds.backupKey && !backupCooldown) {
            const activeP = creds.backupProvider;
            return {
                provider: creds.primaryProvider,
                connected: true,
                statusText: 'Failover Active',
                message: `${primaryLabel} ${failoverTypeMsg}. Live via ${backupLabel}.`,
                callsRemainingText: activeP === 'alphavantage'
                    ? 'Daily limit: 25 requests (Standard Free Tier)'
                    : 'Minute limit: 5 requests (Standard Free Tier)',
                activeProvider: activeP,
                isFailoverActive: true,
                failoverMessage: `${primaryLabel} ${failoverType} — Live via ${backupLabel} (Failover Active)`,
                primaryStatus: {
                    provider: creds.primaryProvider,
                    inCooldown: true,
                    cooldownRemainingSeconds: primaryCdSec,
                },
                backupStatus: {
                    provider: activeP,
                    inCooldown: false,
                    configured: true,
                },
            };
        }
        else {
            const backupCdSec = backupCooldown
                ? Math.max(0, Math.ceil((backupCooldown.cooldownUntil.getTime() - now.getTime()) / 1000))
                : undefined;
            return {
                provider: creds.primaryProvider,
                connected: true,
                statusText: isNetwork ? 'Connection Error' : 'Rate Limited',
                message: backupCooldown
                    ? 'All configured market data providers are currently rate limited.'
                    : `${primaryLabel} ${isNetwork ? 'connection error' : 'request limit reached'}. Data updates are temporarily paused.`,
                callsRemainingText: `0 requests remaining (${primaryCdSec}s cooldown)`,
                activeProvider: creds.primaryProvider,
                isFailoverActive: false,
                failoverMessage: '',
                primaryStatus: {
                    provider: creds.primaryProvider,
                    inCooldown: true,
                    cooldownRemainingSeconds: primaryCdSec,
                },
                backupStatus: {
                    provider: creds.backupProvider || 'none',
                    inCooldown: !!backupCooldown,
                    cooldownRemainingSeconds: backupCdSec,
                    configured: !!creds.backupKey,
                },
            };
        }
    }
    // Case 2: Primary provider is NOT in cooldown
    const cached = apiStatusByUser.get(userId);
    if (cached && !cached.isFailoverActive && now.getTime() - cached.lastChecked.getTime() < 60000) {
        return {
            provider: creds.primaryProvider,
            connected: cached.connected,
            statusText: cached.statusText,
            message: cached.message,
            callsRemainingText: cached.callsRemainingText,
            activeProvider: cached.activeProvider || creds.primaryProvider,
            isFailoverActive: false,
            failoverMessage: '',
            primaryStatus: {
                provider: creds.primaryProvider,
                inCooldown: false,
            },
            backupStatus: {
                provider: creds.backupProvider || 'none',
                inCooldown: !!backupCooldown,
                configured: !!creds.backupKey,
            },
        };
    }
    let connected = false;
    let statusText = 'Disconnected';
    let message = '';
    let callsRemainingText = '';
    let isFailoverActive = false;
    let activeProvider = creds.primaryProvider;
    let failoverMessage = '';
    try {
        if (creds.primaryProvider === 'alphavantage' && creds.primaryKey) {
            await fetchFromAlphaVantage('AAPL', creds.primaryKey);
            connected = true;
            statusText = 'Connected';
            message = 'Connected to Alpha Vantage successfully.';
            callsRemainingText = 'Daily limit: 25 requests (Standard Free Tier)';
        }
        else if (creds.primaryProvider === 'polygon' && creds.primaryKey) {
            await fetchFromPolygon('AAPL', creds.primaryKey);
            connected = true;
            statusText = 'Connected';
            message = 'Connected to Polygon.io successfully.';
            callsRemainingText = 'Minute limit: 5 requests (Standard Free Tier)';
        }
    }
    catch (err) {
        if (shouldFailover(err)) {
            const isRate = isRateLimitError(err);
            const primaryReason = isRate
                ? `Rate limit reached: ${err.message}`
                : `Network error: ${err.message}`;
            setCooldown(userId, creds.primaryProvider, 60000, primaryReason);
            if (creds.autoSwitchOnRateLimit && creds.backupProvider && creds.backupKey) {
                try {
                    if (creds.backupProvider === 'alphavantage') {
                        await fetchFromAlphaVantage('AAPL', creds.backupKey);
                    }
                    else {
                        await fetchFromPolygon('AAPL', creds.backupKey);
                    }
                    connected = true;
                    statusText = 'Failover Active';
                    isFailoverActive = true;
                    activeProvider = creds.backupProvider;
                    const failoverType = isRate ? 'Rate Limited' : 'Network Error';
                    const failoverTypeMsg = isRate ? 'rate limited' : 'connection error';
                    message = `${primaryLabel} ${failoverTypeMsg}. Live via ${backupLabel}.`;
                    failoverMessage = `${primaryLabel} ${failoverType} — Live via ${backupLabel} (Failover Active)`;
                    callsRemainingText =
                        creds.backupProvider === 'alphavantage'
                            ? 'Daily limit: 25 requests (Standard Free Tier)'
                            : 'Minute limit: 5 requests (Standard Free Tier)';
                }
                catch (backupErr) {
                    if (shouldFailover(backupErr)) {
                        const backupReason = isRateLimitError(backupErr)
                            ? `Rate limit reached: ${backupErr.message}`
                            : `Network error: ${backupErr.message}`;
                        setCooldown(userId, creds.backupProvider, 60000, backupReason);
                    }
                    connected = isRate || isRateLimitError(backupErr);
                    statusText = isRate || isRateLimitError(backupErr) ? 'Rate Limited' : 'Connection Error';
                    message =
                        isRate && isRateLimitError(backupErr)
                            ? 'All configured providers are currently rate limited.'
                            : `Both configured providers failed (${primaryLabel}: ${err.message}; ${backupLabel}: ${backupErr.message}).`;
                    callsRemainingText = '0 requests remaining (Please wait a minute)';
                }
            }
            else {
                connected = isRate;
                statusText = isRate ? 'Rate Limited' : 'Connection Error';
                message = isRate
                    ? 'Request limit reached. Data updates are temporarily paused.'
                    : `${primaryLabel} connection error: ${err.message}`;
                callsRemainingText = isRate ? '0 requests remaining (Please wait a minute)' : 'Verification failed';
            }
        }
        else {
            connected = false;
            statusText = 'Connection Error';
            message = err.message;
            callsRemainingText = 'Verification failed';
        }
    }
    const newStatus = {
        connected,
        statusText,
        message,
        callsRemainingText,
        activeProvider,
        isFailoverActive,
        failoverMessage,
        lastChecked: now,
    };
    apiStatusByUser.set(userId, newStatus);
    return {
        provider: creds.primaryProvider,
        connected,
        statusText,
        message,
        callsRemainingText,
        activeProvider,
        isFailoverActive,
        failoverMessage,
        primaryStatus: {
            provider: creds.primaryProvider,
            inCooldown: getCooldown(userId, creds.primaryProvider) !== null,
            cooldownRemainingSeconds: getCooldown(userId, creds.primaryProvider)
                ? Math.max(0, Math.ceil((getCooldown(userId, creds.primaryProvider).cooldownUntil.getTime() - now.getTime()) /
                    1000))
                : undefined,
        },
        backupStatus: {
            provider: creds.backupProvider || 'none',
            inCooldown: creds.backupProvider ? getCooldown(userId, creds.backupProvider) !== null : false,
            configured: !!creds.backupKey,
        },
    };
}
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
            const errorMsg = data['Note'] || data['Information'] || data['Error Message'] || 'Invalid response from Alpha Vantage';
            const lowerMsg = errorMsg.toLowerCase();
            if (lowerMsg.includes('rate limit') ||
                lowerMsg.includes('thank you for visiting alpha vantage') ||
                lowerMsg.includes('call frequency') ||
                lowerMsg.includes('standard api rate limit')) {
                throw new Error('Alpha Vantage rate limit reached: Our standard API call frequency is 25 requests per day. Please wait a moment before trying again.');
            }
            if (lowerMsg.includes('invalid api key') ||
                lowerMsg.includes('apikey') ||
                lowerMsg.includes('unauthorized')) {
                throw new Error('The API key provided is incorrect or invalid.');
            }
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
            if (response.status === 429) {
                throw new Error('Polygon.io rate limit reached: Maximum number of requests allowed per minute (5/min). Please try again in a few moments.');
            }
            if (response.status === 401 || response.status === 403) {
                throw new Error('The API key provided is incorrect or unauthorized.');
            }
            throw new Error(`Polygon.io HTTP error! Status: ${response.status}`);
        }
        const data = (await response.json());
        if (data.status !== 'OK' || !data.results || data.results.length === 0) {
            const errorMsg = data.error || 'Invalid response from Polygon.io or no ticker matches';
            const lowerMsg = errorMsg.toLowerCase();
            if (lowerMsg.includes('unauthorized') ||
                lowerMsg.includes('invalid') ||
                lowerMsg.includes('apikey')) {
                throw new Error('The API key provided is incorrect or unauthorized.');
            }
            if (lowerMsg.includes('exceeded') || lowerMsg.includes('rate limit')) {
                throw new Error('Polygon.io rate limit reached: Maximum number of requests allowed per minute.');
            }
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
 * Centralized fetch function with circuit-breaker failover across providers.
 */
async function fetchWithFailover(symbol, userId) {
    const creds = await resolveProviderCredentials(userId);
    if (creds.primaryProvider === 'manual') {
        throw new Error('Real-time API key not configured or set to manual mode.');
    }
    const { primaryProvider, backupProvider, autoSwitchOnRateLimit, primaryKey, backupKey } = creds;
    const callProvider = async (p, key) => {
        if (p === 'alphavantage') {
            return fetchFromAlphaVantage(symbol, key);
        }
        else {
            return fetchFromPolygon(symbol, key);
        }
    };
    const primaryCooldown = getCooldown(userId, primaryProvider);
    // Scenario 1: Primary provider is in active cooldown window
    if (primaryCooldown) {
        console.warn(`[PriceFeedService] Primary provider (${primaryProvider}) in cooldown until ${primaryCooldown.cooldownUntil.toISOString()}.`);
        if (autoSwitchOnRateLimit && backupProvider && backupKey) {
            const backupCooldown = getCooldown(userId, backupProvider);
            if (backupCooldown) {
                throw new Error(`Both ${primaryProvider} and ${backupProvider} are currently rate limited. ` +
                    `Primary cooldown until ${primaryCooldown.cooldownUntil.toLocaleTimeString()}, backup until ${backupCooldown.cooldownUntil.toLocaleTimeString()}.`);
            }
            console.log(`[PriceFeedService] Cooldown active for ${primaryProvider}. Routing request for ${symbol} directly to backup (${backupProvider}).`);
            try {
                const tickerData = await callProvider(backupProvider, backupKey);
                return {
                    tickerData,
                    provider: backupProvider,
                    isFailover: true,
                    failoverReason: primaryCooldown.reason,
                };
            }
            catch (backupErr) {
                if (shouldFailover(backupErr)) {
                    const backupReason = isRateLimitError(backupErr)
                        ? `Rate limit reached: ${backupErr.message}`
                        : `Network error: ${backupErr.message}`;
                    setCooldown(userId, backupProvider, 60000, backupReason);
                }
                throw backupErr;
            }
        }
        else {
            const isNetwork = primaryCooldown.reason.toLowerCase().includes('network');
            throw new Error(`Primary provider (${primaryProvider}) is ${isNetwork ? 'experiencing connection errors' : 'rate limited'}. Failover unavailable (${!autoSwitchOnRateLimit ? 'auto-switch disabled' : 'no backup key configured'}).`);
        }
    }
    // Scenario 2: Primary provider is NOT in cooldown
    if (!primaryKey) {
        if (autoSwitchOnRateLimit && backupProvider && backupKey) {
            const backupCooldown = getCooldown(userId, backupProvider);
            if (!backupCooldown) {
                console.log(`[PriceFeedService] No primary key for ${primaryProvider}. Routing to backup ${backupProvider}.`);
                const tickerData = await callProvider(backupProvider, backupKey);
                return {
                    tickerData,
                    provider: backupProvider,
                    isFailover: true,
                    failoverReason: `Primary provider ${primaryProvider} key not configured`,
                };
            }
        }
        throw new Error(`Real-time API key not configured for ${primaryProvider}.`);
    }
    try {
        const tickerData = await callProvider(primaryProvider, primaryKey);
        return {
            tickerData,
            provider: primaryProvider,
            isFailover: false,
        };
    }
    catch (primaryErr) {
        if (shouldFailover(primaryErr)) {
            const isRate = isRateLimitError(primaryErr);
            const reason = isRate
                ? `Rate limit reached: ${primaryErr.message}`
                : `Network error: ${primaryErr.message}`;
            console.warn(`[PriceFeedService] ${isRate ? 'Rate limit' : 'Network error'} hit on ${primaryProvider}: ${primaryErr.message}. Activating 60s cooldown.`);
            setCooldown(userId, primaryProvider, 60000, reason);
            if (autoSwitchOnRateLimit && backupProvider && backupKey) {
                const backupCooldown = getCooldown(userId, backupProvider);
                if (!backupCooldown) {
                    console.log(`[PriceFeedService] Seamlessly failing over to backup provider (${backupProvider}) for ${symbol}...`);
                    try {
                        const tickerData = await callProvider(backupProvider, backupKey);
                        return {
                            tickerData,
                            provider: backupProvider,
                            isFailover: true,
                            failoverReason: primaryErr.message,
                        };
                    }
                    catch (backupErr) {
                        if (shouldFailover(backupErr)) {
                            const backupReason = isRateLimitError(backupErr)
                                ? `Rate limit reached: ${backupErr.message}`
                                : `Network error: ${backupErr.message}`;
                            setCooldown(userId, backupProvider, 60000, backupReason);
                        }
                        throw new Error(`Failover failed: Primary ${isRate ? 'rate limited' : 'network error'} (${primaryErr.message}), and backup also failed (${backupErr.message}).`);
                    }
                }
                else {
                    throw new Error(`Primary provider ${isRate ? 'rate limited' : 'encountered network error'} (${primaryErr.message}), and backup is already in cooldown.`);
                }
            }
        }
        throw primaryErr;
    }
}
/**
 * Core wrapper that retrieves the live price for a stock with resilient cache fallback.
 */
async function getLivePriceForStock(stock, userId) {
    const creds = await resolveProviderCredentials(userId);
    if (creds.primaryProvider === 'manual' || (!creds.primaryKey && !creds.backupKey)) {
        return fetchLocalFallback(stock, 'manual fallback');
    }
    const todayStr = new Date().toISOString().split('T')[0];
    try {
        const result = await fetchWithFailover(stock.symbol, userId);
        const { tickerData, provider: activeProvider, isFailover } = result;
        try {
            await models_1.DailyPrice.upsert({
                userId,
                stockId: stock.id,
                date: todayStr,
                price: tickerData.price,
                volume: tickerData.volume,
                source: 'api',
                change: tickerData.change,
                changePercent: tickerData.changePercent,
            });
            // Recalculate stock price history to correct day-over-day price change columns
            await (0, recalculate_1.recalculateStockPriceHistory)(stock.id, userId);
        }
        catch (dbError) {
            console.error(`[PriceFeedService] Failed to cache live price for ${stock.symbol} to database:`, dbError);
        }
        console.log(`[PriceFeedService] Live price cached for ${stock.symbol}: $${tickerData.price} (Source: ${activeProvider}${isFailover ? ' [FAILOVER]' : ''})`);
        const fetchedPrice = await models_1.DailyPrice.findOne({
            where: { stockId: stock.id, date: todayStr, userId },
        });
        const primaryLabel = creds.primaryProvider === 'alphavantage' ? 'Alpha Vantage' : 'Polygon.io';
        const activeLabel = activeProvider === 'alphavantage' ? 'Alpha Vantage' : 'Polygon.io';
        apiStatusByUser.set(userId, {
            connected: true,
            statusText: isFailover ? 'Failover Active' : 'Connected',
            message: isFailover
                ? `${primaryLabel} rate limited. Live via ${activeLabel} (Failover Active).`
                : `Last price updated successfully at ${new Date().toLocaleTimeString()}`,
            callsRemainingText: activeProvider === 'alphavantage'
                ? 'Daily limit: 25 requests (Standard Free Tier)'
                : 'Minute limit: 5 requests (Standard Free Tier)',
            activeProvider,
            isFailoverActive: isFailover,
            failoverMessage: isFailover
                ? `${primaryLabel} Rate Limited — Live via ${activeLabel} (Failover Active)`
                : '',
            lastChecked: new Date(),
        });
        return {
            symbol: stock.symbol,
            price: tickerData.price,
            change: fetchedPrice ? Number(fetchedPrice.change) : (tickerData.change ?? 0),
            changePercent: fetchedPrice ? Number(fetchedPrice.changePercent) : (tickerData.changePercent ?? 0),
            source: 'live',
            lastUpdated: fetchedPrice ? fetchedPrice.updatedAt.toISOString() : new Date().toISOString(),
        };
    }
    catch (error) {
        console.warn(`⚠️ [PriceFeedService ALERT] Failed fetching ${stock.symbol}. Error: ${error.message}. Falling back to cache.`);
        const isRateLimit = isRateLimitError(error);
        apiStatusByUser.set(userId, {
            connected: isRateLimit ? true : false,
            statusText: isRateLimit ? 'Rate Limited' : 'Connection Error',
            message: isRateLimit
                ? 'Request limit reached. Data updates are temporarily paused.'
                : `Error: ${error.message}`,
            callsRemainingText: isRateLimit ? '0 requests remaining (Cooldown active)' : 'Verification failed',
            activeProvider: creds.primaryProvider,
            isFailoverActive: false,
            failoverMessage: '',
            lastChecked: new Date(),
        });
        return fetchLocalFallback(stock, 'cache');
    }
}
/**
 * Fetch the latest price available locally in the database.
 */
async function fetchLocalFallback(stock, fallbackLabel) {
    const latestPrices = await models_1.DailyPrice.findAll({
        where: { stockId: stock.id },
        order: [
            ['date', 'DESC'],
            ['createdAt', 'DESC'],
        ],
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
    const previous = latestPrices.length > 1 ? latestPrices[1] : null;
    const change = previous ? Number(latest.price) - Number(previous.price) : 0;
    const changePercent = previous && Number(previous.price) > 0 ? (change / Number(previous.price)) * 100 : 0;
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
 * Retrieve the locally cached price, change, and update timestamps for a stock.
 */
async function getLocalCachedPriceForStock(stock, userId) {
    let provider = 'manual';
    try {
        const settings = await models_1.UserSetting.findByPk(userId);
        if (settings) {
            provider = settings.provider;
        }
    }
    catch (err) {
        console.error(`[PriceFeedService] Failed to load provider settings for user ${userId}:`, err);
    }
    const label = provider === 'manual' ? 'manual fallback' : 'cache';
    return fetchLocalFallback(stock, label);
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
            if (setting.provider !== 'manual' &&
                (setting.apiKey || setting.alphaVantageApiKey || setting.polygonApiKey)) {
                startPriceSyncPoller(setting.userId, setting.refreshInterval);
            }
        }
    }
    catch (error) {
        console.error(`[PriceSyncPoller] Startup initialization error:`, error.message);
    }
}
