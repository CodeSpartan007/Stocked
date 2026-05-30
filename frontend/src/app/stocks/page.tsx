'use client';

import React, { useEffect, useState } from 'react';

interface StockSummary {
  id: string;
  name: string;
  symbol: string;
  description: string | null;
  category: string;
  summary: {
    totalPriceRecords: number;
    latestPrice: number;
    latestPriceDate: string;
    averagePrice: number;
    highestPrice: number;
    lowestPrice: number;
    priceChange: number;
    priceChangePercent: number;
    source?: 'api' | 'manual';
    lastUpdated?: string | null;
  };
}

export default function StocksCatalog() {
  const [stocks, setStocks] = useState<StockSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Modal control state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formSymbol, setFormSymbol] = useState('');
  const [formCategory, setFormCategory] = useState('Technology');
  const [formDescription, setFormDescription] = useState('');
  const [activeStockId, setActiveStockId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ field: string; message: string }[]>([]);

  // Fetch all stocks
  const fetchStocks = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:5001/api/stocks');
      if (!response.ok) {
        throw new Error('Could not fetch stock counters.');
      }
      const json = await response.json();
      if (json.success) {
        setStocks(json.data);
        setError(null);
      } else {
        throw new Error(json.message);
      }
    } catch (err: any) {
      console.error(err);
      setError('Could not connect to the database. Verify that the server is running on Port 5001.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStocks();
    const interval = setInterval(fetchStocks, 30000);
    return () => clearInterval(interval);
  }, []);

  const openAddModal = () => {
    setFormName('');
    setFormSymbol('');
    setFormCategory('Technology');
    setFormDescription('');
    setValidationErrors([]);
    setAddModalOpen(true);
  };

  const openEditModal = (stock: StockSummary) => {
    setActiveStockId(stock.id);
    setFormName(stock.name);
    setFormSymbol(stock.symbol);
    setFormCategory(stock.category || 'Other');
    setFormDescription(stock.description || '');
    setValidationErrors([]);
    setEditModalOpen(true);
  };

  const openDeleteModal = (stock: StockSummary) => {
    setActiveStockId(stock.id);
    setFormName(stock.name);
    setFormSymbol(stock.symbol);
    setDeleteModalOpen(true);
  };

  // Submit Add Stock
  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors([]);

    try {
      const response = await fetch('http://localhost:5001/api/stocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          symbol: formSymbol,
          category: formCategory,
          description: formDescription,
        }),
      });

      const json = await response.json();
      if (response.ok && json.success) {
        setAddModalOpen(false);
        fetchStocks();
      } else {
        if (json.errors) {
          setValidationErrors(json.errors);
        } else {
          setError(json.message || 'Failed to create stock.');
        }
      }
    } catch (err: any) {
      console.error(err);
      setError('Network communication failure while registering stock.');
    }
  };

  // Submit Edit Stock
  const handleEditStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors([]);

    if (!activeStockId) return;

    try {
      const response = await fetch(`http://localhost:5001/api/stocks/${activeStockId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          symbol: formSymbol,
          category: formCategory,
          description: formDescription,
        }),
      });

      const json = await response.json();
      if (response.ok && json.success) {
        setEditModalOpen(false);
        fetchStocks();
      } else {
        if (json.errors) {
          setValidationErrors(json.errors);
        } else {
          setError(json.message || 'Failed to update stock.');
        }
      }
    } catch (err: any) {
      console.error(err);
      setError('Network communication failure while editing stock.');
    }
  };

  // Submit Delete Stock
  const handleDeleteStock = async () => {
    if (!activeStockId) return;

    try {
      const response = await fetch(`http://localhost:5001/api/stocks/${activeStockId}`, {
        method: 'DELETE',
      });

      const json = await response.json();
      if (response.ok && json.success) {
        setDeleteModalOpen(false);
        fetchStocks();
      } else {
        setError(json.message || 'Failed to delete stock.');
      }
    } catch (err: any) {
      console.error(err);
      setError('Network communication failure while deleting stock.');
    }
  };

  // Filter stocks based on query & category
  const filteredStocks = stocks.filter((stock) => {
    const matchesSearch =
      stock.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stock.symbol.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || stock.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Unique categories list
  const categoriesList = ['All', 'Technology', 'Automotive', 'Financials', 'Health', 'Energy', 'Retail', 'Other'];

  const getFieldError = (fieldName: string) => {
    return validationErrors.find((err) => err.field === fieldName)?.message;
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">Registered Stocks</h1>
          <p className="text-sm text-slate-400 mt-1">
            Register and manage stock counters. Cascade-deletes automatically purge associated Daily Price logs.
          </p>
        </div>
        <div>
          <button
            onClick={openAddModal}
            className="inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-bold text-slate-900 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 transition-all duration-200 shadow-lg shadow-emerald-500/20 active:scale-95 cursor-pointer"
          >
            <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Stock Ticker
          </button>
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

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-2xl p-4 shadow-md">
        {/* Text Search */}
        <div className="flex-1 relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search by ticker symbol or stock name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl pl-11 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
          />
        </div>

        {/* Category selector */}
        <div className="w-full md:w-64 flex items-center space-x-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sector:</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer"
          >
            {categoriesList.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stocks Grid / Table Display */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-48 w-full rounded-2xl bg-slate-900 animate-pulse border border-slate-800" />
          ))}
        </div>
      ) : filteredStocks.length === 0 ? (
        /* Empty State UI */
        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/10 backdrop-blur-md border border-slate-850 rounded-3xl text-center p-8 shadow-xl max-w-xl mx-auto">
          <div className="h-16 w-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-6">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white">No Tickers Match Filters</h3>
          <p className="text-slate-400 text-sm mt-2 max-w-sm">
            We couldn't find any stock counters matching "{searchQuery}" or sector "{selectedCategory}". Add a new stock counter to get started!
          </p>
          <button
            onClick={openAddModal}
            className="mt-6 inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold text-slate-900 bg-indigo-400 hover:bg-indigo-300 transition-all cursor-pointer"
          >
            Add New Ticker
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredStocks.map((stock) => {
            const hasData = stock.summary.totalPriceRecords > 0;
            const isChangePositive = stock.summary.priceChange >= 0;

            return (
              <div
                key={stock.id}
                className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 hover:border-slate-700/80 rounded-2xl p-6 flex flex-col justify-between shadow-lg hover:shadow-2xl transition-all duration-300 group relative overflow-hidden"
              >
                {/* Glowing neon side indicator */}
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-indigo-500 to-emerald-400 opacity-50 group-hover:opacity-100 transition-opacity" />

                {/* Top Row: Symbol, Category & Action buttons */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center justify-center px-3 py-1 text-sm font-black tracking-wider bg-indigo-500/10 text-indigo-300 rounded-lg">
                        {stock.symbol}
                      </span>
                      {hasData && (
                        <div className="flex items-center gap-1.5">
                          {/* Pulsing real-time badge */}
                          <span className="relative flex h-2 w-2">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                              stock.summary.source === 'api' ? 'bg-cyan-400' : 'bg-amber-400'
                            }`}></span>
                            <span className={`relative inline-flex rounded-full h-2 w-2 ${
                              stock.summary.source === 'api' ? 'bg-cyan-500' : 'bg-amber-500'
                            }`}></span>
                          </span>
                          {/* Origin Label */}
                          <span className={`inline-flex px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded border ${
                            stock.summary.source === 'api'
                              ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.1)]'
                              : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                          }`}>
                            {stock.summary.source === 'api' ? 'Live Feed' : 'Manual'}
                          </span>
                          {stock.summary.lastUpdated && (
                            <span className="text-[9px] text-slate-500 font-mono">
                              @{new Date(stock.summary.lastUpdated).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-slate-100 mt-2">{stock.name}</h3>
                    <span className="inline-flex px-2 py-0.5 text-[10px] font-bold bg-slate-800 text-slate-400 rounded mt-1">
                      {stock.category}
                    </span>
                  </div>

                  <div className="flex space-x-1">
                    <button
                      onClick={() => openEditModal(stock)}
                      className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-800/60 rounded-lg transition-all"
                      title="Edit Stock Ticker"
                    >
                      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => openDeleteModal(stock)}
                      className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/60 rounded-lg transition-all"
                      title="Delete Stock and Price Records"
                    >
                      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Middle details description */}
                {stock.description && (
                  <p className="text-xs text-slate-400 mb-6 leading-relaxed line-clamp-2">
                    {stock.description}
                  </p>
                )}

                {/* Price Summary Statistics Deck */}
                <div className="border-t border-slate-800/60 pt-4 mt-auto">
                  {hasData ? (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-slate-950/40 rounded-xl p-2.5 border border-slate-850">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Latest Price</p>
                        <p className="text-sm font-bold text-slate-200 mt-1">${stock.summary.latestPrice.toFixed(2)}</p>
                        <span className={`inline-flex text-[9px] font-black mt-1 ${isChangePositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isChangePositive ? '▲' : '▼'} {Math.abs(stock.summary.priceChangePercent).toFixed(1)}%
                        </span>
                      </div>

                      <div className="bg-slate-950/40 rounded-xl p-2.5 border border-slate-850">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Avg Price</p>
                        <p className="text-sm font-bold text-slate-200 mt-1">${stock.summary.averagePrice.toFixed(2)}</p>
                        <span className="text-[9px] font-medium text-slate-500 mt-1 block">
                          History mean
                        </span>
                      </div>

                      <div className="bg-slate-950/40 rounded-xl p-2.5 border border-slate-850">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Price Range</p>
                        <p className="text-[11px] font-bold text-slate-200 mt-1.5 truncate">
                          ${stock.summary.lowestPrice.toFixed(0)} - ${stock.summary.highestPrice.toFixed(0)}
                        </p>
                        <span className="text-[9px] font-bold text-indigo-400 mt-1 block">
                          {stock.summary.totalPriceRecords} log(s)
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 text-center bg-slate-950/20 border border-slate-850 rounded-xl">
                      <p className="text-xs text-slate-500 font-semibold">No daily price metrics recorded yet</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Stock Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setAddModalOpen(false)} />

          <div className="relative bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div>
              <h3 className="text-xl font-bold text-white">Register Stock Ticker</h3>
              <p className="text-xs text-slate-400 mt-1">Configure user-scoped capital market symbols.</p>
            </div>

            <form onSubmit={handleAddStock} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">Stock Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apple Inc."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">Ticker Symbol</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AAPL"
                  value={formSymbol}
                  onChange={(e) => setFormSymbol(e.target.value.toUpperCase())}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-all uppercase"
                />
                {getFieldError('symbol') && (
                  <p className="text-rose-400 text-xs mt-1.5 font-medium">{getFieldError('symbol')}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">Sector / Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none transition-all cursor-pointer"
                >
                  {categoriesList.filter((cat) => cat !== 'All').map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">Description (Optional)</label>
                <textarea
                  placeholder="Details about company profile or metrics..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-all resize-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-900 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 transition-all cursor-pointer"
                >
                  Register Ticker
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Stock Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setEditModalOpen(false)} />

          <div className="relative bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div>
              <h3 className="text-xl font-bold text-white">Edit Stock Ticker</h3>
              <p className="text-xs text-slate-400 mt-1">Modify details for registered symbol.</p>
            </div>

            <form onSubmit={handleEditStock} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">Stock Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apple Inc."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">Ticker Symbol</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AAPL"
                  value={formSymbol}
                  onChange={(e) => setFormSymbol(e.target.value.toUpperCase())}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-all uppercase"
                />
                {getFieldError('symbol') && (
                  <p className="text-rose-400 text-xs mt-1.5 font-medium">{getFieldError('symbol')}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">Sector / Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none transition-all cursor-pointer"
                >
                  {categoriesList.filter((cat) => cat !== 'All').map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">Description (Optional)</label>
                <textarea
                  placeholder="Details about company profile or metrics..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-all resize-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-900 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 transition-all cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Stock Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setDeleteModalOpen(false)} />

          <div className="relative bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl space-y-6">
            <div className="h-12 w-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-450 mx-auto">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-white">Delete Stock Counter?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Are you absolutely sure you want to delete <span className="font-semibold text-indigo-300">{formName} ({formSymbol})</span>?
                This operation is irreversible and will cascadingly purge all associated historical daily prices immediately.
              </p>
            </div>

            <div className="flex items-center justify-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteStock}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-550 transition-all cursor-pointer"
              >
                Delete Cascadingly
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
