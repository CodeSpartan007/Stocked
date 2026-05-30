'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface StockSummary {
  id: string;
  name: string;
  symbol: string;
  category: string;
  summary: {
    totalPriceRecords: number;
    latestPrice: number;
    priceChange: number;
    priceChangePercent: number;
  };
}

interface PortfolioSummary {
  totalPortfolioValue: number;
  totalInvestedCapital: number;
  realizedPL: number;
  unrealizedPL: number;
}

interface RecentTransaction {
  id: string;
  type: 'BUY' | 'SELL';
  stockId: string;
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  date: string;
  profitLoss: number | null;
}

export default function Dashboard() {
  const [stocks, setStocks] = useState<StockSummary[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [recentTx, setRecentTx] = useState<RecentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        setLoading(true);
        // Fetch all registered stocks, portfolio summary, and recent transactions in parallel
        const [stocksRes, portfolioRes, txRes] = await Promise.all([
          fetch('http://localhost:5001/api/stocks'),
          fetch('http://localhost:5001/api/portfolio/summary'),
          fetch('http://localhost:5001/api/transactions/history')
        ]);

        if (!stocksRes.ok || !portfolioRes.ok || !txRes.ok) {
          throw new Error('One or more backend APIs failed to respond.');
        }

        const stocksJson = await stocksRes.json();
        const portfolioJson = await portfolioRes.json();
        const txJson = await txRes.json();

        if (stocksJson.success && portfolioJson.success && txJson.success) {
          setStocks(stocksJson.data);
          setPortfolio(portfolioJson.data);
          // Limit to 5 most recent transaction rows
          setRecentTx(txJson.data.slice(0, 5));
        } else {
          throw new Error('API reported unsuccessful data retrieval.');
        }
      } catch (err: any) {
        console.error(err);
        setError('Unable to load real-time portfolio metrics. Is the backend server running?');
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, []);

  return (
    <div className="space-y-8 animate-fade-in text-slate-100">
      {/* Welcome Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-indigo-600 via-indigo-900 to-emerald-950 p-8 sm:p-10 shadow-2xl border border-indigo-500/20">
        <div className="absolute right-0 bottom-0 top-0 w-1/2 bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none" />
        <div className="relative z-10 space-y-3 max-w-2xl">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            📊 Capital Market System — Phase 2 Active
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Welcome back, <span className="bg-gradient-to-r from-emerald-300 to-teal-200 bg-clip-text text-transparent">Developer</span>!
          </h1>
          <p className="text-slate-300 text-sm leading-relaxed">
            Monitor overall portfolio health using the <strong className="font-semibold text-slate-100">Valuation Engine (Average Cost Basis)</strong>. Review real-time asset costs, realized sales earnings, paper gains, and commit audit transactions seamlessly.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-sm font-semibold flex items-center">
          <svg className="h-5 w-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </div>
      )}

      {/* Grid: High-Fidelity Portfolio Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Portfolio Value */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-lg group hover:border-indigo-500/30 transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500" />
          <div>
            <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Total Portfolio Value</p>
            <h3 className="text-2xl font-black text-white mt-2 group-hover:scale-105 transition-transform duration-200 origin-left">
              {loading ? (
                <span className="inline-block w-24 h-8 rounded bg-slate-800 animate-pulse" />
              ) : (
                `$${(portfolio?.totalPortfolioValue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </h3>
            <p className="text-[11px] font-medium text-indigo-400 mt-2">Combined holdings market valuation</p>
          </div>
        </div>

        {/* Total Invested Capital */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-lg group hover:border-slate-700 transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-slate-600" />
          <div>
            <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Total Invested Capital</p>
            <h3 className="text-2xl font-black text-white mt-2 group-hover:scale-105 transition-transform duration-200 origin-left">
              {loading ? (
                <span className="inline-block w-24 h-8 rounded bg-slate-800 animate-pulse" />
              ) : (
                `$${(portfolio?.totalInvestedCapital ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </h3>
            <p className="text-[11px] font-medium text-slate-400 mt-2">Remaining shares net cost basis</p>
          </div>
        </div>

        {/* Realized P&L (with green/red glow outline) */}
        <div className={`bg-slate-900/40 backdrop-blur-xl border rounded-2xl p-6 shadow-lg group transition-all duration-300 relative overflow-hidden ${
          loading 
            ? 'border-slate-800/80' 
            : (portfolio?.realizedPL ?? 0) >= 0 
              ? 'border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:border-emerald-500/50' 
              : 'border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.1)] hover:border-rose-500/50'
        }`}>
          <div className={`absolute top-0 left-0 right-0 h-1 ${
            loading ? 'bg-slate-800' : (portfolio?.realizedPL ?? 0) >= 0 ? 'bg-emerald-500' : 'bg-rose-500'
          }`} />
          <div>
            <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Realized P&L</p>
            <h3 className={`text-2xl font-black mt-2 group-hover:scale-105 transition-transform duration-200 origin-left ${
              loading ? 'text-white' : (portfolio?.realizedPL ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {loading ? (
                <span className="inline-block w-24 h-8 rounded bg-slate-800 animate-pulse" />
              ) : (
                `${(portfolio?.realizedPL ?? 0) >= 0 ? '+' : ''}$${(portfolio?.realizedPL ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </h3>
            <p className="text-[11px] font-medium text-slate-400 mt-2">Locked gains from sales history</p>
          </div>
        </div>

        {/* Unrealized P&L (with green/red glow outline) */}
        <div className={`bg-slate-900/40 backdrop-blur-xl border rounded-2xl p-6 shadow-lg group transition-all duration-300 relative overflow-hidden ${
          loading 
            ? 'border-slate-800/80' 
            : (portfolio?.unrealizedPL ?? 0) >= 0 
              ? 'border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:border-emerald-500/50' 
              : 'border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.1)] hover:border-rose-500/50'
        }`}>
          <div className={`absolute top-0 left-0 right-0 h-1 ${
            loading ? 'bg-slate-800' : (portfolio?.unrealizedPL ?? 0) >= 0 ? 'bg-emerald-500' : 'bg-rose-500'
          }`} />
          <div>
            <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Unrealized P&L</p>
            <h3 className={`text-2xl font-black mt-2 group-hover:scale-105 transition-transform duration-200 origin-left ${
              loading ? 'text-white' : (portfolio?.unrealizedPL ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {loading ? (
                <span className="inline-block w-24 h-8 rounded bg-slate-800 animate-pulse" />
              ) : (
                `${(portfolio?.unrealizedPL ?? 0) >= 0 ? '+' : ''}$${(portfolio?.unrealizedPL ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </h3>
            <p className="text-[11px] font-medium text-slate-400 mt-2">Paper profit based on current price</p>
          </div>
        </div>
      </div>

      {/* Main Grid: Recent Activity & Tracked stocks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Recent Activity (Dynamic Feed of 5 Transactions) [FR5] */}
        <div className="lg:col-span-2 bg-slate-900/20 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Recent Activity</h2>
              <p className="text-xs text-slate-400 mt-1">Audit log of your five most recent transactions</p>
            </div>
            <Link
              href="/transactions"
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-lg transition-all"
            >
              Full Ledger &rarr;
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 w-full rounded-xl bg-slate-900/50 animate-pulse" />
              ))}
            </div>
          ) : recentTx.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 border border-dashed border-slate-800 rounded-xl space-y-2">
              <svg className="h-8 w-8 text-slate-650" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <p className="text-slate-400 text-xs font-medium">No transactions recorded yet.</p>
              <Link href="/transactions" className="text-xs font-bold text-indigo-400 hover:underline">Record a trade</Link>
            </div>
          ) : (
            <div className="overflow-hidden border border-slate-850 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/70 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-800/80">
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Ticker</th>
                    <th className="px-4 py-3 text-right">Shares</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-xs">
                  {recentTx.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-extrabold border ${
                          tx.type === 'BUY'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/15'
                        }`}>
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-200">{tx.symbol}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">
                        {tx.quantity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">${tx.price.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-slate-400">{tx.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Quick stock indicators review */}
          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-white">Tracked Stock Tickers</h3>
                <p className="text-[10px] text-slate-400">Overview of registered counters</p>
              </div>
              <Link href="/stocks" className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300">
                Manage counters &rarr;
              </Link>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-10 w-full rounded-lg bg-slate-900/50 animate-pulse" />
                ))}
              </div>
            ) : stocks.length === 0 ? (
              <p className="text-slate-500 text-xs py-2">No stocks registered.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {stocks.slice(0, 4).map((stock) => {
                  const isPositive = stock.summary.priceChange >= 0;
                  return (
                    <div
                      key={stock.id}
                      className="flex items-center justify-between p-2.5 bg-slate-900/30 hover:bg-slate-900/60 border border-slate-850 rounded-lg transition-all"
                    >
                      <div className="flex items-center space-x-2">
                        <div className="h-7 w-7 rounded bg-slate-850 flex items-center justify-center text-slate-200 text-xs font-bold">
                          {stock.symbol}
                        </div>
                        <span className="text-[11px] font-medium text-slate-300 truncate max-w-[100px]">{stock.name}</span>
                      </div>

                      <div className="text-right flex flex-col items-end">
                        {stock.summary.totalPriceRecords > 0 ? (
                          <>
                            <span className="text-[11px] font-extrabold text-slate-200">
                              ${stock.summary.latestPrice.toFixed(2)}
                            </span>
                            <span className={`text-[9px] font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isPositive ? '+' : ''}{stock.summary.priceChange.toFixed(2)} ({isPositive ? '+' : ''}{stock.summary.priceChangePercent.toFixed(2)}%)
                            </span>
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-500">No prices</span>
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
        <div className="bg-slate-900/20 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white">Manual CRUD Shortcuts</h2>
            <p className="text-xs text-slate-400 mt-1">Quick pathways to perform management operations</p>
          </div>

          <div className="space-y-4">
            <Link
              href="/stocks"
              className="flex items-center p-4 bg-gradient-to-tr from-slate-900 to-indigo-950/20 border border-slate-800 hover:border-indigo-500/30 rounded-xl group transition-all"
            >
              <div className="h-10 w-10 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center mr-4 group-hover:scale-110 transition-transform">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors">Register Stock Tickers</h4>
                <p className="text-xs text-slate-400 mt-0.5">Add, Edit or Delete ticker names and categories</p>
              </div>
            </Link>

            <Link
              href="/prices"
              className="flex items-center p-4 bg-gradient-to-tr from-slate-900 to-emerald-950/20 border border-slate-800 hover:border-emerald-500/30 rounded-xl group transition-all"
            >
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mr-4 group-hover:scale-110 transition-transform">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 11l3-3m0 0l3 3m-3-3v8m0-13a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-slate-200 group-hover:text-emerald-300 transition-colors">Record Daily Price</h4>
                <p className="text-xs text-slate-400 mt-0.5">Manually input price models and volumes per date</p>
              </div>
            </Link>

            <Link
              href="/transactions"
              className="flex items-center p-4 bg-gradient-to-tr from-slate-900 to-indigo-950/20 border border-slate-800 hover:border-indigo-500/30 rounded-xl group transition-all"
            >
              <div className="h-10 w-10 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center mr-4 group-hover:scale-110 transition-transform">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors">Record Trade Transactions</h4>
                <p className="text-xs text-slate-400 mt-0.5">Log Purchases or Sales with cost validations</p>
              </div>
            </Link>
          </div>

          <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800/80 space-y-2">
            <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Multi-Tenancy Check</h5>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Every ledger trade and aggregated valuation is stamp-isolated under active user identity <code className="bg-slate-800 px-1 py-0.5 rounded text-indigo-300 font-mono text-[10px]">mock-user-123</code>. Cross-portfolio leakage is structurally prevented at the relation filter boundaries.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
