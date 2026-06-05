'use client';

import { API_BASE } from '../../lib/api';

import React, { useState, useEffect, useCallback } from 'react';
import ExportActionsDropdown from '../../components/ExportActionsDropdown';

interface StockOption {
  id: string;
  name: string;
  symbol: string;
  category: string;
}

interface Transaction {
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

export default function TransactionsPage() {
  const [activeTab, setActiveTab] = useState<'BUY' | 'SELL'>('BUY');
  const [stocks, setStocks] = useState<StockOption[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingStocks, setLoadingStocks] = useState(true);
  const [loadingLedger, setLoadingLedger] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Form State
  const [selectedStockId, setSelectedStockId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [txDate, setTxDate] = useState('');

  // Notifications
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Get localized today date string (YYYY-MM-DD)
  const getTodayString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Fetch registered stocks for pre-filling logical drop-downs [NFR2.2]
  useEffect(() => {
    async function loadStocks() {
      try {
        const res = await fetch(`${API_BASE}/api/stocks`,
{
          credentials: 'include'
        });
        const json = await res.json();
        if (json.success && json.data.length > 0) {
          setStocks(json.data);
          setSelectedStockId(json.data[0].id); // Prefill logical first choice
        }
      } catch (err) {
        console.error('Failed to load stocks for select box:', err);
      } finally {
        setLoadingStocks(false);
      }
    }
    loadStocks();
    setTxDate(getTodayString());
  }, []);

  // Fetch Transaction Ledger history with date-range filters [FR5]
  const fetchLedger = useCallback(async (signal?: AbortSignal) => {
    setLoadingLedger(true);
    setErrorMessage(null); // Clear preceding error on reload attempts
    try {
      let url = `${API_BASE}/api/transactions/history`;
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const res = await fetch(url, { signal, credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setTransactions(json.data);
      } else {
        throw new Error(json.message || 'Failed to retrieve chronological trade history.');
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.name === 'DOMException') {
        // Superseded request, ignore state updates
        return;
      }
      console.error('Failed to fetch ledger rows:', err);
      setErrorMessage(`Failed to retrieve trade history: ${err.message || err}`);
      setTransactions([]); // Reset to clear table on failure
    } finally {
      if (!signal || !signal.aborted) {
        setLoadingLedger(false);
      }
    }
  }, [startDate, endDate]);

  // Trigger ledger reload on date filter change with request cancellation
  useEffect(() => {
    const controller = new AbortController();
    fetchLedger(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchLedger]);

  // Handle transaction recording submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    // Validation Guardrail
    if (!selectedStockId) {
      setErrorMessage('Please select a stock ticker from the list.');
      return;
    }
    if (!quantity || Number(quantity) <= 0) {
      setErrorMessage('Quantity must be strictly greater than 0.');
      return;
    }
    if (!price || Number(price) <= 0) {
      setErrorMessage('Price must be strictly greater than 0.');
      return;
    }
    if (!txDate) {
      setErrorMessage('Please select a transaction date.');
      return;
    }

    setSubmitting(true);
    try {
      const endpoint =
        activeTab === 'BUY'
          ? `${API_BASE}/api/transactions/purchases`
          : `${API_BASE}/api/transactions/sales`;

      const bodyData = {
        stockId: selectedStockId,
        quantity: Number(quantity),
        [activeTab === 'BUY' ? 'purchasePrice' : 'sellPrice']: Number(price),
        [activeTab === 'BUY' ? 'purchaseDate' : 'saleDate']: txDate,
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
        credentials: 'include',
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setSuccessMessage(
          `Successfully recorded ${activeTab === 'BUY' ? 'purchase' : 'sale'} of ${quantity} shares!`
        );
        // Reset numerical inputs
        setQuantity('');
        setPrice('');
        setTxDate(getTodayString());
        // Reload transactions
        fetchLedger();
      } else {
        // Validation/Business error message
        const message =
          json.errors && json.errors.length > 0 ? json.errors[0].message : json.message;
        setErrorMessage(message || 'Failed to submit transaction.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage('Unable to connect to the backend server. Please verify connections.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in text-slate-100">
      {/* Title Header */}
      <div>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 mb-3">
          💼 Trade History & Recording
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Trade History
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Record buys or sells and review trade history.
        </p>
      </div>

      {/* Main Form + Table layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: Record transaction panel */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 shadow-2xl h-fit">
          {/* Dual Tabs for Buy/Sell selection */}
          <div className="grid grid-cols-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800/80 mb-6">
            <button
              onClick={() => {
                setActiveTab('BUY');
                setSuccessMessage(null);
                setErrorMessage(null);
              }}
              className={`py-2 text-xs sm:text-sm font-bold rounded-lg transition-all ${
                activeTab === 'BUY'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📈 Buy Stock
            </button>
            <button
              onClick={() => {
                setActiveTab('SELL');
                setSuccessMessage(null);
                setErrorMessage(null);
              }}
              className={`py-2 text-xs sm:text-sm font-bold rounded-lg transition-all ${
                activeTab === 'SELL'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-950/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📉 Sell Stock
            </button>
          </div>

          <h3 className="text-lg font-bold text-white mb-4">
            {activeTab === 'BUY' ? 'Record a Buy' : 'Record a Sell'}
          </h3>

          {/* Feedback banners */}
          {successMessage && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl text-xs font-semibold mb-4">
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-xs font-semibold mb-4">
              {errorMessage}
            </div>
          )}

          {/* Forms */}
          {loadingStocks ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-10 bg-slate-850 rounded-xl" />
              <div className="h-10 bg-slate-850 rounded-xl" />
              <div className="h-10 bg-slate-850 rounded-xl" />
              <div className="h-12 bg-slate-800 rounded-xl" />
            </div>
          ) : stocks.length === 0 ? (
            <div className="py-6 text-center border border-dashed border-slate-800 rounded-2xl">
              <p className="text-slate-400 text-sm">Please register at least one stock counter first.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Select Stock */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Select Stock
                </label>
                <select
                  value={selectedStockId}
                  onChange={(e) => setSelectedStockId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  {stocks.map((stock) => (
                    <option key={stock.id} value={stock.id}>
                      {stock.symbol} — {stock.name} ({stock.category})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Number of Shares
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 10.50"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                  required
                />
              </div>

              {/* Purchase/Sell Price */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Price per Share ($)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 175.50"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                  required
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Transaction Date
                </label>
                <input
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                  required
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className={`w-full py-3.5 font-bold rounded-xl text-sm transition-all duration-200 flex items-center justify-center text-white ${
                  activeTab === 'BUY'
                    ? 'bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98]'
                    : 'bg-rose-600 hover:bg-rose-500 active:scale-[0.98]'
                } disabled:opacity-50 disabled:pointer-events-none`}
              >
                {submitting ? (
                  <span className="flex items-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Processing Trade...
                  </span>
                ) : activeTab === 'BUY' ? (
                  'Record Buy'
                ) : (
                  'Record Sell'
                )}
              </button>
            </form>
          )}
        </div>

        {/* Right column: Ledger details table */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header & Date filters */}
          <div className="bg-slate-900/20 backdrop-blur-md border border-slate-800/80 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white">Trade Log</h3>
                <p className="text-xs text-slate-400 mt-1">History of all logged buys and sells</p>
              </div>

              {/* Date Filters with live-refresh controls */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-slate-950 border border-slate-850 text-xs text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                  placeholder="Start Date"
                />
                <span className="text-slate-600 text-xs font-bold">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-slate-950 border border-slate-850 text-xs text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                  placeholder="End Date"
                />
                {(startDate || endDate) && (
                  <button
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                    }}
                    className="text-[10px] text-rose-400 hover:text-rose-300 font-bold bg-rose-500/10 border border-rose-500/20 px-2 py-1.5 rounded-lg"
                  >
                    Clear
                  </button>
                )}
                
                <ExportActionsDropdown 
                  reportType="transactions" 
                  startDate={startDate} 
                  endDate={endDate} 
                />
              </div>
            </div>

            {/* Ledger content */}
            {loadingLedger ? (
              <div className="space-y-3 py-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-slate-900/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 border border-dashed border-slate-800 rounded-2xl space-y-3">
                <svg
                  className="h-10 w-10 text-slate-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2"
                  />
                </svg>
                <p className="text-slate-400 text-sm font-semibold">No trade records found within the selected dates.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800/80">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-800/85">
                      <th className="px-4 py-3.5">Type</th>
                      <th className="px-4 py-3.5">Stock Code &amp; Name</th>
                      <th className="px-4 py-3.5 text-right">Quantity</th>
                      <th className="px-4 py-3.5 text-right">Price</th>
                      <th className="px-4 py-3.5 text-right">Date</th>
                      <th className="px-4 py-3.5 text-right">Gains/Losses</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 bg-slate-950/20 text-xs">
                    {transactions.map((tx) => {
                      const isBuy = tx.type === 'BUY';
                      return (
                        <tr key={tx.id} className="hover:bg-slate-900/40 transition-colors">
                          {/* Type badge */}
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                                isBuy
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              }`}
                            >
                              {tx.type}
                            </span>
                          </td>
                          {/* Stock symbol */}
                          <td className="px-4 py-3.5 font-semibold text-slate-200">
                            <div>{tx.symbol}</div>
                            <div className="text-[10px] font-normal text-slate-500 truncate max-w-[120px]">
                              {tx.name}
                            </div>
                          </td>
                          {/* Qty */}
                          <td className="px-4 py-3.5 text-right text-slate-300 font-mono font-medium">
                            {tx.quantity.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 4,
                            })}
                          </td>
                          {/* Price */}
                          <td className="px-4 py-3.5 text-right text-slate-300 font-mono font-medium">
                            ${tx.price.toFixed(2)}
                          </td>
                          {/* Date */}
                          <td className="px-4 py-3.5 text-right text-slate-400 font-medium">
                            {tx.date}
                          </td>
                          {/* P&L */}
                          <td className="px-4 py-3.5 text-right font-mono font-bold">
                            {tx.profitLoss !== null ? (
                              <span
                                className={tx.profitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}
                              >
                                {tx.profitLoss >= 0 ? '+' : ''}
                                ${tx.profitLoss.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
