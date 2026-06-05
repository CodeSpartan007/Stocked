'use client';

import { API_BASE } from '../../lib/api';

import React, { useEffect, useState, useRef } from 'react';
import ExportActionsDropdown from '../../components/ExportActionsDropdown';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import {
  TrendingUp,
  BarChart2,
  PieChart as PieIcon,
  Target,
  Percent,
  Calendar,
  AlertCircle,
  Plus,
  CheckCircle2,
  DollarSign,
  Activity
} from 'lucide-react';

interface ChartData {
  priceTrend: { date: string; price: number }[];
  volumeTrend: { date: string; volume: number }[];
  cumulativePerformance: {
    date: string;
    portfolioValue: number;
    investedCapital: number;
    realizedPL: number;
    unrealizedPL: number;
    totalPL: number;
  }[];
}

interface AdvancedMetrics {
  totalReturnPercent: number;
  annualizedReturnPercent: number;
  volatility: number;
  assetAllocation: {
    stockId: string;
    symbol: string;
    name: string;
    category: string;
    marketValue: number;
    percentage: number;
  }[];
  totalPortfolioValue: number;
  totalInvestedCapital: number;
}

interface PerformanceTarget {
  id: string;
  targetName: string;
  targetType: 'portfolio_value' | 'total_return' | 'annualized_return';
  targetValue: number;
  targetDate: string;
  isAchieved: boolean;
  currentValue: number;
  progressPercent: number;
}

interface BenchmarkItem {
  stockId: string;
  symbol: string;
  name: string;
  startPrice: number | null;
  endPrice: number | null;
  performanceGain: number;
}

export default function AnalyticsPage() {
  // Dynamically compute the first and last day of the current month (YYYY-MM-DD)
  const getInitialDates = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const format = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    return {
      start: format(firstDay),
      end: format(lastDay),
    };
  };

  const initialDates = getInitialDates();

  // Date states
  const [startDate, setStartDate] = useState(initialDates.start);
  const [endDate, setEndDate] = useState(initialDates.end);

  // Selected Stock ID for chart filtering ('portfolio' or specific stock ID)
  const [selectedStockId, setSelectedStockId] = useState('portfolio');
  const [stocksList, setStocksList] = useState<{ id: string; symbol: string; name: string }[]>([]);

  // Data states
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [metrics, setMetrics] = useState<AdvancedMetrics | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarkItem[]>([]);
  const [targets, setTargets] = useState<PerformanceTarget[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Target Form states
  const [newTargetName, setNewTargetName] = useState('');
  const [newTargetType, setNewTargetType] = useState<'portfolio_value' | 'total_return' | 'annualized_return'>('portfolio_value');
  const [newTargetValue, setNewTargetValue] = useState('');
  const [newTargetDate, setNewTargetDate] = useState('2026-12-31');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Active Tab state for Charts
  const [activeChartTab, setActiveChartTab] = useState<'performance' | 'price' | 'volume'>('performance');

  // Keep references to abort controllers to cancel previous pending requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch Stocks List initially
  useEffect(() => {
    async function fetchStocks() {
      try {
        const res = await fetch(`${API_BASE}/api/stocks`,
{
          credentials: 'include'
        });
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (json.success) {
          setStocksList(json.data);
        }
      } catch (err) {
        console.error('Failed to load stocks list.');
      }
    }
    fetchStocks();
  }, []);

  // Primary data fetcher binding to startDate, endDate, selectedStockId
  useEffect(() => {
    // 1. Cancel previous pending fetch requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 2. Create a new AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;

    async function fetchAnalyticsData() {
      try {
        setLoading(true);
        setError(null);

        const signal = controller.signal;
        const queryParams = `startDate=${startDate}&endDate=${endDate}`;

        const [chartsRes, metricsRes, benchmarkRes, targetsRes] = await Promise.all([
          fetch(`${API_BASE}/api/analytics/charts/${selectedStockId}?${queryParams}`, { signal, credentials: 'include' }),
          fetch(`${API_BASE}/api/analytics/advanced?${queryParams}`, { signal, credentials: 'include' }),
          fetch(`${API_BASE}/api/analytics/benchmark?${queryParams}`, { signal, credentials: 'include' }),
          fetch(`${API_BASE}/api/analytics/targets`, { signal, credentials: 'include' })
        ]);

        if (!chartsRes.ok || !metricsRes.ok || !benchmarkRes.ok || !targetsRes.ok) {
          throw new Error('Server returned an error status code.');
        }

        const chartsJson = await chartsRes.json();
        const metricsJson = await metricsRes.json();
        const benchmarkJson = await benchmarkRes.json();
        const targetsJson = await targetsRes.json();

        if (
          chartsJson.success &&
          metricsJson.success &&
          benchmarkJson.success &&
          targetsJson.success
        ) {
          setChartData(chartsJson.data);
          setMetrics(metricsJson.data);
          setBenchmarks(benchmarkJson.data);
          setTargets(targetsJson.data);
        } else {
          throw new Error('API reported unsuccessful payload parsing.');
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error(err);
          setError('Failed to refresh data feeds. Verify that the backend server is running.');
        }
      } finally {
        // Prevent setting loading false if it was aborted (another request is already running)
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchAnalyticsData();

    // Cleanup hook to abort when unmounting or re-running
    return () => {
      controller.abort();
    };
  }, [startDate, endDate, selectedStockId]);

  // Handle target creation
  const handleAddTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormSuccess(null);
    setFormError(null);

    try {
      const res = await fetch(`${API_BASE}/api/analytics/targets`,
{
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetName: newTargetName,
          targetType: newTargetType,
          targetValue: Number(newTargetValue),
          targetDate: newTargetDate
        }),
        credentials: 'include'
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setFormSuccess('Goal metric successfully registered!');
        setNewTargetName('');
        setNewTargetValue('');
        // Refresh targets checklist
        const updatedTargetsRes = await fetch(`${API_BASE}/api/analytics/targets`,
{
          credentials: 'include'
        });
        const updatedJson = await updatedTargetsRes.json();
        if (updatedJson.success) {
          setTargets(updatedJson.data);
        }
      } else {
        throw new Error(json.message || 'Validation error saving target.');
      }
    } catch (err: any) {
      setFormError(err.message || 'Connection breakdown sending target profile.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Curated elegant color scheme variables for asset allocation donut cells
  const DOUGHNUT_COLORS = ['#6366f1', '#10b981', '#f43f5e', '#8b5cf6', '#eab308', '#ec4899', '#3b82f6'];

  return (
    <div className="space-y-8 text-slate-100 pb-12">
      {/* Page Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black bg-gradient-to-r from-indigo-200 via-slate-100 to-emerald-200 bg-clip-text text-transparent flex items-center gap-3">
            <Activity className="text-indigo-400 h-8 w-8" />
            Performance &amp; Insights
          </h1>
          <p className="text-slate-400 text-xs mt-1">
            View net returns, investment mix, and set financial goals.
          </p>
        </div>

        {/* Global Filter Bar */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-3 flex flex-wrap items-center gap-4 shadow-lg">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date Filters:</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            />
            <span className="text-slate-500 text-xs">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div className="border-l border-slate-800 h-6 hidden md:block" />

          {/* Stock Scope Select dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scope:</span>
            <select
              value={selectedStockId}
              onChange={(e) => setSelectedStockId(e.target.value)}
              className="bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-semibold"
            >
              <option value="portfolio">💼 Entire Portfolio</option>
              {stocksList.map((s) => (
                <option key={s.id} value={s.id}>
                  📈 {s.symbol} - {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-2xl text-xs font-semibold flex items-center gap-2.5">
          <AlertCircle className="h-5 w-5 text-rose-400 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Metrics Header with Export Actions */}
      <div className="relative z-30 flex items-center justify-between bg-slate-900/10 backdrop-blur-md border border-slate-800/40 rounded-2xl p-4 shadow-md">
        <div>
          <h2 className="text-xs font-black uppercase tracking-wider text-indigo-400">Key Metrics View</h2>
          <p className="text-[9px] text-slate-500 font-medium">Returns, growth, and total market value</p>
        </div>
        <ExportActionsDropdown 
          reportType="analytics" 
          stockId={selectedStockId === 'portfolio' ? undefined : selectedStockId} 
          startDate={startDate} 
          endDate={endDate} 
        />
      </div>

      {/* Advanced Quantitative Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Return Card */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-lg relative overflow-hidden group hover:border-indigo-500/30 transition-all duration-300">
          <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500/80" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Total Gain/Loss (%)</span>
            <span className="h-7 w-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Percent className="h-4 w-4" />
            </span>
          </div>
          <h3 className={`text-3xl font-black mt-4 tracking-tight ${
            (metrics?.totalReturnPercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {loading ? (
              <span className="inline-block w-24 h-9 bg-slate-800 animate-pulse rounded" />
            ) : (
              `${(metrics?.totalReturnPercent ?? 0) >= 0 ? '+' : ''}${(metrics?.totalReturnPercent ?? 0).toFixed(2)}%`
            )}
          </h3>
          <p className="text-[10px] text-slate-400 mt-2 font-medium">Total gain or loss on your money put in</p>
        </div>

        {/* Annualized Return Card */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-lg relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-300">
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500/80" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Annual Growth Rate (CAGR)</span>
            <span className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
          <h3 className={`text-3xl font-black mt-4 tracking-tight ${
            (metrics?.annualizedReturnPercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {loading ? (
              <span className="inline-block w-24 h-9 bg-slate-800 animate-pulse rounded" />
            ) : (
              `${(metrics?.annualizedReturnPercent ?? 0) >= 0 ? '+' : ''}${(metrics?.annualizedReturnPercent ?? 0).toFixed(2)}%`
            )}
          </h3>
          <p className="text-[10px] text-slate-400 mt-2 font-medium">Compounded annual growth rate</p>
        </div>

        {/* Volatility Index Card */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-lg relative overflow-hidden group hover:border-rose-500/30 transition-all duration-300">
          <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500/80" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Stock Volatility</span>
            <span className="h-7 w-7 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <Activity className="h-4 w-4" />
            </span>
          </div>
          <h3 className="text-3xl font-black mt-4 tracking-tight text-white">
            {loading ? (
              <span className="inline-block w-24 h-9 bg-slate-800 animate-pulse rounded" />
            ) : (
              `${(metrics?.volatility ?? 0).toFixed(3)}%`
            )}
          </h3>
          <p className="text-[10px] text-slate-400 mt-2 font-medium">Price stability of your active shares</p>
        </div>

        {/* Total Assets Valuation Card */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-lg relative overflow-hidden group hover:border-indigo-500/30 transition-all duration-300">
          <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Current Value</span>
            <span className="h-7 w-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <DollarSign className="h-4 w-4" />
            </span>
          </div>
          <h3 className="text-3xl font-black mt-4 tracking-tight text-slate-100">
            {loading ? (
              <span className="inline-block w-24 h-9 bg-slate-800 animate-pulse rounded" />
            ) : (
              `$${(metrics?.totalPortfolioValue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
            )}
          </h3>
          <p className="text-[10px] text-slate-400 mt-2 font-medium">Market value of your active shares</p>
        </div>
      </div>

      {/* Primary Chart Visualization Panels */}
      <div className="bg-slate-900/20 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <BarChart2 className="text-indigo-400 h-5 w-5" />
              Portfolio Value Over Time
            </h2>
            <p className="text-xs text-slate-400">
              Interactive visualizations plotting your {selectedStockId === 'portfolio' ? 'cumulative portfolio performance' : 'stock price history'}.
            </p>
          </div>

          {/* Visual Tabs */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 self-start sm:self-auto">
            <button
              onClick={() => setActiveChartTab('performance')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeChartTab === 'performance'
                  ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              Total Gains/Losses
            </button>
            <button
              onClick={() => setActiveChartTab('price')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeChartTab === 'price'
                  ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              Price Trend
            </button>
            <button
              onClick={() => setActiveChartTab('volume')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeChartTab === 'volume'
                  ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              Volume Trend
            </button>
          </div>
        </div>

        {/* Charts Container */}
        <div className="h-[360px] w-full relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/10 rounded-xl border border-dashed border-slate-800">
              <div className="flex flex-col items-center gap-2">
                <svg className="animate-spin h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-xs font-semibold text-slate-400">Loading charts, plotting data...</span>
              </div>
            </div>
          ) : !chartData ||
            (activeChartTab === 'performance' && chartData.cumulativePerformance.length === 0) ||
            (activeChartTab === 'price' && chartData.priceTrend.length === 0) ||
            (activeChartTab === 'volume' && chartData.volumeTrend.length === 0) ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl gap-2 text-slate-400">
              <BarChart2 className="h-10 w-10 text-slate-600" />
              <p className="text-xs font-medium">No price records found for this selection.</p>
              <p className="text-[10px] text-slate-500">Add price history points or adjust target dates.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {activeChartTab === 'performance' ? (
                <AreaChart data={chartData.cumulativePerformance} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradTotalPL" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.9)',
                      border: '1px solid rgba(148, 163, 184, 0.1)',
                      borderRadius: '12px',
                      color: '#f8fafc',
                      fontSize: '11px'
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Area
                    type="monotone"
                    name="Total Gains/Losses ($)"
                    dataKey="totalPL"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#gradTotalPL)"
                  />
                  <Area
                    type="monotone"
                    name="Current Value ($)"
                    dataKey="portfolioValue"
                    stroke="#6366f1"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    fill="transparent"
                  />
                  <Area
                    type="monotone"
                    name="Money Put In ($)"
                    dataKey="investedCapital"
                    stroke="#f43f5e"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    fill="transparent"
                  />
                </AreaChart>
              ) : activeChartTab === 'price' ? (
                <AreaChart data={chartData.priceTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.9)',
                      border: '1px solid rgba(148, 163, 184, 0.1)',
                      borderRadius: '12px',
                      color: '#f8fafc',
                      fontSize: '11px'
                    }}
                  />
                  <Area
                    type="monotone"
                    name="Closing Price ($)"
                    dataKey="price"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#gradPrice)"
                    dot={{ stroke: '#6366f1', strokeWidth: 1.5, r: 2 }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                </AreaChart>
              ) : (
                <BarChart data={chartData.volumeTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.9)',
                      border: '1px solid rgba(148, 163, 184, 0.1)',
                      borderRadius: '12px',
                      color: '#f8fafc',
                      fontSize: '11px'
                    }}
                  />
                  <Bar name="Trading Volume" dataKey="volume" fill="#059669" radius={[4, 4, 0, 0]}>
                    {chartData.volumeTrend.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill="#059669" opacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Asset Allocation & Benchmarking split panels */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Asset Allocation Donut Chart */}
        <div className="lg:col-span-2 bg-slate-900/20 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <PieIcon className="text-emerald-400 h-5 w-5" />
              My Investment Mix
            </h2>
            <p className="text-xs text-slate-400 mt-1">Diversification mix of your current stocks</p>
          </div>

          <div className="h-60 w-full relative flex items-center justify-center my-4">
            {loading ? (
              <div className="h-16 w-16 rounded-full border-4 border-indigo-500/25 border-t-indigo-500 animate-spin" />
            ) : !metrics || metrics.assetAllocation.length === 0 ? (
              <div className="text-center text-slate-500 text-xs py-10">No active stock holdings to distribute.</div>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={metrics.assetAllocation}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="marketValue"
                    >
                      {metrics.assetAllocation.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={DOUGHNUT_COLORS[index % DOUGHNUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any) => [`$${Number(value).toLocaleString()}`, 'Valuation']}
                      contentStyle={{
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        border: '1px solid rgba(148, 163, 184, 0.1)',
                        borderRadius: '12px',
                        color: '#f8fafc',
                        fontSize: '11px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Mid Donut text */}
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Value</span>
                  <span className="text-sm font-extrabold text-white mt-0.5">
                    ${(metrics?.totalPortfolioValue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Allocation Legend */}
          <div className="space-y-2.5 max-h-32 overflow-y-auto pr-1">
            {!loading &&
              metrics?.assetAllocation.map((item, index) => (
                <div key={item.stockId} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: DOUGHNUT_COLORS[index % DOUGHNUT_COLORS.length] }}
                    />
                    <span className="font-extrabold text-slate-200 font-mono w-10">{item.symbol}</span>
                    <span className="text-slate-400 truncate max-w-[120px]">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-slate-300 font-mono">${item.marketValue.toLocaleString()}</span>
                    <span className="text-[10px] text-slate-400 font-semibold ml-2 font-mono">{item.percentage}%</span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Benchmarking Counters Panel */}
        <div className="lg:col-span-3 bg-slate-900/20 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-6">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <TrendingUp className="text-indigo-400 h-5 w-5" />
              Stock Performance Comparison
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Compare stock price changes within the selected dates.
            </p>
          </div>

          <div className="overflow-hidden border border-slate-850 rounded-xl max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-12 text-center text-slate-500 text-xs">Awaiting benchmarking calculations...</div>
            ) : benchmarks.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs">No performance records found.</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/70 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-800/80">
                    <th className="px-4 py-3">Stock Name &amp; Symbol</th>
                    <th className="px-4 py-3 text-right">Start Price</th>
                    <th className="px-4 py-3 text-right">End Price</th>
                    <th className="px-4 py-3 text-right">Gains/Losses (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-xs font-medium">
                  {benchmarks.map((item) => {
                    const isPositive = item.performanceGain >= 0;
                    return (
                      <tr key={item.stockId} className="hover:bg-slate-900/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="h-6 w-10 rounded bg-slate-850 flex items-center justify-center text-xs font-bold text-indigo-300">
                              {item.symbol}
                            </span>
                            <span className="text-slate-300 truncate max-w-[120px]">{item.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-400">
                          {item.startPrice !== null ? `$${item.startPrice.toFixed(2)}` : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-400">
                          {item.endPrice !== null ? `$${item.endPrice.toFixed(2)}` : 'N/A'}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-extrabold ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {item.startPrice !== null && item.endPrice !== null ? (
                            `${isPositive ? '+' : ''}${item.performanceGain.toFixed(2)}%`
                          ) : (
                            '0.00%'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Target Progress checklist & target register Form widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Active Target checklist */}
        <div className="lg:col-span-3 bg-slate-900/20 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-6">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Target className="text-rose-400 h-5 w-5" />
              My Financial Goals
            </h2>
            <p className="text-xs text-slate-400 mt-1">Track progress towards your investment milestones</p>
          </div>

          <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
            {loading ? (
              <div className="p-8 text-center text-slate-500 text-xs">Parsing user milestone trackers...</div>
            ) : targets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 border border-dashed border-slate-800 rounded-xl space-y-2">
                <Target className="h-8 w-8 text-slate-700" />
                <p className="text-xs text-slate-400 font-medium">No financial goals set yet.</p>
                <p className="text-[10px] text-slate-500">Create a goal in the form below to start tracking.</p>
              </div>
            ) : (
              targets.map((t) => (
                <div
                  key={t.id}
                  className="bg-slate-950/40 border border-slate-850 hover:border-slate-800 transition-all rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-100">{t.targetName}</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                        Target Date: {t.targetDate} &bull; Type:{' '}
                        <span className="font-extrabold text-indigo-400">{t.targetType.replace('_', ' ')}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {t.isAchieved ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3 w-3" />
                          ACHIEVED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                          IN PROGRESS
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress Tracker Slider Meter */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-slate-400 font-medium">
                        Current: {t.targetType === 'portfolio_value' ? '$' : ''}
                        {t.currentValue.toLocaleString()}
                        {t.targetType !== 'portfolio_value' ? '%' : ''}
                      </span>
                      <span className="text-slate-200 font-bold">{t.progressPercent}%</span>
                      <span className="text-slate-400 font-medium font-mono">
                        Goal: {t.targetType === 'portfolio_value' ? '$' : ''}
                        {t.targetValue.toLocaleString()}
                        {t.targetType !== 'portfolio_value' ? '%' : ''}
                      </span>
                    </div>

                    <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-850">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          t.isAchieved
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                            : 'bg-gradient-to-r from-indigo-500 to-violet-500 shadow-[0_0_8px_rgba(99,102,241,0.3)]'
                        }`}
                        style={{ width: `${t.progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Target Profile Register Widget */}
        <div className="lg:col-span-2 bg-slate-900/20 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="text-indigo-400 h-5 w-5" />
              Create a Goal
            </h2>
            <p className="text-xs text-slate-400 mt-1">Set a new target to keep your investments on track</p>
          </div>

          <form onSubmit={handleAddTarget} className="space-y-4 my-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Goal Name
              </label>
              <input
                type="text"
                required
                value={newTargetName}
                onChange={(e) => setNewTargetName(e.target.value)}
                placeholder="e.g. House Down Payment"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder-slate-650"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Target Metric
                </label>
                <select
                  value={newTargetType}
                  onChange={(e) => setNewTargetType(e.target.value as any)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-semibold"
                >
                  <option value="portfolio_value">Portfolio Value ($)</option>
                  <option value="total_return">Total Return (%)</option>
                  <option value="annualized_return">Annual CAGR (%)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Target Amount
                </label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="any"
                  value={newTargetValue}
                  onChange={(e) => setNewTargetValue(e.target.value)}
                  placeholder="e.g. 50000"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Target Date
              </label>
              <input
                type="date"
                required
                value={newTargetDate}
                onChange={(e) => setNewTargetDate(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            {formError && <p className="text-rose-400 text-[11px] font-bold">{formError}</p>}
            {formSuccess && <p className="text-emerald-400 text-[11px] font-bold">{formSuccess}</p>}

            <button
              type="submit"
              disabled={formSubmitting}
              className="w-full flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-xl text-xs shadow-lg shadow-indigo-600/10 hover:shadow-indigo-500/20 active:scale-95 transition-all disabled:opacity-50"
            >
              {formSubmitting ? 'Saving Goal...' : 'Save Goal'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
