'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';

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
  const [activeTab, setActiveTab] = useState<'feed' | 'admin'>('feed');

  // Price Feed Configurations State
  const [provider, setProvider] = useState<'alphavantage' | 'polygon' | 'manual'>('manual');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(60);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });

  // System User Administration State
  const [adminUsers, setAdminUsers] = useState<UserItem[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminPage, setAdminPage] = useState(1);
  const [adminTotalPages, setAdminTotalPages] = useState(1);
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);
  const [userDeletingId, setUserDeletingId] = useState<string | null>(null);

  // Fetch current feed config
  useEffect(() => {
    async function fetchSettings() {
      try {
        setLoading(true);
        const response = await fetch('http://localhost:5001/api/settings/feed', {
          method: 'GET',
          credentials: 'include',
        });
        if (!response.ok) {
          throw new Error('Failed to retrieve price feed configuration.');
        }
        const json = await response.json();
        if (json.success && json.data) {
          setProvider(json.data.provider);
          setApiKey(json.data.apiKey || '');
          setApiKeyDirty(false);
          setRefreshInterval(json.data.refreshInterval);
        }
      } catch (err: any) {
        console.error(err);
        triggerToast('Could not sync settings from backend server.', 'error');
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []);

  // Reset connection status when provider or key changes
  useEffect(() => {
    setConnectionStatus('idle');
    setConnectionMessage('');
  }, [provider, apiKey]);

  const handleTestConnection = async () => {
    if (!apiKey) {
      triggerToast('API Key is required to test connection.', 'error');
      return;
    }
    setConnectionStatus('testing');
    setConnectionMessage('');
    try {
      const response = await fetch('http://localhost:5001/api/settings/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey,
        }),
        credentials: 'include',
      });
      const json = await response.json();
      if (response.ok && json.success) {
        setConnectionStatus('success');
        setConnectionMessage(json.message);
        triggerToast(json.message, 'success');
      } else {
        setConnectionStatus('failed');
        setConnectionMessage(json.message || 'Connection failed.');
        triggerToast(json.message || 'Connection failed.', 'error');
      }
    } catch (err: any) {
      console.error(err);
      setConnectionStatus('failed');
      setConnectionMessage(err.message || 'Network error testing API connection.');
      triggerToast(err.message || 'Network error testing API connection.', 'error');
    }
  };

  // Fetch registered users (Admins only)
  const fetchAdminUsers = async (page: number = 1) => {
    if (user?.role !== 'admin') return;

    try {
      setAdminLoading(true);
      const response = await fetch(`http://localhost:5001/api/admin?page=${page}&limit=8`, {
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
    } catch (err: any) {
      console.error(err);
      triggerToast('Could not retrieve user matrix from backend.', 'error');
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'admin') {
      fetchAdminUsers(1);
    }
  }, [activeTab]);

  const triggerToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 4000);
  };

  const handleSaveFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload: any = {
        provider,
        refreshInterval: Number(refreshInterval),
      };

      const isMasked = apiKey.includes('•') || apiKey.includes('★') || apiKey.includes('*');
      
      if (provider !== 'manual') {
        if (apiKeyDirty && !isMasked) {
          payload.apiKey = apiKey;
        }
      } else {
        payload.apiKey = '';
      }

      const response = await fetch('http://localhost:5001/api/settings/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });

      const json = await response.json();
      if (response.ok && json.success) {
        triggerToast('Pricing configurations and credentials updated successfully.', 'success');
        if (json.data) {
          setApiKey(json.data.apiKey || '');
          setApiKeyDirty(false);
        }
      } else {
        const errorMsg = json.errors && json.errors.length > 0 ? json.errors[0].message : json.message;
        throw new Error(errorMsg || 'Failed to persist feed parameters.');
      }
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Error occurred while saving configurations.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRole = async (userId: string, currentRole: 'admin' | 'user') => {
    if (roleUpdatingId) return;
    setRoleUpdatingId(userId);

    const nextRole = currentRole === 'admin' ? 'user' : 'admin';

    try {
      const response = await fetch(`http://localhost:5001/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
        credentials: 'include',
      });

      const json = await response.json();
      if (response.ok && json.success) {
        triggerToast(`Role elevated successfully. Account is now designated as ${nextRole.toUpperCase()}.`, 'success');
        // Refresh grid locally
        setAdminUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: nextRole } : u))
        );
      } else {
        throw new Error(json.message || 'Failed to update user role.');
      }
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Error toggling account role.', 'error');
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
      const response = await fetch(`http://localhost:5001/api/admin/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const json = await response.json();
      if (response.ok && json.success) {
        triggerToast('System account and all scoped records deleted successfully.', 'success');
        // Refresh grid
        fetchAdminUsers(adminPage);
      } else {
        throw new Error(json.message || 'Failed to delete user account.');
      }
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Error deleting system account.', 'error');
    } finally {
      setUserDeletingId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in relative text-slate-100 pb-12">
      {/* Toast Notification Banner */}
      {toast.show && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-2xl border backdrop-blur-xl shadow-2xl transition-all duration-300 transform translate-y-0 ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)] animate-slide-in'
              : 'bg-rose-950/90 border-rose-500/30 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.2)] animate-slide-in'
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
          <span className="text-sm font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Header section */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-white">System Administration & Configurations</h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure real-time price feed schedulers, manage credentials, and monitor system-wide multi-tenant accounts.
        </p>
      </div>

      {/* Conditional Administrative Tabs */}
      {user?.role === 'admin' && (
        <div className="flex border-b border-slate-800 space-x-6">
          <button
            onClick={() => setActiveTab('feed')}
            className={`pb-4 text-sm font-bold tracking-wide uppercase transition-all duration-200 border-b-2 focus:outline-none cursor-pointer ${
              activeTab === 'feed'
                ? 'border-indigo-500 text-indigo-400 font-extrabold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🔌 API Integrations
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className={`pb-4 text-sm font-bold tracking-wide uppercase transition-all duration-200 border-b-2 focus:outline-none cursor-pointer ${
              activeTab === 'admin'
                ? 'border-emerald-500 text-emerald-450 font-extrabold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🛡️ Administrative Console
          </button>
        </div>
      )}

      {activeTab === 'feed' ? (
        // tab: Integration Configurations
        loading ? (
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-xl animate-pulse space-y-6">
            <div className="h-8 bg-slate-850 w-1/4 rounded" />
            <div className="h-14 bg-slate-850 w-full rounded-2xl" />
            <div className="h-14 bg-slate-850 w-full rounded-2xl" />
            <div className="h-12 bg-slate-850 w-1/3 rounded-xl ml-auto" />
          </div>
        ) : (
          <form onSubmit={handleSaveFeed} className="space-y-6">
            <div className="bg-slate-900/30 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-xl space-y-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 opacity-60" />

              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white">Pricing Provider Engine</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Choose your live external feed provider or toggle manual offline fallback mode.</p>
                </div>

                <div 
                  className="grid grid-cols-1 md:grid-cols-3 gap-4" 
                  role="radiogroup" 
                  aria-label="Pricing Provider Selection"
                >
                  {/* Alpha Vantage */}
                  <div
                    onClick={() => setProvider('alphavantage')}
                    role="radio"
                    aria-checked={provider === 'alphavantage'}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        setProvider('alphavantage');
                      }
                    }}
                    className={`cursor-pointer rounded-2xl p-5 border transition-all duration-300 relative flex flex-col justify-between h-32 hover:border-indigo-500/40 hover:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      provider === 'alphavantage'
                        ? 'border-indigo-500 bg-indigo-500/5 shadow-[0_0_15px_rgba(99,102,241,0.15)]'
                        : 'border-slate-850 bg-slate-950/40'
                    }`}
                  >
                    <div className="flex items-center justify-between pointer-events-none">
                      <span className="text-xs font-black text-slate-400 tracking-wider">ALPHA VANTAGE</span>
                      <div
                        className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center transition-colors ${
                          provider === 'alphavantage' ? 'border-indigo-400 bg-indigo-500/20' : 'border-slate-700'
                        }`}
                      >
                        {provider === 'alphavantage' && <div className="h-2 w-2 rounded-full bg-indigo-400" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-450 leading-relaxed mt-2 pointer-events-none">
                      Global stock market queries via high-resolution quote payloads. Ideal for standard catalog listings.
                    </p>
                  </div>

                  {/* Polygon.io */}
                  <div
                    onClick={() => setProvider('polygon')}
                    role="radio"
                    aria-checked={provider === 'polygon'}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        setProvider('polygon');
                      }
                    }}
                    className={`cursor-pointer rounded-2xl p-5 border transition-all duration-300 relative flex flex-col justify-between h-32 hover:border-indigo-500/40 hover:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      provider === 'polygon'
                        ? 'border-indigo-500 bg-indigo-500/5 shadow-[0_0_15px_rgba(99,102,241,0.15)]'
                        : 'border-slate-850 bg-slate-950/40'
                    }`}
                  >
                    <div className="flex items-center justify-between pointer-events-none">
                      <span className="text-xs font-black text-slate-400 tracking-wider">POLYGON.IO</span>
                      <div
                        className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center transition-colors ${
                          provider === 'polygon' ? 'border-indigo-400 bg-indigo-500/20' : 'border-slate-700'
                        }`}
                      >
                        {provider === 'polygon' && <div className="h-2 w-2 rounded-full bg-indigo-400" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-450 leading-relaxed mt-2 pointer-events-none">
                      Highly scalable REST responses using historic prev-close aggregates. Perfect for charts and graphs.
                    </p>
                  </div>

                  {/* Manual Fallback */}
                  <div
                    onClick={() => setProvider('manual')}
                    role="radio"
                    aria-checked={provider === 'manual'}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        setProvider('manual');
                      }
                    }}
                    className={`cursor-pointer rounded-2xl p-5 border transition-all duration-300 relative flex flex-col justify-between h-32 hover:border-emerald-500/40 hover:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                      provider === 'manual'
                        ? 'border-emerald-500 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                        : 'border-slate-850 bg-slate-950/40'
                    }`}
                  >
                    <div className="flex items-center justify-between pointer-events-none">
                      <span className="text-xs font-black text-slate-400 tracking-wider">MANUAL FALLBACK</span>
                      <div
                        className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center transition-colors ${
                          provider === 'manual' ? 'border-emerald-400 bg-emerald-500/20' : 'border-slate-700'
                        }`}
                      >
                        {provider === 'manual' && <div className="h-2 w-2 rounded-full bg-emerald-400" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-455 leading-relaxed mt-2 pointer-events-none">
                      Local pricing. Keeps transactions linked exclusively to your manually logged and seeded price logs.
                    </p>
                  </div>
                </div>
              </div>

              {provider !== 'manual' && (
                <div className="space-y-3 animate-slide-down">
                  <div>
                    <label className="block text-xs font-bold text-slate-350 uppercase tracking-wider">API Authentication Credentials</label>
                    <p className="text-[10px] text-slate-500 mt-0.5">Secure, server-side encrypted token. Never exposed client-side.</p>
                  </div>

                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </span>
                    <input
                      type={showKey ? 'text' : 'password'}
                      placeholder="Input external market provider API key..."
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        setApiKeyDirty(true);
                      }}
                      required
                      className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl pl-11 pr-12 py-3 text-sm text-slate-100 placeholder-slate-650 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      {showKey ? (
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

                  {/* API Key Status and Test Button */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5 border-t border-slate-800/40 mt-3">
                    <div className="flex-1">
                      {connectionStatus === 'idle' && (
                        <span className="text-[11px] text-slate-400 font-medium">Status: Not tested yet</span>
                      )}
                      {connectionStatus === 'testing' && (
                        <span className="text-[11px] text-indigo-400 font-semibold flex items-center gap-1.5">
                          <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Verifying API key connection status...
                        </span>
                      )}
                      {connectionStatus === 'success' && (
                        <span className="text-[11px] text-emerald-450 font-bold flex items-center gap-1">
                          ✓ {connectionMessage}
                        </span>
                      )}
                      {connectionStatus === 'failed' && (
                        <span className="text-[11px] text-rose-450 font-semibold block leading-relaxed max-w-md">
                          ✗ Connection Failed: {connectionMessage}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={connectionStatus === 'testing' || !apiKey}
                      onClick={handleTestConnection}
                      className="px-3.5 py-1.5 text-xs font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/25 hover:border-indigo-500/40 rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                    >
                      Test API Connection
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-350 uppercase tracking-wider">Automated Refresh Polling Rate</label>
                  <p className="text-[10px] text-slate-500 mt-0.5">Customize the background cache interval to balance database freshness with API rate limits.</p>
                </div>

                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <svg className="h-4.5 w-4.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <select
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl pl-11 pr-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer appearance-none"
                  >
                    <option value={10}>10 Seconds (Ultra Live)</option>
                    <option value={30}>30 Seconds (Highly Responsive)</option>
                    <option value={60}>60 Seconds (Default Interval)</option>
                    <option value={300}>5 Minutes (Balanced Standard)</option>
                    <option value={900}>15 Minutes (Low Rate Usage)</option>
                    <option value={3600}>1 Hour (Minimal Cache Sync)</option>
                  </select>
                  <span className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-slate-400">
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
                className="inline-flex items-center px-6 py-3 rounded-xl text-sm font-bold text-slate-900 bg-gradient-to-r from-emerald-400 to-teal-350 hover:from-emerald-350 hover:to-teal-250 transition-all duration-200 shadow-lg shadow-emerald-500/20 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2.5 h-4 w-4 text-slate-900" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving Integration Details...
                  </>
                ) : (
                  <>
                    <svg className="h-4.5 w-4.5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Save Integration Parameters
                  </>
                )}
              </button>
            </div>
          </form>
        )
      ) : (
        // tab: System User Administration Grid (Admins only)
        user?.role === 'admin' && (
          <div className="space-y-6">
            <div className="bg-slate-900/30 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-indigo-650 to-indigo-500 opacity-60" />

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
                <div>
                  <h3 className="text-base font-bold text-white">System Account Administration</h3>
                  <p className="text-xs text-slate-400 mt-0.5">List registered accounts, modify role scopes, and cascade delete system records.</p>
                </div>
                <button
                  onClick={() => fetchAdminUsers(adminPage)}
                  disabled={adminLoading}
                  className="px-3.5 py-2 text-xs font-bold text-indigo-300 bg-indigo-550/10 border border-indigo-500/20 hover:bg-indigo-500/20 hover:border-indigo-500/40 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className={`h-3.5 w-3.5 ${adminLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H12" />
                  </svg>
                  Sync User Matrix
                </button>
              </div>

              {adminLoading ? (
                <div className="space-y-4 py-8">
                  <div className="h-10 bg-slate-850 w-full rounded-xl animate-pulse" />
                  <div className="h-12 bg-slate-850 w-full rounded-xl animate-pulse" />
                  <div className="h-12 bg-slate-850 w-full rounded-xl animate-pulse" />
                  <div className="h-12 bg-slate-850 w-full rounded-xl animate-pulse" />
                </div>
              ) : adminUsers.length === 0 ? (
                <div className="text-center py-16 border border-slate-800/80 border-dashed rounded-2xl">
                  <p className="text-slate-500 text-sm">No registered user accounts found.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Account Grid Table */}
                  <div className="overflow-hidden border border-slate-850 rounded-2xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-950/70 border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          <th className="px-4 py-3">User Identity</th>
                          <th className="px-4 py-3">Account Scope Badge</th>
                          <th className="px-4 py-3 text-center">Stocks Tracking</th>
                          <th className="px-4 py-3 text-center">Reports Exported</th>
                          <th className="px-4 py-3 text-right">Actions Panel</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850/80 text-xs">
                        {adminUsers.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-900/30 transition-all duration-200">
                            {/* User Identity */}
                            <td className="px-4 py-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-100">{item.email}</span>
                                <span className="text-[10px] text-slate-500 font-mono mt-0.5">{item.id}</span>
                              </div>
                            </td>

                            {/* Account Scope Badge */}
                            <td className="px-4 py-4">
                              {item.role === 'admin' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black text-amber-300 bg-amber-500/10 border border-amber-500/30 tracking-wider shadow-[0_0_10px_rgba(245,158,11,0.15)] uppercase">
                                  👑 Administrator
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black text-slate-300 bg-slate-700/20 border border-slate-700/50 tracking-wider uppercase">
                                  💼 Standard Tenant
                                </span>
                              )}
                            </td>

                            {/* Stocks Tracking */}
                            <td className="px-4 py-4 text-center font-mono font-bold text-slate-300">
                              {item.metadata.totalStocks} stocks
                            </td>

                            {/* Reports Exported */}
                            <td className="px-4 py-4 text-center font-mono font-bold text-slate-350">
                              {item.metadata.totalLogs} files
                            </td>

                            {/* Actions Panel */}
                            <td className="px-4 py-4 text-right">
                              <div className="inline-flex items-center gap-2">
                                {/* Toggle Role Action */}
                                <button
                                  onClick={() => handleToggleRole(item.id, item.role)}
                                  disabled={roleUpdatingId !== null || item.id === user?.id}
                                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-300 bg-slate-950 border border-slate-800 hover:border-indigo-500/40 hover:text-indigo-300 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                  title={item.id === user?.id ? "You cannot demote yourself" : "Switch user role"}
                                >
                                  {roleUpdatingId === item.id ? (
                                    <svg className="animate-spin h-3 w-3 text-indigo-400" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
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
                                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-rose-400 bg-rose-950/10 border border-rose-500/20 hover:bg-rose-500/10 hover:border-rose-500/40 hover:text-rose-350 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                  title={item.id === user?.id ? "You cannot delete yourself" : "Delete account cascadingly"}
                                >
                                  {userDeletingId === item.id ? (
                                    <svg className="animate-spin h-3 w-3 text-rose-455" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
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
                      <span className="text-[11px] text-slate-500">
                        Page {adminPage} of {adminTotalPages}
                      </span>
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => fetchAdminUsers(adminPage - 1)}
                          disabled={adminPage <= 1}
                          className="px-2.5 py-1.5 text-xs font-bold text-slate-400 bg-slate-950 border border-slate-850 hover:bg-slate-900 rounded-lg transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          &larr; Prev
                        </button>
                        <button
                          onClick={() => fetchAdminUsers(adminPage + 1)}
                          disabled={adminPage >= adminTotalPages}
                          className="px-2.5 py-1.5 text-xs font-bold text-slate-400 bg-slate-950 border border-slate-850 hover:bg-slate-900 rounded-lg transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
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
        )
      )}
    </div>
  );
}
