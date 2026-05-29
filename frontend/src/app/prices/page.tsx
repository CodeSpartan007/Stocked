'use client';

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

  // Fetch stocks list for selection dropdowns
  const fetchStocksList = async () => {
    try {
      setLoadingStocks(true);
      const response = await fetch('http://localhost:5001/api/stocks');
      if (!response.ok) {
        throw new Error('Failed to retrieve stocks list.');
      }
      const json = await response.json();
      if (json.success) {
        setStocks(json.data);
        if (json.data.length > 0) {
          setSelectedStockId(json.data[0].id);
        }
      }
    } catch (err: any) {
      console.error(err);
      setGlobalError('Unable to fetch stock selectors. Is the API backend running?');
    } finally {
      setLoadingStocks(false);
    }
  };

  // Fetch price history with pagination
  const fetchPriceHistory = async (stockId: string, pageNum = 1) => {
    if (!stockId) return;

    try {
      setLoadingHistory(true);
      const response = await fetch(`http://localhost:5001/api/prices/${stockId}?page=${pageNum}&limit=5`);
      if (!response.ok) {
        throw new Error('Failed to retrieve price recordings.');
      }
      const json = await response.json();
      if (json.success) {
        setPriceHistory(json.data.prices);
        setPagination(json.data.pagination);
      }
    } catch (err: any) {
      console.error(err);
      setGlobalError('Failed to synchronize historical daily logs.');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchStocksList();
  }, []);

  useEffect(() => {
    if (selectedStockId) {
      fetchPriceHistory(selectedStockId, 1);
    }
  }, [selectedStockId]);

  // Handle Recording Creation
  const handleRecordPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors([]);
    setFormSuccessMessage(null);

    if (!selectedStockId) {
      setFormErrors([{ field: 'stockId', message: 'Please select a stock ticker.' }]);
      return;
    }

    try {
      const response = await fetch('http://localhost:5001/api/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockId: selectedStockId,
          date: formDate,
          price: parseFloat(formPrice),
          volume: parseInt(formVolume),
        }),
      });

      const json = await response.json();
      if (response.ok && json.success) {
        setFormPrice('');
        setFormVolume('');
        setFormSuccessMessage('Daily price record logged successfully!');
        // Refresh price list
        fetchPriceHistory(selectedStockId, 1);
      } else {
        if (json.errors) {
          setFormErrors(json.errors);
        } else {
          setGlobalError(json.message || 'Failed to submit price entry.');
        }
      }
    } catch (err: any) {
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
      const response = await fetch(`http://localhost:5001/api/prices/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: editDate,
          price: parseFloat(editPrice),
          volume: parseInt(editVolume),
        }),
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
    } catch (err: any) {
      console.error(err);
      setGlobalError('Network connection failure while updating price record.');
    }
  };

  // Handle Price Deletion
  const handleDeletePrice = async (recordId: string) => {
    if (!confirm('Are you sure you want to delete this price record?')) return;

    try {
      const response = await fetch(`http://localhost:5001/api/prices/${recordId}`, {
        method: 'DELETE',
      });

      const json = await response.json();
      if (response.ok && json.success) {
        // Fetch current page again (or previous page if current is now empty)
        const isCurrentPageEmpty = priceHistory.length === 1 && pagination.currentPage > 1;
        fetchPriceHistory(selectedStockId, isCurrentPageEmpty ? pagination.currentPage - 1 : pagination.currentPage);
      } else {
        setGlobalError(json.message || 'Failed to delete record.');
      }
    } catch (err: any) {
      console.error(err);
      setGlobalError('Network connection failure while deleting price record.');
    }
  };

  const getFormError = (fieldName: string) => {
    return formErrors.find((err) => err.field === fieldName)?.message;
  };

  const getEditError = (fieldName: string) => {
    return editErrors.find((err) => err.field === fieldName)?.message;
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header section */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-white">Daily Price Recording</h1>
        <p className="text-sm text-slate-400 mt-1">
          Manually input ticker prices and daily volumes. Fetch, paginate, and correct recordings in real-time.
        </p>
      </div>

      {globalError && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-sm font-semibold flex items-center">
          <svg className="h-5 w-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {globalError}
        </div>
      )}

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Recording Form */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div>
            <h2 className="text-lg font-bold text-white">Manual Record Form</h2>
            <p className="text-xs text-slate-400 mt-1">Inputs default to manual data-source badges.</p>
          </div>

          {loadingStocks ? (
            <div className="h-48 w-full rounded-2xl bg-slate-950/20 animate-pulse border border-slate-850" />
          ) : stocks.length === 0 ? (
            <div className="text-center py-6 bg-slate-950/40 rounded-2xl border border-slate-850 px-4 space-y-3">
              <p className="text-slate-400 text-xs font-semibold">No stocks registered in catalog.</p>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                You must register at least one stock counter before logging daily prices.
              </p>
            </div>
          ) : (
            <form onSubmit={handleRecordPrice} className="space-y-4">
              {/* Stock Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Select Stock Counter
                </label>
                <select
                  value={selectedStockId}
                  onChange={(e) => setSelectedStockId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none transition-all cursor-pointer"
                >
                  {stocks.map((stock) => (
                    <option key={stock.id} value={stock.id}>
                      {stock.symbol} — {stock.name}
                    </option>
                  ))}
                </select>
                {getFormError('stockId') && (
                  <p className="text-rose-450 text-xs mt-1.5 font-medium">{getFormError('stockId')}</p>
                )}
              </div>

              {/* Date Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Trading Date
                </label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none transition-all cursor-pointer"
                />
                {getFormError('date') && (
                  <p className="text-rose-450 text-xs mt-1.5 font-medium">{getFormError('date')}</p>
                )}
              </div>

              {/* Price field */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Close Price ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  placeholder="e.g. 178.45"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-700 focus:outline-none transition-all"
                />
                {getFormError('price') && (
                  <p className="text-rose-450 text-xs mt-1.5 font-medium">{getFormError('price')}</p>
                )}
              </div>

              {/* Volume field */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Trading Volume (Shares)
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  placeholder="e.g. 52000000"
                  value={formVolume}
                  onChange={(e) => setFormVolume(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-700 focus:outline-none transition-all"
                />
                {getFormError('volume') && (
                  <p className="text-rose-450 text-xs mt-1.5 font-medium">{getFormError('volume')}</p>
                )}
              </div>

              {/* Success / Info states */}
              {formSuccessMessage && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold flex items-center">
                  <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {formSuccessMessage}
                </div>
              )}

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-bold text-slate-900 bg-gradient-to-r from-indigo-400 to-indigo-300 hover:from-indigo-300 hover:to-indigo-200 transition-all duration-200 shadow-lg shadow-indigo-500/20 cursor-pointer active:scale-98"
              >
                Log Price Entry
              </button>
            </form>
          )}
        </div>

        {/* Right Column: Historical Logs Panel */}
        <div className="lg:col-span-2 bg-slate-900/20 backdrop-blur-md border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Price History Logs</h2>
              <p className="text-xs text-slate-400 mt-1">Paginated daily logs. Edit or remove erroneous records.</p>
            </div>

            {/* Filter by Stock selector */}
            {stocks.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Viewing:</span>
                <select
                  value={selectedStockId}
                  onChange={(e) => setSelectedStockId(e.target.value)}
                  className="bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none transition-all cursor-pointer"
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
              <div className="h-6 w-full rounded bg-slate-900 animate-pulse" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 w-full rounded bg-slate-950 animate-pulse" />
              ))}
            </div>
          ) : priceHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 border border-dashed border-slate-800 rounded-2xl text-center p-6">
              <svg className="h-12 w-12 text-slate-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h4 className="text-sm font-bold text-slate-300">No Historical Records Found</h4>
              <p className="text-xs text-slate-500 mt-1.5 max-w-xs">
                No daily price coordinates are logged in the database for this stock. Fill out the form to log your first coordinate!
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="min-w-full divide-y divide-slate-800 bg-slate-950/20">
                  <thead className="bg-slate-900/60">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider">Close Price</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider">Trading Volume</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider">Source</th>
                      <th className="px-6 py-4 text-right text-xs font-bold text-slate-300 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {priceHistory.map((record) => {
                      const isEditing = editingRecordId === record.id;

                      if (isEditing) {
                        return (
                          <tr key={record.id} className="bg-indigo-500/5">
                            {/* Inline Editing Mode Row */}
                            <td className="px-6 py-3 text-sm text-slate-200">
                              <input
                                type="date"
                                value={editDate}
                                onChange={(e) => setEditDate(e.target.value)}
                                className="bg-slate-950 border border-slate-850 rounded px-2 py-1 text-xs text-slate-200 w-32 focus:outline-none"
                              />
                              {getEditError('date') && (
                                <p className="text-rose-450 text-[10px] mt-1 font-semibold">{getEditError('date')}</p>
                              )}
                            </td>
                            <td className="px-6 py-3 text-sm text-slate-200">
                              <input
                                type="number"
                                step="0.01"
                                value={editPrice}
                                onChange={(e) => setEditPrice(e.target.value)}
                                className="bg-slate-950 border border-slate-850 rounded px-2 py-1 text-xs text-slate-200 w-24 focus:outline-none"
                              />
                              {getEditError('price') && (
                                <p className="text-rose-450 text-[10px] mt-1 font-semibold">{getEditError('price')}</p>
                              )}
                            </td>
                            <td className="px-6 py-3 text-sm text-slate-200">
                              <input
                                type="number"
                                value={editVolume}
                                onChange={(e) => setEditVolume(e.target.value)}
                                className="bg-slate-950 border border-slate-850 rounded px-2 py-1 text-xs text-slate-200 w-28 focus:outline-none"
                              />
                              {getEditError('volume') && (
                                <p className="text-rose-450 text-[10px] mt-1 font-semibold">{getEditError('volume')}</p>
                              )}
                            </td>
                            <td className="px-6 py-3 text-sm text-slate-200">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400">
                                {record.source}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-right text-xs font-semibold space-x-2">
                              <button
                                onClick={() => handleUpdatePrice(record.id)}
                                className="text-emerald-400 hover:text-emerald-300 font-bold"
                              >
                                Save
                              </button>
                              <button onClick={cancelEditing} className="text-slate-450 hover:text-slate-300">
                                Cancel
                              </button>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={record.id} className="hover:bg-slate-900/20 transition-all">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-300">
                            {record.date}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-100">
                            ${Number(record.price).toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                            {Number(record.volume).toLocaleString()} shares
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {record.source === 'api' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                🔌 api
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                ✍️ manual
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-semibold space-x-3">
                            <button
                              onClick={() => startEditing(record)}
                              className="text-indigo-400 hover:text-indigo-300 transition-colors"
                              title="Edit Price Record"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeletePrice(record.id)}
                              className="text-slate-500 hover:text-rose-400 transition-colors"
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
                <div className="flex items-center justify-between border-t border-slate-800/60 pt-4 px-2">
                  <div className="text-xs text-slate-450">
                    Showing page <span className="font-semibold text-slate-200">{pagination.currentPage}</span> of{' '}
                    <span className="font-semibold text-slate-200">{pagination.totalPages}</span> (
                    <span className="font-semibold text-slate-200">{pagination.totalItems}</span> records total)
                  </div>

                  <nav className="inline-flex rounded-xl bg-slate-900 border border-slate-800 p-1 space-x-1">
                    {/* Previous Button */}
                    <button
                      onClick={() => fetchPriceHistory(selectedStockId, pagination.currentPage - 1)}
                      disabled={pagination.currentPage === 1}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 text-slate-300 cursor-pointer"
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
                              ? 'bg-indigo-500 text-white shadow-md'
                              : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
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
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 text-slate-300 cursor-pointer"
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
