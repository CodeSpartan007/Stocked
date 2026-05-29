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

export default function Dashboard() {
  const [stocks, setStocks] = useState<StockSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDashboardStats() {
      try {
        const response = await fetch('http://localhost:5001/api/stocks');
        if (!response.ok) {
          throw new Error('Failed to fetch stock statistics.');
        }
        const json = await response.json();
        if (json.success) {
          setStocks(json.data);
        } else {
          throw new Error(json.message || 'Failed to retrieve stats.');
        }
      } catch (err: any) {
        console.error(err);
        setError('Unable to load real-time database indicators. Is the backend server running?');
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardStats();
  }, []);

  const totalStocks = stocks.length;
  const totalPriceRecords = stocks.reduce((acc, curr) => acc + curr.summary.totalPriceRecords, 0);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Upper Welcome Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-indigo-600 via-indigo-900 to-emerald-950 p-8 sm:p-10 shadow-2xl border border-indigo-500/20">
        <div className="absolute right-0 bottom-0 top-0 w-1/2 bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none" />
        <div className="relative z-10 space-y-3 max-w-2xl">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            📊 Capital Market System — Phase 1
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Welcome back, <span className="bg-gradient-to-r from-emerald-300 to-teal-200 bg-clip-text text-transparent">Developer</span>!
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Monitor and record capital market tickers and historical price models. Add custom stock counters, record trading activity logs manually, and verify validation schemas in real-time.
          </p>
        </div>
      </div>

      {/* Database Quick Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 flex items-center justify-between shadow-lg group hover:border-indigo-500/40 transition-all duration-300">
          <div>
            <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Registered Stocks</p>
            <h3 className="text-3xl font-black text-white mt-1 group-hover:scale-105 transition-transform duration-200 origin-left">
              {loading ? (
                <span className="inline-block w-8 h-8 rounded bg-slate-800 animate-pulse" />
              ) : (
                totalStocks
              )}
            </h3>
            <p className="text-xs font-medium text-emerald-400 mt-2 flex items-center">
              Active stock counters
            </p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
        </div>

        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 flex items-center justify-between shadow-lg group hover:border-indigo-500/40 transition-all duration-300">
          <div>
            <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Price Records</p>
            <h3 className="text-3xl font-black text-white mt-1 group-hover:scale-105 transition-transform duration-200 origin-left">
              {loading ? (
                <span className="inline-block w-8 h-8 rounded bg-slate-800 animate-pulse" />
              ) : (
                totalPriceRecords
              )}
            </h3>
            <p className="text-xs font-medium text-indigo-400 mt-2">
              Aggregated daily logs
            </p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
            </svg>
          </div>
        </div>

        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 flex items-center justify-between shadow-lg group hover:border-indigo-500/40 transition-all duration-300">
          <div>
            <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">System Status</p>
            <h3 className="text-xl font-black text-emerald-400 mt-2.5 flex items-center">
              <span className="h-3 w-3 rounded-full bg-emerald-500 mr-2 animate-ping" />
              Operational
            </h3>
            <p className="text-xs font-medium text-slate-400 mt-2">
              Express API & SQLite DB online
            </p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
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

      {/* Main Grid: Registered Stocks & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Seeded Tickers Quick View */}
        <div className="lg:col-span-2 bg-slate-900/20 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Tracked Stock Tickers</h2>
              <p className="text-xs text-slate-400 mt-1">Overview of registered counters and active daily entries</p>
            </div>
            <Link
              href="/stocks"
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-lg transition-all"
            >
              Manage Stocks &rarr;
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 w-full rounded-xl bg-slate-900 animate-pulse" />
              ))}
            </div>
          ) : stocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 border border-dashed border-slate-800 rounded-xl space-y-2">
              <svg className="h-10 w-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-slate-400 text-sm font-medium">No stock counters registered yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {stocks.map((stock) => {
                const isPositive = stock.summary.priceChange >= 0;
                return (
                  <div
                    key={stock.id}
                    className="flex items-center justify-between p-4 bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800 rounded-xl transition-all group"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center text-slate-200 font-bold group-hover:bg-indigo-500/10 group-hover:text-indigo-300 transition-colors">
                        {stock.symbol}
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-100">{stock.name}</h4>
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 mt-1">
                          {stock.category}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      {stock.summary.totalPriceRecords > 0 ? (
                        <>
                          <p className="font-bold text-slate-100">${stock.summary.latestPrice.toFixed(2)}</p>
                          <span
                            className={`inline-flex items-center text-[11px] font-bold mt-1 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}
                          >
                            {isPositive ? '+' : ''}
                            {stock.summary.priceChange.toFixed(2)} ({isPositive ? '+' : ''}
                            {stock.summary.priceChangePercent.toFixed(2)}%)
                          </span>
                        </>
                      ) : (
                        <p className="text-xs font-semibold text-slate-500">No prices logged</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side: Quick Action Links */}
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
          </div>

          <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800/80">
            <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Multi-Tenancy Check</h5>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Every creation and modification is securely stamped with owner ID <code className="bg-slate-850 px-1 py-0.5 rounded text-indigo-300 font-mono text-[10px]">mock-user-123</code>. Portfolios are completely isolated at the relational schema layer.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
