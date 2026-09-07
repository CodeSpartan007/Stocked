'use client';

import { API_BASE } from '../../lib/api';

import React, { useState, useEffect, useCallback } from 'react';
import ExportActionsDropdown from '../../components/ExportActionsDropdown';
import { Pencil, Trash2, X, AlertCircle } from 'lucide-react';
import { useCurrency } from '@/app/context/CurrencyContext';

interface StockOption {
  id: string;
  name: string;
  symbol: string;
  category: string;
  currency?: 'USD' | 'KES';
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
  currency?: 'USD' | 'KES';
  nativePrice?: number;
  convertedPrice?: number;
  nativeProfitLoss?: number | null;
  convertedProfitLoss?: number | null;
}

function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function TransactionsPage() {
  const { baseCurrency, convert, formatMoney } = useCurrency();
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
  const [txDate, setTxDate] = useState(getTodayString);

  const selectedStock = stocks.find((s) => s.id === selectedStockId);
  const stockCurr = selectedStock?.currency || 'USD';

  // Notifications
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Transaction Edit Modal state
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editQuantity, setEditQuantity] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Fetch registered stocks
  useEffect(() => {
    async function loadStocks() {
      try {
        const res = await fetch(`${API_BASE}/api/stocks`, {
          credentials: 'include'
        });
        const json = await res.json();
        if (json.success && json.data.length > 0) {
          setStocks(json.data);
          setSelectedStockId(json.data[0].id);
        }
      } catch (err) {
        console.error('Failed to load stocks for select box:', err);
      } finally {
        setLoadingStocks(false);
      }
    }
    loadStocks();
  }, []);

  // Fetch Transaction Ledger history with date-range filters
  const fetchLedger = useCallback(async (signal?: AbortSignal) => {
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
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch transaction records:', err);
    } finally {
      setLoadingLedger(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadLedger() {
      try {
        let url = `${API_BASE}/api/transactions/history`;
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);

        if (params.toString()) {
          url += `?${params.toString()}`;
        }

        const res = await fetch(url, { signal: controller.signal, credentials: 'include' });
        const json = await res.json();
        if (json.success) {
          setTransactions(json.data);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        console.error('Failed to fetch transaction records:', err);
      } finally {
        setLoadingLedger(false);
      }
    }

    loadLedger();

    return () => {
      controller.abort();
    };
  }, [startDate, endDate]);

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    // Frontend validations
    if (!selectedStockId) {
      setErrorMessage('Please select a stock counter.');
      return;
    }
    if (Number(quantity) <= 0) {
      setErrorMessage('Quantity must be a positive number greater than 0.');
      return;
    }
    if (Number(price) <= 0) {
      setErrorMessage('Price per share must be greater than 0.');
      return;
    }
    if (!txDate) {
      setErrorMessage('Please specify the transaction execution date.');
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
        setQuantity('');
        setPrice('');
        setTxDate(getTodayString());
        setLoadingLedger(true);
        fetchLedger();
      } else {
        const message =
          json.errors && json.errors.length > 0 ? json.errors[0].message : json.message;
        setErrorMessage(message || 'Failed to submit transaction.');
      }
    } catch (err: unknown) {
      console.error(err);
      setErrorMessage('Unable to connect to the backend server. Please verify connections.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setEditQuantity(String(tx.quantity));
    setEditPrice(String(tx.price));
    setEditDate(tx.date);
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;

    setEditSubmitting(true);
    setEditError(null);

    const isBuy = editingTx.type === 'BUY';
    const endpoint = isBuy
      ? `${API_BASE}/api/transactions/purchases/${editingTx.id}`
      : `${API_BASE}/api/transactions/sales/${editingTx.id}`;

    const bodyPayload = isBuy
      ? {
          quantity: Number(editQuantity),
          purchasePrice: Number(editPrice),
          purchaseDate: editDate,
        }
      : {
          quantity: Number(editQuantity),
          sellPrice: Number(editPrice),
          saleDate: editDate,
        };

    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
        credentials: 'include',
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setEditingTx(null);
        setSuccessMessage(`Successfully updated ${isBuy ? 'buy' : 'sell'} transaction for ${editingTx.symbol}.`);
        setLoadingLedger(true);
        fetchLedger();
      } else {
        const msg = json.errors?.[0]?.message || json.message || 'Failed to update transaction.';
        setEditError(msg);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error updating transaction.';
      setEditError(msg);
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteTx = async (tx: Transaction) => {
    const isBuy = tx.type === 'BUY';
    const confirmDelete = window.confirm(
      `Are you sure you want to delete this ${isBuy ? 'BUY' : 'SELL'} record of ${tx.quantity} shares of ${tx.symbol}?`
    );
    if (!confirmDelete) return;

    const endpoint = isBuy
      ? `${API_BASE}/api/transactions/purchases/${tx.id}`
      : `${API_BASE}/api/transactions/sales/${tx.id}`;

    try {
      const res = await fetch(endpoint, {
        method: 'DELETE',
        credentials: 'include',
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setSuccessMessage(`Successfully deleted ${isBuy ? 'buy' : 'sell'} transaction for ${tx.symbol}.`);
        setLoadingLedger(true);
        fetchLedger();
      } else {
        const msg = json.errors?.[0]?.message || json.message || 'Failed to delete transaction.';
        alert(msg);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Network error deleting transaction: ${msg}`);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in text-main">
      {/* Title Header */}
      <div>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-surface-elevated border border-subtle text-[#00272b] dark:text-[#e0ff4f] mb-3">
          💼 Trade History & Recording
        </span>
        <h1 className="text-3xl font-black tracking-tight text-main sm:text-4xl">
          Trade History
        </h1>
        <p className="text-muted text-sm mt-1">
          Record buys or sells and review trade history.
        </p>
      </div>

      {/* Main Form + Table layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: Record transaction panel */}
        <div className="bg-surface backdrop-blur-xl border border-subtle rounded-3xl p-6 shadow-2xl h-fit">
          {/* Dual Tabs for Buy/Sell selection */}
          <div className="grid grid-cols-2 bg-surface-elevated p-1.5 rounded-xl border border-subtle mb-6">
            <button
              type="button"
              onClick={() => {
                setActiveTab('BUY');
                setSuccessMessage(null);
                setErrorMessage(null);
              }}
              className={`py-2 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === 'BUY'
                  ? 'bg-[#e0ff4f] text-[#00272b] font-black shadow-md'
                  : 'text-muted hover:text-main'
              }`}
            >
              📈 Buy Stock
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('SELL');
                setSuccessMessage(null);
                setErrorMessage(null);
              }}
              className={`py-2 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === 'SELL'
                  ? 'bg-rose-600 text-white font-black shadow-md shadow-rose-950/20'
                  : 'text-muted hover:text-main'
              }`}
            >
              📉 Sell Stock
            </button>
          </div>

          <h3 className="text-lg font-bold text-main mb-4">
            {activeTab === 'BUY' ? 'Record a Buy' : 'Record a Sell'}
          </h3>

          {/* Feedback banners */}
          {successMessage && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-semibold mb-4">
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-semibold mb-4">
              {errorMessage}
            </div>
          )}

          {/* Forms */}
          {loadingStocks ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-10 bg-surface-elevated rounded-xl" />
              <div className="h-10 bg-surface-elevated rounded-xl" />
              <div className="h-10 bg-surface-elevated rounded-xl" />
              <div className="h-12 bg-surface-elevated rounded-xl" />
            </div>
          ) : stocks.length === 0 ? (
            <div className="py-6 text-center border border-dashed border-subtle rounded-2xl">
              <p className="text-muted text-sm">Please register at least one stock counter first.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Select Stock */}
              <div>
                <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">
                  Select Stock
                </label>
                <select
                  value={selectedStockId}
                  onChange={(e) => setSelectedStockId(e.target.value)}
                  className="w-full bg-surface-elevated border border-subtle rounded-xl px-4 py-3 text-sm text-main focus:outline-none focus:border-[#e0ff4f] transition-colors font-semibold"
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
                <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">
                  Number of Shares
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 10.50"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full bg-surface-elevated border border-subtle rounded-xl px-4 py-3 text-sm text-main focus:outline-none focus:border-[#e0ff4f] transition-colors font-mono"
                  required
                />
              </div>

              {/* Purchase/Sell Price */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider">
                    Price per Share ({stockCurr === 'KES' ? 'KSh' : '$'} - {stockCurr})
                  </label>
                  {stockCurr !== baseCurrency && Number(price) > 0 && (
                    <span className="text-[11px] font-mono text-muted">
                      ≈ {formatMoney(convert(Number(price), stockCurr, baseCurrency), baseCurrency)}
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 175.50"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full bg-surface-elevated border border-subtle rounded-xl px-4 py-3 text-sm text-main focus:outline-none focus:border-[#e0ff4f] transition-colors font-mono"
                  required
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">
                  Transaction Date
                </label>
                <input
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className="w-full bg-surface-elevated border border-subtle rounded-xl px-4 py-3 text-sm text-main focus:outline-none focus:border-[#e0ff4f] transition-colors font-mono"
                  required
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className={`w-full py-3.5 font-black rounded-xl text-sm transition-all duration-200 flex items-center justify-center cursor-pointer ${
                  activeTab === 'BUY'
                    ? 'bg-[#e0ff4f] text-[#00272b] hover:bg-[#d2f33b] shadow-md'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-md'
                } disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]`}
              >
                {submitting ? (
                  <span className="flex items-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5"
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
          <div className="bg-surface backdrop-blur-md border border-subtle rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-main">Trade Log</h3>
                <p className="text-xs text-muted mt-1">History of all logged buys and sells</p>
              </div>

              {/* Date Filters with live-refresh controls */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-surface-elevated border border-subtle text-xs text-main rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#e0ff4f] font-mono"
                  placeholder="Start Date"
                />
                <span className="text-muted text-xs font-bold">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-surface-elevated border border-subtle text-xs text-main rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#e0ff4f] font-mono"
                  placeholder="End Date"
                />
                {(startDate || endDate) && (
                  <button
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                    }}
                    className="text-[10px] text-rose-500 hover:text-rose-400 font-bold bg-rose-500/10 border border-rose-500/20 px-2 py-1.5 rounded-lg cursor-pointer"
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
                  <div key={i} className="h-12 bg-surface-elevated rounded-xl animate-pulse" />
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 border border-dashed border-subtle rounded-2xl space-y-3">
                <svg
                  className="h-10 w-10 text-muted/60"
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
                <p className="text-muted text-sm font-semibold">No trade records found within the selected dates.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-subtle">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-elevated text-secondary text-[10px] font-bold uppercase tracking-wider border-b border-subtle">
                      <th className="px-4 py-3.5">Type</th>
                      <th className="px-4 py-3.5">Stock Code &amp; Name</th>
                      <th className="px-4 py-3.5 text-right">Quantity</th>
                      <th className="px-4 py-3.5 text-right">Price</th>
                      <th className="px-4 py-3.5 text-right">Date</th>
                      <th className="px-4 py-3.5 text-right">Gains/Losses</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle text-xs">
                    {transactions.map((tx) => {
                      const isBuy = tx.type === 'BUY';
                      return (
                        <tr key={tx.id} className="hover:bg-surface-hover transition-colors">
                          {/* Type badge */}
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded text-[10px] font-black border ${
                                isBuy
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                              }`}
                            >
                              {tx.type}
                            </span>
                          </td>
                          {/* Stock symbol */}
                          <td className="px-4 py-3.5 font-semibold text-main">
                            <div className="flex items-center gap-1.5 font-mono">
                              <span>{tx.symbol}</span>
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-surface-elevated border border-subtle text-muted uppercase">
                                {tx.currency || 'USD'}
                              </span>
                            </div>
                            <div className="text-[10px] font-normal text-muted truncate max-w-[120px]">
                              {tx.name}
                            </div>
                          </td>
                          {/* Qty */}
                          <td className="px-4 py-3.5 text-right text-secondary font-mono font-medium">
                            {tx.quantity.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 4,
                            })}
                          </td>
                          {/* Price */}
                          <td className="px-4 py-3.5 text-right text-secondary font-mono font-medium">
                            <div>{formatMoney(tx.nativePrice ?? tx.price, tx.currency || 'USD')}</div>
                            {tx.currency && tx.currency !== baseCurrency && (
                              <div className="text-[10px] text-muted font-normal">
                                ≈ {formatMoney(tx.convertedPrice ?? convert(tx.price, tx.currency, baseCurrency), baseCurrency)}
                              </div>
                            )}
                          </td>
                          {/* Date */}
                          <td className="px-4 py-3.5 text-right text-muted font-medium">
                            {tx.date}
                          </td>
                          {/* P&L */}
                          <td className="px-4 py-3.5 text-right font-mono font-bold">
                            {tx.profitLoss !== null ? (
                              (() => {
                                const displayPL = tx.convertedProfitLoss ?? (tx.currency ? convert(tx.profitLoss, tx.currency, baseCurrency) : tx.profitLoss);
                                const isPos = displayPL >= 0;
                                return (
                                  <div>
                                    <span
                                      className={isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
                                    >
                                      {isPos ? '+' : ''}
                                      {formatMoney(displayPL, baseCurrency)}
                                    </span>
                                    {tx.currency && tx.currency !== baseCurrency && tx.nativeProfitLoss !== null && tx.nativeProfitLoss !== undefined && (
                                      <div className="text-[10px] text-muted font-normal">
                                        Native: {tx.nativeProfitLoss >= 0 ? '+' : ''}{formatMoney(tx.nativeProfitLoss, tx.currency)}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          {/* Actions */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(tx)}
                                className="p-1 rounded-lg text-muted hover:text-main hover:bg-surface-elevated transition-colors cursor-pointer"
                                title="Edit transaction"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTx(tx)}
                                className="p-1 rounded-lg text-muted hover:text-rose-500 hover:bg-surface-elevated transition-colors cursor-pointer"
                                title="Delete transaction"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
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

      {/* Edit Transaction Modal */}
      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-subtle rounded-2xl p-6 shadow-2xl w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-subtle pb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex px-2 py-0.5 rounded text-[10px] font-black border ${
                    editingTx.type === 'BUY'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                  }`}
                >
                  {editingTx.type}
                </span>
                <h3 className="text-sm font-bold text-main">
                  Edit {editingTx.symbol} ({editingTx.name})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="text-muted hover:text-main p-1 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
                  Quantity (Shares)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(e.target.value)}
                  required
                  className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl px-3.5 py-2 text-xs text-main focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
                  Price ({editingTx.currency === 'KES' ? 'KSh' : '$'} - {editingTx.currency || 'USD'})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  required
                  className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl px-3.5 py-2 text-xs text-main focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
                  Transaction Date
                </label>
                <input
                  type="date"
                  max={getTodayString()}
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  required
                  className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl px-3.5 py-2 text-xs text-main focus:outline-none font-mono cursor-pointer"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  className="px-4 py-2 text-xs font-semibold text-muted hover:text-main bg-surface-elevated hover:bg-surface-hover rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className={`px-4 py-2 text-xs font-black rounded-xl transition-colors disabled:opacity-50 cursor-pointer shadow-sm ${
                    editingTx.type === 'BUY'
                      ? 'bg-[#e0ff4f] text-[#00272b] hover:bg-[#d2f33b]'
                      : 'bg-rose-600 text-white hover:bg-rose-500'
                  }`}
                >
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
