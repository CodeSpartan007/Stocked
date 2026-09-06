'use client';

import { API_BASE } from '../../lib/api';

import React, { useEffect, useState } from 'react';

interface StockOption {
  id: string;
  name: string;
  symbol: string;
}

interface PriceRecord {
  id: string;
  stockId: string;
  date: string;
  price: number;
  volume: number;
  source: 'manual' | 'api';
  createdAt: string;
}

interface PaginationInfo {
  totalItems: number;
  totalPages: number;
  currentPage: number;
  limit: number;
}

export default function DailyPricesRecording() {
  const [stocks, setStocks] = useState<StockOption[]>([]);
  const [selectedStockId, setSelectedStockId] = useState<string>('');
  const [priceHistory, setPriceHistory] = useState<PriceRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    totalItems: 0,
    totalPages: 1,
    currentPage: 1,
    limit: 10,
  });

  const [loadingStocks, setLoadingStocks] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Form states
  const [formDate, setFormDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formPrice, setFormPrice] = useState<string>('');
  const [formVolume, setFormVolume] = useState<string>('');
  const [formErrors, setFormErrors] = useState<{ field: string; message: string }[]>([]);
  const [formSuccessMessage, setFormSuccessMessage] = useState<string | null>(null);

  // Edit states
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editPrice, setEditPrice] = useState<string>('');
  const [editVolume, setEditVolume] = useState<string>('');
  const [editErrors, setEditErrors] = useState<{ field: string; message: string }[]>([]);

  // Fetch price history with pagination
  const fetchPriceHistory = async (stockId: string, pageNum = 1) => {
    if (!stockId) return;

    try {
      setLoadingHistory(true);
      const response = await fetch(`${API_BASE}/api/prices/${stockId}?page=${pageNum}&limit=5`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to retrieve price recordings.');
      }
      const json = await response.json();
      if (json.success) {
        setPriceHistory(json.data.prices);
        setPagination(json.data.pagination);
      }
    } catch (err: unknown) {
      console.error(err);
      setGlobalError('Failed to synchronize historical daily logs.');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    let active = true;

    async function loadStocksList() {
      try {
        const response = await fetch(`${API_BASE}/api/stocks`, {
          credentials: 'include'
        });
        if (!response.ok) {
          throw new Error('Failed to retrieve stocks list.');
        }
        const json = await response.json();
        if (active && json.success) {
          setStocks(json.data);
          if (json.data.length > 0) {
            setSelectedStockId(json.data[0].id);
          }
        }
      } catch (err: unknown) {
        console.error(err);
        setGlobalError('Failed to load registered stocks.');
      } finally {
        if (active) setLoadingStocks(false);
      }
    }

    loadStocksList();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedStockId) {
      return;
    }

    let active = true;

    async function loadPriceHistory() {
      try {
        const response = await fetch(`${API_BASE}/api/prices/${selectedStockId}?page=1&limit=5`, {
          credentials: 'include'
        });
        if (!response.ok) {
          throw new Error('Failed to retrieve price recordings.');
        }
        const json = await response.json();
        if (active && json.success) {
          setPriceHistory(json.data.prices);
          setPagination(json.data.pagination);
        }
      } catch (err: unknown) {
        if (active) {
          console.error(err);
          setGlobalError('Failed to synchronize historical daily logs.');
        }
      } finally {
        if (active) {
          setLoadingHistory(false);
        }
      }
    }

    loadPriceHistory();

    return () => {
      active = false;
    };
  }, [selectedStockId]);

  // Handle Recording Creation
  const handleRecordPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors([]);
    setFormSuccessMessage(null);

    if (!selectedStockId) {
      setFormErrors([{ field: 'stockId', message: 'Please select a stock.' }]);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockId: selectedStockId,
          date: formDate,
          price: parseFloat(formPrice),
          volume: parseInt(formVolume),
        }),
        credentials: 'include',
      });

      const json = await response.json();
      if (response.ok && json.success) {
        setFormPrice('');
        setFormVolume('');
        setFormSuccessMessage('Daily price record logged successfully!');
        fetchPriceHistory(selectedStockId, 1);
      } else {
        if (json.errors) {
          setFormErrors(json.errors);
        } else {
          setGlobalError(json.message || 'Failed to submit price entry.');
        }
      }
    } catch (err: unknown) {
      console.error(err);
      setGlobalError('Network connection failure while sending price record.');
    }
  };

  // Enable inline editing mode
  const startEditing = (record: PriceRecord) => {
    setEditingRecordId(record.id);
    setEditDate(record.date);
    setEditPrice(record.price.toString());
    setEditVolume(record.volume.toString());
    setEditErrors([]);
  };

  const cancelEditing = () => {
    setEditingRecordId(null);
    setEditErrors([]);
  };

  // Submit Price Update
  const handleUpdatePrice = async (recordId: string) => {
    setEditErrors([]);

    try {
      const response = await fetch(`${API_BASE}/api/prices/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: editDate,
          price: parseFloat(editPrice),
          volume: parseInt(editVolume),
        }),
        credentials: 'include',
      });

      const json = await response.json();
      if (response.ok && json.success) {
        setEditingRecordId(null);
        fetchPriceHistory(selectedStockId, pagination.currentPage);
      } else {
        if (json.errors) {
          setEditErrors(json.errors);
        } else {
          setGlobalError(json.message || 'Failed to update record.');
        }
      }
    } catch (err: unknown) {
      console.error(err);
      setGlobalError('Network connection failure while updating price record.');
    }
  };

  // Handle Price Deletion
  const handleDeletePrice = async (recordId: string) => {
    if (!confirm('Are you sure you want to delete this price record?')) return;

    try {
      const response = await fetch(`${API_BASE}/api/prices/${recordId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const json = await response.json();
      if (response.ok && json.success) {
        fetchPriceHistory(selectedStockId, pagination.currentPage);
      } else {
        setGlobalError(json.message || 'Failed to remove price record.');
      }
    } catch (err: unknown) {
      console.error(err);
      setGlobalError('Network connection failure while deleting record.');
    }
  };

  const getFormError = (fieldName: string) => {
    return formErrors.find((err) => err.field === fieldName)?.message;
  };

  const getEditError = (fieldName: string) => {
    return editErrors.find((err) => err.field === fieldName)?.message;
  };

  return (
    <div className="space-y-8 animate-fade-in text-main">
      {/* Header section */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-main">Daily Price Recording</h1>
        <p className="text-sm text-muted mt-1">
          Manually input stock prices and daily volumes. View and update entries in real-time.
        </p>
      </div>

      {globalError && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-sm font-semibold flex items-center">
          <svg className="h-5 w-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {globalError}
        </div>
      )}

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Recording Form */}
        <div className="bg-surface backdrop-blur-xl border border-subtle rounded-3xl p-6 shadow-xl space-y-6">
          <div>
            <h2 className="text-lg font-bold text-main">Add Price Record</h2>
          </div>

          {loadingStocks ? (
            <div className="h-48 w-full rounded-2xl bg-surface-elevated animate-pulse border border-subtle" />
          ) : stocks.length === 0 ? (
            <div className="text-center py-6 bg-surface-elevated rounded-2xl border border-subtle px-4 space-y-3">
              <p className="text-muted text-xs font-semibold">No stocks registered in catalog.</p>
              <p className="text-muted text-[11px] leading-relaxed">
                You must register at least one stock before logging daily prices.
              </p>
            </div>
          ) : (
            <form onSubmit={handleRecordPrice} className="space-y-4">
              {/* Stock Selector */}
              <div>
                <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">
                  Select Stock
                </label>
                <select
                  value={selectedStockId}
                  onChange={(e) => setSelectedStockId(e.target.value)}
                  className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl px-4 py-2.5 text-sm text-main focus:outline-none transition-all cursor-pointer font-semibold"
                >
                  {stocks.map((stock) => (
                    <option key={stock.id} value={stock.id}>
                      {stock.symbol} — {stock.name}
                    </option>
                  ))}
                </select>
                {getFormError('stockId') && (
                  <p className="text-rose-500 text-xs mt-1.5 font-medium">{getFormError('stockId')}</p>
                )}
              </div>

              {/* Date Selector */}
              <div>
                <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">
                  Trading Date
                </label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl px-4 py-2.5 text-sm text-main focus:outline-none transition-all cursor-pointer font-mono"
                />
                {getFormError('date') && (
                  <p className="text-rose-500 text-xs mt-1.5 font-medium">{getFormError('date')}</p>
                )}
              </div>

              {/* Price field */}
              <div>
                <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">
                  Price per Share ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  placeholder="e.g. 178.45"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl px-4 py-2.5 text-sm text-main placeholder-muted focus:outline-none transition-all font-mono"
                />
                {getFormError('price') && (
                  <p className="text-rose-500 text-xs mt-1.5 font-medium">{getFormError('price')}</p>
                )}
              </div>

              {/* Volume field */}
              <div>
                <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">
                  Number of Shares Traded
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  placeholder="e.g. 52000000"
                  value={formVolume}
                  onChange={(e) => setFormVolume(e.target.value)}
                  className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl px-4 py-2.5 text-sm text-main placeholder-muted focus:outline-none transition-all font-mono"
                />
                {getFormError('volume') && (
                  <p className="text-rose-500 text-xs mt-1.5 font-medium">{getFormError('volume')}</p>
                )}
              </div>

              {/* Success / Info states */}
              {formSuccessMessage && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-semibold flex items-center">
                  <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {formSuccessMessage}
                </div>
              )}

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-black text-[#00272b] bg-[#e0ff4f] hover:bg-[#d2f33b] transition-all duration-200 shadow-md cursor-pointer active:scale-98"
              >
                Save Price Record
              </button>
            </form>
          )}
        </div>

        {/* Right Column: Historical Logs Panel */}
        <div className="lg:col-span-2 bg-surface backdrop-blur-md border border-subtle rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-main">Price History Over Time</h2>
              <p className="text-xs text-muted mt-1">View paginated daily logs, edit, or remove records.</p>
            </div>

            {/* Filter by Stock selector */}
            {stocks.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-muted uppercase tracking-wider">Viewing:</span>
                <select
                  value={selectedStockId}
                  onChange={(e) => setSelectedStockId(e.target.value)}
                  className="bg-surface-elevated border border-subtle rounded-xl px-3 py-2 text-xs text-main focus:outline-none transition-all cursor-pointer font-semibold"
                >
                  {stocks.map((stock) => (
                    <option key={stock.id} value={stock.id}>
                      {stock.symbol}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Table displaying price logs */}
          {loadingHistory ? (
            <div className="space-y-4 py-10">
              <div className="h-6 w-full rounded bg-surface-elevated animate-pulse" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 w-full rounded bg-surface-elevated animate-pulse" />
              ))}
            </div>
          ) : priceHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 border border-dashed border-subtle rounded-2xl text-center p-6">
              <svg className="h-12 w-12 text-muted/60 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h4 className="text-sm font-bold text-main">No Price History Found</h4>
              <p className="text-xs text-muted mt-1.5 max-w-xs">
                No price history is recorded for this stock yet. Save a price above to get started!
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="overflow-x-auto rounded-2xl border border-subtle">
                <table className="min-w-full divide-y divide-subtle bg-surface">
                  <thead className="bg-surface-elevated">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-secondary uppercase tracking-wider">Date</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-secondary uppercase tracking-wider">Price</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-secondary uppercase tracking-wider">Volume Traded</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-secondary uppercase tracking-wider">Price Type</th>
                      <th className="px-6 py-4 text-right text-xs font-bold text-secondary uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {priceHistory.map((record) => {
                      const isEditing = editingRecordId === record.id;

                      if (isEditing) {
                        return (
                          <tr key={record.id} className="bg-[#e0ff4f]/10">
                            {/* Inline Editing Mode Row */}
                            <td className="px-6 py-3 text-sm text-main">
                              <input
                                type="date"
                                value={editDate}
                                onChange={(e) => setEditDate(e.target.value)}
                                className="bg-surface-elevated border border-subtle rounded px-2 py-1 text-xs text-main w-32 focus:outline-none"
                              />
                              {getEditError('date') && (
                                <p className="text-rose-500 text-[10px] mt-1 font-semibold">{getEditError('date')}</p>
                              )}
                            </td>
                            <td className="px-6 py-3 text-sm text-main">
                              <input
                                type="number"
                                step="0.01"
                                value={editPrice}
                                onChange={(e) => setEditPrice(e.target.value)}
                                className="bg-surface-elevated border border-subtle rounded px-2 py-1 text-xs text-main w-24 focus:outline-none font-mono"
                              />
                              {getEditError('price') && (
                                <p className="text-rose-500 text-[10px] mt-1 font-semibold">{getEditError('price')}</p>
                              )}
                            </td>
                            <td className="px-6 py-3 text-sm text-main">
                              <input
                                type="number"
                                value={editVolume}
                                onChange={(e) => setEditVolume(e.target.value)}
                                className="bg-surface-elevated border border-subtle rounded px-2 py-1 text-xs text-main w-28 focus:outline-none font-mono"
                              />
                              {getEditError('volume') && (
                                <p className="text-rose-500 text-[10px] mt-1 font-semibold">{getEditError('volume')}</p>
                              )}
                            </td>
                            <td className="px-6 py-3 text-sm text-main">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-surface-elevated border border-subtle text-muted">
                                {record.source}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-right text-xs font-semibold space-x-2">
                              <button
                                onClick={() => handleUpdatePrice(record.id)}
                                className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                              >
                                Save
                              </button>
                              <button onClick={cancelEditing} className="text-muted hover:text-main">
                                Cancel
                              </button>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={record.id} className="hover:bg-surface-hover transition-all">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-secondary">
                            {record.date}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-main font-mono">
                            ${Number(record.price).toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary font-mono">
                            {Number(record.volume).toLocaleString()} shares
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {record.source === 'api' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                Live Network Price
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                Added by You
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-semibold space-x-3">
                            <button
                              onClick={() => startEditing(record)}
                              className="text-[#00272b] dark:text-[#e0ff4f] hover:underline transition-colors font-bold cursor-pointer"
                              title="Edit Price Record"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeletePrice(record.id)}
                              className="text-muted hover:text-rose-500 transition-colors cursor-pointer"
                              title="Delete Price Record"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Explicit, Interactive Pagination Controls */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-subtle pt-4 px-2">
                  <div className="text-xs text-muted">
                    Showing page <span className="font-bold text-main">{pagination.currentPage}</span> of{' '}
                    <span className="font-bold text-main">{pagination.totalPages}</span> (
                    <span className="font-bold text-main">{pagination.totalItems}</span> records total)
                  </div>

                  <nav className="inline-flex rounded-xl bg-surface-elevated border border-subtle p-1 space-x-1">
                    {/* Previous Button */}
                    <button
                      onClick={() => fetchPriceHistory(selectedStockId, pagination.currentPage - 1)}
                      disabled={pagination.currentPage === 1}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-hover text-secondary cursor-pointer"
                    >
                      &larr; Prev
                    </button>

                    {/* Numeric buttons */}
                    {Array.from({ length: pagination.totalPages }, (_, index) => {
                      const pageNum = index + 1;
                      const active = pagination.currentPage === pageNum;

                      return (
                        <button
                          key={pageNum}
                          onClick={() => fetchPriceHistory(selectedStockId, pageNum)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            active
                              ? 'bg-[#e0ff4f] text-[#00272b] shadow-sm font-black'
                              : 'hover:bg-surface-hover text-muted hover:text-main'
                          } cursor-pointer`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    {/* Next Button */}
                    <button
                      onClick={() => fetchPriceHistory(selectedStockId, pagination.currentPage + 1)}
                      disabled={pagination.currentPage === pagination.totalPages}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-hover text-secondary cursor-pointer"
                    >
                      Next &rarr;
                    </button>
                  </nav>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
