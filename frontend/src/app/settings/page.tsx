'use client';

import { API_BASE } from '../../lib/api';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useTheme } from '@/app/context/ThemeContext';
import { useCurrency, BaseCurrency } from '@/app/context/CurrencyContext';
import { Sun, Moon, Monitor, CheckCircle2, Sliders, Scale, ArrowRightLeft, RefreshCw, Coins } from 'lucide-react';

interface UserItem {
  id: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: string;
  metadata: {
    totalStocks: number;
    totalLogs: number;
  };
}

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error';
}

export default function FeedSettings() {
  const { user } = useAuth();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const {
    baseCurrency,
    exchangeRate,
    customExchangeRate,
    rateSource,
    rateUpdatedAt,
    inverseRate,
    setBaseCurrency,
    setCustomRate,
    refreshExchangeRate,
  } = useCurrency();

  const [activeTab, setActiveTab] = useState<'appearance' | 'feed' | 'currency' | 'accounting' | 'admin'>('appearance');

  // Currency Tab State
  const [currencySaving, setCurrencySaving] = useState(false);
  const [currencyRefreshing, setCurrencyRefreshing] = useState(false);
  const [rateMode, setRateMode] = useState<'auto' | 'custom'>(customExchangeRate ? 'custom' : 'auto');
  const [customRateInput, setCustomRateInput] = useState(customExchangeRate ? String(customExchangeRate) : '130.00');
  const [prevCustomExchangeRate, setPrevCustomExchangeRate] = useState(customExchangeRate);

  if (customExchangeRate !== prevCustomExchangeRate) {
    setPrevCustomExchangeRate(customExchangeRate);
    if (customExchangeRate) {
      setRateMode('custom');
      setCustomRateInput(String(customExchangeRate));
    } else {
      setRateMode('auto');
    }
  }

  // Price Feed Configurations State
  const [provider, setProvider] = useState<'alphavantage' | 'polygon' | 'manual'>('manual');
  const [alphaVantageApiKey, setAlphaVantageApiKey] = useState('');
  const [alphaVantageDirty, setAlphaVantageDirty] = useState(false);
  const [showAlphaVantageKey, setShowAlphaVantageKey] = useState(false);
  const [avConnectionStatus, setAvConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [avConnectionMessage, setAvConnectionMessage] = useState('');

  const [polygonApiKey, setPolygonApiKey] = useState('');
  const [polygonDirty, setPolygonDirty] = useState(false);
  const [showPolygonKey, setShowPolygonKey] = useState(false);
  const [polygonConnectionStatus, setPolygonConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [polygonConnectionMessage, setPolygonConnectionMessage] = useState('');

  const [nseConnectionStatus, setNseConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [nseConnectionMessage, setNseConnectionMessage] = useState('');

  const [autoSwitchOnRateLimit, setAutoSwitchOnRateLimit] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(60);
  const [costBasisMethod, setCostBasisMethod] = useState<'average' | 'fifo'>('average');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAccounting, setSavingAccounting] = useState(false);
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });

  // System User Administration State
  const [adminUsers, setAdminUsers] = useState<UserItem[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminPage, setAdminPage] = useState(1);
  const [adminTotalPages, setAdminTotalPages] = useState(1);
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);
  const [userDeletingId, setUserDeletingId] = useState<string | null>(null);

  const triggerToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 4000);
  };

  const handleSelectProvider = (newProvider: 'alphavantage' | 'polygon' | 'manual') => {
    setProvider(newProvider);
  };

  const handleToggleBaseCurrency = async (curr: BaseCurrency) => {
    if (curr === baseCurrency) return;
    setCurrencySaving(true);
    const ok = await setBaseCurrency(curr);
    setCurrencySaving(false);
    if (ok) {
      triggerToast(`Base currency switched to ${curr === 'KES' ? 'Kenyan Shilling (KES)' : 'US Dollar (USD)'}.`, 'success');
    } else {
      triggerToast('Failed to switch base currency.', 'error');
    }
  };

  const handleSaveCustomRate = async () => {
    const num = parseFloat(customRateInput);
    if (isNaN(num) || num < 50 || num > 300) {
      triggerToast('Custom USD/KES rate must be a valid number between 50.00 and 300.00.', 'error');
      return;
    }
    setCurrencySaving(true);
    const ok = await setCustomRate(num);
    setCurrencySaving(false);
    if (ok) {
      triggerToast(`Custom exchange rate fixed at 1 USD = ${num.toFixed(2)} KES.`, 'success');
    } else {
      triggerToast('Failed to save custom exchange rate.', 'error');
    }
  };

  const handleResetToAuto = async () => {
    setCurrencySaving(true);
    const ok = await setCustomRate(null);
    setCurrencySaving(false);
    if (ok) {
      setRateMode('auto');
      triggerToast('Reverted to automatic live market exchange rate.', 'success');
    } else {
      triggerToast('Failed to reset to live market exchange rate.', 'error');
    }
  };

  const handleManualRefreshRate = async () => {
    setCurrencyRefreshing(true);
    const ok = await refreshExchangeRate();
    setCurrencyRefreshing(false);
    if (ok) {
      triggerToast('Live exchange rate refreshed successfully from market feed.', 'success');
    } else {
      triggerToast('Could not refresh live exchange rate from feed. Retaining cached rate.', 'error');
    }
  };

  // Fetch current feed config
  useEffect(() => {
    async function fetchSettings() {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/api/settings/feed`, {
          method: 'GET',
          credentials: 'include',
        });
        if (!response.ok) {
          throw new Error('Failed to retrieve price feed configuration.');
        }
        const json = await response.json();
        if (json.success && json.data) {
          if (json.data.provider === 'nse') {
            setProvider(json.data.alphaVantageApiKey ? 'alphavantage' : json.data.polygonApiKey ? 'polygon' : 'manual');
          } else {
            setProvider(json.data.provider);
          }
          setAlphaVantageApiKey(json.data.alphaVantageApiKey || '');
          setAlphaVantageDirty(false);
          setPolygonApiKey(json.data.polygonApiKey || '');
          setPolygonDirty(false);
          setAutoSwitchOnRateLimit(json.data.autoSwitchOnRateLimit ?? true);
          setRefreshInterval(json.data.refreshInterval);
          if (json.data.costBasisMethod) {
            setCostBasisMethod(json.data.costBasisMethod);
          }

          // Hydrate key statuses on mount
          if (json.data.alphaVantageApiKey && json.data.alphaVantageApiKey.includes('•')) {
            setAvConnectionStatus('success');
            setAvConnectionMessage('Alpha Vantage credentials configured.');
          }
          if (json.data.polygonApiKey && json.data.polygonApiKey.includes('•')) {
            setPolygonConnectionStatus('success');
            setPolygonConnectionMessage('Polygon.io credentials configured.');
          }
        }
      } catch (err: unknown) {
        console.error(err);
        triggerToast('Could not sync settings from backend server.', 'error');
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []);

  const handleTestConnection = async (targetProvider: 'alphavantage' | 'polygon' | 'nse') => {
    const keyToTest =
      targetProvider === 'alphavantage'
        ? alphaVantageApiKey
        : targetProvider === 'polygon'
        ? polygonApiKey
        : '';
    const providerLabel =
      targetProvider === 'alphavantage'
        ? 'Alpha Vantage'
        : targetProvider === 'polygon'
        ? 'Polygon.io'
        : 'NSE Kenya';

    if (targetProvider !== 'nse' && !keyToTest) {
      triggerToast(`API Key is required to test ${providerLabel} connection.`, 'error');
      return;
    }

    if (targetProvider === 'alphavantage') {
      setAvConnectionStatus('testing');
      setAvConnectionMessage('');
    } else if (targetProvider === 'polygon') {
      setPolygonConnectionStatus('testing');
      setPolygonConnectionMessage('');
    } else {
      setNseConnectionStatus('testing');
      setNseConnectionMessage('');
    }

    try {
      const response = await fetch(`${API_BASE}/api/settings/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: targetProvider,
          apiKey: targetProvider === 'nse' ? undefined : keyToTest,
        }),
        credentials: 'include',
      });
      const json = await response.json();
      if (response.ok && json.success) {
        if (targetProvider === 'alphavantage') {
          setAvConnectionStatus('success');
          setAvConnectionMessage(json.message);
        } else if (targetProvider === 'polygon') {
          setPolygonConnectionStatus('success');
          setPolygonConnectionMessage(json.message);
        } else {
          setNseConnectionStatus('success');
          setNseConnectionMessage(json.message);
        }
        triggerToast(json.message, 'success');
      } else {
        const errorMsg = json.message || 'Connection failed.';
        if (targetProvider === 'alphavantage') {
          setAvConnectionStatus('failed');
          setAvConnectionMessage(errorMsg);
        } else if (targetProvider === 'polygon') {
          setPolygonConnectionStatus('failed');
          setPolygonConnectionMessage(errorMsg);
        } else {
          setNseConnectionStatus('failed');
          setNseConnectionMessage(errorMsg);
        }
        triggerToast(errorMsg, 'error');
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Network error testing API connection.';
      if (targetProvider === 'alphavantage') {
        setAvConnectionStatus('failed');
        setAvConnectionMessage(msg);
      } else if (targetProvider === 'polygon') {
        setPolygonConnectionStatus('failed');
        setPolygonConnectionMessage(msg);
      } else {
        setNseConnectionStatus('failed');
        setNseConnectionMessage(msg);
      }
      triggerToast(msg, 'error');
    }
  };

  // Fetch registered users (Admins only)
  const fetchAdminUsers = async (page: number = 1) => {
    if (user?.role !== 'admin') return;

    try {
      setAdminLoading(true);
      const response = await fetch(`${API_BASE}/api/admin?page=${page}&limit=8`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load registered system accounts.');
      }

      const json = await response.json();
      if (json.success && json.data) {
        setAdminUsers(json.data.users);
        setAdminPage(json.data.pagination.currentPage);
        setAdminTotalPages(json.data.pagination.totalPages);
      }
    } catch (err: unknown) {
      console.error(err);
      triggerToast('Could not retrieve user matrix from backend.', 'error');
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'admin' || user?.role !== 'admin') return;
    let active = true;

    async function loadAdminUsers() {
      try {
        setAdminLoading(true);
        const response = await fetch(`${API_BASE}/api/admin?page=1&limit=8`, {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to load registered system accounts.');
        }

        const json = await response.json();
        if (active && json.success && json.data) {
          setAdminUsers(json.data.users);
          setAdminPage(json.data.pagination.currentPage);
          setAdminTotalPages(json.data.pagination.totalPages);
        }
      } catch (err: unknown) {
        if (active) {
          console.error(err);
          triggerToast('Could not retrieve user matrix from backend.', 'error');
        }
      } finally {
        if (active) {
          setAdminLoading(false);
        }
      }
    }

    loadAdminUsers();
    return () => {
      active = false;
    };
  }, [activeTab, user?.role]);

  const handleSaveFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      interface FeedSettingsPayload {
        provider: 'alphavantage' | 'polygon' | 'manual';
        refreshInterval: number;
        costBasisMethod: 'average' | 'fifo';
        alphaVantageApiKey?: string;
        polygonApiKey?: string;
        autoSwitchOnRateLimit: boolean;
      }

      const payload: FeedSettingsPayload = {
        provider,
        refreshInterval: Number(refreshInterval),
        costBasisMethod,
        autoSwitchOnRateLimit,
      };

      const isAvMasked = alphaVantageApiKey.includes('•') || alphaVantageApiKey.includes('*');
      const isPolyMasked = polygonApiKey.includes('•') || polygonApiKey.includes('*');

      if (alphaVantageDirty && !isAvMasked) {
        payload.alphaVantageApiKey = alphaVantageApiKey;
      }
      if (polygonDirty && !isPolyMasked) {
        payload.polygonApiKey = polygonApiKey;
      }

      const response = await fetch(`${API_BASE}/api/settings/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });

      const json = await response.json();
      if (response.ok && json.success) {
        triggerToast(json.message || 'Pricing configurations and credentials updated successfully.', 'success');
        if (json.data) {
          setAlphaVantageApiKey(json.data.alphaVantageApiKey || '');
          setAlphaVantageDirty(false);
          setPolygonApiKey(json.data.polygonApiKey || '');
          setPolygonDirty(false);
          setAutoSwitchOnRateLimit(json.data.autoSwitchOnRateLimit ?? true);
          if (json.data.costBasisMethod) {
            setCostBasisMethod(json.data.costBasisMethod);
          }
          if (json.data.alphaVantageApiKey) {
            setAvConnectionStatus('success');
            setAvConnectionMessage('Alpha Vantage credentials configured.');
          }
          if (json.data.polygonApiKey) {
            setPolygonConnectionStatus('success');
            setPolygonConnectionMessage('Polygon.io credentials configured.');
          }
        }
      } else {
        const errorMsg = json.errors && json.errors.length > 0 ? json.errors[0].message : json.message;
        throw new Error(errorMsg || 'Failed to persist feed parameters.');
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error occurred while saving configurations.';
      triggerToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAccounting = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAccounting(true);

    try {
      const payload = {
        provider,
        refreshInterval: Number(refreshInterval),
        costBasisMethod,
        autoSwitchOnRateLimit,
      };

      const response = await fetch(`${API_BASE}/api/settings/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });

      const json = await response.json();
      if (response.ok && json.success) {
        triggerToast('Accounting methodology updated and historical sales recalculated successfully.', 'success');
        if (json.data?.costBasisMethod) {
          setCostBasisMethod(json.data.costBasisMethod);
        }
      } else {
        const errorMsg = json.errors && json.errors.length > 0 ? json.errors[0].message : json.message;
        throw new Error(errorMsg || 'Failed to update accounting methodology.');
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error occurred while saving accounting methodology.';
      triggerToast(msg, 'error');
    } finally {
      setSavingAccounting(false);
    }
  };

  const handleToggleRole = async (userId: string, currentRole: 'admin' | 'user') => {
    if (roleUpdatingId) return;
    setRoleUpdatingId(userId);

    const nextRole = currentRole === 'admin' ? 'user' : 'admin';

    try {
      const response = await fetch(`${API_BASE}/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
        credentials: 'include',
      });

      const json = await response.json();
      if (response.ok && json.success) {
        triggerToast(`Role elevated successfully. Account is now designated as ${nextRole.toUpperCase()}.`, 'success');
        setAdminUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: nextRole } : u))
        );
      } else {
        throw new Error(json.message || 'Failed to update user role.');
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error toggling account role.';
      triggerToast(msg, 'error');
    } finally {
      setRoleUpdatingId(null);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (userDeletingId) return;

    const confirmDelete = window.confirm(
      `CRITICAL WARNING:\nAre you absolutely sure you want to delete the account "${email}"?\n\nThis is a destructive cascade delete and will permanently remove all associated Stocks, Purchases, Sales, Price Logs, and Performance Targets from the database.`
    );
    if (!confirmDelete) return;

    setUserDeletingId(userId);

    try {
      const response = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const json = await response.json();
      if (response.ok && json.success) {
        triggerToast('System account and all scoped records deleted successfully.', 'success');
        fetchAdminUsers(adminPage);
      } else {
        throw new Error(json.message || 'Failed to delete user account.');
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error deleting system account.';
      triggerToast(msg, 'error');
    } finally {
      setUserDeletingId(null);
    }
  };

  return (
    <>
      {/* Toast Notification Banner */}
      {toast.show && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-2xl border backdrop-blur-xl shadow-2xl transition-all duration-300 transform translate-y-0 ${
            toast.type === 'success'
              ? 'bg-surface border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)] animate-slide-in'
              : 'bg-surface border-rose-500/30 text-rose-600 dark:text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.2)] animate-slide-in'
          }`}
        >
          <div
            className={`h-7 w-7 rounded-full flex items-center justify-center ${
              toast.type === 'success' ? 'bg-emerald-500/10' : 'bg-rose-500/10'
            }`}
          >
            {toast.type === 'success' ? (
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <span className="text-sm font-semibold text-main">{toast.message}</span>
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-8 animate-fade-in relative text-main pb-12">
        {/* Header section */}
        <div>
          <h1 className="text-3xl font-black tracking-tight text-main">System Settings</h1>
          <p className="text-sm text-muted mt-1">
            Customize theme appearance, configure real-time market data providers, manage portfolio cost-basis accounting, and administer platform users.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-subtle space-x-6">
          <button
            onClick={() => setActiveTab('appearance')}
            className={`pb-4 text-xs font-bold tracking-wider uppercase transition-all duration-200 border-b-2 focus:outline-none cursor-pointer flex items-center gap-2 ${
              activeTab === 'appearance'
                ? 'border-[#e0ff4f] text-main font-black'
                : 'border-transparent text-muted hover:text-main'
            }`}
          >
            🎨 Appearance &amp; Theme
          </button>
          <button
            onClick={() => setActiveTab('feed')}
            className={`pb-4 text-xs font-bold tracking-wider uppercase transition-all duration-200 border-b-2 focus:outline-none cursor-pointer flex items-center gap-2 ${
              activeTab === 'feed'
                ? 'border-[#e0ff4f] text-main font-black'
                : 'border-transparent text-muted hover:text-main'
            }`}
          >
            🔌 API Integrations
          </button>
          <button
            onClick={() => setActiveTab('currency')}
            className={`pb-4 text-xs font-bold tracking-wider uppercase transition-all duration-200 border-b-2 focus:outline-none cursor-pointer flex items-center gap-2 ${
              activeTab === 'currency'
                ? 'border-[#e0ff4f] text-main font-black'
                : 'border-transparent text-muted hover:text-main'
            }`}
          >
            💱 Currency
          </button>
          <button
            onClick={() => setActiveTab('accounting')}
            className={`pb-4 text-xs font-bold tracking-wider uppercase transition-all duration-200 border-b-2 focus:outline-none cursor-pointer flex items-center gap-2 ${
              activeTab === 'accounting'
                ? 'border-[#e0ff4f] text-main font-black'
                : 'border-transparent text-muted hover:text-main'
            }`}
          >
            ⚖️ Portfolio Accounting
          </button>
          {user?.role === 'admin' && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`pb-4 text-xs font-bold tracking-wider uppercase transition-all duration-200 border-b-2 focus:outline-none cursor-pointer flex items-center gap-2 ${
                activeTab === 'admin'
                  ? 'border-[#e0ff4f] text-main font-black'
                  : 'border-transparent text-muted hover:text-main'
              }`}
            >
              🛡️ Administrative Console
            </button>
          )}
        </div>

        {/* Tab 1: Appearance & Theme */}
        {activeTab === 'appearance' && (
          <div className="space-y-8 animate-fade-in">
            {/* Theme Mode Selector Cards */}
            <div className="bg-surface backdrop-blur-xl border border-subtle rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
              <div>
                <h3 className="text-lg font-black text-main flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-[#00272b] dark:text-[#e0ff4f]" />
                  Theme Preference
                </h3>
                <p className="text-xs text-muted mt-1">
                  Select your interface theme mode. Changes take effect instantaneously across all platform modules.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Dark Mode Card */}
                <div
                  onClick={() => setTheme('dark')}
                  className={`cursor-pointer rounded-2xl p-5 border transition-all duration-300 flex flex-col justify-between relative group ${
                    theme === 'dark'
                      ? 'border-[#e0ff4f] bg-[#e0ff4f]/10 shadow-[0_0_20px_rgba(224,255,79,0.15)] ring-1 ring-[#e0ff4f]'
                      : 'border-subtle bg-surface-elevated hover:bg-surface-hover hover:border-[#e0ff4f]/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-surface border border-subtle dark:bg-[#00272b] dark:border-[#085862] flex items-center justify-center text-main dark:text-[#e0ff4f]">
                        <Moon className="h-4 w-4" />
                      </div>
                      <span className="font-bold text-sm text-main">Dark Mode</span>
                    </div>
                    {theme === 'dark' && (
                      <span className="h-5 w-5 rounded-full bg-[#e0ff4f] text-[#00272b] flex items-center justify-center">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-3">
                    Ultra-deep Gun Metal base with high-energy Chartreuse accents.
                  </p>
                  <div className="mt-4 flex items-center gap-1.5 pt-2 border-t border-subtle">
                    <div className="h-3 w-3 rounded-full bg-[#00272b] border border-subtle" />
                    <div className="h-3 w-3 rounded-full bg-[#023439]" />
                    <div className="h-3 w-3 rounded-full bg-[#e0ff4f]" />
                    <span className="text-[10px] text-muted ml-auto font-mono">Gun Metal</span>
                  </div>
                </div>

                {/* Light Mode Card */}
                <div
                  onClick={() => setTheme('light')}
                  className={`cursor-pointer rounded-2xl p-5 border transition-all duration-300 flex flex-col justify-between relative group ${
                    theme === 'light'
                      ? 'border-[#00272b] dark:border-[#e0ff4f] bg-[#e0ff4f]/10 shadow-[0_0_20px_rgba(0,39,43,0.1)] ring-1 ring-[#00272b] dark:ring-[#e0ff4f]'
                      : 'border-subtle bg-surface-elevated hover:bg-surface-hover hover:border-[#e0ff4f]/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-[#f3f8f6] border border-[#ccdfda] flex items-center justify-center text-[#00272b]">
                        <Sun className="h-4 w-4" />
                      </div>
                      <span className="font-bold text-sm text-main">Light Mode</span>
                    </div>
                    {theme === 'light' && (
                      <span className="h-5 w-5 rounded-full bg-[#e0ff4f] text-[#00272b] flex items-center justify-center">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-3">
                    Soft Mint canvas with crisp Gun Metal headings and Chartreuse highlights.
                  </p>
                  <div className="mt-4 flex items-center gap-1.5 pt-2 border-t border-subtle">
                    <div className="h-3 w-3 rounded-full bg-[#f3f8f6] border border-subtle" />
                    <div className="h-3 w-3 rounded-full bg-[#ffffff] border border-subtle" />
                    <div className="h-3 w-3 rounded-full bg-[#00272b]" />
                    <div className="h-3 w-3 rounded-full bg-[#e0ff4f]" />
                    <span className="text-[10px] text-muted ml-auto font-mono">Soft Mint</span>
                  </div>
                </div>

                {/* System Mode Card */}
                <div
                  onClick={() => setTheme('system')}
                  className={`cursor-pointer rounded-2xl p-5 border transition-all duration-300 flex flex-col justify-between relative group ${
                    theme === 'system'
                      ? 'border-[#e0ff4f] bg-[#e0ff4f]/10 shadow-[0_0_20px_rgba(224,255,79,0.15)] ring-1 ring-[#e0ff4f]'
                      : 'border-subtle bg-surface-elevated hover:bg-surface-hover hover:border-[#e0ff4f]/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-surface border border-subtle flex items-center justify-center text-main">
                        <Monitor className="h-4 w-4" />
                      </div>
                      <span className="font-bold text-sm text-main">System Mode</span>
                    </div>
                    {theme === 'system' && (
                      <span className="h-5 w-5 rounded-full bg-[#e0ff4f] text-[#00272b] flex items-center justify-center">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-3">
                    Automatically synchronize appearance with your operating system dark/light configuration.
                  </p>
                  <div className="mt-4 flex items-center gap-1.5 pt-2 border-t border-subtle">
                    <span className="text-[10px] text-muted">Currently resolving to:</span>
                    <span className="text-[10px] font-bold font-mono uppercase text-main">
                      {resolvedTheme}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: API Integrations */}
        {activeTab === 'feed' && (
          loading ? (
            <div className="bg-surface backdrop-blur-xl border border-subtle rounded-3xl p-8 shadow-xl animate-pulse space-y-6">
              <div className="h-8 bg-surface-elevated w-1/4 rounded" />
              <div className="h-14 bg-surface-elevated w-full rounded-2xl" />
              <div className="h-14 bg-surface-elevated w-full rounded-2xl" />
              <div className="h-12 bg-surface-elevated w-1/3 rounded-xl ml-auto" />
            </div>
          ) : (
            <form onSubmit={handleSaveFeed} className="space-y-6">
              <div className="bg-surface backdrop-blur-xl border border-subtle rounded-3xl p-6 sm:p-8 shadow-xl space-y-8 relative overflow-hidden group">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-main">Pricing Provider Engine</h3>
                    <p className="text-xs text-muted mt-0.5">Select your primary live market data provider or toggle manual offline fallback mode.</p>
                  </div>

                  <div 
                    className="grid grid-cols-1 sm:grid-cols-3 gap-4" 
                    role="radiogroup" 
                    aria-label="Pricing Provider Selection"
                  >
                    {/* Alpha Vantage */}
                    <div
                      onClick={() => handleSelectProvider('alphavantage')}
                      role="radio"
                      aria-checked={provider === 'alphavantage'}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          handleSelectProvider('alphavantage');
                        }
                      }}
                      className={`cursor-pointer rounded-2xl p-5 border transition-all duration-300 relative flex flex-col justify-between h-36 hover:border-[#e0ff4f]/50 hover:bg-surface-hover focus:outline-none ${
                        provider === 'alphavantage'
                          ? 'border-[#e0ff4f] bg-[#e0ff4f]/10 shadow-[0_0_15px_rgba(224,255,79,0.15)] ring-1 ring-[#e0ff4f]'
                          : 'border-subtle bg-surface-elevated'
                      }`}
                    >
                      <div className="flex items-center justify-between pointer-events-none">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-main tracking-wider font-mono">ALPHA VANTAGE</span>
                          {provider === 'alphavantage' && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#00272b] dark:bg-[#e0ff4f] text-[#e0ff4f] dark:text-[#00272b]">
                              PRIMARY
                            </span>
                          )}
                        </div>
                        <div
                          className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center transition-colors ${
                            provider === 'alphavantage' ? 'border-[#e0ff4f] bg-[#e0ff4f]/20' : 'border-subtle'
                          }`}
                        >
                          {provider === 'alphavantage' && <div className="h-2 w-2 rounded-full bg-[#00272b] dark:bg-[#e0ff4f]" />}
                        </div>
                      </div>
                      <p className="text-[11px] text-muted leading-relaxed mt-2 pointer-events-none">
                        Global stock market queries via quote payloads. Free tier: 25 requests/day.
                      </p>
                    </div>

                    {/* Polygon.io */}
                    <div
                      onClick={() => handleSelectProvider('polygon')}
                      role="radio"
                      aria-checked={provider === 'polygon'}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          handleSelectProvider('polygon');
                        }
                      }}
                      className={`cursor-pointer rounded-2xl p-5 border transition-all duration-300 relative flex flex-col justify-between h-36 hover:border-[#e0ff4f]/50 hover:bg-surface-hover focus:outline-none ${
                        provider === 'polygon'
                          ? 'border-[#e0ff4f] bg-[#e0ff4f]/10 shadow-[0_0_15px_rgba(224,255,79,0.15)] ring-1 ring-[#e0ff4f]'
                          : 'border-subtle bg-surface-elevated'
                      }`}
                    >
                      <div className="flex items-center justify-between pointer-events-none">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-main tracking-wider font-mono">POLYGON.IO</span>
                          {provider === 'polygon' && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#00272b] dark:bg-[#e0ff4f] text-[#e0ff4f] dark:text-[#00272b]">
                              PRIMARY
                            </span>
                          )}
                        </div>
                        <div
                          className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center transition-colors ${
                            provider === 'polygon' ? 'border-[#e0ff4f] bg-[#e0ff4f]/20' : 'border-subtle'
                          }`}
                        >
                          {provider === 'polygon' && <div className="h-2 w-2 rounded-full bg-[#00272b] dark:bg-[#e0ff4f]" />}
                        </div>
                      </div>
                      <p className="text-[11px] text-muted leading-relaxed mt-2 pointer-events-none">
                        Scalable REST responses using historic aggregates. Free tier: 5 requests/min.
                      </p>
                    </div>

                    {/* Manual Fallback */}
                    <div
                      onClick={() => handleSelectProvider('manual')}
                      role="radio"
                      aria-checked={provider === 'manual'}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          handleSelectProvider('manual');
                        }
                      }}
                      className={`cursor-pointer rounded-2xl p-5 border transition-all duration-300 relative flex flex-col justify-between h-36 hover:border-[#e0ff4f]/50 hover:bg-surface-hover focus:outline-none ${
                        provider === 'manual'
                          ? 'border-[#e0ff4f] bg-[#e0ff4f]/10 shadow-[0_0_15px_rgba(224,255,79,0.15)] ring-1 ring-[#e0ff4f]'
                          : 'border-subtle bg-surface-elevated'
                      }`}
                    >
                      <div className="flex items-center justify-between pointer-events-none">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-main tracking-wider font-mono">MANUAL FALLBACK</span>
                          {provider === 'manual' && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#00272b] dark:bg-[#e0ff4f] text-[#e0ff4f] dark:text-[#00272b]">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <div
                          className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center transition-colors ${
                            provider === 'manual' ? 'border-[#e0ff4f] bg-[#e0ff4f]/20' : 'border-subtle'
                          }`}
                        >
                          {provider === 'manual' && <div className="h-2 w-2 rounded-full bg-[#00272b] dark:bg-[#e0ff4f]" />}
                        </div>
                      </div>
                      <p className="text-[11px] text-muted leading-relaxed mt-2 pointer-events-none">
                        Local pricing only. Keeps transactions linked exclusively to manually logged price logs.
                      </p>
                    </div>
                  </div>

                  {/* Nairobi Securities Exchange (NSE) Built-in Market Info Card */}
                  <div className="bg-surface-elevated/80 border border-subtle rounded-2xl p-5 space-y-3 relative overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs font-black text-main tracking-wider font-mono uppercase">
                          Nairobi Securities Exchange (NSE Kenya)
                        </span>
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          BUILT-IN &bull; ALWAYS ACTIVE
                        </span>
                      </div>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                        100% Free &bull; No API Key Required
                      </span>
                    </div>

                    <p className="text-xs text-muted leading-relaxed">
                      The Nairobi Securities Exchange market is natively supported and active by default. Live quotes and historical prices for all 71 listed NSE counters (e.g., Safaricom, Equity Bank, KCB Group, EABL) are synced automatically via Stocked&apos;s integrated web scraper without consuming external API rate limits.
                    </p>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-subtle">
                      <div className="flex-1">
                        {nseConnectionStatus === 'idle' && (
                          <span className="text-[11px] text-muted font-medium">Status: Feed available &amp; ready</span>
                        )}
                        {nseConnectionStatus === 'testing' && (
                          <span className="text-[11px] text-[#00272b] dark:text-[#e0ff4f] font-semibold flex items-center gap-1.5">
                            <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Testing connection to NSE market scraper...
                          </span>
                        )}
                        {nseConnectionStatus === 'success' && (
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                            ✓ {nseConnectionMessage || 'Connected to Nairobi Securities Exchange feed'}
                          </span>
                        )}
                        {nseConnectionStatus === 'failed' && (
                          <span className="text-[11px] text-rose-500 font-semibold block leading-relaxed max-w-md">
                            ✗ Connection Failed: {nseConnectionMessage}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={nseConnectionStatus === 'testing'}
                        onClick={() => handleTestConnection('nse')}
                        className="px-3.5 py-1.5 text-xs font-bold text-[#00272b] dark:text-[#e0ff4f] bg-[#e0ff4f]/20 border border-[#e0ff4f]/40 hover:bg-[#e0ff4f]/30 rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                      >
                        Test NSE Feed
                      </button>
                    </div>
                  </div>
                </div>

                {provider !== 'manual' && (
                  <div className="space-y-6 animate-slide-down">
                    {/* Auto-Switch Toggle Card */}
                    <div className="bg-surface-elevated border border-subtle rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-main tracking-wider uppercase">
                            Automatic Provider Failover
                          </span>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#e0ff4f]/20 text-[#00272b] dark:text-[#e0ff4f] border border-[#e0ff4f]/30">
                            RECOMMENDED
                          </span>
                        </div>
                        <p className="text-xs text-muted leading-relaxed max-w-xl">
                          When your primary provider encounters rate limits or network connection errors, automatically switch to your secondary provider to maintain uninterrupted live market data without downtime.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={autoSwitchOnRateLimit}
                        onClick={() => setAutoSwitchOnRateLimit(!autoSwitchOnRateLimit)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          autoSwitchOnRateLimit ? 'bg-[#00272b] dark:bg-[#e0ff4f]' : 'bg-gray-300 dark:bg-gray-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-[#00272b] shadow ring-0 transition duration-200 ease-in-out ${
                            autoSwitchOnRateLimit ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Section Header */}
                    <div>
                      <h4 className="text-xs font-bold text-muted uppercase tracking-wider">
                        Multi-Provider Authentication Credentials
                      </h4>
                      <p className="text-[11px] text-muted mt-0.5">
                        Configure credentials for both providers for seamless rate-limit and network failover. Keys are stored encrypted per user.
                      </p>
                    </div>

                    {/* Alpha Vantage API Key Card */}
                    <div className="bg-surface-elevated border border-subtle rounded-2xl p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-main tracking-wider font-mono uppercase">
                            Alpha Vantage API Key
                          </span>
                          {provider === 'alphavantage' ? (
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-[#e0ff4f]/20 text-[#00272b] dark:text-[#e0ff4f] border border-[#e0ff4f]/30">
                              PRIMARY PROVIDER
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-surface text-muted border border-subtle">
                              BACKUP / FAILOVER
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted">25 calls/day limit</span>
                      </div>

                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                          <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </span>
                        <input
                          type={showAlphaVantageKey ? 'text' : 'password'}
                          placeholder="Input Alpha Vantage API key..."
                          value={alphaVantageApiKey}
                          onChange={(e) => {
                            setAlphaVantageApiKey(e.target.value);
                            setAlphaVantageDirty(true);
                            setAvConnectionStatus('idle');
                            setAvConnectionMessage('');
                          }}
                          required={provider === 'alphavantage'}
                          className="w-full bg-surface border border-subtle focus:border-[#e0ff4f] rounded-xl pl-11 pr-12 py-3 text-sm text-main placeholder-muted focus:outline-none transition-all font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAlphaVantageKey(!showAlphaVantageKey)}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-muted hover:text-main transition-colors cursor-pointer"
                        >
                          {showAlphaVantageKey ? (
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                          ) : (
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-subtle">
                        <div className="flex-1">
                          {avConnectionStatus === 'idle' && (
                            <span className="text-[11px] text-muted font-medium">Status: Not tested yet</span>
                          )}
                          {avConnectionStatus === 'testing' && (
                            <span className="text-[11px] text-[#00272b] dark:text-[#e0ff4f] font-semibold flex items-center gap-1.5">
                              <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Testing Alpha Vantage connection...
                            </span>
                          )}
                          {avConnectionStatus === 'success' && (
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                              ✓ {avConnectionMessage || 'Connected to Alpha Vantage'}
                            </span>
                          )}
                          {avConnectionStatus === 'failed' && (
                            <span className="text-[11px] text-rose-500 font-semibold block leading-relaxed max-w-md">
                              ✗ Connection Failed: {avConnectionMessage}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={avConnectionStatus === 'testing' || !alphaVantageApiKey}
                          onClick={() => handleTestConnection('alphavantage')}
                          className="px-3.5 py-1.5 text-xs font-bold text-[#00272b] dark:text-[#e0ff4f] bg-[#e0ff4f]/20 border border-[#e0ff4f]/40 hover:bg-[#e0ff4f]/30 rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                        >
                          Test Alpha Vantage
                        </button>
                      </div>
                    </div>

                    {/* Polygon.io API Key Card */}
                    <div className="bg-surface-elevated border border-subtle rounded-2xl p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-main tracking-wider font-mono uppercase">
                            Polygon.io API Key
                          </span>
                          {provider === 'polygon' ? (
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-[#e0ff4f]/20 text-[#00272b] dark:text-[#e0ff4f] border border-[#e0ff4f]/30">
                              PRIMARY PROVIDER
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-surface text-muted border border-subtle">
                              BACKUP / FAILOVER
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted">5 calls/minute limit</span>
                      </div>

                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                          <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </span>
                        <input
                          type={showPolygonKey ? 'text' : 'password'}
                          placeholder="Input Polygon.io API key..."
                          value={polygonApiKey}
                          onChange={(e) => {
                            setPolygonApiKey(e.target.value);
                            setPolygonDirty(true);
                            setPolygonConnectionStatus('idle');
                            setPolygonConnectionMessage('');
                          }}
                          required={provider === 'polygon'}
                          className="w-full bg-surface border border-subtle focus:border-[#e0ff4f] rounded-xl pl-11 pr-12 py-3 text-sm text-main placeholder-muted focus:outline-none transition-all font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPolygonKey(!showPolygonKey)}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-muted hover:text-main transition-colors cursor-pointer"
                        >
                          {showPolygonKey ? (
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                          ) : (
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-subtle">
                        <div className="flex-1">
                          {polygonConnectionStatus === 'idle' && (
                            <span className="text-[11px] text-muted font-medium">Status: Not tested yet</span>
                          )}
                          {polygonConnectionStatus === 'testing' && (
                            <span className="text-[11px] text-[#00272b] dark:text-[#e0ff4f] font-semibold flex items-center gap-1.5">
                              <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Testing Polygon.io connection...
                            </span>
                          )}
                          {polygonConnectionStatus === 'success' && (
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                              ✓ {polygonConnectionMessage || 'Connected to Polygon.io'}
                            </span>
                          )}
                          {polygonConnectionStatus === 'failed' && (
                            <span className="text-[11px] text-rose-500 font-semibold block leading-relaxed max-w-md">
                              ✗ Connection Failed: {polygonConnectionMessage}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={polygonConnectionStatus === 'testing' || !polygonApiKey}
                          onClick={() => handleTestConnection('polygon')}
                          className="px-3.5 py-1.5 text-xs font-bold text-[#00272b] dark:text-[#e0ff4f] bg-[#e0ff4f]/20 border border-[#e0ff4f]/40 hover:bg-[#e0ff4f]/30 rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                        >
                          Test Polygon.io
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider">Automated Refresh Polling Rate</label>
                    <p className="text-[10px] text-muted mt-0.5">Customize the background cache interval to balance database freshness with API rate limits.</p>
                  </div>

                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <svg className="h-4.5 w-4.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </span>
                    <select
                      value={refreshInterval}
                      onChange={(e) => setRefreshInterval(Number(e.target.value))}
                      className="w-full bg-surface-elevated border border-subtle focus:border-[#e0ff4f] rounded-xl pl-11 pr-4 py-3 text-sm text-main focus:outline-none transition-all cursor-pointer appearance-none font-semibold"
                    >
                      <option value={10}>10 Seconds (Ultra Live)</option>
                      <option value={30}>30 Seconds (Highly Responsive)</option>
                      <option value={60}>60 Seconds (Default Interval)</option>
                      <option value={300}>5 Minutes (Balanced Standard)</option>
                      <option value={900}>15 Minutes (Low Rate Usage)</option>
                      <option value={3600}>1 Hour (Minimal Cache Sync)</option>
                    </select>
                    <span className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-muted">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center px-6 py-3 rounded-xl text-sm font-black text-[#00272b] bg-[#e0ff4f] hover:bg-[#d2f33b] transition-all duration-200 shadow-md active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2.5 h-4 w-4 text-[#00272b]" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving Integration Details...
                    </>
                  ) : (
                    <>
                      <svg className="h-4.5 w-4.5 mr-2 text-[#00272b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Save Integration Parameters
                    </>
                  )}
                </button>
              </div>
            </form>
          )
        )}

        {/* Tab: Currency & Exchange Rate Engine */}
        {activeTab === 'currency' && (
          <div className="space-y-6">
            {/* Base Currency Selection */}
            <div className="bg-surface backdrop-blur-xl border border-subtle rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 relative overflow-hidden">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-3">
                  <Coins className="w-3.5 h-3.5" />
                  Global Accounting Standard
                </div>
                <h3 className="text-xl font-black text-main">Active Base Currency</h3>
                <p className="text-xs text-muted mt-1 leading-relaxed max-w-2xl">
                  Choose the dominant currency for aggregating portfolio net worth, invested capital, asset allocation charts, and generated reports. Counter holdings and trade ledgers always retain their original trading currency.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* USD Card */}
                <div
                  onClick={() => handleToggleBaseCurrency('USD')}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                    baseCurrency === 'USD'
                      ? 'bg-[#e0ff4f]/5 border-[#e0ff4f] shadow-lg shadow-[#e0ff4f]/5'
                      : 'bg-surface-elevated/40 border-subtle hover:border-slate-500/40'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg font-black">
                        $
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-main flex items-center gap-2">
                          US Dollar (USD)
                          {baseCurrency === 'USD' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-[#e0ff4f] text-black">
                              ACTIVE
                            </span>
                          )}
                        </h4>
                        <p className="text-xs text-muted mt-0.5">Global Benchmark &amp; US Markets</p>
                      </div>
                    </div>
                    {baseCurrency === 'USD' && (
                      <CheckCircle2 className="w-5 h-5 text-[#e0ff4f]" />
                    )}
                  </div>
                  <p className="text-xs text-muted mt-4 leading-relaxed">
                    Standard for international equities, Alpha Vantage, and Polygon.io market data feeds.
                  </p>
                </div>

                {/* KES Card */}
                <div
                  onClick={() => handleToggleBaseCurrency('KES')}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                    baseCurrency === 'KES'
                      ? 'bg-[#e0ff4f]/5 border-[#e0ff4f] shadow-lg shadow-[#e0ff4f]/5'
                      : 'bg-surface-elevated/40 border-subtle hover:border-slate-500/40'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-sm font-black">
                        KSh
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-main flex items-center gap-2">
                          Kenyan Shilling (KES)
                          {baseCurrency === 'KES' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-[#e0ff4f] text-black">
                              ACTIVE
                            </span>
                          )}
                        </h4>
                        <p className="text-xs text-muted mt-0.5">Nairobi Securities Exchange (NSE)</p>
                      </div>
                    </div>
                    {baseCurrency === 'KES' && (
                      <CheckCircle2 className="w-5 h-5 text-[#e0ff4f]" />
                    )}
                  </div>
                  <p className="text-xs text-muted mt-4 leading-relaxed">
                    Native currency for NSE-listed equities. All USD assets are converted into KES using live market rates.
                  </p>
                </div>
              </div>
            </div>

            {/* Live Exchange Rate & Conversion Engine Card */}
            <div className="bg-surface backdrop-blur-xl border border-subtle rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-3">
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    Conversion Engine
                  </div>
                  <h3 className="text-xl font-black text-main">USD / KES Market Rate</h3>
                  <p className="text-xs text-muted mt-1">
                    Real-time market rate engine with in-memory caching and failover protection.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleManualRefreshRate}
                    disabled={currencyRefreshing || rateMode === 'custom'}
                    className="px-4 py-2.5 rounded-xl border border-subtle hover:border-slate-500/50 bg-surface-elevated/40 text-xs font-bold text-main transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${currencyRefreshing ? 'animate-spin' : ''}`} />
                    {currencyRefreshing ? 'Refreshing...' : 'Refresh Rate'}
                  </button>
                </div>
              </div>

              {/* Rate Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-surface-elevated/30 border border-subtle">
                  <p className="text-[10px] font-bold tracking-wider uppercase text-muted">Exchange Rate</p>
                  <p className="text-2xl font-black text-main mt-1">
                    1 USD = <span className="text-[#e0ff4f]">{exchangeRate.toFixed(2)}</span> KES
                  </p>
                  <p className="text-[11px] text-muted mt-1">
                    1 KES ≈ ${inverseRate.toFixed(4)} USD
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-surface-elevated/30 border border-subtle">
                  <p className="text-[10px] font-bold tracking-wider uppercase text-muted">Rate Mode &amp; Source</p>
                  <div className="mt-2 flex items-center gap-2">
                    {rateSource === 'custom' ? (
                      <span className="px-2.5 py-1 rounded-md text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        CUSTOM FIXED
                      </span>
                    ) : rateSource === 'live' || rateSource === 'cache' ? (
                      <span className="px-2.5 py-1 rounded-md text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        LIVE MARKET
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-md text-xs font-black bg-slate-500/20 text-slate-300 border border-slate-500/30">
                        STORED CACHE
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted mt-2">
                    {rateSource === 'custom' ? 'User-defined override' : 'Open Exchange Rates API'}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-surface-elevated/30 border border-subtle">
                  <p className="text-[10px] font-bold tracking-wider uppercase text-muted">Last Updated</p>
                  <p className="text-sm font-bold text-main mt-2">
                    {rateUpdatedAt ? new Date(rateUpdatedAt).toLocaleString() : 'Recent cache'}
                  </p>
                  <p className="text-[11px] text-muted mt-1">1-hour automated cache TTL</p>
                </div>
              </div>

              {/* Rate Policy: Automatic vs Custom Override */}
              <div className="pt-4 border-t border-subtle space-y-4">
                <h4 className="text-xs font-black tracking-wider uppercase text-main">Exchange Rate Policy</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div
                    onClick={handleResetToAuto}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                      rateMode === 'auto'
                        ? 'bg-emerald-500/10 border-emerald-500/40'
                        : 'bg-surface-elevated/20 border-subtle hover:border-slate-500/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ratePolicy"
                      checked={rateMode === 'auto'}
                      onChange={() => {}}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-xs font-black text-main">Automatic Live Market Rate</p>
                      <p className="text-[11px] text-muted mt-0.5">
                        Fetches live exchange rates automatically from Open Exchange Rates and updates every hour.
                      </p>
                    </div>
                  </div>

                  <div
                    onClick={() => setRateMode('custom')}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                      rateMode === 'custom'
                        ? 'bg-amber-500/10 border-amber-500/40'
                        : 'bg-surface-elevated/20 border-subtle hover:border-slate-500/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ratePolicy"
                      checked={rateMode === 'custom'}
                      onChange={() => {}}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-xs font-black text-main">Fixed Custom Rate Override</p>
                      <p className="text-[11px] text-muted mt-0.5">
                        Lock in a fixed exchange rate for statutory audits, personal tax accounting, or custom scenarios.
                      </p>
                    </div>
                  </div>
                </div>

                {rateMode === 'custom' && (
                  <div className="p-4 rounded-2xl bg-surface-elevated/40 border border-amber-500/20 space-y-3">
                    <label className="block text-xs font-bold text-main">
                      Custom 1 USD to KES Exchange Rate
                    </label>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <div className="relative flex-1 max-w-xs">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted">
                          KSh
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="50"
                          max="300"
                          value={customRateInput}
                          onChange={(e) => setCustomRateInput(e.target.value)}
                          className="w-full bg-surface border border-subtle rounded-xl pl-12 pr-4 py-2 text-xs font-bold text-main focus:outline-none focus:border-[#e0ff4f]"
                          placeholder="130.00"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSaveCustomRate}
                        disabled={currencySaving}
                        className="px-5 py-2 rounded-xl bg-[#e0ff4f] text-black font-black text-xs hover:bg-[#d0ef3f] transition-all cursor-pointer disabled:opacity-50"
                      >
                        {currencySaving ? 'Saving...' : 'Lock Custom Rate'}
                      </button>
                    </div>
                    <p className="text-[11px] text-muted">
                      Must be between 50.00 and 300.00 KES per USD.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Cost-Basis & Portfolio Accounting */}
        {activeTab === 'accounting' && (
          loading ? (
            <div className="bg-surface backdrop-blur-xl border border-subtle rounded-3xl p-8 shadow-xl animate-pulse space-y-6">
              <div className="h-8 bg-surface-elevated w-1/4 rounded" />
              <div className="h-28 bg-surface-elevated w-full rounded-2xl" />
              <div className="h-12 bg-surface-elevated w-1/3 rounded-xl ml-auto" />
            </div>
          ) : (
            <form onSubmit={handleSaveAccounting} className="space-y-6">
              <div className="bg-surface backdrop-blur-xl border border-subtle rounded-3xl p-6 sm:p-8 shadow-xl space-y-8 relative overflow-hidden group">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-main">Cost-Basis Accounting Methodology</h3>
                    <p className="text-xs text-muted mt-0.5">
                      Select how acquisition cost basis and realized profit/loss are calculated for trade sales across your entire portfolio.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Average Cost */}
                    <div
                      onClick={() => setCostBasisMethod('average')}
                      role="radio"
                      aria-checked={costBasisMethod === 'average'}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          setCostBasisMethod('average');
                        }
                      }}
                      className={`cursor-pointer rounded-2xl p-5 border transition-all duration-300 relative flex flex-col justify-between hover:border-[#e0ff4f]/50 hover:bg-surface-hover focus:outline-none ${
                        costBasisMethod === 'average'
                          ? 'border-[#e0ff4f] bg-[#e0ff4f]/10 shadow-[0_0_15px_rgba(224,255,79,0.15)] ring-1 ring-[#e0ff4f]'
                          : 'border-subtle bg-surface-elevated'
                      }`}
                    >
                      <div className="flex items-center justify-between pointer-events-none">
                        <span className="text-xs font-black text-main tracking-wider font-mono">AVERAGE COST (DEFAULT)</span>
                        <div
                          className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center transition-colors ${
                            costBasisMethod === 'average' ? 'border-[#e0ff4f] bg-[#e0ff4f]/20' : 'border-subtle'
                          }`}
                        >
                          {costBasisMethod === 'average' && <div className="h-2 w-2 rounded-full bg-[#00272b] dark:bg-[#e0ff4f]" />}
                        </div>
                      </div>
                      <p className="text-[11px] text-muted leading-relaxed mt-3 pointer-events-none">
                        Computes cost basis using historical volume-weighted average price (VWAP). Standard for long-term investments and DCA strategies.
                      </p>
                      <div className="mt-4 pt-3 border-t border-subtle flex items-center justify-between text-[10px] text-muted font-mono pointer-events-none">
                        <span>Lot Allocation</span>
                        <span className="font-bold text-main">Blended Average</span>
                      </div>
                    </div>

                    {/* FIFO */}
                    <div
                      onClick={() => setCostBasisMethod('fifo')}
                      role="radio"
                      aria-checked={costBasisMethod === 'fifo'}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          setCostBasisMethod('fifo');
                        }
                      }}
                      className={`cursor-pointer rounded-2xl p-5 border transition-all duration-300 relative flex flex-col justify-between hover:border-[#e0ff4f]/50 hover:bg-surface-hover focus:outline-none ${
                        costBasisMethod === 'fifo'
                          ? 'border-[#e0ff4f] bg-[#e0ff4f]/10 shadow-[0_0_15px_rgba(224,255,79,0.15)] ring-1 ring-[#e0ff4f]'
                          : 'border-subtle bg-surface-elevated'
                      }`}
                    >
                      <div className="flex items-center justify-between pointer-events-none">
                        <span className="text-xs font-black text-main tracking-wider font-mono">FIRST-IN, FIRST-OUT (FIFO)</span>
                        <div
                          className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center transition-colors ${
                            costBasisMethod === 'fifo' ? 'border-[#e0ff4f] bg-[#e0ff4f]/20' : 'border-subtle'
                          }`}
                        >
                          {costBasisMethod === 'fifo' && <div className="h-2 w-2 rounded-full bg-[#00272b] dark:bg-[#e0ff4f]" />}
                        </div>
                      </div>
                      <p className="text-[11px] text-muted leading-relaxed mt-3 pointer-events-none">
                        Matches trade sales against the oldest acquired purchase lots first. Compliant with standard brokerage tax reporting and specific lot matching.
                      </p>
                      <div className="mt-4 pt-3 border-t border-subtle flex items-center justify-between text-[10px] text-muted font-mono pointer-events-none">
                        <span>Lot Allocation</span>
                        <span className="font-bold text-main">Chronological Queue</span>
                      </div>
                    </div>
                  </div>

                  {/* Informational notice about automatic historical recalculation */}
                  <div className="bg-surface-elevated border border-subtle rounded-2xl p-4 flex items-start gap-3.5">
                    <div className="p-2 rounded-xl bg-[#e0ff4f]/20 text-[#00272b] dark:text-[#e0ff4f] flex-shrink-0 mt-0.5">
                      <Scale className="h-4 w-4" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-main">Automatic Historical Recalculation</span>
                      <p className="text-[11px] text-muted leading-relaxed">
                        Updating your accounting methodology will trigger an automatic recalculation across all historical stock sales in your portfolio. Your analytics charts, realized profit/loss metrics, and export data will immediately align with your chosen method.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingAccounting}
                  className="inline-flex items-center px-6 py-3 rounded-xl text-sm font-black text-[#00272b] bg-[#e0ff4f] hover:bg-[#d2f33b] transition-all duration-200 shadow-md active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingAccounting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2.5 h-4 w-4 text-[#00272b]" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Updating Accounting Calculations...
                    </>
                  ) : (
                    <>
                      <svg className="h-4.5 w-4.5 mr-2 text-[#00272b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Save Accounting Preferences
                    </>
                  )}
                </button>
              </div>
            </form>
          )
        )}

        {/* Tab 4: System User Administration Grid (Admins only) */}
        {activeTab === 'admin' && user?.role === 'admin' && (
          <div className="space-y-6">
            <div className="bg-surface backdrop-blur-xl border border-subtle rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden group">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
                <div>
                  <h3 className="text-base font-bold text-main">System Account Administration</h3>
                  <p className="text-xs text-muted mt-0.5">List registered accounts, modify role scopes, and cascade delete system records.</p>
                </div>
                <button
                  onClick={() => fetchAdminUsers(adminPage)}
                  disabled={adminLoading}
                  className="px-3.5 py-2 text-xs font-bold text-[#00272b] dark:text-[#e0ff4f] bg-[#e0ff4f]/20 border border-[#e0ff4f]/40 hover:bg-[#e0ff4f]/30 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className={`h-3.5 w-3.5 ${adminLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H12" />
                  </svg>
                  Sync User Matrix
                </button>
              </div>

              {adminLoading ? (
                <div className="space-y-4 py-8">
                  <div className="h-10 bg-surface-elevated w-full rounded-xl animate-pulse" />
                  <div className="h-12 bg-surface-elevated w-full rounded-xl animate-pulse" />
                  <div className="h-12 bg-surface-elevated w-full rounded-xl animate-pulse" />
                  <div className="h-12 bg-surface-elevated w-full rounded-xl animate-pulse" />
                </div>
              ) : adminUsers.length === 0 ? (
                <div className="text-center py-16 border border-subtle border-dashed rounded-2xl">
                  <p className="text-muted text-sm">No registered user accounts found.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Account Grid Table */}
                  <div className="overflow-hidden border border-subtle rounded-2xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-surface-elevated border-b border-subtle text-[10px] font-bold text-secondary uppercase tracking-wider">
                          <th className="px-4 py-3">User Identity</th>
                          <th className="px-4 py-3">Account Scope Badge</th>
                          <th className="px-4 py-3 text-center">Stocks Tracking</th>
                          <th className="px-4 py-3 text-center">Reports Exported</th>
                          <th className="px-4 py-3 text-right">Actions Panel</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-subtle text-xs">
                        {adminUsers.map((item) => (
                          <tr key={item.id} className="hover:bg-surface-hover transition-all duration-200">
                            {/* User Identity */}
                            <td className="px-4 py-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-main">{item.email}</span>
                                <span className="text-[10px] text-muted font-mono mt-0.5">{item.id}</span>
                              </div>
                            </td>

                            {/* Account Scope Badge */}
                            <td className="px-4 py-4">
                              {item.role === 'admin' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black text-[#00272b] dark:text-[#e0ff4f] bg-[#e0ff4f]/20 border border-[#e0ff4f]/40 tracking-wider uppercase">
                                  👑 Administrator
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold text-secondary bg-surface-elevated border border-subtle tracking-wider uppercase">
                                  💼 Standard Tenant
                                </span>
                              )}
                            </td>

                            {/* Stocks Tracking */}
                            <td className="px-4 py-4 text-center font-mono font-bold text-secondary">
                              {item.metadata.totalStocks} stocks
                            </td>

                            {/* Reports Exported */}
                            <td className="px-4 py-4 text-center font-mono font-bold text-secondary">
                              {item.metadata.totalLogs} files
                            </td>

                            {/* Actions Panel */}
                            <td className="px-4 py-4 text-right">
                              <div className="inline-flex items-center gap-2">
                                {/* Toggle Role Action */}
                                <button
                                  onClick={() => handleToggleRole(item.id, item.role)}
                                  disabled={roleUpdatingId !== null || item.id === user?.id}
                                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-secondary bg-surface-elevated border border-subtle hover:border-[#e0ff4f]/50 hover:text-main transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                  title={item.id === user?.id ? "You cannot demote yourself" : "Switch user role"}
                                >
                                  {roleUpdatingId === item.id ? (
                                    <svg className="animate-spin h-3 w-3 text-[#00272b] dark:text-[#e0ff4f]" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                  ) : (
                                    'Toggle Scope'
                                  )}
                                </button>

                                {/* Cascade Delete Action */}
                                <button
                                  onClick={() => handleDeleteUser(item.id, item.email)}
                                  disabled={userDeletingId !== null || item.id === user?.id}
                                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 hover:border-rose-500/40 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                  title={item.id === user?.id ? "You cannot delete yourself" : "Delete account cascadingly"}
                                >
                                  {userDeletingId === item.id ? (
                                    <svg className="animate-spin h-3 w-3 text-rose-500" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                  ) : (
                                    'Delete Account'
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination control footer */}
                  {adminTotalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-[11px] text-muted">
                        Page {adminPage} of {adminTotalPages}
                      </span>
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => fetchAdminUsers(adminPage - 1)}
                          disabled={adminPage <= 1}
                          className="px-2.5 py-1.5 text-xs font-bold text-secondary bg-surface-elevated border border-subtle hover:bg-surface-hover rounded-lg transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          &larr; Prev
                        </button>
                        <button
                          onClick={() => fetchAdminUsers(adminPage + 1)}
                          disabled={adminPage >= adminTotalPages}
                          className="px-2.5 py-1.5 text-xs font-bold text-secondary bg-surface-elevated border border-subtle hover:bg-surface-hover rounded-lg transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Next &rarr;
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
