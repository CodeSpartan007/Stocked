'use client';

import { API_BASE } from '../../lib/api';

import React, { useEffect, useState, useRef } from 'react';
import ExportActionsDropdown from '../../components/ExportActionsDropdown';
import { useTheme } from '@/app/context/ThemeContext';
import {
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
  Activity,
  Pencil,
  Trash2,
  X
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
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

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
        const res = await fetch(`${API_BASE}/api/stocks`, {
          credentials: 'include'
        });
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (json.success) {
          setStocksList(json.data);
        }
      } catch (err: unknown) {
        console.error('Failed to load stocks list.', err);
      }
    }
    fetchStocks();
  }, []);

  // Primary data fetcher binding to startDate, endDate, selectedStockId
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

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
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        console.error(err);
        setError('Failed to refresh data feeds. Verify that the backend server is running.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchAnalyticsData();

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
      const res = await fetch(`${API_BASE}/api/analytics/targets`, {
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
        const updatedTargetsRes = await fetch(`${API_BASE}/api/analytics/targets`, {
          credentials: 'include'
        });
        const updatedJson = await updatedTargetsRes.json();
        if (updatedJson.success) {
          setTargets(updatedJson.data);
        }
      } else {
        throw new Error(json.message || 'Validation error saving target.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection breakdown sending target profile.';
      setFormError(msg);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Target Edit states
  const [editingTarget, setEditingTarget] = useState<PerformanceTarget | null>(null);
  const [editTargetName, setEditTargetName] = useState('');
  const [editTargetType, setEditTargetType] = useState<'portfolio_value' | 'total_return' | 'annualized_return'>('portfolio_value');
  const [editTargetValue, setEditTargetValue] = useState('');
  const [editTargetDate, setEditTargetDate] = useState('');
  const [editIsAchieved, setEditIsAchieved] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const handleStartEditTarget = (t: PerformanceTarget) => {
    setEditingTarget(t);
    setEditTargetName(t.targetName);
    setEditTargetType(t.targetType);
    setEditTargetValue(String(t.targetValue));
    setEditTargetDate(t.targetDate);
    setEditIsAchieved(t.isAchieved);
    setEditError(null);
  };

  const handleSaveEditTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTarget) return;

    setEditSubmitting(true);
    setEditError(null);

    try {
      const res = await fetch(`${API_BASE}/api/analytics/targets/${editingTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetName: editTargetName,
          targetType: editTargetType,
          targetValue: Number(editTargetValue),
          targetDate: editTargetDate,
          isAchieved: editIsAchieved,
        }),
        credentials: 'include',
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setEditingTarget(null);
        const updatedTargetsRes = await fetch(`${API_BASE}/api/analytics/targets`, {
          credentials: 'include',
        });
        const updatedJson = await updatedTargetsRes.json();
        if (updatedJson.success) {
          setTargets(updatedJson.data);
        }
      } else {
        throw new Error(json.message || 'Failed to update performance target.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating performance target.';
      setEditError(msg);
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteTarget = async (id: string, name: string) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete the goal "${name}"?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`${API_BASE}/api/analytics/targets/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setTargets((prev) => prev.filter((t) => t.id !== id));
      } else {
        throw new Error(json.message || 'Failed to delete target.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Could not delete goal: ${msg}`);
    }
  };

  // Coordinated palette for asset allocation donut slices
  const DOUGHNUT_COLORS = isDark
    ? ['#e0ff4f', '#00e599', '#38bdf8', '#f43f5e', '#a78bfa', '#fbbf24', '#2dd4bf']
    : ['#00272b', '#059669', '#0284c7', '#e11d48', '#7c3aed', '#d97706', '#0f766e'];

  const gridStroke = isDark ? '#085862' : '#ccdfda';
  const axisStroke = isDark ? '#9bbbc0' : '#55797e';
  const tooltipStyle = {
    backgroundColor: isDark ? '#023439' : '#ffffff',
    border: `1px solid ${isDark ? '#085862' : '#ccdfda'}`,
    borderRadius: '12px',
    color: isDark ? '#f4fbf8' : '#00272b',
    fontSize: '11px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
  };

  return (
    <div className="space-y-8 text-main pb-12">
      {/* Page Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-main flex items-center gap-3">
            <Activity className="text-[#00272b] dark:text-[#e0ff4f] h-8 w-8" />
            Performance &amp; Insights
          </h1>
          <p className="text-muted text-xs mt-1">
            View net returns, investment mix, and set financial goals.
          </p>
        </div>

        {/* Global Filter Bar */}
        <div className="bg-surface backdrop-blur-xl border border-subtle rounded-2xl p-3 flex flex-wrap items-center gap-4 shadow-lg">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted" />
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Date Filters:</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-surface-elevated border border-subtle rounded-lg px-2.5 py-1 text-xs text-main focus:outline-none focus:border-[#e0ff4f] font-mono"
            />
            <span className="text-muted text-xs">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-surface-elevated border border-subtle rounded-lg px-2.5 py-1 text-xs text-main focus:outline-none focus:border-[#e0ff4f] font-mono"
            />
          </div>

          <div className="border-l border-subtle h-6 hidden md:block" />

          {/* Stock Scope Select dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Scope:</span>
            <select
              value={selectedStockId}
              onChange={(e) => setSelectedStockId(e.target.value)}
              className="bg-surface-elevated border border-subtle rounded-lg px-2.5 py-1 text-xs text-main focus:outline-none focus:border-[#e0ff4f] font-semibold"
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
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl text-xs font-semibold flex items-center gap-2.5">
          <AlertCircle className="h-5 w-5 text-rose-500 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Metrics Header with Export Actions */}
      <div className="relative z-30 flex items-center justify-between bg-surface backdrop-blur-md border border-subtle rounded-2xl p-4 shadow-md">
        <div>
          <h2 className="text-xs font-black uppercase tracking-wider text-[#00272b] dark:text-[#e0ff4f]">Key Metrics View</h2>
          <p className="text-[9px] text-muted font-medium">Returns, growth, and total market value</p>
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
        <div className="bg-surface backdrop-blur-xl border border-subtle hover:border-[#e0ff4f]/60 rounded-2xl p-6 shadow-lg relative overflow-hidden group transition-all duration-300">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-muted uppercase">Total Gain/Loss (%)</span>
            <span className="h-7 w-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Percent className="h-4 w-4" />
            </span>
          </div>
          <h3 className={`text-3xl font-black mt-4 tracking-tight ${
            (metrics?.totalReturnPercent ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
          }`}>
            {loading ? (
              <span className="inline-block w-24 h-9 bg-surface-elevated animate-pulse rounded" />
            ) : (
              `${(metrics?.totalReturnPercent ?? 0) >= 0 ? '+' : ''}${(metrics?.totalReturnPercent ?? 0).toFixed(2)}%`
            )}
          </h3>
          <p className="text-[10px] text-muted mt-2 font-medium">Total gain or loss on your money put in</p>
        </div>

        {/* Annualized Return Card */}
        <div className="bg-surface backdrop-blur-xl border border-subtle hover:border-[#e0ff4f]/60 rounded-2xl p-6 shadow-lg relative overflow-hidden group transition-all duration-300">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-muted uppercase">Annual Growth Rate (CAGR)</span>
            <span className="h-7 w-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
          <h3 className={`text-3xl font-black mt-4 tracking-tight ${
            (metrics?.annualizedReturnPercent ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
          }`}>
            {loading ? (
              <span className="inline-block w-24 h-9 bg-surface-elevated animate-pulse rounded" />
            ) : (
              `${(metrics?.annualizedReturnPercent ?? 0) >= 0 ? '+' : ''}${(metrics?.annualizedReturnPercent ?? 0).toFixed(2)}%`
            )}
          </h3>
          <p className="text-[10px] text-muted mt-2 font-medium">Compounded annual growth rate</p>
        </div>

        {/* Volatility Index Card */}
        <div className="bg-surface backdrop-blur-xl border border-subtle hover:border-rose-500/50 rounded-2xl p-6 shadow-lg relative overflow-hidden group transition-all duration-300">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-rose-500" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-muted uppercase">Stock Volatility</span>
            <span className="h-7 w-7 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Activity className="h-4 w-4" />
            </span>
          </div>
          <h3 className="text-3xl font-black mt-4 tracking-tight text-main">
            {loading ? (
              <span className="inline-block w-24 h-9 bg-surface-elevated animate-pulse rounded" />
            ) : (
              `${(metrics?.volatility ?? 0).toFixed(3)}%`
            )}
          </h3>
          <p className="text-[10px] text-muted mt-2 font-medium">Price stability of your active shares</p>
        </div>

        {/* Total Assets Valuation Card */}
        <div className="bg-surface backdrop-blur-xl border border-subtle hover:border-[#e0ff4f] rounded-2xl p-6 shadow-lg relative overflow-hidden group transition-all duration-300">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#e0ff4f]" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-muted uppercase">Current Value</span>
            <span className="h-7 w-7 rounded-lg bg-[#e0ff4f] text-[#00272b] flex items-center justify-center font-bold">
              <DollarSign className="h-4 w-4" />
            </span>
          </div>
          <h3 className="text-3xl font-black mt-4 tracking-tight text-main">
            {loading ? (
              <span className="inline-block w-24 h-9 bg-surface-elevated animate-pulse rounded" />
            ) : (
              `$${(metrics?.totalPortfolioValue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
            )}
          </h3>
          <p className="text-[10px] text-muted mt-2 font-medium">Market value of your active shares</p>
        </div>
      </div>

      {/* Primary Chart Visualization Panels */}
      <div className="bg-surface backdrop-blur-md border border-subtle rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-subtle pb-4">
          <div>
            <h2 className="text-lg font-bold text-main flex items-center gap-2">
              <BarChart2 className="text-[#00272b] dark:text-[#e0ff4f] h-5 w-5" />
              Portfolio Value Over Time
            </h2>
            <p className="text-xs text-muted">
              Interactive visualizations plotting your {selectedStockId === 'portfolio' ? 'cumulative portfolio performance' : 'stock price history'}.
            </p>
          </div>

          {/* Visual Tabs */}
          <div className="flex bg-surface-elevated p-1 rounded-xl border border-subtle self-start sm:self-auto">
            <button
              onClick={() => setActiveChartTab('performance')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeChartTab === 'performance'
                  ? 'bg-[#e0ff4f] text-[#00272b] shadow-sm'
                  : 'text-muted hover:text-main'
              }`}
            >
              Total Gains/Losses
            </button>
            <button
              onClick={() => setActiveChartTab('price')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeChartTab === 'price'
                  ? 'bg-[#e0ff4f] text-[#00272b] shadow-sm'
                  : 'text-muted hover:text-main'
              }`}
            >
              Price Trend
            </button>
            <button
              onClick={() => setActiveChartTab('volume')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeChartTab === 'volume'
                  ? 'bg-[#e0ff4f] text-[#00272b] shadow-sm'
                  : 'text-muted hover:text-main'
              }`}
            >
              Volume Trend
            </button>
          </div>
        </div>

        {/* Charts Container */}
        <div className="h-[360px] w-full relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-surface-elevated/50 rounded-xl border border-dashed border-subtle">
              <div className="flex flex-col items-center gap-2">
                <svg className="animate-spin h-8 w-8 text-[#00272b] dark:text-[#e0ff4f]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-xs font-semibold text-muted">Loading charts, plotting data...</span>
              </div>
            </div>
          ) : !chartData ||
            (activeChartTab === 'performance' && chartData.cumulativePerformance.length === 0) ||
            (activeChartTab === 'price' && chartData.priceTrend.length === 0) ||
            (activeChartTab === 'volume' && chartData.volumeTrend.length === 0) ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center border border-dashed border-subtle rounded-xl gap-2 text-muted">
              <BarChart2 className="h-10 w-10 text-muted/60" />
              <p className="text-xs font-medium">No price records found for this selection.</p>
              <p className="text-[10px] text-muted">Add price history points or adjust target dates.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {activeChartTab === 'performance' ? (
                <AreaChart data={chartData.cumulativePerformance} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradTotalPL" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={isDark ? "#e0ff4f" : "#00272b"} stopOpacity={isDark ? 0.35 : 0.2} />
                      <stop offset="95%" stopColor={isDark ? "#e0ff4f" : "#00272b"} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.5} />
                  <XAxis dataKey="date" stroke={axisStroke} fontSize={10} tickLine={false} />
                  <YAxis stroke={axisStroke} fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Area
                    type="monotone"
                    name="Total Gains/Losses ($)"
                    dataKey="totalPL"
                    stroke={isDark ? "#e0ff4f" : "#00272b"}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#gradTotalPL)"
                  />
                  <Area
                    type="monotone"
                    name="Current Value ($)"
                    dataKey="portfolioValue"
                    stroke={isDark ? "#38bdf8" : "#0284c7"}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    fill="transparent"
                  />
                  <Area
                    type="monotone"
                    name="Money Put In ($)"
                    dataKey="investedCapital"
                    stroke={isDark ? "#f43f5e" : "#e11d48"}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    fill="transparent"
                  />
                </AreaChart>
              ) : activeChartTab === 'price' ? (
                <AreaChart data={chartData.priceTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={isDark ? "#e0ff4f" : "#00272b"} stopOpacity={isDark ? 0.35 : 0.2} />
                      <stop offset="95%" stopColor={isDark ? "#e0ff4f" : "#00272b"} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.5} />
                  <XAxis dataKey="date" stroke={axisStroke} fontSize={10} tickLine={false} />
                  <YAxis stroke={axisStroke} fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    name="Closing Price ($)"
                    dataKey="price"
                    stroke={isDark ? "#e0ff4f" : "#00272b"}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#gradPrice)"
                    dot={{ stroke: isDark ? '#e0ff4f' : '#00272b', strokeWidth: 1.5, r: 2 }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                </AreaChart>
              ) : (
                <BarChart data={chartData.volumeTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.5} />
                  <XAxis dataKey="date" stroke={axisStroke} fontSize={10} tickLine={false} />
                  <YAxis stroke={axisStroke} fontSize={10} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: isDark ? 'rgba(224,255,79,0.05)' : 'rgba(0,39,43,0.05)' }}
                    contentStyle={tooltipStyle}
                  />
                  <Bar name="Trading Volume" dataKey="volume" fill={isDark ? "#e0ff4f" : "#00272b"} radius={[4, 4, 0, 0]}>
                    {chartData.volumeTrend.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={isDark ? "#e0ff4f" : "#00272b"} opacity={0.85} />
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
        <div className="lg:col-span-2 bg-surface backdrop-blur-md border border-subtle rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-main flex items-center gap-2">
              <PieIcon className="text-emerald-500 dark:text-emerald-400 h-5 w-5" />
              My Investment Mix
            </h2>
            <p className="text-xs text-muted mt-1">Diversification mix of your current stocks</p>
          </div>

          <div className="h-60 w-full relative flex items-center justify-center my-4">
            {loading ? (
              <div className="h-16 w-16 rounded-full border-4 border-[#e0ff4f]/25 border-t-[#e0ff4f] animate-spin" />
            ) : !metrics || metrics.assetAllocation.length === 0 ? (
              <div className="text-center text-muted text-xs py-10">No active stock holdings to distribute.</div>
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
                      formatter={(value: unknown) => [`$${Number(value).toLocaleString()}`, 'Valuation']}
                      contentStyle={tooltipStyle}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Mid Donut text */}
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Total Value</span>
                  <span className="text-sm font-black text-main mt-0.5">
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
                    <span className="font-extrabold text-main font-mono w-10">{item.symbol}</span>
                    <span className="text-muted truncate max-w-[120px]">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-secondary font-mono">${item.marketValue.toLocaleString()}</span>
                    <span className="text-[10px] text-muted font-semibold ml-2 font-mono">{item.percentage}%</span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Benchmarking Counters Panel */}
        <div className="lg:col-span-3 bg-surface backdrop-blur-md border border-subtle rounded-2xl p-6 shadow-xl space-y-6">
          <div>
            <h2 className="text-lg font-bold text-main flex items-center gap-2">
              <TrendingUp className="text-[#00272b] dark:text-[#e0ff4f] h-5 w-5" />
              Stock Performance Comparison
            </h2>
            <p className="text-xs text-muted mt-1">
              Compare stock price changes within the selected dates.
            </p>
          </div>

          <div className="overflow-hidden border border-subtle rounded-xl max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-12 text-center text-muted text-xs">Awaiting benchmarking calculations...</div>
            ) : benchmarks.length === 0 ? (
              <div className="p-12 text-center text-muted text-xs">No performance records found.</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-elevated text-secondary text-[10px] font-bold uppercase tracking-wider border-b border-subtle">
                    <th className="px-4 py-3">Stock Name &amp; Symbol</th>
                    <th className="px-4 py-3 text-right">Start Price</th>
                    <th className="px-4 py-3 text-right">End Price</th>
                    <th className="px-4 py-3 text-right">Gains/Losses (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle text-xs font-medium">
                  {benchmarks.map((item) => {
                    const isPositive = item.performanceGain >= 0;
                    return (
                      <tr key={item.stockId} className="hover:bg-surface-hover transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="h-6 w-10 rounded bg-surface-elevated border border-subtle flex items-center justify-center text-xs font-bold text-main font-mono">
                              {item.symbol}
                            </span>
                            <span className="text-secondary truncate max-w-[120px]">{item.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted">
                          {item.startPrice !== null ? `$${item.startPrice.toFixed(2)}` : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted">
                          {item.endPrice !== null ? `$${item.endPrice.toFixed(2)}` : 'N/A'}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-extrabold ${
                          isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
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
        <div className="lg:col-span-3 bg-surface backdrop-blur-md border border-subtle rounded-2xl p-6 shadow-xl space-y-6">
          <div>
            <h2 className="text-lg font-bold text-main flex items-center gap-2">
              <Target className="text-rose-500 dark:text-rose-400 h-5 w-5" />
              My Financial Goals
            </h2>
            <p className="text-xs text-muted mt-1">Track progress towards your investment milestones</p>
          </div>

          <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
            {loading ? (
              <div className="p-8 text-center text-muted text-xs">Parsing user milestone trackers...</div>
            ) : targets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 border border-dashed border-subtle rounded-xl space-y-2">
                <Target className="h-8 w-8 text-muted/60" />
                <p className="text-xs text-muted font-medium">No financial goals set yet.</p>
                <p className="text-[10px] text-muted">Create a goal in the form below to start tracking.</p>
              </div>
            ) : (
              targets.map((t) => (
                <div
                  key={t.id}
                  className="bg-surface-elevated border border-subtle hover:border-[#e0ff4f]/50 transition-all rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-main">{t.targetName}</h4>
                      <p className="text-[10px] text-muted mt-0.5 font-mono">
                        Target Date: {t.targetDate} &bull; Type:{' '}
                        <span className="font-extrabold text-[#00272b] dark:text-[#e0ff4f]">
                          {t.targetType === 'portfolio_value'
                            ? 'Portfolio Value'
                            : t.targetType === 'total_return'
                            ? 'Total Return'
                            : 'Annual CAGR'}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {t.isAchieved ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3 w-3" />
                          ACHIEVED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black bg-[#e0ff4f]/20 text-[#00272b] dark:text-[#e0ff4f] border border-[#e0ff4f]/40 px-2 py-0.5 rounded-full">
                          IN PROGRESS
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleStartEditTarget(t)}
                        className="p-1 rounded-lg text-muted hover:text-main hover:bg-surface transition-colors cursor-pointer"
                        title="Edit financial goal"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteTarget(t.id, t.targetName)}
                        className="p-1 rounded-lg text-muted hover:text-rose-500 hover:bg-surface transition-colors cursor-pointer"
                        title="Delete financial goal"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Tracker Slider Meter */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-muted font-medium">
                        Current:{' '}
                        {t.targetType === 'portfolio_value'
                          ? `$${t.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : `${t.currentValue >= 0 ? '+' : ''}${t.currentValue.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`}
                      </span>
                      <span className="text-main font-bold">
                        {Math.max(0, Math.min(100, t.progressPercent))}%
                      </span>
                      <span className="text-muted font-medium font-mono">
                        Goal:{' '}
                        {t.targetType === 'portfolio_value'
                          ? `$${t.targetValue.toLocaleString()}`
                          : `${t.targetValue.toLocaleString()}%`}
                      </span>
                    </div>

                    <div className="h-2 w-full bg-app rounded-full overflow-hidden border border-subtle">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          t.isAchieved
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                            : 'bg-gradient-to-r from-[#e0ff4f] to-emerald-400 shadow-[0_0_8px_rgba(224,255,79,0.3)]'
                        }`}
                        style={{ width: `${Math.max(0, Math.min(100, t.progressPercent))}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Target Profile Register Widget */}
        <div className="lg:col-span-2 bg-surface backdrop-blur-md border border-subtle rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-main flex items-center gap-2">
              <Plus className="text-[#00272b] dark:text-[#e0ff4f] h-5 w-5" />
              Create a Goal
            </h2>
            <p className="text-xs text-muted mt-1">Set a new target to keep your investments on track</p>
          </div>

          <form onSubmit={handleAddTarget} className="space-y-4 my-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1.5">
                Goal Name
              </label>
              <input
                type="text"
                required
                value={newTargetName}
                onChange={(e) => setNewTargetName(e.target.value)}
                placeholder="e.g. House Down Payment"
                className="w-full bg-surface-elevated border border-subtle rounded-lg px-3 py-2 text-xs text-main focus:outline-none focus:border-[#e0ff4f] placeholder-muted"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1.5">
                  Target Metric
                </label>
                <select
                  value={newTargetType}
                  onChange={(e) => setNewTargetType(e.target.value as 'portfolio_value' | 'total_return' | 'annualized_return')}
                  className="w-full bg-surface-elevated border border-subtle rounded-lg px-3 py-2 text-xs text-main focus:outline-none focus:border-[#e0ff4f] font-semibold"
                >
                  <option value="portfolio_value">Portfolio Value ($)</option>
                  <option value="total_return">Total Return (%)</option>
                  <option value="annualized_return">Annual CAGR (%)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1.5">
                  {newTargetType === 'portfolio_value'
                    ? 'Target Amount ($)'
                    : newTargetType === 'total_return'
                    ? 'Target Return (%)'
                    : 'Target Annual CAGR (%)'}
                </label>
                <div className="relative">
                  {newTargetType === 'portfolio_value' && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted select-none pointer-events-none">
                      $
                    </span>
                  )}
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="any"
                    value={newTargetValue}
                    onChange={(e) => setNewTargetValue(e.target.value)}
                    placeholder={
                      newTargetType === 'portfolio_value'
                        ? 'e.g. 50000'
                        : newTargetType === 'total_return'
                        ? 'e.g. 25.0'
                        : 'e.g. 12.0'
                    }
                    className={`w-full bg-surface-elevated border border-subtle rounded-lg py-2 text-xs text-main focus:outline-none focus:border-[#e0ff4f] font-mono ${
                      newTargetType === 'portfolio_value' ? 'pl-7 pr-3' : 'pl-3 pr-7'
                    }`}
                  />
                  {newTargetType !== 'portfolio_value' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted select-none pointer-events-none">
                      %
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted mt-1">
                  {newTargetType === 'portfolio_value'
                    ? 'Total portfolio market value in USD'
                    : 'Enter whole percentage (e.g. 20 for 20%)'}
                </p>
                {newTargetType !== 'portfolio_value' &&
                  Number(newTargetValue) > 0 &&
                  Number(newTargetValue) < 1 && (
                    <p className="text-[10px] text-amber-500 dark:text-amber-400 font-semibold mt-1">
                      Tip: Enter {Number(newTargetValue) * 100} for {Number(newTargetValue) * 100}%, not {newTargetValue}.
                    </p>
                  )}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1.5">
                Target Date
              </label>
              <input
                type="date"
                required
                value={newTargetDate}
                onChange={(e) => setNewTargetDate(e.target.value)}
                className="w-full bg-surface-elevated border border-subtle rounded-lg px-3 py-2 text-xs text-main focus:outline-none focus:border-[#e0ff4f] font-mono"
              />
            </div>

            {formError && <p className="text-rose-500 text-[11px] font-bold">{formError}</p>}
            {formSuccess && <p className="text-emerald-500 text-[11px] font-bold">{formSuccess}</p>}

            <button
              type="submit"
              disabled={formSubmitting}
              className="w-full flex items-center justify-center bg-[#e0ff4f] hover:bg-[#d2f33b] text-[#00272b] font-black py-2.5 px-4 rounded-xl text-xs shadow-md active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              {formSubmitting ? 'Saving Goal...' : 'Save Goal'}
            </button>
          </form>
        </div>
      </div>

      {/* Edit Target Modal */}
      {editingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-subtle rounded-2xl p-6 shadow-2xl w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-subtle pb-3">
              <h3 className="text-sm font-bold text-main flex items-center gap-2">
                <Pencil className="h-4 w-4 text-[#00272b] dark:text-[#e0ff4f]" />
                Edit Financial Goal
              </h3>
              <button
                type="button"
                onClick={() => setEditingTarget(null)}
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

            <form onSubmit={handleSaveEditTarget} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
                  Goal Name
                </label>
                <input
                  type="text"
                  value={editTargetName}
                  onChange={(e) => setEditTargetName(e.target.value)}
                  required
                  className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl px-3.5 py-2 text-xs text-main focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
                  Target Metric
                </label>
                <select
                  value={editTargetType}
                  onChange={(e) => setEditTargetType(e.target.value as 'portfolio_value' | 'total_return' | 'annualized_return')}
                  className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl px-3.5 py-2 text-xs text-main focus:outline-none cursor-pointer font-semibold"
                >
                  <option value="portfolio_value">Portfolio Value ($)</option>
                  <option value="total_return">Total Return (%)</option>
                  <option value="annualized_return">Annual CAGR (%)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
                  {editTargetType === 'portfolio_value'
                    ? 'Target Amount ($)'
                    : editTargetType === 'total_return'
                    ? 'Target Return (%)'
                    : 'Target Annual CAGR (%)'}
                </label>
                <div className="relative">
                  {editTargetType === 'portfolio_value' && (
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-muted select-none pointer-events-none">
                      $
                    </span>
                  )}
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    value={editTargetValue}
                    onChange={(e) => setEditTargetValue(e.target.value)}
                    required
                    placeholder={
                      editTargetType === 'portfolio_value'
                        ? 'e.g. 50000'
                        : editTargetType === 'total_return'
                        ? 'e.g. 25.0'
                        : 'e.g. 12.0'
                    }
                    className={`w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl py-2 text-xs text-main focus:outline-none font-mono ${
                      editTargetType === 'portfolio_value' ? 'pl-7 pr-3.5' : 'pl-3.5 pr-7'
                    }`}
                  />
                  {editTargetType !== 'portfolio_value' && (
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-muted select-none pointer-events-none">
                      %
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted mt-1">
                  {editTargetType === 'portfolio_value'
                    ? 'Total portfolio market value in USD'
                    : 'Enter whole percentage (e.g. 20 for 20%)'}
                </p>
                {editTargetType !== 'portfolio_value' &&
                  Number(editTargetValue) > 0 &&
                  Number(editTargetValue) < 1 && (
                    <p className="text-[10px] text-amber-500 dark:text-amber-400 font-semibold mt-1">
                      Tip: Enter {Number(editTargetValue) * 100} for {Number(editTargetValue) * 100}%, not {editTargetValue}.
                    </p>
                  )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
                  Target Completion Date
                </label>
                <input
                  type="date"
                  value={editTargetDate}
                  onChange={(e) => setEditTargetDate(e.target.value)}
                  required
                  className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl px-3.5 py-2 text-xs text-main focus:outline-none font-mono cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editIsAchieved"
                  checked={editIsAchieved}
                  onChange={(e) => setEditIsAchieved(e.target.checked)}
                  className="rounded bg-surface-elevated border-subtle text-[#00272b] dark:text-[#e0ff4f] focus:ring-[#e0ff4f] h-4 w-4 cursor-pointer"
                />
                <label htmlFor="editIsAchieved" className="text-xs text-secondary font-medium cursor-pointer">
                  Mark as Completed / Achieved
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => setEditingTarget(null)}
                  className="px-4 py-2 text-xs font-bold text-muted hover:text-main bg-surface-elevated hover:bg-surface-hover rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-4 py-2 text-xs font-bold text-[#00272b] bg-[#e0ff4f] hover:bg-[#d2f33b] rounded-xl transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
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
