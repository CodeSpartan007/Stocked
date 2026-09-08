'use client';

import { API_BASE } from '../../lib/api';
import { getCached, setCached, clearCache } from '../../lib/cache';

import React, { useEffect, useState } from 'react';
import { useCurrency } from '@/app/context/CurrencyContext';
import {
  X,
  Search,
  Check,
  TrendingUp,
  TrendingDown,
  Building2,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  Sparkles,
  DollarSign,
} from 'lucide-react';

interface StockSummary {
  id: string;
  name: string;
  symbol: string;
  currency?: 'USD' | 'KES';
  description: string | null;
  category: string;
  summary: {
    totalPriceRecords: number;
    latestPrice: number;
    nativeLatestPrice?: number;
    latestPriceDate: string;
    averagePrice: number;
    nativeAveragePrice?: number;
    highestPrice: number;
    nativeHighestPrice?: number;
    lowestPrice: number;
    nativeLowestPrice?: number;
    priceChange: number;
    priceChangePercent: number;
    source?: 'live' | 'cache' | 'manual fallback';
    lastUpdated?: string | null;
  };
}

const POPULAR_STOCKS: { symbol: string; name: string; category: string; description: string; currency: 'USD' | 'KES' }[] = [
  // Nairobi Securities Exchange (Kenya)
  { symbol: 'SCOM', name: 'Safaricom Plc', category: 'Technology', currency: 'KES', description: 'Leading telecommunications, mobile money (M-Pesa), and data services provider in Kenya.' },
  { symbol: 'EQTY', name: 'Equity Group Holdings Ltd', category: 'Financials', currency: 'KES', description: 'Leading financial services and banking conglomerate operating in East and Central Africa.' },
  { symbol: 'KCB', name: 'KCB Group Plc', category: 'Financials', currency: 'KES', description: 'One of the oldest and largest commercial banking groups in East Africa.' },
  { symbol: 'EABL', name: 'East African Breweries Ltd', category: 'Consumer Goods', currency: 'KES', description: 'Leading alcoholic beverage producer, brewery, and spirits distributor in East Africa.' },
  { symbol: 'COOP', name: 'Co-operative Bank of Kenya', category: 'Financials', currency: 'KES', description: 'Major commercial bank providing services to retail and cooperative societies.' },
  { symbol: 'BAT', name: 'British American Tobacco Kenya', category: 'Consumer Goods', currency: 'KES', description: 'Cigarette, tobacco, and nicotine product manufacturing and distribution.' },
  { symbol: 'ABSA', name: 'Absa Bank Kenya Plc', category: 'Financials', currency: 'KES', description: 'Full-service commercial bank operating across corporate and retail banking.' },
  { symbol: 'SCBK', name: 'Standard Chartered Bank Kenya', category: 'Financials', currency: 'KES', description: 'Tier-1 international commercial bank operating in Kenya.' },
  { symbol: 'NCBA', name: 'NCBA Group Plc', category: 'Financials', currency: 'KES', description: 'Financial services group formed through CBA and NIC Bank merger.' },
  { symbol: 'KEGN', name: 'KenGen Plc', category: 'Energy', currency: 'KES', description: 'Kenya Electricity Generating Company, leading electric power generation.' },
  { symbol: 'KPLC', name: 'Kenya Power & Lighting Company', category: 'Energy', currency: 'KES', description: 'National electricity transmission and retail distribution utility.' },
  { symbol: 'BAMB', name: 'Bamburi Cement Ltd', category: 'Industrial', currency: 'KES', description: 'Leading cement and building materials manufacturer in East Africa.' },
  { symbol: 'BRIT', name: 'Britam Holdings Ltd', category: 'Financials', currency: 'KES', description: 'Diversified financial services, insurance, and asset management group.' },
  { symbol: 'NSE', name: 'Nairobi Securities Exchange Plc', category: 'Financials', currency: 'KES', description: 'The principal securities exchange in Kenya providing listing and trading.' },
  { symbol: 'CIC', name: 'CIC Insurance Group Ltd', category: 'Financials', currency: 'KES', description: 'Micro-insurance, life insurance, and general insurance solutions.' },
  { symbol: 'SASN', name: 'Sasini Plc', category: 'Agriculture', currency: 'KES', description: 'Tea, coffee, macadamia nuts, and avocado agribusiness.' },

  // US & International Equities
  { symbol: 'AAPL', name: 'Apple Inc.', category: 'Technology', currency: 'USD', description: 'Consumer electronics, software, and services company.' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', category: 'Technology', currency: 'USD', description: 'Software, services, devices, and cloud computing company.' },
  { symbol: 'TSLA', name: 'Tesla, Inc.', category: 'Automotive', currency: 'USD', description: 'Electric vehicles, clean energy, and battery storage company.' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', category: 'Technology', currency: 'USD', description: 'Graphics processing units (GPUs) and artificial intelligence technologies.' },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', category: 'Retail', currency: 'USD', description: 'E-commerce, cloud computing, online advertising, and digital streaming.' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', category: 'Technology', currency: 'USD', description: 'Search engine, online advertising, cloud computing, and hardware.' },
  { symbol: 'META', name: 'Meta Platforms, Inc.', category: 'Technology', currency: 'USD', description: 'Social media, online advertising, and virtual reality company.' },
  { symbol: 'NFLX', name: 'Netflix, Inc.', category: 'Other', currency: 'USD', description: 'Subscription-based streaming service and production company.' },
  { symbol: 'AMD', name: 'Advanced Micro Devices, Inc.', category: 'Technology', currency: 'USD', description: 'Semiconductor company that designs computer processors and technologies.' },
  { symbol: 'INTC', name: 'Intel Corporation', category: 'Technology', currency: 'USD', description: 'Semiconductor design and manufacturing company.' },
  { symbol: 'BABA', name: 'Alibaba Group Holding Limited', category: 'Retail', currency: 'USD', description: 'E-commerce, retail, internet, and technology company.' },
  { symbol: 'DIS', name: 'The Walt Disney Company', category: 'Other', currency: 'USD', description: 'Diversified mass media and entertainment conglomerate.' },
  { symbol: 'PYPL', name: 'PayPal Holdings, Inc.', category: 'Financials', currency: 'USD', description: 'Online payments system operator.' },
  { symbol: 'COIN', name: 'Coinbase Global, Inc.', category: 'Financials', currency: 'USD', description: 'Cryptocurrency exchange platform.' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', category: 'Financials', currency: 'USD', description: 'Multinational banking and financial services.' },
  { symbol: 'V', name: 'Visa Inc.', category: 'Financials', currency: 'USD', description: 'Multinational financial services corporation.' },
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', category: 'Energy', currency: 'USD', description: 'Multinational oil and gas corporation.' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', category: 'Health', currency: 'USD', description: 'Multinational corporation developing medical devices and pharmaceuticals.' },
  { symbol: 'WMT', name: 'Walmart Inc.', category: 'Retail', currency: 'USD', description: 'Multinational retail corporation operating hypermarkets.' },
];

export default function StocksCatalog() {
  const { baseCurrency, convert, formatMoney } = useCurrency();
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
  const [formCurrency, setFormCurrency] = useState<'USD' | 'KES'>('USD');
  const [activeStockId, setActiveStockId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ field: string; message: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Searchable Dropdown and Live Price States
  const [useCustomTicker, setUseCustomTicker] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [livePrice, setLivePrice] = useState<{ price: number; provider: string; change?: number; changePercent?: number; currency?: 'USD' | 'KES' } | null>(null);
  const [livePriceError, setLivePriceError] = useState<string | null>(null);
  const [livePriceLoading, setLivePriceLoading] = useState(false);

  const fetchLivePrice = async (symbol: string) => {
    if (!symbol || symbol.trim() === '') return;
    try {
      setLivePriceLoading(true);
      setLivePriceError(null);
      setLivePrice(null);

      const res = await fetch(`${API_BASE}/api/stocks/ticker-price/${symbol.toUpperCase()}`, {
        credentials: 'include'
      });
      let json: {
        success?: boolean;
        data?: { price: number; provider: string; change?: number; changePercent?: number; currency?: 'USD' | 'KES' };
        message?: string;
      } | null = null;
      try {
        json = await res.json();
      } catch {
        // Handle non-JSON responses gracefully
      }
      if (res.ok && json?.success && json.data) {
        setLivePrice(json.data);
        if (json.data.currency) {
          setFormCurrency(json.data.currency);
        }
      } else {
        setLivePriceError(json?.message || 'Live quote not reachable right now.');
      }
    } catch (err: unknown) {
      setLivePriceError(err instanceof Error ? err.message : 'Network request failed fetching quote.');
    } finally {
      setLivePriceLoading(false);
    }
  };

  const fetchStocks = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/stocks`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to retrieve stock list.');
      }
      const json = await response.json();
      if (json.success) {
        setStocks(json.data);
        setCached('stocks_catalog', json.data);
      }
    } catch (err: unknown) {
      console.error(err);
      setError('Could not load catalog. Verify backend connectivity.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Instant Cache Hydration: Render immediately if data is already in memory
    const cached = getCached<StockSummary[]>('stocks_catalog');
    if (cached) {
      setStocks(cached);
      setLoading(false);
    }

    let ignore = false;
    async function loadInitialStocks() {
      try {
        if (!cached) setLoading(true);
        const response = await fetch(`${API_BASE}/api/stocks`, {
          credentials: 'include'
        });
        if (!response.ok) {
          throw new Error('Failed to retrieve stock list.');
        }
        const json = await response.json();
        if (!ignore && json.success) {
          setStocks(json.data);
          setCached('stocks_catalog', json.data);
        }
      } catch (err: unknown) {
        if (!ignore && !cached) {
          console.error(err);
          setError('Could not load catalog. Verify backend connectivity.');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadInitialStocks();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAddModalOpen(false);
        setEditModalOpen(false);
        setDeleteModalOpen(false);
        setDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      ignore = true;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const openAddModal = () => {
    const firstStock = POPULAR_STOCKS[0];
    setUseCustomTicker(false);
    setSearchTerm(`${firstStock.symbol} - ${firstStock.name}`);
    setFormName(firstStock.name);
    setFormSymbol(firstStock.symbol);
    setFormCategory(firstStock.category);
    setFormDescription(firstStock.description);
    setFormCurrency(firstStock.currency);
    setLivePrice(null);
    setLivePriceError(null);
    setValidationErrors([]);
    setAddModalOpen(true);
    fetchLivePrice(firstStock.symbol);
  };

  const openEditModal = (stock: StockSummary) => {
    setActiveStockId(stock.id);
    setFormName(stock.name);
    setFormSymbol(stock.symbol);
    setFormCategory(stock.category);
    setFormDescription(stock.description || '');
    setFormCurrency(stock.currency || 'USD');
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
    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE}/api/stocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          symbol: formSymbol,
          category: formCategory,
          description: formDescription,
          currency: formCurrency,
        }),
        credentials: 'include',
      });

      const json = await response.json();
      if (response.ok && json.success) {
        clearCache(); // Invalidate frontend memory cache so all views update
        setAddModalOpen(false);
        fetchStocks();
      } else {
        if (json.errors) {
          setValidationErrors(json.errors);
        } else {
          setError(json.message || 'Failed to create stock.');
        }
      }
    } catch (err: unknown) {
      console.error(err);
      setError('Network communication failure while registering stock.');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Edit Stock
  const handleEditStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStockId) return;
    setValidationErrors([]);

    try {
      const response = await fetch(`${API_BASE}/api/stocks/${activeStockId}`, {
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
        clearCache();
        setEditModalOpen(false);
        fetchStocks();
      } else {
        if (json.errors) {
          setValidationErrors(json.errors);
        } else {
          setError(json.message || 'Failed to update stock.');
        }
      }
    } catch (err: unknown) {
      console.error(err);
      setError('Network communication failure while updating stock.');
    }
  };

  // Submit Delete Stock
  const handleDeleteStock = async () => {
    if (!activeStockId) return;

    try {
      const response = await fetch(`${API_BASE}/api/stocks/${activeStockId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const json = await response.json();
      if (response.ok && json.success) {
        clearCache();
        setDeleteModalOpen(false);
        fetchStocks();
      } else {
        setError(json.message || 'Failed to delete stock.');
      }
    } catch (err: unknown) {
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
  const categoriesList = ['All', 'Technology', 'Financials', 'Consumer Goods', 'Industrial', 'Energy', 'Agriculture', 'Automotive', 'Health', 'Retail', 'Other'];

  const getFieldError = (fieldName: string) => {
    return validationErrors.find((err) => err.field === fieldName)?.message;
  };

  return (
    <div className="space-y-8 animate-fade-in text-main">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-main">Registered Stocks</h1>
          <p className="text-sm text-muted mt-1">
            Register and manage your stock catalog.
          </p>
        </div>
        <div>
          <button
            onClick={openAddModal}
            className="inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-black text-[#00272b] bg-[#e0ff4f] hover:bg-[#d2f33b] transition-all duration-200 shadow-lg shadow-[#e0ff4f]/20 active:scale-95 cursor-pointer"
          >
            <svg className="h-4.5 w-4.5 mr-2 text-[#00272b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Stock
          </button>
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

      {/* Category Pill Filters (matching reference image pill badges) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-muted uppercase tracking-wider">Filter by Sector:</span>
          <span className="text-[10px] text-muted font-mono">{filteredStocks.length} stock(s) shown</span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {categoriesList.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer flex-shrink-0 flex items-center gap-1.5 ${
                  active
                    ? 'bg-[#e0ff4f] text-[#00272b] border border-[#e0ff4f] shadow-sm font-black'
                    : 'bg-surface-elevated border border-subtle text-secondary hover:text-main hover:border-[#e0ff4f]/50'
                }`}
              >
                <span>{cat}</span>
                {active && <span className="text-[10px]">&rarr;</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Text Search Bar */}
      <div className="bg-surface backdrop-blur-xl border border-subtle rounded-2xl p-3 shadow-md">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search by stock code or company name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl pl-11 pr-4 py-2.5 text-sm text-main placeholder-muted focus:outline-none focus:ring-1 focus:ring-[#e0ff4f] transition-all"
          />
        </div>
      </div>

      {/* Stocks Grid / Table Display */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-48 w-full rounded-2xl bg-surface-elevated animate-pulse border border-subtle" />
          ))}
        </div>
      ) : filteredStocks.length === 0 ? (
        /* Empty State UI */
        <div className="flex flex-col items-center justify-center py-20 bg-surface backdrop-blur-md border border-subtle rounded-3xl text-center p-8 shadow-xl max-w-xl mx-auto">
          <div className="h-16 w-16 rounded-2xl bg-[#e0ff4f]/15 flex items-center justify-center text-[#00272b] dark:text-[#e0ff4f] mb-6">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-main">No Stocks Match Filters</h3>
          <p className="text-muted text-sm mt-2 max-w-sm">
            We couldn&apos;t find any stocks matching &quot;{searchQuery}&quot; or sector &quot;{selectedCategory}&quot;. Add a new stock to get started!
          </p>
          <button
            onClick={openAddModal}
            className="mt-6 inline-flex items-center px-4 py-2 rounded-xl text-sm font-black text-[#00272b] bg-[#e0ff4f] hover:bg-[#d2f33b] transition-all cursor-pointer shadow-md"
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
                className="bg-surface backdrop-blur-xl border border-subtle hover:border-[#e0ff4f]/50 rounded-2xl p-6 flex flex-col justify-between shadow-lg hover:shadow-2xl transition-all duration-300 group relative overflow-hidden"
              >
                {/* Glowing side indicator */}
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#e0ff4f] opacity-40 group-hover:opacity-100 transition-opacity" />

                {/* Top Row: Symbol, Category & Action buttons */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center px-3 py-1 text-sm font-mono font-black tracking-wider bg-surface-elevated border border-subtle text-main rounded-lg">
                        {stock.symbol}
                      </span>
                      <span className="px-1.5 py-0.5 text-[9px] font-bold font-mono bg-surface-elevated border border-subtle text-muted rounded uppercase">
                        {stock.currency || 'USD'}
                      </span>
                      {hasData && (
                        <div className="flex items-center gap-1.5 ml-1">
                          <span className="relative flex h-2 w-2">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                              stock.summary.source === 'live' ? 'bg-cyan-400' : 'bg-amber-400'
                            }`}></span>
                            <span className={`relative inline-flex rounded-full h-2 w-2 ${
                              stock.summary.source === 'live' ? 'bg-cyan-500' : 'bg-amber-500'
                            }`}></span>
                          </span>
                          <span className={`inline-flex px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded border ${
                            stock.summary.source === 'live'
                              ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-600 dark:text-cyan-300'
                              : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-300'
                          }`}>
                            {stock.summary.source === 'live' ? 'Live Network Price' : 'Added by You'}
                          </span>
                          {stock.summary.lastUpdated && (
                            <span className="text-[9px] text-muted font-mono">
                              @{new Date(stock.summary.lastUpdated).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-main mt-2">{stock.name}</h3>
                    <span className="inline-flex px-2 py-0.5 text-[10px] font-bold bg-surface-elevated border border-subtle text-secondary rounded mt-1">
                      {stock.category}
                    </span>
                  </div>

                  <div className="flex space-x-1">
                    <button
                      onClick={() => openEditModal(stock)}
                      className="p-2 text-muted hover:text-[#00272b] dark:hover:text-[#e0ff4f] hover:bg-surface-elevated rounded-lg transition-all cursor-pointer"
                      title="Edit Stock"
                    >
                      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => openDeleteModal(stock)}
                      className="p-2 text-muted hover:text-rose-500 hover:bg-surface-elevated rounded-lg transition-all cursor-pointer"
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
                  <p className="text-xs text-muted mb-6 leading-relaxed line-clamp-2">
                    {stock.description}
                  </p>
                )}

                {/* Price Summary Statistics Deck */}
                <div className="border-t border-subtle pt-4 mt-auto">
                  {hasData ? (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-surface-elevated rounded-xl p-2.5 border border-subtle">
                        <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Latest Price</p>
                        <p className="text-sm font-bold text-main mt-1 font-mono">
                          {formatMoney(stock.summary.nativeLatestPrice ?? stock.summary.latestPrice, stock.currency || 'USD')}
                        </p>
                        {(stock.currency || 'USD') !== baseCurrency && (
                          <span className="text-[9px] text-muted block font-mono">
                            ≈ {formatMoney(stock.summary.latestPrice ?? convert(stock.summary.nativeLatestPrice ?? stock.summary.latestPrice, stock.currency || 'USD', baseCurrency), baseCurrency)}
                          </span>
                        )}
                        <span className={`inline-flex text-[9px] font-black mt-1 ${isChangePositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {isChangePositive ? '▲' : '▼'} {Math.abs(stock.summary.priceChangePercent).toFixed(1)}%
                        </span>
                      </div>

                      <div className="bg-surface-elevated rounded-xl p-2.5 border border-subtle">
                        <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Avg Price</p>
                        <p className="text-sm font-bold text-main mt-1 font-mono">
                          {formatMoney(stock.summary.nativeAveragePrice ?? stock.summary.averagePrice, stock.currency || 'USD')}
                        </p>
                        <span className="text-[9px] font-medium text-muted mt-1 block">
                          History mean
                        </span>
                      </div>

                      <div className="bg-surface-elevated rounded-xl p-2.5 border border-subtle">
                        <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Price Range</p>
                        <p className="text-[11px] font-bold text-main mt-1.5 truncate font-mono">
                          {formatMoney(stock.summary.nativeLowestPrice ?? stock.summary.lowestPrice, stock.currency || 'USD', 0)} - {formatMoney(stock.summary.nativeHighestPrice ?? stock.summary.highestPrice, stock.currency || 'USD', 0)}
                        </p>
                        <span className="text-[9px] font-bold text-[#00272b] dark:text-[#e0ff4f] mt-1 block">
                          {stock.summary.totalPriceRecords} log(s)
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 text-center bg-surface-elevated border border-subtle rounded-xl">
                      <p className="text-xs text-muted font-semibold">No price records saved yet</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" onClick={() => setAddModalOpen(false)} />

          <div className="relative bg-surface border border-subtle rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col my-auto max-h-[min(90vh,820px)] animate-fade-in z-10">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-subtle bg-surface-elevated/40 shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-[#e0ff4f]/20 border border-[#e0ff4f]/40 flex items-center justify-center text-[#00272b] dark:text-[#e0ff4f]">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-main">Register Stock</h3>
                  <p className="text-xs text-muted">Add Nairobi (NSE) or Global equities to your tracker</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="p-2 rounded-xl text-muted hover:text-main hover:bg-surface-hover transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddStock} className="flex flex-col flex-1 min-h-0">
              <div className="p-6 space-y-5 overflow-y-auto flex-1">
                {/* Segment Toggle */}
                <div className="grid grid-cols-2 gap-2 bg-surface-elevated p-1.5 rounded-2xl border border-subtle">
                  <button
                    type="button"
                    onClick={() => {
                      setUseCustomTicker(false);
                      const firstStock = POPULAR_STOCKS[0];
                      setFormName(firstStock.name);
                      setFormSymbol(firstStock.symbol);
                      setFormCategory(firstStock.category);
                      setFormDescription(firstStock.description);
                      setFormCurrency(firstStock.currency);
                      setSearchTerm(`${firstStock.symbol} - ${firstStock.name}`);
                      fetchLivePrice(firstStock.symbol);
                    }}
                    className={`py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      !useCustomTicker
                        ? 'bg-[#e0ff4f] text-[#00272b] shadow-sm font-black'
                        : 'text-muted hover:text-main hover:bg-surface'
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                    <span>NSE & Popular Equities</span>
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
                    className={`py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      useCustomTicker
                        ? 'bg-[#e0ff4f] text-[#00272b] shadow-sm font-black'
                        : 'text-muted hover:text-main hover:bg-surface'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Custom Ticker</span>
                  </button>
                </div>

                {!useCustomTicker ? (
                  /* Predefined Asset Selection UI */
                  <div className="space-y-4">
                    <div className="relative">
                      <label className="block text-xs font-bold text-muted uppercase mb-2">Search Stock Catalog</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                          <Search className="h-4 w-4" />
                        </span>
                        <input
                          type="text"
                          placeholder="Search popular or NSE stocks (e.g. SCOM, EQTY, AAPL)..."
                          value={searchTerm}
                          onFocus={() => setDropdownOpen(true)}
                          onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setDropdownOpen(true);
                          }}
                          className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl pl-10 pr-10 py-2.5 text-sm text-main placeholder-muted focus:outline-none transition-all font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => setDropdownOpen(!dropdownOpen)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted hover:text-main cursor-pointer"
                        >
                          <ChevronDown className={`h-4 w-4 transform transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                      </div>

                      {/* Dropdown list */}
                      {dropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-20" onClick={() => setDropdownOpen(false)} />
                          <div className="absolute left-0 right-0 mt-2 max-h-56 overflow-y-auto bg-surface border border-subtle rounded-2xl shadow-2xl z-30 divide-y divide-subtle">
                            {POPULAR_STOCKS.filter(stock => 
                              stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              stock.name.toLowerCase().includes(searchTerm.toLowerCase())
                            ).length === 0 ? (
                              <div className="p-4 text-xs text-muted text-center">
                                No matching popular stocks found. Try &quot;Custom Ticker&quot; to enter any equity code!
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
                                    setFormCurrency(stock.currency);
                                    setSearchTerm(`${stock.symbol} - ${stock.name}`);
                                    setDropdownOpen(false);
                                    fetchLivePrice(stock.symbol);
                                  }}
                                  className="p-3 text-left hover:bg-surface-hover cursor-pointer transition-colors flex items-center justify-between gap-2"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="text-xs font-mono font-black text-main bg-surface-elevated border border-subtle px-2 py-0.5 rounded shrink-0">
                                      {stock.symbol}
                                    </span>
                                    <span className="text-xs font-bold text-main truncate">{stock.name}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                      stock.currency === 'KES'
                                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                        : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                                    }`}>
                                      {stock.currency === 'KES' ? 'NSE (KES)' : 'US (USD)'}
                                    </span>
                                    <span className="text-[10px] text-muted font-medium hidden sm:inline">{stock.category}</span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Preselected stock preview card */}
                    {formSymbol && (
                      <div className="space-y-3 bg-surface-elevated border border-subtle p-4 rounded-2xl relative overflow-hidden">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="block text-[10px] font-bold text-muted uppercase tracking-wider">Selected Counter</span>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="font-mono font-black text-base text-main bg-surface px-2.5 py-0.5 rounded-lg border border-subtle">
                                {formSymbol}
                              </span>
                              <span className="text-sm font-bold text-main">{formName}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <span className="inline-flex px-2 py-0.5 text-[10px] font-bold bg-surface border border-subtle text-secondary rounded-lg">
                              {formCategory}
                            </span>
                            <span className="inline-flex px-2 py-0.5 text-[10px] font-bold bg-surface border border-subtle text-secondary rounded-lg font-mono">
                              {formCurrency}
                            </span>
                          </div>
                        </div>

                        {formDescription && (
                          <p className="text-xs text-muted leading-relaxed line-clamp-2">{formDescription}</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Custom Ticker Form Inputs */
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-muted uppercase mb-2">Stock Code (Ticker)</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          required
                          placeholder="e.g. AAPL, SCOM, TSLA"
                          value={formSymbol}
                          onChange={(e) => setFormSymbol(e.target.value.toUpperCase())}
                          className="flex-1 bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl px-4 py-2.5 text-sm text-main placeholder-muted focus:outline-none transition-all uppercase font-mono font-bold"
                        />
                        <button
                          type="button"
                          disabled={!formSymbol.trim() || livePriceLoading}
                          onClick={() => fetchLivePrice(formSymbol)}
                          className="px-4 py-2 bg-[#e0ff4f]/20 hover:bg-[#e0ff4f]/30 border border-[#e0ff4f]/40 text-[#00272b] dark:text-[#e0ff4f] rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
                        >
                          {livePriceLoading ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Search className="w-3.5 h-3.5" />
                          )}
                          Check Price
                        </button>
                      </div>
                      {getFieldError('symbol') && (
                        <p className="text-rose-500 text-xs mt-1.5 font-medium">{getFieldError('symbol')}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-muted uppercase mb-2">Stock Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Apple Inc."
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl px-4 py-2.5 text-sm text-main placeholder-muted focus:outline-none transition-all font-medium"
                        />
                        {getFieldError('name') && (
                          <p className="text-rose-500 text-xs mt-1.5 font-medium">{getFieldError('name')}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-muted uppercase mb-2">Trading Currency</label>
                        <select
                          value={formCurrency}
                          onChange={(e) => setFormCurrency(e.target.value as 'USD' | 'KES')}
                          className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl px-4 py-2.5 text-sm text-main focus:outline-none transition-all cursor-pointer font-semibold"
                        >
                          <option value="USD">USD ($) — US Dollars</option>
                          <option value="KES">KES (KSh) — Kenyan Shilling</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-muted uppercase mb-2">Sector / Category</label>
                      <select
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                        className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl px-4 py-2.5 text-sm text-main focus:outline-none transition-all cursor-pointer"
                      >
                        {categoriesList.filter((cat) => cat !== 'All').map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-muted uppercase mb-2">Description (Optional)</label>
                      <textarea
                        placeholder="Company profile, business overview, or thesis..."
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        rows={2}
                        className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl px-4 py-2.5 text-sm text-main placeholder-muted focus:outline-none transition-all resize-none"
                      />
                    </div>
                  </div>
                )}

                {/* Live Price Quote Preview Card */}
                {(livePriceLoading || livePrice || livePriceError) && (
                  <div className="p-4 rounded-2xl border border-subtle bg-surface-elevated transition-all">
                    {livePriceLoading && (
                      <div className="flex items-center justify-center gap-2 py-2 text-xs font-semibold text-[#00272b] dark:text-[#e0ff4f]">
                        <RefreshCw className="w-4 h-4 animate-spin text-[#00272b] dark:text-[#e0ff4f]" />
                        Fetching latest market price...
                      </div>
                    )}
                    {livePriceError && !livePriceLoading && (
                      <div className="flex items-center gap-2 text-xs text-rose-500 font-semibold py-1">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{livePriceError}</span>
                      </div>
                    )}
                    {livePrice && !livePriceLoading && (
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Latest Market Quote</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-surface border border-subtle text-muted">
                              {livePrice.provider === 'nse' ? 'NSE Kenya Feed' : livePrice.provider}
                            </span>
                          </div>
                          <span className="text-xl font-black text-main font-mono mt-0.5 block">
                            {formatMoney(livePrice.price, livePrice.currency || formCurrency)}
                          </span>
                        </div>
                        {livePrice.change !== undefined && livePrice.changePercent !== undefined && (
                          <div className="text-right">
                            <span className="text-[10px] font-bold text-muted uppercase block tracking-wider">Day Change</span>
                            <span className={`text-xs font-black inline-flex items-center gap-1 ${
                              livePrice.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                            }`}>
                              {livePrice.change >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                              {formatMoney(Math.abs(livePrice.change), livePrice.currency || formCurrency)} ({livePrice.changePercent.toFixed(2)}%)
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Sticky Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-subtle bg-surface-elevated/40 shrink-0">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-muted hover:text-main hover:bg-surface-hover transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formSymbol.trim()}
                  className="px-6 py-2.5 rounded-xl text-xs font-black text-[#00272b] bg-[#e0ff4f] hover:bg-[#d2f33b] transition-all cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Registering...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Register Stock
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Stock Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" onClick={() => setEditModalOpen(false)} />

          <div className="relative bg-surface border border-subtle rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col my-auto max-h-[min(90vh,720px)] animate-fade-in z-10">
            <div className="flex items-center justify-between px-6 py-5 border-b border-subtle bg-surface-elevated/40 shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-[#e0ff4f]/20 border border-[#e0ff4f]/40 flex items-center justify-center text-[#00272b] dark:text-[#e0ff4f]">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-main">Edit Stock</h3>
                  <p className="text-xs text-muted">Modify profile details for {formSymbol}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="p-2 rounded-xl text-muted hover:text-main hover:bg-surface-hover transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditStock} className="flex flex-col flex-1 min-h-0">
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-bold text-muted uppercase mb-2">Stock Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apple Inc."
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl px-4 py-2.5 text-sm text-main placeholder-muted focus:outline-none transition-all font-medium"
                  />
                  {getFieldError('name') && (
                    <p className="text-rose-500 text-xs mt-1.5 font-medium">{getFieldError('name')}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted uppercase mb-2">Stock Code (Ticker)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AAPL"
                    value={formSymbol}
                    onChange={(e) => setFormSymbol(e.target.value.toUpperCase())}
                    className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl px-4 py-2.5 text-sm text-main placeholder-muted focus:outline-none transition-all uppercase font-mono font-bold"
                  />
                  {getFieldError('symbol') && (
                    <p className="text-rose-500 text-xs mt-1.5 font-medium">{getFieldError('symbol')}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted uppercase mb-2">Sector / Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl px-4 py-2.5 text-sm text-main focus:outline-none transition-all cursor-pointer"
                  >
                    {categoriesList.filter((cat) => cat !== 'All').map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted uppercase mb-2">Trading Currency</label>
                  <div className="w-full bg-surface-elevated/60 border border-subtle rounded-xl px-4 py-2.5 text-xs text-secondary font-mono font-bold">
                    {formCurrency === 'KES' ? 'KES (KSh) — Kenyan Shilling' : 'USD ($) — US Dollars'}
                  </div>
                  <p className="text-[10px] text-muted mt-1">
                    Trading currency cannot be modified to preserve transaction and ledger integrity.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted uppercase mb-2">Description (Optional)</label>
                  <textarea
                    placeholder="Details about company profile or metrics..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    rows={3}
                    className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl px-4 py-2.5 text-sm text-main placeholder-muted focus:outline-none transition-all resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between px-6 py-4 border-t border-subtle bg-surface-elevated/40 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-muted hover:text-main hover:bg-surface-hover transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl text-xs font-black text-[#00272b] bg-[#e0ff4f] hover:bg-[#d2f33b] transition-all cursor-pointer shadow-md flex items-center gap-2"
                >
                  <Check className="w-3.5 h-3.5" />
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Stock Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" onClick={() => setDeleteModalOpen(false)} />

          <div className="relative bg-surface border border-subtle rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl space-y-6 my-auto z-10 animate-fade-in">
            <div className="h-12 w-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500 mx-auto">
              <AlertCircle className="h-6 w-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-main">Delete Stock?</h3>
              <p className="text-xs text-muted leading-relaxed">
                Are you sure you want to delete <span className="font-bold text-main">{formName} ({formSymbol})</span>?
                This will also delete all historical price logs associated with this counter.
              </p>
            </div>

            <div className="flex items-center justify-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-muted hover:text-main hover:bg-surface-hover transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteStock}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition-all cursor-pointer shadow-md"
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
