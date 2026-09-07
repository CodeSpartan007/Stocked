"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CACHE_TTL_MS = exports.MAX_VALID_RATE = exports.MIN_VALID_RATE = exports.DEFAULT_USD_KES_RATE = void 0;
exports.clearExchangeRateCache = clearExchangeRateCache;
exports.getUsdToKesRate = getUsdToKesRate;
exports.refreshLiveExchangeRate = refreshLiveExchangeRate;
exports.convertPrice = convertPrice;
exports.formatCurrency = formatCurrency;
exports.getUserCurrencyContext = getUserCurrencyContext;
const models_1 = require("../models");
exports.DEFAULT_USD_KES_RATE = 130.0;
exports.MIN_VALID_RATE = 50.0;
exports.MAX_VALID_RATE = 300.0;
exports.CACHE_TTL_MS = 60 * 60 * 1000; // 1-hour in-memory TTL
let rateCache = null;
function clearExchangeRateCache() {
    rateCache = null;
}
/**
 * Fetches the USD to KES exchange rate with multi-layered fallbacks and sanity bounds checking.
 */
async function getUsdToKesRate(userId) {
    // 1. If userId is provided, check if user defined a custom exchange rate
    let userSetting = null;
    if (userId) {
        try {
            userSetting = await models_1.UserSetting.findByPk(userId);
            if (userSetting &&
                userSetting.customExchangeRate !== null &&
                userSetting.customExchangeRate !== undefined &&
                Number(userSetting.customExchangeRate) > 0) {
                return {
                    rate: Number(Number(userSetting.customExchangeRate).toFixed(4)),
                    source: 'custom',
                    updatedAt: userSetting.exchangeRateUpdatedAt || userSetting.updatedAt || new Date(),
                };
            }
        }
        catch (err) {
            console.warn('[CurrencyService] Error loading UserSetting for exchange rate:', err.message);
        }
    }
    // 2. Check in-memory cache
    const now = Date.now();
    if (rateCache && now - rateCache.cachedAt < exports.CACHE_TTL_MS) {
        return {
            rate: rateCache.rate,
            source: 'cache',
            updatedAt: new Date(rateCache.cachedAt),
        };
    }
    // 3. Fetch from live API
    try {
        const liveResult = await fetchLiveRate();
        if (liveResult) {
            rateCache = {
                rate: liveResult.rate,
                cachedAt: liveResult.updatedAt.getTime(),
            };
            // Persist live rate to user record if user provided
            if (userSetting) {
                userSetting.exchangeRate = liveResult.rate;
                userSetting.exchangeRateUpdatedAt = liveResult.updatedAt;
                await userSetting.save();
            }
            return liveResult;
        }
    }
    catch (apiErr) {
        console.warn('[CurrencyService] Live exchange rate fetch failed:', apiErr.message);
    }
    // 4. Fallback to user's previously stored exchange rate
    if (userSetting && userSetting.exchangeRate && Number(userSetting.exchangeRate) > 0) {
        const storedRate = Number(userSetting.exchangeRate);
        if (storedRate >= exports.MIN_VALID_RATE && storedRate <= exports.MAX_VALID_RATE) {
            return {
                rate: storedRate,
                source: 'default',
                updatedAt: userSetting.exchangeRateUpdatedAt || userSetting.updatedAt || new Date(),
            };
        }
    }
    // 5. Hardcoded default fallback
    return {
        rate: exports.DEFAULT_USD_KES_RATE,
        source: 'default',
        updatedAt: new Date(),
    };
}
/**
 * Performs a network fetch to open.er-api.com to retrieve USD/KES live exchange rate.
 */
async function fetchLiveRate() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
        const response = await fetch('https://open.er-api.com/v6/latest/USD', {
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        const data = (await response.json());
        if (data && data.rates && typeof data.rates.KES === 'number') {
            const liveRate = Number(data.rates.KES);
            if (liveRate >= exports.MIN_VALID_RATE && liveRate <= exports.MAX_VALID_RATE) {
                return {
                    rate: Number(liveRate.toFixed(4)),
                    source: 'live',
                    updatedAt: new Date(),
                };
            }
            else {
                console.warn(`[CurrencyService] Rate out of bounds (${liveRate}), outside [${exports.MIN_VALID_RATE}, ${exports.MAX_VALID_RATE}]`);
            }
        }
    }
    catch (fetchErr) {
        clearTimeout(timeout);
        throw fetchErr;
    }
    return null;
}
/**
 * Force clear cache and refresh rate from live API.
 */
async function refreshLiveExchangeRate(userId) {
    clearExchangeRateCache();
    try {
        const live = await fetchLiveRate();
        if (live) {
            rateCache = {
                rate: live.rate,
                cachedAt: live.updatedAt.getTime(),
            };
            if (userId) {
                const userSetting = await models_1.UserSetting.findByPk(userId);
                if (userSetting) {
                    userSetting.exchangeRate = live.rate;
                    userSetting.exchangeRateUpdatedAt = live.updatedAt;
                    await userSetting.save();
                }
            }
            return live;
        }
    }
    catch (err) {
        console.warn('[CurrencyService] Forced refresh failed, using fallback:', err.message);
    }
    return getUsdToKesRate(userId);
}
/**
 * Converts financial amount between USD and KES based on given rate.
 */
function convertPrice(amount, from, to, rate) {
    if (amount === 0 || isNaN(amount))
        return 0;
    if (from === to)
        return amount;
    if (from === 'USD' && to === 'KES') {
        return amount * rate;
    }
    if (from === 'KES' && to === 'USD') {
        return rate > 0 ? amount / rate : amount;
    }
    return amount;
}
/**
 * Formats financial values with currency symbols and adaptive precision for penny stocks.
 */
function formatCurrency(amount, currency, decimals) {
    if (isNaN(amount) || amount === null || amount === undefined) {
        return currency === 'KES' ? 'KSh 0.00' : '$0.00';
    }
    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);
    let dec = decimals;
    if (dec === undefined) {
        // Adaptive precision for micro-penny stocks: preserve 4 decimals if < 0.05 and > 0
        if (absAmount > 0 && absAmount < 0.05) {
            dec = 4;
        }
        else {
            dec = 2;
        }
    }
    const formattedNum = absAmount.toLocaleString('en-US', {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
    });
    const prefix = currency === 'KES' ? 'KSh ' : '$';
    return `${isNegative ? '-' : ''}${prefix}${formattedNum}`;
}
/**
 * Helper to fetch a user's currency configuration.
 */
async function getUserCurrencyContext(userId) {
    let settings = await models_1.UserSetting.findByPk(userId);
    if (!settings) {
        settings = await models_1.UserSetting.create({
            userId,
            provider: 'manual',
            baseCurrency: 'USD',
            exchangeRate: exports.DEFAULT_USD_KES_RATE,
        });
    }
    const baseCurrency = settings.baseCurrency || 'USD';
    const rateInfo = await getUsdToKesRate(userId);
    return {
        baseCurrency,
        exchangeRate: rateInfo.rate,
        customExchangeRate: settings.customExchangeRate !== null && settings.customExchangeRate !== undefined
            ? Number(settings.customExchangeRate)
            : null,
        rateInfo,
    };
}
