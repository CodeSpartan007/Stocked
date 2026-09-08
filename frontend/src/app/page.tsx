'use client';

import { API_BASE } from '../lib/api';
import { getCached, setCached } from '../lib/cache';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import ExportActionsDropdown from '../components/ExportActionsDropdown';
import { useAuth } from '@/app/context/AuthContext';
import { useCurrency } from '@/app/context/CurrencyContext';

interface StockSummary {
  id: string;
  name: string;
  symbol: string;
  category: string;
  currency?: 'USD' | 'KES';
  summary: {
    totalPriceRecords: number;
    latestPrice: number;
    nativeLatestPrice?: number;
    nativeCurrency?: 'USD' | 'KES';
    priceChange: number;
    priceChangePercent: number;
    source?: 'live' | 'manual fallback' | 'cache';
    lastUpdated?: string | null;
  };
}

interface PortfolioSummary {
  totalPortfolioValue: number;
  totalInvestedCapital: number;
  realizedPL: number;
  unrealizedPL: number;
  currency?: 'USD' | 'KES';
}

interface RecentTransaction {
  id: string;
  type: 'BUY' | 'SELL';
  stockId: string;
  symbol: string;
  name: string;
  currency?: 'USD' | 'KES';
  baseCurrency?: 'USD' | 'KES';
  quantity: number;
  price: number;
  nativePrice?: number;
  convertedPrice?: number;
  date: string;
  profitLoss: number | null;
}

interface LiveTickerItem {
  symbol: string;
  price: number;
  nativePrice?: number;
  nativeCurrency?: 'USD' | 'KES';
  change: number;
  changePercent: number;
  source: 'live' | 'manual fallback' | 'cache';
  lastUpdated: string;
}

interface BenchmarkItem {
  stockId: string;
  symbol: string;
  name: string;
  startPrice: number | null;
  endPrice: number | null;
  performanceGain: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { baseCurrency, convert, formatMoney } = useCurrency();
  const [stocks, setStocks] = useState<StockSummary[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [recentTx, setRecentTx] = useState<RecentTransaction[]>([]);
  const [topPerformers, setTopPerformers] = useState<BenchmarkItem[]>([]);
  const [tickerItems, setTickerItems] = useState<LiveTickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  interface DashboardCache {
    stocks: StockSummary[];
    portfolio: PortfolioSummary | null;
    recentTx: RecentTransaction[];
    topPerformers: BenchmarkItem[];
    tickerItems: LiveTickerItem[];
  }

  const fetchTickerPrices = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stocks/live-prices`, {
        credentials: 'include'
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setTickerItems(json.data);
          const currentCache = getCached<DashboardCache>('dashboard_data');
          if (currentCache) {
            setCached('dashboard_data', { ...currentCache, tickerItems: json.data });
          }
        }
      }
    } catch (err) {
      console.error('Failed to update live tickers:', err);
    }
  };

  useEffect(() => {
    // 1. Instant Cache Hydration: If data was viewed recently, load immediately without blocking spinner
    const cached = getCached<DashboardCache>('dashboard_data');
    if (cached) {
      setStocks(cached.stocks);
      setPortfolio(cached.portfolio);
      setRecentTx(cached.recentTx);
      setTopPerformers(cached.topPerformers);
      setTickerItems(cached.tickerItems);
      setLoading(false);
    }

    async function fetchDashboardData(isBackgroundRevalidate = false) {
      try {
        if (!isBackgroundRevalidate) {
          setLoading(true);
        }

        const [stocksRes, portfolioRes, txRes, tickerRes] = await Promise.all([
          fetch(`${API_BASE}/api/stocks`, { credentials: 'include' }),
          fetch(`${API_BASE}/api/portfolio/summary`, { credentials: 'include' }),
          fetch(`${API_BASE}/api/transactions/history`, { credentials: 'include' }),
          fetch(`${API_BASE}/api/stocks/live-prices`, { credentials: 'include' })
        ]);

        if (!stocksRes.ok || !portfolioRes.ok || !txRes.ok) {
          throw new Error('One or more backend APIs failed to respond.');
        }

        const stocksJson = await stocksRes.json();
        const portfolioJson = await portfolioRes.json();
        const txJson = await txRes.json();

        let latestTickers: LiveTickerItem[] = [];
        if (tickerRes.ok) {
          const tickerJson = await tickerRes.json();
          if (tickerJson.success) {
            latestTickers = tickerJson.data;
            setTickerItems(latestTickers);
          }
        }

        if (stocksJson.success && portfolioJson.success && txJson.success) {
          const loadedStocks = stocksJson.data;
          const loadedPortfolio = portfolioJson.data;
          const history = txJson.data as RecentTransaction[];
          const loadedRecentTx = history.slice(0, 5);

          setStocks(loadedStocks);
          setPortfolio(loadedPortfolio);
          setRecentTx(loadedRecentTx);

          let loadedPerformers: BenchmarkItem[] = [];
          try {
            const today = new Date();
            const year = today.getFullYear();
            const month = today.getMonth();
            const firstDay = new Date(year, month, 1).toISOString().split('T')[0];
            const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0];

            const benchRes = await fetch(
              `${API_BASE}/api/analytics/benchmark?startDate=${firstDay}&endDate=${lastDay}`,
              { credentials: 'include' }
            );
            if (benchRes.ok) {
              const benchJson = await benchRes.json();
              if (benchJson.success && benchJson.data) {
                loadedPerformers = benchJson.data;
                setTopPerformers(loadedPerformers);
              }
            }
          } catch (benchErr) {
            console.error('Could not fetch top performers:', benchErr);
          }

          // Persist snapshot in client-side memory cache for instant navigation
          setCached<DashboardCache>('dashboard_data', {
            stocks: loadedStocks,
            portfolio: loadedPortfolio,
            recentTx: loadedRecentTx,
            topPerformers: loadedPerformers,
            tickerItems: latestTickers,
          });
        } else {
          throw new Error('Backend responded with unhandled status code.');
        }
      } catch (err: unknown) {
        if (!cached) {
          if (err instanceof Error) {
            setError(err.message);
          } else {
            setError('Failed to fetch dashboard metrics.');
          }
        }
      } finally {
        setLoading(false);
      }
    }

    // Run fetch (silent revalidation if cache is already displayed)
    fetchDashboardData(Boolean(cached));

    const tickerInterval = setInterval(fetchTickerPrices, 30000);
    return () => clearInterval(tickerInterval);
  }, []);

  return (
    <div className="space-y-8 animate-fade-in text-main">
      {/* Horizontally Scrolling Stock Price Ticker Bar */}
      {tickerItems.length > 0 && (
        <div className="relative w-full overflow-hidden bg-surface backdrop-blur-xl border border-subtle rounded-2xl py-3.5 mb-2 shadow-lg">
          <div className="flex w-full overflow-hidden">
            <div className="animate-marquee whitespace-nowrap flex gap-8 items-center">
              {[...tickerItems, ...tickerItems].map((item, idx) => {
                const isPositive = item.change >= 0;
                return (
                  <div
                    key={`${item.symbol}-${idx}`}
                    className={`inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl border bg-surface-elevated text-xs font-semibold select-none transition-all duration-300 ${
                      isPositive
                        ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-sm'
                        : 'border-rose-500/30 text-rose-600 dark:text-rose-400 shadow-sm'
                    }`}
                  >
                    <span className="font-extrabold text-main font-mono tracking-wider">{item.symbol}</span>
                    <span className="font-bold font-mono text-main">{formatMoney(item.price, baseCurrency)}</span>
                    <span className="flex items-center gap-0.5 text-[10px] font-black">
                      {isPositive ? '▲' : '▼'} {Math.abs(item.changePercent).toFixed(2)}%
                    </span>
                    <span className="text-[9px] text-muted font-medium">
                      ({new Date(item.lastUpdated).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })})
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Ambient shading fades on sides */}
          <div className="absolute top-0 bottom-0 left-0 w-16 bg-gradient-to-r from-[var(--bg-app)] to-transparent pointer-events-none rounded-l-2xl" />
          <div className="absolute top-0 bottom-0 right-0 w-16 bg-gradient-to-l from-[var(--bg-app)] to-transparent pointer-events-none rounded-r-2xl" />
        </div>
      )}

      {/* Hero Welcome Banner */}
      <div className="relative z-20 rounded-3xl bg-surface text-main p-8 sm:p-10 shadow-xl border border-subtle flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#00272b] via-[#0d7b88] to-[#e0ff4f] dark:from-[#e0ff4f] dark:via-emerald-400 dark:to-[#0d7b88] rounded-t-3xl" />
        <div className="absolute right-0 bottom-0 top-0 w-1/2 bg-gradient-to-l from-[#e0ff4f]/15 dark:from-[#e0ff4f]/10 to-transparent pointer-events-none rounded-r-3xl" />
        <div className="relative z-10 space-y-4 max-w-2xl">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-main">
            Welcome back, <span className="text-[#00272b] dark:text-[#e0ff4f]">{user ? user.email.split('@')[0] : 'Developer'}</span>!
          </h1>
          <p className="text-secondary text-sm leading-relaxed">
            Monitor overall portfolio health. Review real-time asset costs, locked-in profits, active value changes, and log transactions.
          </p>
        </div>
        <div className="relative z-50 flex-shrink-0">
          <ExportActionsDropdown reportType="summary" />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-sm font-semibold flex items-center">
          <svg className="h-5 w-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </div>
      )}

      {/* Grid: High-Fidelity Portfolio Summary Cards & Top Performers Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Left Side: Summary Cards Grid */}
        <div className="xl:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Total Portfolio Value */}
          <div className="bg-surface backdrop-blur-xl border border-subtle hover:border-[#e0ff4f] rounded-2xl p-6 shadow-lg group transition-all duration-300 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#e0ff4f] shadow-[0_0_12px_rgba(224,255,79,0.3)]" />
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold tracking-wider text-muted uppercase">Total Portfolio Value</p>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-[#e0ff4f]/20 text-main border border-[#e0ff4f]/30">
                  {baseCurrency}
                </span>
              </div>
              <h3 className="text-2xl font-black text-main mt-2 group-hover:scale-105 transition-transform duration-200 origin-left">
                {loading ? (
                  <span className="inline-block w-24 h-8 rounded bg-surface-elevated animate-pulse" />
                ) : (
                  formatMoney(portfolio?.totalPortfolioValue ?? 0, baseCurrency)
                )}
              </h3>
              <p className="text-[11px] font-semibold text-[#00272b] dark:text-[#e0ff4f] mt-2">Combined holdings market valuation</p>
            </div>
          </div>

          {/* Total Invested Capital */}
          <div className="bg-surface backdrop-blur-xl border border-subtle hover:border-strong rounded-2xl p-6 shadow-lg group transition-all duration-300 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#00272b] dark:bg-[#0d7b88]" />
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold tracking-wider text-muted uppercase">Total Money Put In</p>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-surface-elevated text-muted border border-subtle">
                  {baseCurrency}
                </span>
              </div>
              <h3 className="text-2xl font-black text-main mt-2 group-hover:scale-105 transition-transform duration-200 origin-left">
                {loading ? (
                  <span className="inline-block w-24 h-8 rounded bg-surface-elevated animate-pulse" />
                ) : (
                  formatMoney(portfolio?.totalInvestedCapital ?? 0, baseCurrency)
                )}
              </h3>
              <p className="text-[11px] font-medium text-secondary mt-2">Money put into your active shares</p>
            </div>
          </div>

          {/* Realized P&L */}
          <div className={`bg-surface backdrop-blur-xl border rounded-2xl p-6 shadow-lg group transition-all duration-300 relative overflow-hidden ${
            loading 
              ? 'border-subtle' 
              : (portfolio?.realizedPL ?? 0) >= 0 
                ? 'border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:border-emerald-500/50' 
                : 'border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.1)] hover:border-rose-500/50'
          }`}>
            <div className={`absolute top-0 left-0 right-0 h-1.5 ${
              loading ? 'bg-surface-elevated' : (portfolio?.realizedPL ?? 0) >= 0 ? 'bg-emerald-500' : 'bg-rose-500'
            }`} />
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold tracking-wider text-muted uppercase">Locked-in Profit</p>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-surface-elevated text-muted border border-subtle">
                  {baseCurrency}
                </span>
              </div>
              <h3 className={`text-2xl font-black mt-2 group-hover:scale-105 transition-transform duration-200 origin-left ${
                loading ? 'text-main' : (portfolio?.realizedPL ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}>
                {loading ? (
                  <span className="inline-block w-24 h-8 rounded bg-surface-elevated animate-pulse" />
                ) : (
                  `${(portfolio?.realizedPL ?? 0) >= 0 ? '+' : ''}${formatMoney(portfolio?.realizedPL ?? 0, baseCurrency)}`
                )}
              </h3>
              <p className="text-[11px] font-medium text-secondary mt-2">Profit from sold shares</p>
            </div>
          </div>

          {/* Unrealized P&L */}
          <div className={`bg-surface backdrop-blur-xl border rounded-2xl p-6 shadow-lg group transition-all duration-300 relative overflow-hidden ${
            loading 
              ? 'border-subtle' 
              : (portfolio?.unrealizedPL ?? 0) >= 0 
                ? 'border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:border-emerald-500/50' 
                : 'border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.1)] hover:border-rose-500/50'
          }`}>
            <div className={`absolute top-0 left-0 right-0 h-1.5 ${
              loading ? 'bg-surface-elevated' : (portfolio?.unrealizedPL ?? 0) >= 0 ? 'bg-emerald-500' : 'bg-rose-500'
            }`} />
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold tracking-wider text-muted uppercase">Current Paper Value Change</p>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-surface-elevated text-muted border border-subtle">
                  {baseCurrency}
                </span>
              </div>
              <h3 className={`text-2xl font-black mt-2 group-hover:scale-105 transition-transform duration-200 origin-left ${
                loading ? 'text-main' : (portfolio?.unrealizedPL ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}>
                {loading ? (
                  <span className="inline-block w-24 h-8 rounded bg-surface-elevated animate-pulse" />
                ) : (
                  `${(portfolio?.unrealizedPL ?? 0) >= 0 ? '+' : ''}${formatMoney(portfolio?.unrealizedPL ?? 0, baseCurrency)}`
                )}
              </h3>
              <p className="text-[11px] font-medium text-secondary mt-2">Active investment value change</p>
            </div>
          </div>
        </div>

        {/* Right Side: Top Performers visual panel */}
        <div className="bg-surface backdrop-blur-xl border border-subtle rounded-2xl p-6 shadow-lg hover:border-[#e0ff4f]/40 transition-all duration-300 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#e0ff4f] to-emerald-400" />
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-main uppercase tracking-wider">Top Performers</h3>
                <p className="text-[9px] text-muted mt-0.5">Month-to-date (MTD) gain</p>
              </div>
              <span className="text-[9px] font-black text-[#00272b] bg-[#e0ff4f] px-2 py-0.5 rounded shadow-sm">
                📈 MTD GAINS
              </span>
            </div>

            {loading ? (
              <div className="space-y-2.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-9 w-full rounded bg-surface-elevated animate-pulse" />
                ))}
              </div>
            ) : topPerformers.length === 0 ? (
              <div className="text-muted text-[10px] py-4 text-center">No active gains computed.</div>
            ) : (
              <div className="space-y-2.5">
                {topPerformers
                  .slice()
                  .sort((a, b) => b.performanceGain - a.performanceGain)
                  .slice(0, 3)
                  .map((item, idx) => (
                    <div key={item.stockId} className="flex items-center justify-between p-2 bg-surface-elevated rounded-lg border border-subtle">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-black h-5 w-5 rounded-full flex items-center justify-center ${
                          idx === 0 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' :
                          idx === 1 ? 'bg-surface text-secondary border border-subtle' :
                          'bg-amber-700/15 text-amber-700 dark:text-amber-500 border border-amber-800/30'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="font-extrabold text-main text-xs font-mono">{item.symbol}</span>
                      </div>
                      <span className={`text-xs font-black font-mono ${
                        item.performanceGain > 0 ? 'text-emerald-600 dark:text-emerald-400' : item.performanceGain < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted'
                      }`}>
                        {item.performanceGain > 0 ? '+' : ''}{item.performanceGain.toFixed(1)}%
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-subtle flex items-center justify-between">
            <span className="text-[9px] text-muted font-mono">Monthly benchmark</span>
            <Link href="/analytics" className="text-[10px] font-bold text-[#00272b] dark:text-[#e0ff4f] hover:underline flex items-center">
              Analytics &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Main Grid: Recent Activity & Tracked stocks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Recent Activity */}
        <div className="lg:col-span-2 bg-surface backdrop-blur-md border border-subtle rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-main">Recent Trades</h2>
              <p className="text-xs text-muted mt-1">Your five most recent buy or sell records</p>
            </div>
            <Link
              href="/transactions"
              className="text-xs font-bold text-main bg-[#e0ff4f]/20 hover:bg-[#e0ff4f]/30 border border-[#e0ff4f]/40 px-3 py-1.5 rounded-lg transition-all"
            >
              Full Trade History &rarr;
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 w-full rounded-xl bg-surface-elevated animate-pulse" />
              ))}
            </div>
          ) : recentTx.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 border border-dashed border-subtle rounded-xl space-y-2">
              <svg className="h-8 w-8 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <p className="text-muted text-xs font-medium">No transactions recorded yet.</p>
              <Link href="/transactions" className="text-xs font-bold text-[#00272b] dark:text-[#e0ff4f] hover:underline">Record a trade</Link>
            </div>
          ) : (
            <div className="overflow-hidden border border-subtle rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-elevated text-secondary text-[10px] font-bold uppercase tracking-wider border-b border-subtle">
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Stock Code</th>
                    <th className="px-4 py-3 text-right">Quantity</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle text-xs">
                  {recentTx.map((tx) => (
                    <tr key={tx.id} className="hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black border ${
                          tx.type === 'BUY'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                        }`}>
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-main">{tx.symbol}</td>
                      <td className="px-4 py-3 text-right font-mono text-secondary">
                        {tx.quantity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-secondary">
                        <div>
                          {formatMoney(
                            tx.currency && tx.currency !== baseCurrency
                              ? (tx.baseCurrency === baseCurrency && tx.convertedPrice !== undefined
                                  ? tx.convertedPrice
                                  : convert(tx.price, tx.currency, baseCurrency))
                              : tx.price,
                            baseCurrency
                          )}
                        </div>
                        {tx.currency && tx.currency !== baseCurrency && (
                          <div className="text-[10px] text-muted font-normal">
                            {formatMoney(tx.nativePrice ?? tx.price, tx.currency)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-muted">{tx.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Quick stock indicators review */}
          <div className="pt-2 border-t border-subtle">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-main">Tracked Stocks</h3>
                <p className="text-[10px] text-muted">Overview of registered stocks</p>
              </div>
              <Link href="/stocks" className="text-[10px] font-semibold text-[#00272b] dark:text-[#e0ff4f] hover:underline">
                Manage stocks &rarr;
              </Link>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-10 w-full rounded-lg bg-surface-elevated animate-pulse" />
                ))}
              </div>
            ) : stocks.length === 0 ? (
              <p className="text-muted text-xs py-2">No stocks registered.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {stocks.slice(0, 4).map((stock) => {
                  const isPositive = stock.summary.priceChange >= 0;
                  return (
                    <div
                      key={stock.id}
                      className="flex items-center justify-between p-2.5 bg-surface-elevated hover:bg-surface-hover border border-subtle rounded-lg transition-all"
                    >
                      <div className="flex items-center space-x-2">
                        <div className="h-7 w-7 rounded bg-app border border-subtle flex items-center justify-center text-main text-xs font-bold font-mono">
                          {stock.symbol}
                        </div>
                        <span className="text-[11px] font-medium text-secondary truncate max-w-[100px]">{stock.name}</span>
                      </div>

                      <div className="text-right flex flex-col items-end">
                        {stock.summary.totalPriceRecords > 0 ? (
                          <>
                            <span className="text-[11px] font-extrabold text-main font-mono">
                              {formatMoney(stock.summary.latestPrice, baseCurrency)}
                            </span>
                            <span className={`text-[9px] font-bold ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                              {isPositive ? '+' : ''}{formatMoney(stock.summary.priceChange, baseCurrency)} ({isPositive ? '+' : ''}{stock.summary.priceChangePercent.toFixed(2)}%)
                            </span>
                          </>
                        ) : (
                          <span className="text-[10px] text-muted">No prices</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Quick Action Links & System Status */}
        <div className="bg-surface backdrop-blur-md border border-subtle rounded-2xl p-6 shadow-xl space-y-6">
          <div>
            <h2 className="text-xl font-bold text-main">Quick Actions</h2>
            <p className="text-xs text-muted mt-1">Quick pathways to manage your portfolio</p>
          </div>

          <div className="space-y-4">
            <Link
              href="/stocks"
              className="flex items-center p-4 bg-surface-elevated hover:bg-surface-hover border border-subtle hover:border-[#e0ff4f]/60 rounded-xl group transition-all"
            >
              <div className="h-10 w-10 rounded-lg bg-[#e0ff4f] text-[#00272b] flex items-center justify-center mr-4 group-hover:scale-110 transition-transform shadow-sm">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-main group-hover:text-[#00272b] dark:group-hover:text-[#e0ff4f] transition-colors">Register Stocks</h4>
                <p className="text-xs text-muted mt-0.5">Add, edit, or delete stocks and categories</p>
              </div>
            </Link>

            <Link
              href="/prices"
              className="flex items-center p-4 bg-surface-elevated hover:bg-surface-hover border border-subtle hover:border-[#e0ff4f]/60 rounded-xl group transition-all"
            >
              <div className="h-10 w-10 rounded-lg bg-[#e0ff4f] text-[#00272b] flex items-center justify-center mr-4 group-hover:scale-110 transition-transform shadow-sm">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-main group-hover:text-[#00272b] dark:group-hover:text-[#e0ff4f] transition-colors">Record Stock Price</h4>
                <p className="text-xs text-muted mt-0.5">Manually input stock prices and volumes</p>
              </div>
            </Link>

            <Link
              href="/transactions"
              className="flex items-center p-4 bg-surface-elevated hover:bg-surface-hover border border-subtle hover:border-[#e0ff4f]/60 rounded-xl group transition-all"
            >
              <div className="h-10 w-10 rounded-lg bg-[#e0ff4f] text-[#00272b] flex items-center justify-center mr-4 group-hover:scale-110 transition-transform shadow-sm">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-main group-hover:text-[#00272b] dark:group-hover:text-[#e0ff4f] transition-colors">Record Trades</h4>
                <p className="text-xs text-muted mt-0.5">Log buys or sells with cost validations</p>
              </div>
            </Link>
          </div>

          <div className="p-4 bg-surface-elevated rounded-xl border border-subtle space-y-2">
            <h5 className="text-xs font-bold text-secondary uppercase tracking-wider">Secure Portfolio</h5>
            <p className="text-[11px] text-muted leading-relaxed">
              Your investment details are private and safely isolated under your account: <code className="bg-surface px-1.5 py-0.5 rounded border border-subtle text-[#00272b] dark:text-[#e0ff4f] font-mono text-[10px]">{user ? user.email : 'mock-user-123'}</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
