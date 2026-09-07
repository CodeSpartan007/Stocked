import { UserSetting } from '../models';

export const DEFAULT_USD_KES_RATE = 130.0;
export const MIN_VALID_RATE = 50.0;
export const MAX_VALID_RATE = 300.0;
export const CACHE_TTL_MS = 60 * 60 * 1000; // 1-hour in-memory TTL

export interface ExchangeRateInfo {
  rate: number;
  source: 'live' | 'custom' | 'cache' | 'default';
  updatedAt: Date;
}

interface RateCache {
  rate: number;
  cachedAt: number;
}

let rateCache: RateCache | null = null;

export function clearExchangeRateCache(): void {
  rateCache = null;
}

/**
 * Fetches the USD to KES exchange rate with multi-layered fallbacks and sanity bounds checking.
 */
export async function getUsdToKesRate(userId?: string): Promise<ExchangeRateInfo> {
  // 1. If userId is provided, check if user defined a custom exchange rate
  let userSetting: UserSetting | null = null;
  if (userId) {
    try {
      userSetting = await UserSetting.findByPk(userId);
      if (
        userSetting &&
        userSetting.customExchangeRate !== null &&
        userSetting.customExchangeRate !== undefined &&
        Number(userSetting.customExchangeRate) > 0
      ) {
        return {
          rate: Number(Number(userSetting.customExchangeRate).toFixed(4)),
          source: 'custom',
          updatedAt: userSetting.exchangeRateUpdatedAt || userSetting.updatedAt || new Date(),
        };
      }
    } catch (err: any) {
      console.warn('[CurrencyService] Error loading UserSetting for exchange rate:', err.message);
    }
  }

  // 2. Check in-memory cache
  const now = Date.now();
  if (rateCache && now - rateCache.cachedAt < CACHE_TTL_MS) {
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
  } catch (apiErr: any) {
    console.warn('[CurrencyService] Live exchange rate fetch failed:', apiErr.message);
  }

  // 4. Fallback to user's previously stored exchange rate
  if (userSetting && userSetting.exchangeRate && Number(userSetting.exchangeRate) > 0) {
    const storedRate = Number(userSetting.exchangeRate);
    if (storedRate >= MIN_VALID_RATE && storedRate <= MAX_VALID_RATE) {
      return {
        rate: storedRate,
        source: 'default',
        updatedAt: userSetting.exchangeRateUpdatedAt || userSetting.updatedAt || new Date(),
      };
    }
  }

  // 5. Hardcoded default fallback
  return {
    rate: DEFAULT_USD_KES_RATE,
    source: 'default',
    updatedAt: new Date(),
  };
}

/**
 * Performs a network fetch to open.er-api.com to retrieve USD/KES live exchange rate.
 */
async function fetchLiveRate(): Promise<ExchangeRateInfo | null> {
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

    const data = (await response.json()) as any;
    if (data && data.rates && typeof data.rates.KES === 'number') {
      const liveRate = Number(data.rates.KES);
      if (liveRate >= MIN_VALID_RATE && liveRate <= MAX_VALID_RATE) {
        return {
          rate: Number(liveRate.toFixed(4)),
          source: 'live',
          updatedAt: new Date(),
        };
      } else {
        console.warn(
          `[CurrencyService] Rate out of bounds (${liveRate}), outside [${MIN_VALID_RATE}, ${MAX_VALID_RATE}]`
        );
      }
    }
  } catch (fetchErr: any) {
    clearTimeout(timeout);
    throw fetchErr;
  }

  return null;
}

/**
 * Force clear cache and refresh rate from live API.
 */
export async function refreshLiveExchangeRate(userId?: string): Promise<ExchangeRateInfo> {
  clearExchangeRateCache();
  try {
    const live = await fetchLiveRate();
    if (live) {
      rateCache = {
        rate: live.rate,
        cachedAt: live.updatedAt.getTime(),
      };
      if (userId) {
        const userSetting = await UserSetting.findByPk(userId);
        if (userSetting) {
          userSetting.exchangeRate = live.rate;
          userSetting.exchangeRateUpdatedAt = live.updatedAt;
          await userSetting.save();
        }
      }
      return live;
    }
  } catch (err: any) {
    console.warn('[CurrencyService] Forced refresh failed, using fallback:', err.message);
  }

  return getUsdToKesRate(userId);
}

/**
 * Converts financial amount between USD and KES based on given rate.
 */
export function convertPrice(
  amount: number,
  from: 'USD' | 'KES',
  to: 'USD' | 'KES',
  rate: number
): number {
  if (amount === 0 || isNaN(amount)) return 0;
  if (from === to) return amount;

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
export function formatCurrency(
  amount: number,
  currency: 'USD' | 'KES',
  decimals?: number
): string {
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
    } else {
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
export async function getUserCurrencyContext(userId: string): Promise<{
  baseCurrency: 'USD' | 'KES';
  exchangeRate: number;
  customExchangeRate: number | null;
  rateInfo: ExchangeRateInfo;
}> {
  let settings = await UserSetting.findByPk(userId);
  if (!settings) {
    settings = await UserSetting.create({
      userId,
      provider: 'manual',
      baseCurrency: 'USD',
      exchangeRate: DEFAULT_USD_KES_RATE,
    });
  }

  const baseCurrency = (settings.baseCurrency as 'USD' | 'KES') || 'USD';
  const rateInfo = await getUsdToKesRate(userId);

  return {
    baseCurrency,
    exchangeRate: rateInfo.rate,
    customExchangeRate:
      settings.customExchangeRate !== null && settings.customExchangeRate !== undefined
        ? Number(settings.customExchangeRate)
        : null,
    rateInfo,
  };
}
