'use client';

import React, { useEffect, useState } from 'react';

interface SettingData {
  provider: 'alphavantage' | 'polygon' | 'manual';
  apiKey: string;
  refreshInterval: number;
}

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error';
}

export default function FeedSettings() {
  const [provider, setProvider] = useState<'alphavantage' | 'polygon' | 'manual'>('manual');
  const [apiKey, setApiKey] = useState('');
  const [refreshInterval, setRefreshInterval] = useState(60);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });

  // Fetch current config
  useEffect(() => {
    async function fetchSettings() {
      try {
        setLoading(true);
        const response = await fetch('http://localhost:5001/api/settings/feed');
        if (!response.ok) {
          throw new Error('Failed to retrieve price feed configuration.');
        }
        const json = await response.json();
        if (json.success && json.data) {
          setProvider(json.data.provider);
          setApiKey(json.data.apiKey || '');
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

  const triggerToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 4000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch('http://localhost:5001/api/settings/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey: provider === 'manual' ? '' : apiKey,
          refreshInterval: Number(refreshInterval),
        }),
      });

      const json = await response.json();
      if (response.ok && json.success) {
        triggerToast('Credentials and pricing configurations updated successfully.', 'success');
        if (json.data) {
          setApiKey(json.data.apiKey || '');
        }
      } else {
        const errorMsg = json.errors ? json.errors[0].message : json.message;
        throw new Error(errorMsg || 'Failed to persist feed parameters.');
      }
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Error occurred while saving configurations.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in relative text-slate-100">
      {/* Toast Notification Banner */}
      {toast.show && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-2xl border backdrop-blur-xl shadow-2xl transition-all duration-300 transform translate-y-0 ${
            toast.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
              : 'bg-rose-950/80 border-rose-500/30 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.2)]'
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
        <h1 className="text-3xl font-black tracking-tight text-white">External API Integration</h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure real-time capital market stock pricing services, authenticate API tokens, and set refresh scheduler rates.
        </p>
      </div>

      {loading ? (
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-xl animate-pulse space-y-6">
          <div className="h-8 bg-slate-850 w-1/4 rounded" />
          <div className="h-14 bg-slate-850 w-full rounded-2xl" />
          <div className="h-14 bg-slate-850 w-full rounded-2xl" />
          <div className="h-12 bg-slate-850 w-1/3 rounded-xl ml-auto" />
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Main card */}
          <div className="bg-slate-900/30 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-xl space-y-8 relative overflow-hidden group">
            {/* Ambient glows */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 opacity-60" />

            {/* Provider Section */}
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-white">Pricing Provider Engine</h3>
                <p className="text-xs text-slate-400 mt-0.5">Choose your live external feed provider or toggle manual offline fallback mode.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Provider Card - Alpha Vantage */}
                <div
                  onClick={() => setProvider('alphavantage')}
                  className={`cursor-pointer rounded-2xl p-5 border transition-all duration-300 relative flex flex-col justify-between h-32 hover:border-indigo-500/40 hover:bg-slate-900/60 ${
                    provider === 'alphavantage'
                      ? 'border-indigo-500 bg-indigo-500/5 shadow-[0_0_15px_rgba(99,102,241,0.15)]'
                      : 'border-slate-850 bg-slate-950/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-400 tracking-wider">ALPHA VANTAGE</span>
                    <div
                      className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center transition-colors ${
                        provider === 'alphavantage' ? 'border-indigo-400 bg-indigo-500/20' : 'border-slate-700'
                      }`}
                    >
                      {provider === 'alphavantage' && <div className="h-2 w-2 rounded-full bg-indigo-400" />}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-2">
                    Global stock market queries via high-resolution quote payloads. Ideal for standard catalog listings.
                  </p>
                </div>

                {/* Provider Card - Polygon.io */}
                <div
                  onClick={() => setProvider('polygon')}
                  className={`cursor-pointer rounded-2xl p-5 border transition-all duration-300 relative flex flex-col justify-between h-32 hover:border-indigo-500/40 hover:bg-slate-900/60 ${
                    provider === 'polygon'
                      ? 'border-indigo-500 bg-indigo-500/5 shadow-[0_0_15px_rgba(99,102,241,0.15)]'
                      : 'border-slate-850 bg-slate-950/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-400 tracking-wider">POLYGON.IO</span>
                    <div
                      className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center transition-colors ${
                        provider === 'polygon' ? 'border-indigo-400 bg-indigo-500/20' : 'border-slate-700'
                      }`}
                    >
                      {provider === 'polygon' && <div className="h-2 w-2 rounded-full bg-indigo-400" />}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-2">
                    Highly scalable REST responses using historic prev-close aggregates. Perfect for charts and graphs.
                  </p>
                </div>

                {/* Provider Card - Manual Fallback */}
                <div
                  onClick={() => setProvider('manual')}
                  className={`cursor-pointer rounded-2xl p-5 border transition-all duration-300 relative flex flex-col justify-between h-32 hover:border-emerald-500/40 hover:bg-slate-900/60 ${
                    provider === 'manual'
                      ? 'border-emerald-500 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                      : 'border-slate-850 bg-slate-950/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-400 tracking-wider">MANUAL FALLBACK</span>
                    <div
                      className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center transition-colors ${
                        provider === 'manual' ? 'border-emerald-400 bg-emerald-500/20' : 'border-slate-700'
                      }`}
                    >
                      {provider === 'manual' && <div className="h-2 w-2 rounded-full bg-emerald-400" />}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-2">
                    Local pricing. Keeps transactions linked exclusively to your manually logged and seeded price logs.
                  </p>
                </div>
              </div>
            </div>

            {/* API Credentials Input (Show only if not Manual) */}
            {provider !== 'manual' && (
              <div className="space-y-3 animate-slide-down">
                <div className="flex justify-between items-center">
                  <div>
                    <label className="block text-xs font-bold text-slate-350 uppercase tracking-wider">API Authentication Credentials</label>
                    <p className="text-[10px] text-slate-500 mt-0.5">Secure, server-side encrypted token. Never exposed client-side.</p>
                  </div>
                </div>

                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <svg className="h-4.5 w-4.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </span>
                  <input
                    type={showKey ? 'text' : 'password'}
                    placeholder="Input external market provider API key..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 rounded-xl pl-11 pr-12 py-3 text-sm text-slate-100 placeholder-slate-650 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
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
              </div>
            )}

            {/* Refresh Interval Dropdown */}
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

          {/* Form Actions */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className={`inline-flex items-center px-6 py-3 rounded-xl text-sm font-bold text-slate-900 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 transition-all duration-200 shadow-lg shadow-emerald-500/20 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {saving ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2.5 h-4 w-4 text-slate-900" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving Credentials...
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
      )}
    </div>
  );
}
