/**
 * Nairobi Securities Exchange (NSE Kenya) Market Data Service
 * 
 * Fetches live quotes, daily trading summaries, and historical prices
 * for all 71 listed equities on the Nairobi Securities Exchange via afx.kwayisi.org.
 */

export interface NseStockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  lastUpdated: string;
}

export interface NseHistoricalQuote {
  date: string;
  volume: number;
  close: number;
  change: number;
  changePercent: number;
}

export interface TickerData {
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

export interface NseCatalogItem {
  symbol: string;
  name: string;
  category: string;
  description?: string;
}

// Full official directory of NSE listed equities with standard industry classification
export const NSE_CATALOG: NseCatalogItem[] = [
  // Telecommunication & Technology
  { symbol: 'SCOM', name: 'Safaricom Plc', category: 'Technology', description: 'Leading telecommunications, mobile payments (M-Pesa), and data service provider in East Africa.' },
  
  // Banking
  { symbol: 'ABSA', name: 'Absa Bank Kenya Plc', category: 'Financials', description: 'Commercial banking and financial services group.' },
  { symbol: 'BKG', name: 'BK Group Plc', category: 'Financials', description: 'Banking and financial services conglomerate headquartered in Rwanda.' },
  { symbol: 'COOP', name: 'Co-operative Bank of Kenya', category: 'Financials', description: 'Major retail and corporate bank providing banking to cooperatives and businesses.' },
  { symbol: 'DTK', name: 'Diamond Trust Bank Kenya Ltd', category: 'Financials', description: 'Leading commercial banking group operating across East Africa.' },
  { symbol: 'EQTY', name: 'Equity Group Holdings Ltd', category: 'Financials', description: 'One of the largest financial services conglomerates in Central and East Africa.' },
  { symbol: 'FMLY', name: 'Family Bank Ltd', category: 'Financials', description: 'Commercial bank offering retail, SME, and corporate banking.' },
  { symbol: 'HFCB', name: 'HF Group Plc', category: 'Financials', description: 'Mortgage finance, banking, and real estate development group.' },
  { symbol: 'IMH', name: 'I&M Group Plc', category: 'Financials', description: 'Regional commercial banking and investment group.' },
  { symbol: 'KCB', name: 'KCB Group Plc', category: 'Financials', description: 'One of the oldest and largest banking institutions in East Africa.' },
  { symbol: 'NCBA', name: 'NCBA Group Plc', category: 'Financials', description: 'Financial services group formed through CBA and NIC Bank merger.' },
  { symbol: 'SBIC', name: 'Stanbic Holdings Plc', category: 'Financials', description: 'Financial services provider affiliated with Standard Bank Group.' },
  { symbol: 'SCBK', name: 'Standard Chartered Bank Kenya', category: 'Financials', description: 'Tier-1 international commercial bank operating in Kenya.' },

  // Manufacturing & Allied / Consumer Goods
  { symbol: 'BAMB', name: 'Bamburi Cement Ltd', category: 'Industrial', description: 'Leading cement and building materials manufacturer in East Africa.' },
  { symbol: 'BAT', name: 'British American Tobacco Kenya', category: 'Consumer Goods', description: 'Cigarette and tobacco product manufacturing and distribution.' },
  { symbol: 'BOC', name: 'BOC Kenya Ltd', category: 'Industrial', description: 'Industrial, medical, and specialty gas production.' },
  { symbol: 'CARB', name: 'Carbacid Investments Plc', category: 'Industrial', description: 'Mining and marketing of natural food-grade carbon dioxide gas.' },
  { symbol: 'EABL', name: 'East African Breweries Ltd', category: 'Consumer Goods', description: 'Leading alcoholic beverage producer, brewery, and spirits distributor.' },
  { symbol: 'CRWN', name: 'Crown Paints Kenya Ltd', category: 'Industrial', description: 'Manufacturer and distributor of paints and decorative coatings.' },
  { symbol: 'UNGA', name: 'Unga Group Ltd', category: 'Consumer Goods', description: 'Flour milling, grain processing, and animal nutrition products.' },
  { symbol: 'PORT', name: 'East African Portland Cement', category: 'Industrial', description: 'Manufacturer of construction cement and concrete products.' },
  { symbol: 'FTGH', name: 'Flame Tree Group Holdings', category: 'Consumer Goods', description: 'Manufacturer of plastic tanks, cosmetics, and snacks.' },

  // Energy & Petroleum
  { symbol: 'KEGN', name: 'KenGen Plc', category: 'Energy', description: 'Kenya Electricity Generating Company, leading electric power generation.' },
  { symbol: 'KPC', name: 'Kenya Pipeline Company', category: 'Energy', description: 'Oil transport, storage, and pipeline infrastructure operator.' },
  { symbol: 'KPLC', name: 'Kenya Power & Lighting Company', category: 'Energy', description: 'National electricity transmission and retail distribution utility.' },
  { symbol: 'TOTL', name: 'TotalEnergies Marketing Kenya', category: 'Energy', description: 'Petroleum product marketing and fuel distribution network.' },

  // Insurance
  { symbol: 'BRIT', name: 'Britam Holdings Ltd', category: 'Financials', description: 'Diversified financial services, life assurance, general insurance, and asset management.' },
  { symbol: 'CIC', name: 'CIC Insurance Group Ltd', category: 'Financials', description: 'Micro-insurance, life insurance, and general insurance solutions.' },
  { symbol: 'JUB', name: 'Jubilee Holdings Ltd', category: 'Financials', description: 'Leading insurance and healthcare risk provider in East Africa.' },
  { symbol: 'KNRE', name: 'Kenya Re-Insurance Corporation', category: 'Financials', description: 'State-backed reinsurance services and risk underwriting.' },
  { symbol: 'LBTY', name: 'Liberty Kenya Holdings Ltd', category: 'Financials', description: 'Insurance and asset management provider.' },
  { symbol: 'SLAM', name: 'Sanlam Kenya Plc', category: 'Financials', description: 'Life and general insurance provider affiliated with Sanlam Group.' },

  // Agricultural
  { symbol: 'EGAD', name: 'Eaagads Ltd', category: 'Agriculture', description: 'Cultivation, processing, and marketing of high-grade Arabica coffee.' },
  { symbol: 'KAPC', name: 'Kapchorua Tea Company Ltd', category: 'Agriculture', description: 'Cultivation, manufacture, and wholesale packing of tea.' },
  { symbol: 'KUKZ', name: 'Kakuzi Plc', category: 'Agriculture', description: 'Agricultural cultivation of avocados, macadamia, tea, and forestry.' },
  { symbol: 'LIMT', name: 'Limuru Tea Company Ltd', category: 'Agriculture', description: 'Black tea growing and green leaf processing.' },
  { symbol: 'SASN', name: 'Sasini Plc', category: 'Agriculture', description: 'Tea, coffee, macadamia nuts, and avocado agribusiness.' },
  { symbol: 'WTK', name: 'Williamson Tea Kenya Ltd', category: 'Agriculture', description: 'Growing, processing, and export marketing of fine teas.' },

  // Commercial & Services
  { symbol: 'KQ', name: 'Kenya Airways Ltd', category: 'Commercial & Services', description: 'National flag carrier airline providing passenger and cargo air services.' },
  { symbol: 'NMG', name: 'Nation Media Group', category: 'Commercial & Services', description: 'Leading independent media and publishing house in East and Central Africa.' },
  { symbol: 'SGL', name: 'Standard Group Ltd', category: 'Commercial & Services', description: 'Multi-media broadcasting, print, and digital journalism company.' },
  { symbol: 'SCAN', name: 'WPP Scangroup Plc', category: 'Commercial & Services', description: 'Marketing communications, advertising, and digital agency network.' },
  { symbol: 'TPSE', name: 'TPS Eastern Africa (Serena)', category: 'Commercial & Services', description: 'Eco-tourism safari lodges, resorts, and premium hotel operator.' },
  { symbol: 'UCHM', name: 'Uchumi Supermarkets Ltd', category: 'Retail', description: 'Retail supermarket chain store operator.' },
  { symbol: 'XPRS', name: 'Express Kenya Ltd', category: 'Commercial & Services', description: 'Clearing, freight forwarding, and warehousing logistics services.' },
  { symbol: 'LKL', name: 'Longhorn Publishers Ltd', category: 'Commercial & Services', description: 'Educational and literary publishing in Eastern Africa.' },

  // Investment & Financial Markets
  { symbol: 'NSE', name: 'Nairobi Securities Exchange Plc', category: 'Financials', description: 'The principal securities exchange in Kenya providing listing and trading facilities.' },
  { symbol: 'CTUM', name: 'Centum Investment Company', category: 'Financials', description: 'Public investment company investing in private equity, real estate, and marketable securities.' },
  { symbol: 'KURV', name: 'Kurwitu Ventures Ltd', category: 'Financials', description: 'Sharia-compliant investment advisory and capital deployment.' },
  { symbol: 'OCH', name: 'Olympia Capital Holdings Ltd', category: 'Financials', description: 'Investment holding company focusing on building products and real estate.' },
  { symbol: 'TCL', name: 'TransCentury Plc', category: 'Industrial', description: 'Infrastructure development and engineering investment firm.' },

  // ETFs & REITs
  { symbol: 'GLD', name: 'Absa NewGold ETF', category: 'Other', description: 'Exchange-traded fund tracking the spot price of physical gold.' },
  { symbol: 'ALP', name: 'ALP Real Estate Investment Trust', category: 'Real Estate', description: 'Logistics and industrial real estate investment trust.' },
  { symbol: 'LAPR', name: 'Laptrust Imara Income-REIT', category: 'Real Estate', description: 'Closed-ended income-producing real estate investment trust.' },
  { symbol: 'TRFC', name: 'TRIFIC Green USD I-REIT', category: 'Real Estate', description: 'Green commercial real estate investment trust.' },
  { symbol: 'SMWF', name: 'Satrix MSCI World Feeder ETF', category: 'Other', description: 'Exchange-traded feeder fund investing in the MSCI World Index.' },
];

export const NSE_SYMBOLS_SET = new Set(NSE_CATALOG.map((item) => item.symbol.toUpperCase()));

// In-memory caching
interface CacheWrapper<T> {
  data: T;
  cachedAt: number;
}

const NSE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL
let allStocksCache: CacheWrapper<Map<string, NseStockQuote>> | null = null;
const stockHistoryCache = new Map<string, CacheWrapper<NseHistoricalQuote[]>>();

/**
 * Normalizes an arbitrary ticker symbol to NSE format (e.g., 'SCOM.NR' -> 'SCOM', 'SCOM:NSE' -> 'SCOM').
 */
export function normalizeNseSymbol(symbol: string): string {
  if (!symbol) return '';
  return symbol
    .trim()
    .toUpperCase()
    .replace(/\.(NR|NSE|XNA|NA)$/i, '')
    .replace(/^(NSE|NSEKE):/i, '')
    .replace(/:NSE$/i, '');
}

/**
 * Checks whether a given symbol belongs to the Nairobi Securities Exchange.
 */
export function isNseSymbol(symbol: string): boolean {
  if (!symbol) return false;
  const upper = symbol.trim().toUpperCase();
  if (upper.endsWith('.NR') || upper.endsWith('.NSE') || upper.startsWith('NSE:') || upper.startsWith('NSEKE:')) {
    return true;
  }
  const normalized = normalizeNseSymbol(upper);
  return NSE_SYMBOLS_SET.has(normalized);
}

/**
 * Fetches the live trading snapshot for all listed NSE equities.
 */
export async function fetchAllNseStocks(forceRefresh = false): Promise<Map<string, NseStockQuote>> {
  const now = Date.now();
  if (!forceRefresh && allStocksCache && now - allStocksCache.cachedAt < NSE_CACHE_TTL_MS) {
    return allStocksCache.data;
  }

  const url = 'https://afx.kwayisi.org/nse/';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; StockedApp/1.0; +https://stocked.app)',
        Accept: 'text/html',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`AFX Kwayisi HTTP error! Status: ${response.status}`);
    }

    const html = await response.text();
    const tablePart = html.split('<th>Ticker<th>Name<th>Volume<th>Price<th>Change<tbody>')[1]?.split('</table>')[0];

    if (!tablePart) {
      throw new Error('Could not locate NSE market table in HTML response.');
    }

    const rows = tablePart.split(/<tr[^>]*>/).filter(Boolean);
    const stockMap = new Map<string, NseStockQuote>();
    const todayStr = new Date().toISOString().split('T')[0];

    for (const r of rows) {
      const cells = r.split(/<td[^>]*>/).slice(1);
      if (cells.length >= 4) {
        const tickerMatch = cells[0].match(/>([A-Z0-9-]+)<\/a>/);
        const nameMatch = cells[1].match(/>([^<]+)<\/a>/);

        const symbol = tickerMatch ? tickerMatch[1].trim().toUpperCase() : '';
        const name = nameMatch ? nameMatch[1].trim() : symbol;
        const volumeStr = cells[2].replace(/,/g, '').trim();
        const volume = volumeStr ? parseInt(volumeStr, 10) || 0 : 0;
        const priceStr = cells[3].replace(/,/g, '').trim();
        const price = parseFloat(priceStr);

        let changeStr = cells[4] ? cells[4].replace(/[<>/a-z= ]/gi, '').trim() : '0';
        const change = parseFloat(changeStr) || 0;
        const previousClose = price - change;
        const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

        if (symbol && !isNaN(price)) {
          stockMap.set(symbol, {
            symbol,
            name,
            price,
            change: Number(change.toFixed(2)),
            changePercent: Number(changePercent.toFixed(2)),
            volume,
            lastUpdated: todayStr,
          });
        }
      }
    }

    if (stockMap.size > 0) {
      allStocksCache = {
        data: stockMap,
        cachedAt: now,
      };
      return stockMap;
    }

    throw new Error('Parsed 0 stocks from NSE feed table.');
  } catch (error: any) {
    clearTimeout(timeoutId);
    // If live fetch fails, fall back to existing cache if available
    if (allStocksCache?.data) {
      console.warn(`[NseScraperService] Live fetch failed (${error.message}). Serving stale cache.`);
      return allStocksCache.data;
    }
    if (error.name === 'AbortError') {
      throw new Error('Request to NSE data feed timed out after 10000ms.');
    }
    throw error;
  }
}

/**
 * Fetches quote data for a single NSE stock ticker.
 */
export async function fetchNseStockQuote(symbol: string): Promise<TickerData> {
  const normalized = normalizeNseSymbol(symbol);
  
  // 1. Try to get from bulk market snapshot
  try {
    const allStocks = await fetchAllNseStocks();
    const stock = allStocks.get(normalized);
    if (stock) {
      return {
        price: stock.price,
        change: stock.change,
        changePercent: stock.changePercent,
        volume: stock.volume,
      };
    }
  } catch (err) {
    console.warn(`[NseScraperService] Bulk fetch failed while querying ${normalized}:`, err);
  }

  // 2. Direct individual ticker page fallback: https://afx.kwayisi.org/nse/<slug>.html
  const slug = normalized.toLowerCase();
  const url = `https://afx.kwayisi.org/nse/${slug}.html`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; StockedApp/1.0; +https://stocked.app)',
        Accept: 'text/html',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`NSE stock symbol "${symbol}" (${normalized}) not found.`);
      }
      throw new Error(`AFX Kwayisi returned HTTP ${response.status} for ticker ${symbol}`);
    }

    const html = await response.text();
    const histPart = html.split('<table data-hist>')[1]?.split('</table>')[0];

    if (histPart) {
      const rows = histPart.split('<tr>').slice(2);
      for (const r of rows) {
        const cells = r.split(/<td[^>]*>/).slice(1).map((c) => c.split('<')[0].trim());
        if (cells.length >= 5) {
          const volume = parseInt(cells[1].replace(/,/g, ''), 10) || 0;
          const close = parseFloat(cells[2].replace(/,/g, ''));
          const change = parseFloat(cells[3].replace(/,/g, '')) || 0;
          const changePercent = parseFloat(cells[4].replace(/%/g, '')) || 0;

          if (!isNaN(close)) {
            return {
              price: close,
              change,
              changePercent,
              volume,
            };
          }
        }
      }
    }

    throw new Error(`Unable to extract price data from page for ${symbol}.`);
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request for NSE ticker "${symbol}" timed out.`);
    }
    throw error;
  }
}

/**
 * Fetches recent historical quotes for an NSE ticker (last 10-30 trading sessions).
 */
export async function fetchNseStockHistory(symbol: string): Promise<NseHistoricalQuote[]> {
  const normalized = normalizeNseSymbol(symbol);
  const now = Date.now();
  const cached = stockHistoryCache.get(normalized);
  if (cached && now - cached.cachedAt < 15 * 60 * 1000) {
    return cached.data;
  }

  const slug = normalized.toLowerCase();
  const url = `https://afx.kwayisi.org/nse/${slug}.html`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; StockedApp/1.0; +https://stocked.app)',
        Accept: 'text/html',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch history for ${symbol}: HTTP ${response.status}`);
    }

    const html = await response.text();
    const histPart = html.split('<table data-hist>')[1]?.split('</table>')[0];
    const history: NseHistoricalQuote[] = [];

    if (histPart) {
      const rows = histPart.split('<tr>').slice(2);
      for (const r of rows) {
        const cells = r.split(/<td[^>]*>/).slice(1).map((c) => c.split('<')[0].trim());
        if (cells.length >= 5) {
          const date = cells[0];
          const volume = parseInt(cells[1].replace(/,/g, ''), 10) || 0;
          const close = parseFloat(cells[2].replace(/,/g, ''));
          const change = parseFloat(cells[3].replace(/,/g, '')) || 0;
          const changePercent = parseFloat(cells[4].replace(/%/g, '')) || 0;

          if (date && !isNaN(close)) {
            history.push({
              date,
              volume,
              close,
              change,
              changePercent,
            });
          }
        }
      }
    }

    stockHistoryCache.set(normalized, { data: history, cachedAt: now });
    return history;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (cached?.data) return cached.data;
    throw err;
  }
}
