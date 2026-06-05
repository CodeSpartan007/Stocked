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
    source?: 'live' | 'cache' | 'manual fallback';
    lastUpdated?: string | null;
  };
}

const POPULAR_STOCKS = [
  { symbol: 'AAPL', name: 'Apple Inc.', category: 'Technology', description: 'Consumer electronics, software, and services company.' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', category: 'Technology', description: 'Software, services, devices, and cloud computing company.' },
  { symbol: 'TSLA', name: 'Tesla, Inc.', category: 'Automotive', description: 'Electric vehicles, clean energy, and battery storage company.' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', category: 'Technology', description: 'Graphics processing units (GPUs) and artificial intelligence technologies.' },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', category: 'Retail', description: 'E-commerce, cloud computing, online advertising, and digital streaming.' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', category: 'Technology', description: 'Search engine, online advertising, cloud computing, and hardware.' },
  { symbol: 'META', name: 'Meta Platforms, Inc.', category: 'Technology', description: 'Social media, online advertising, and virtual reality company.' },
  { symbol: 'NFLX', name: 'Netflix, Inc.', category: 'Other', description: 'Subscription-based streaming service and production company.' },
  { symbol: 'AMD', name: 'Advanced Micro Devices, Inc.', category: 'Technology', description: 'Semiconductor company that designs computer processors and technologies.' },
  { symbol: 'INTC', name: 'Intel Corporation', category: 'Technology', description: 'Semiconductor design and manufacturing company.' },
  { symbol: 'BABA', name: 'Alibaba Group Holding Limited', category: 'Retail', description: 'E-commerce, retail, internet, and technology company.' },
  { symbol: 'DIS', name: 'The Walt Disney Company', category: 'Other', description: 'Diversified mass media and entertainment conglomerate.' },
  { symbol: 'PYPL', name: 'PayPal Holdings, Inc.', category: 'Financials', description: 'Online payments system operator.' },
  { symbol: 'COIN', name: 'Coinbase Global, Inc.', category: 'Financials', description: 'Cryptocurrency exchange platform.' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', category: 'Financials', description: 'Multinational banking and financial services.' },
  { symbol: 'V', name: 'Visa Inc.', category: 'Financials', description: 'Multinational financial services corporation.' },
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', category: 'Energy', description: 'Multinational oil and gas corporation.' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', category: 'Health', description: 'Multinational corporation developing medical devices and pharmaceuticals.' },
  { symbol: 'WMT', name: 'Walmart Inc.', category: 'Retail', description: 'Multinational retail corporation operating hypermarkets.' },
];

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

  // Searchable Dropdown and Live Price States
  const [useCustomTicker, setUseCustomTicker] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [livePrice, setLivePrice] = useState<{ price: number; provider: string; change?: number; changePercent?: number } | null>(null);
  const [livePriceError, setLivePriceError] = useState<string | null>(null);
  const [livePriceLoading, setLivePriceLoading] = useState(false);

  const fetchLivePrice = async (symbol: string) => {
    if (!symbol || symbol.trim() === '') return;
    setLivePriceLoading(true);
    setLivePriceError(null);
    setLivePrice(null);

    try {
      const response = await fetch(`http://localhost:5001/api/stocks/search-price?symbol=${encodeURIComponent(symbol.trim())}`, {
        credentials: 'include',
      });
      const json = await response.json();
      if (response.ok && json.success) {
        setLivePrice({
          price: json.data.price,
          provider: json.data.provider,
          change: json.data.change,
          changePercent: json.data.changePercent,
        });
      } else {
        setLivePriceError(json.message || 'Could not fetch live price.');
      }
    } catch (err: any) {
      console.error(err);
      setLivePriceError('Network error checking live price.');
    } finally {
      setLivePriceLoading(false);
    }
  };

  // Fetch all stocks
  const fetchStocks = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:5001/api/stocks', {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Could not fetch stocks.');
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
    const firstStock = POPULAR_STOCKS[0];
    setFormName(firstStock.name);
    setFormSymbol(firstStock.symbol);
    setFormCategory(firstStock.category);
    setFormDescription(firstStock.description);
    setValidationErrors([]);

    setUseCustomTicker(false);
    setSearchTerm(`${firstStock.symbol} - ${firstStock.name}`);
    setDropdownOpen(false);
    setLivePrice(null);
    setLivePriceError(null);
    setLivePriceLoading(false);

    setAddModalOpen(true);
    fetchLivePrice(firstStock.symbol);
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
        credentials: 'include',
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
        credentials: 'include',
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
        credentials: 'include',
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
            Register and manage your stock catalog.
          </p>
        </div>
        <div>
          <button
            onClick={openAddModal}
            className="inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-bold text-slate-900 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 transition-all duration-200 shadow-lg shadow-emerald-500/20 active:scale-95 cursor-pointer"
          >
            <svg className="h-4.5 w-4.5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Stock
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
            placeholder="Search by stock code or name..."
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
          <h3 className="text-xl font-bold text-white">No Stocks Match Filters</h3>
          <p className="text-slate-400 text-sm mt-2 max-w-sm">
            We couldn't find any stocks matching "{searchQuery}" or sector "{selectedCategory}". Add a new stock to get started!
          </p>
          <button
            onClick={openAddModal}
            className="mt-6 inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold text-slate-900 bg-indigo-400 hover:bg-indigo-300 transition-all cursor-pointer"
          >
            Add New Stock
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
                              stock.summary.source === 'live' ? 'bg-cyan-400' : 'bg-amber-400'
                            }`}></span>
                            <span className={`relative inline-flex rounded-full h-2 w-2 ${
                              stock.summary.source === 'live' ? 'bg-cyan-500' : 'bg-amber-500'
                            }`}></span>
                          </span>
                          {/* Origin Label */}
                          <span className={`inline-flex px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded border ${
                            stock.summary.source === 'live'
                              ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.1)]'
                              : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                          }`}>
                            {stock.summary.source === 'live' ? 'Live Network Price' : 'Added by You'}
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
                      title="Edit Stock"
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
                      <p className="text-xs text-slate-500 font-semibold">No price records saved yet</p>
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
              <h3 className="text-xl font-bold text-white">Register Stock</h3>
            </div>
            {/* Segment Toggle */}
            <div className="grid grid-cols-2 gap-2 bg-slate-950/50 p-1 rounded-xl border border-slate-850">
              <button
                type="button"
                onClick={() => {
                  setUseCustomTicker(false);
                  const firstStock = POPULAR_STOCKS[0];
                  setFormName(firstStock.name);
                  setFormSymbol(firstStock.symbol);
                  setFormCategory(firstStock.category);
                  setFormDescription(firstStock.description);
                  setSearchTerm(`${firstStock.symbol} - ${firstStock.name}`);
                  fetchLivePrice(firstStock.symbol);
                }}
                className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  !useCustomTicker
                    ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                🔌 Predefined Asset
              </button>
              <button
                type="button"
                onClick={() => {
                  setUseCustomTicker(true);
                  setFormName('');
                  setFormSymbol('');
                  setFormCategory('Technology');
                  setFormDescription('');
                  setSearchTerm('');
                  setLivePrice(null);
                  setLivePriceError(null);
                }}
                className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  useCustomTicker
                    ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                ✍️ Custom Ticker
              </button>
            </div>

            <form onSubmit={handleAddStock} className="space-y-4">
              {!useCustomTicker ? (
                /* Predefined Asset Selection UI */
                <div className="space-y-4">
                  <div className="relative">
                    <label className="block text-xs font-semibold text-slate-350 uppercase mb-2">Select Popular Stock</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </span>
                      <input
                        type="text"
                        placeholder="Search popular stocks (e.g. AAPL, TSLA)..."
                        value={searchTerm}
                        onFocus={() => setDropdownOpen(true)}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setDropdownOpen(true);
                        }}
                        className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl pl-11 pr-10 py-2.5 text-sm text-slate-100 placeholder-slate-650 focus:outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                      >
                        <svg className={`h-4.5 w-4.5 transform transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    {/* Dropdown list */}
                    {dropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                        <div className="absolute left-0 right-0 mt-2 max-h-52 overflow-y-auto bg-slate-950 border border-slate-850 rounded-xl shadow-2xl z-20 divide-y divide-slate-900/60 scrollbar-thin scrollbar-thumb-slate-800">
                          {POPULAR_STOCKS.filter(stock => 
                            stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            stock.name.toLowerCase().includes(searchTerm.toLowerCase())
                          ).length === 0 ? (
                            <div className="p-3 text-xs text-slate-500 text-center">
                              No matching popular stocks. Try "Custom Ticker"!
                            </div>
                          ) : (
                            POPULAR_STOCKS.filter(stock => 
                              stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              stock.name.toLowerCase().includes(searchTerm.toLowerCase())
                            ).map((stock) => (
                              <div
                                key={stock.symbol}
                                onClick={() => {
                                  setFormName(stock.name);
                                  setFormSymbol(stock.symbol);
                                  setFormCategory(stock.category);
                                  setFormDescription(stock.description || '');
                                  setSearchTerm(`${stock.symbol} - ${stock.name}`);
                                  setDropdownOpen(false);
                                  fetchLivePrice(stock.symbol);
                                }}
                                className="p-3 text-left hover:bg-indigo-950/40 cursor-pointer transition-colors flex items-center justify-between"
                              >
                                <div>
                                  <span className="text-xs font-black text-indigo-300 tracking-wider bg-indigo-500/10 px-2 py-0.5 rounded mr-2">
                                    {stock.symbol}
                                  </span>
                                  <span className="text-xs font-bold text-slate-200">{stock.name}</span>
                                </div>
                                <span className="text-[10px] text-slate-500 font-semibold">{stock.category}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Preselected stock dashboard */}
                  {formSymbol && (
                    <div className="space-y-3 bg-slate-950/30 border border-slate-850/60 p-4 rounded-2xl relative overflow-hidden">
                      <div>
                        <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Stock Profile</span>
                        <span className="block text-sm font-bold text-slate-100 mt-1">{formName} ({formSymbol})</span>
                      </div>
                      <div className="flex gap-4">
                        <div>
                          <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sector</span>
                          <span className="inline-flex px-2 py-0.5 text-[9px] font-bold bg-slate-800 text-slate-400 rounded mt-1">{formCategory}</span>
                        </div>
                      </div>
                      {formDescription && (
                        <div>
                          <span className="block text-[10px] font-bold text-slate-550 uppercase tracking-wider">Profile Overview</span>
                          <p className="text-xs text-slate-450 mt-1 leading-relaxed">{formDescription}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Custom Ticker Form Inputs */
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-350 uppercase mb-2">Stock Code (Ticker)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        placeholder="e.g. AAPL"
                        value={formSymbol}
                        onChange={(e) => setFormSymbol(e.target.value.toUpperCase())}
                        className="flex-1 bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-650 focus:outline-none transition-all uppercase"
                      />
                      <button
                        type="button"
                        disabled={!formSymbol || livePriceLoading}
                        onClick={() => fetchLivePrice(formSymbol)}
                        className="px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 hover:border-indigo-500/40 text-indigo-300 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                      >
                        Check Price
                      </button>
                    </div>
                    {getFieldError('symbol') && (
                      <p className="text-rose-400 text-xs mt-1.5 font-medium">{getFieldError('symbol')}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-355 uppercase mb-2">Stock Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Apple Inc."
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-650 focus:outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-355 uppercase mb-2">Sector / Category</label>
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
                    <label className="block text-xs font-semibold text-slate-355 uppercase mb-2">Description (Optional)</label>
                    <textarea
                      placeholder="Details about company profile or metrics..."
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      rows={3}
                      className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-all resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Live Price Fetching Status Card */}
              {(livePriceLoading || livePrice || livePriceError) && (
                <div className="p-4 rounded-2xl border border-slate-855 bg-slate-950/40 backdrop-blur-md transition-all duration-300">
                  {livePriceLoading && (
                    <div className="flex items-center justify-center gap-2 py-2 text-xs font-semibold text-indigo-400 animate-pulse">
                      <svg className="animate-spin h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Querying live pricing details...
                    </div>
                  )}
                  {livePriceError && (
                    <div className="text-xs text-rose-450 font-semibold py-1 leading-relaxed">
                      ⚠️ {livePriceError}
                    </div>
                  )}
                  {livePrice && (
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase block tracking-wider">Current Market Price</span>
                        <span className="text-lg font-black text-slate-100">${livePrice.price.toFixed(2)}</span>
                      </div>
                      {livePrice.change !== undefined && livePrice.changePercent !== undefined && (
                        <div className="text-right">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block tracking-wider">Today's Shift</span>
                          <span className={`text-xs font-black ${livePrice.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {livePrice.change >= 0 ? '▲' : '▼'} ${Math.abs(livePrice.change).toFixed(2)} ({livePrice.changePercent.toFixed(2)}%)
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

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
                  Register Stock
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
              <h3 className="text-xl font-bold text-white">Edit Stock</h3>
              <p className="text-xs text-slate-400 mt-1">Modify stock profile details.</p>
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
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">Stock Code (Ticker)</label>
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
              <h3 className="text-lg font-bold text-white">Delete Stock?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Are you sure you want to delete <span className="font-semibold text-indigo-300">{formName} ({formSymbol})</span>?
                This will also delete all price records linked to it.
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
                Delete Stock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
