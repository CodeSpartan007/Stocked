import { Stock, DailyPrice, UserSetting } from '../models';
import { Op } from 'sequelize';
import { recalculateStockPriceHistory } from '../utils/recalculate';

// Multi-user scheduler maps
const timersByUser = new Map<string, NodeJS.Timeout>();
const intervalByUser = new Map<string, number>();
const isSyncRunningByUser = new Map<string, boolean>();

const apiStatusByUser = new Map<string, {
  connected: boolean;
  statusText: string;
  message: string;
  callsRemainingText: string;
  lastChecked: Date;
}>();

export async function getOrUpdateApiStatus(userId: string): Promise<{
  provider: 'alphavantage' | 'polygon' | 'manual';
  connected: boolean;
  statusText: string;
  message: string;
  callsRemainingText: string;
}> {
  const now = new Date();
  
  const settings = await UserSetting.scope('withApiKey').findByPk(userId);
  if (!settings || settings.provider === 'manual' || !settings.apiKey) {
    return {
      provider: settings ? settings.provider : 'manual',
      connected: false,
      statusText: 'Disconnected',
      message: 'No live data provider configured.',
      callsRemainingText: '',
    };
  }

  const cached = apiStatusByUser.get(userId);
  if (cached && (now.getTime() - cached.lastChecked.getTime() < 60000)) {
    return {
      provider: settings.provider,
      connected: cached.connected,
      statusText: cached.statusText,
      message: cached.message,
      callsRemainingText: cached.callsRemainingText,
    };
  }

  let connected = false;
  let statusText = 'Disconnected';
  let message = '';
  let callsRemainingText = '';

  try {
    if (settings.provider === 'alphavantage') {
      await fetchFromAlphaVantage('AAPL', settings.apiKey);
      connected = true;
      statusText = 'Connected';
      message = 'Connected to Alpha Vantage successfully.';
      callsRemainingText = 'Daily limit: 25 requests (Standard Free Tier)';
    } else if (settings.provider === 'polygon') {
      await fetchFromPolygon('AAPL', settings.apiKey);
      connected = true;
      statusText = 'Connected';
      message = 'Connected to Polygon.io successfully.';
      callsRemainingText = 'Minute limit: 5 requests (Standard Free Tier)';
    }
  } catch (err: any) {
    const errMsgLower = err.message.toLowerCase();
    const isRateLimit =
      errMsgLower.includes('rate limit') ||
      errMsgLower.includes('thank you for visiting alpha vantage') ||
      errMsgLower.includes('429') ||
      errMsgLower.includes('standard api rate limit') ||
      errMsgLower.includes('call frequency') ||
      errMsgLower.includes('too many requests') ||
      errMsgLower.includes('maximum number of requests');

    if (isRateLimit) {
      connected = true;
      statusText = 'Rate Limited';
      message = 'Request limit reached. Data updates are temporarily paused.';
      callsRemainingText = '0 requests remaining (Please wait a minute)';
    } else {
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
    lastChecked: now,
  };
  apiStatusByUser.set(userId, newStatus);

  return {
    provider: settings.provider,
    connected,
    statusText,
    message,
    callsRemainingText,
  };
}

interface TickerData {
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

/**
 * Fetch from Alpha Vantage using the Global Quote API with AbortController and symbol encoding
 */
export async function fetchFromAlphaVantage(symbol: string, apiKey: string): Promise<TickerData> {
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
    
    const data = (await response.json()) as any;
    const quote = data['Global Quote'];
    if (!quote || Object.keys(quote).length === 0) {
      const errorMsg = data['Note'] || data['Information'] || data['Error Message'] || 'Invalid response from Alpha Vantage';
      const lowerMsg = errorMsg.toLowerCase();
      if (
        lowerMsg.includes('rate limit') ||
        lowerMsg.includes('thank you for visiting alpha vantage') ||
        lowerMsg.includes('call frequency') ||
        lowerMsg.includes('standard api rate limit')
      ) {
        throw new Error('We have requested data too many times in a short period. Please wait a moment before trying again.');
      }
      if (lowerMsg.includes('invalid api key') || lowerMsg.includes('apikey') || lowerMsg.includes('unauthorized')) {
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
  } catch (error: any) {
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
export async function fetchFromPolygon(symbol: string, apiKey: string): Promise<TickerData> {
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
        throw new Error('We have reached the maximum number of requests allowed by the provider per minute. Please try again in a few moments.');
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error('The API key provided is incorrect or unauthorized.');
      }
      throw new Error(`Polygon.io HTTP error! Status: ${response.status}`);
    }

    const data = (await response.json()) as any;
    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      const errorMsg = data.error || 'Invalid response from Polygon.io or no ticker matches';
      const lowerMsg = errorMsg.toLowerCase();
      if (lowerMsg.includes('unauthorized') || lowerMsg.includes('invalid') || lowerMsg.includes('apikey')) {
        throw new Error('The API key provided is incorrect or unauthorized.');
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
  } catch (error: any) {
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
export async function getLivePriceForStock(
  stock: Stock,
  userId: string
): Promise<{
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  source: 'live' | 'manual fallback' | 'cache';
  lastUpdated: string;
}> {
  let provider = process.env.PRICE_FEED_PROVIDER || 'manual';
  let apiKey = process.env.MARKET_API_KEY || '';

  try {
    const settings = await UserSetting.scope('withApiKey').findByPk(userId);
    if (settings) {
      provider = settings.provider;
      if (settings.apiKey) {
        apiKey = settings.apiKey;
      }
    }
  } catch (err) {
    console.error(`[PriceFeedService] Failed to load UserSetting for user ${userId}:`, err);
  }

  const todayStr = new Date().toISOString().split('T')[0];

  if (provider === 'manual' || !apiKey) {
    return fetchLocalFallback(stock, 'manual fallback');
  }

  try {
    let tickerData: TickerData;
    if (provider === 'alphavantage') {
      tickerData = await fetchFromAlphaVantage(stock.symbol, apiKey);
    } else if (provider === 'polygon') {
      tickerData = await fetchFromPolygon(stock.symbol, apiKey);
    } else {
      throw new Error(`Unsupported price feed provider: ${provider}`);
    }

    const [dailyPrice] = await DailyPrice.upsert({
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
    await recalculateStockPriceHistory(stock.id, userId);

    console.log(`[PriceFeedService] Live price cached for ${stock.symbol}: $${tickerData.price} (Source: ${provider})`);

    const fetchedPrice = await DailyPrice.findOne({
      where: { stockId: stock.id, date: todayStr, userId }
    });

    apiStatusByUser.set(userId, {
      connected: true,
      statusText: 'Connected',
      message: `Last price updated successfully at ${new Date().toLocaleTimeString()}`,
      callsRemainingText: provider === 'alphavantage' ? 'Daily limit: 25 requests (Standard Free Tier)' : 'Minute limit: 5 requests (Standard Free Tier)',
      lastChecked: new Date(),
    });

    return {
      symbol: stock.symbol,
      price: tickerData.price,
      change: fetchedPrice ? Number(fetchedPrice.change) : 0,
      changePercent: fetchedPrice ? Number(fetchedPrice.changePercent) : 0,
      source: 'live',
      lastUpdated: fetchedPrice ? fetchedPrice.updatedAt.toISOString() : new Date().toISOString(),
    };
  } catch (error: any) {
    console.warn(`⚠️ [PriceFeedService ALERT] Failed fetching ${stock.symbol} from ${provider}. Error: ${error.message}. Falling back to cache.`);
    
    const errMsgLower = error.message.toLowerCase();
    const isRateLimit =
      errMsgLower.includes('rate limit') ||
      errMsgLower.includes('thank you for visiting alpha vantage') ||
      errMsgLower.includes('429') ||
      errMsgLower.includes('standard api rate limit') ||
      errMsgLower.includes('call frequency') ||
      errMsgLower.includes('too many requests') ||
      errMsgLower.includes('maximum number of requests');

    apiStatusByUser.set(userId, {
      connected: isRateLimit ? true : false,
      statusText: isRateLimit ? 'Rate Limited' : 'Connection Error',
      message: isRateLimit ? 'Request limit reached. Data updates are temporarily paused.' : `Error: ${error.message}`,
      callsRemainingText: isRateLimit ? '0 requests remaining (Please wait a minute)' : 'Checking connection...',
      lastChecked: new Date(),
    });

    return fetchLocalFallback(stock, 'cache');
  }
}

/**
 * Fetch the latest price available locally in the database.
 */
async function fetchLocalFallback(
  stock: Stock,
  fallbackLabel: 'live' | 'manual fallback' | 'cache'
): Promise<{
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  source: 'live' | 'manual fallback' | 'cache';
  lastUpdated: string;
}> {
  const latestPrices = await DailyPrice.findAll({
    where: { stockId: stock.id },
    order: [['date', 'DESC'], ['createdAt', 'DESC']],
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
  const first = latestPrices[latestPrices.length - 1];
  const change = Number(latest.price) - Number(first.price);
  const changePercent = Number(first.price) !== 0 ? (change / Number(first.price)) * 100 : 0;

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
export async function getLocalCachedPriceForStock(
  stock: Stock,
  userId: string
): Promise<{
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  source: 'live' | 'manual fallback' | 'cache';
  lastUpdated: string;
}> {
  let provider = 'manual';
  try {
    const settings = await UserSetting.findByPk(userId);
    if (settings) {
      provider = settings.provider;
    }
  } catch (err) {
    console.error(`[PriceFeedService] Failed to load provider settings for user ${userId}:`, err);
  }

  const label = provider === 'manual' ? 'manual fallback' : 'cache';
  return fetchLocalFallback(stock, label);
}

/**
 * Fetch live prices using exponential backoff retry.
 */
export async function getLivePriceWithRetry(
  stock: Stock,
  userId: string,
  retries = 2,
  delayMs = 1000
): Promise<any> {
  try {
    return await getLivePriceForStock(stock, userId);
  } catch (error) {
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
async function syncUserPrices(userId: string) {
  // Re-entrancy guard
  if (isSyncRunningByUser.get(userId)) {
    console.log(`[PriceSyncPoller] Pricing cycle already running for user ${userId}. Skipping this execution.`);
    return;
  }

  isSyncRunningByUser.set(userId, true);

  try {
    console.log(`[PriceSyncPoller] Starting background sync cycle for user ${userId}...`);
    
    // Fetch only stocks associated with the actual stock.userId
    const stocks = await Stock.findAll({ where: { userId } });
    if (stocks.length === 0) {
      console.log(`[PriceSyncPoller] No stocks registered for user ${userId}. skipping sync cycle.`);
      return;
    }

    for (const stock of stocks) {
      try {
        await getLivePriceWithRetry(stock, userId);
        // Pause 1 second between requests to satisfy API provider rate limit thresholds
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (err: any) {
        console.error(`[PriceSyncPoller] Error syncing ${stock.symbol} for user ${userId}:`, err.message);
      }
    }
    console.log(`[PriceSyncPoller] Pricing cycle for user ${userId} completed successfully.`);
  } catch (error: any) {
    console.error(`[PriceSyncPoller] Global error in user ${userId} sync cycle:`, error.message);
  } finally {
    isSyncRunningByUser.set(userId, false);
  }
}

/**
 * Start background price synchronization loop for a specific user.
 */
export function startPriceSyncPoller(userId: string, intervalSeconds?: number) {
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
export function stopPriceSyncPoller(userId: string) {
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
export async function initializeAllPollers() {
  try {
    console.log(`🚀 [PriceSyncPoller] Initializing active user synchronization timers on system startup...`);
    const settings = await UserSetting.scope('withApiKey').findAll();
    for (const setting of settings) {
      if (setting.provider !== 'manual' && setting.apiKey) {
        startPriceSyncPoller(setting.userId, setting.refreshInterval);
      }
    }
  } catch (error: any) {
    console.error(`[PriceSyncPoller] Startup initialization error:`, error.message);
  }
}
