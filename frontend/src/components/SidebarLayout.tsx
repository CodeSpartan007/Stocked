'use client';

import { API_BASE } from '../lib/api';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/app/context/AuthContext';
import { useTheme } from '@/app/context/ThemeContext';
import { Sun, Moon } from 'lucide-react';

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, loading, logout } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [apiStatus, setApiStatus] = useState<{
    provider: 'alphavantage' | 'polygon' | 'manual';
    connected: boolean;
    statusText: string;
    message: string;
    callsRemainingText: string;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    async function fetchApiStatus() {
      try {
        const res = await fetch(`${API_BASE}/api/settings/status`, {
          credentials: 'include',
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            setApiStatus(json.data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch API status:', err);
      }
    }
    fetchApiStatus();
    const interval = setInterval(fetchApiStatus, 30000);
    return () => clearInterval(interval);
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-app text-main relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-[#e0ff4f]/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[#00272b]/20 rounded-full blur-[100px] pointer-events-none" />
        <div className="h-10 w-10 rounded-xl bg-[#e0ff4f] flex items-center justify-center animate-spin mb-4 shadow-lg shadow-[#e0ff4f]/20">
          <svg className="h-5 w-5 text-[#00272b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H12" />
          </svg>
        </div>
        <p className="text-xs text-muted font-bold tracking-widest uppercase">Stocked</p>
      </div>
    );
  }

  const isAuthPage = pathname?.startsWith('/auth');

  if (isAuthPage) {
    return <main className="min-h-screen w-screen bg-app text-main">{children}</main>;
  }

  if (!user) {
    return null;
  }

  const navigation = [
    {
      name: 'Dashboard',
      href: '/',
      icon: (active: boolean) => (
        <svg
          className={`h-5 w-5 mr-3 transition-colors ${active ? 'text-[#00272b] dark:text-[#e0ff4f]' : 'text-muted group-hover:text-main'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z"
          />
        </svg>
      ),
    },
    {
      name: 'Analytics',
      href: '/analytics',
      icon: (active: boolean) => (
        <svg
          className={`h-5 w-5 mr-3 transition-colors ${active ? 'text-[#00272b] dark:text-[#e0ff4f]' : 'text-muted group-hover:text-main'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      ),
    },
    {
      name: 'Stocks',
      href: '/stocks',
      icon: (active: boolean) => (
        <svg
          className={`h-5 w-5 mr-3 transition-colors ${active ? 'text-[#00272b] dark:text-[#e0ff4f]' : 'text-muted group-hover:text-main'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7 12l3-3 3 3 4-4M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
      ),
    },
    {
      name: 'Daily Prices',
      href: '/prices',
      icon: (active: boolean) => (
        <svg
          className={`h-5 w-5 mr-3 transition-colors ${active ? 'text-[#00272b] dark:text-[#e0ff4f]' : 'text-muted group-hover:text-main'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
    {
      name: 'Trades',
      href: '/transactions',
      icon: (active: boolean) => (
        <svg
          className={`h-5 w-5 mr-3 transition-colors ${active ? 'text-[#00272b] dark:text-[#e0ff4f]' : 'text-muted group-hover:text-main'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />
        </svg>
      ),
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: (active: boolean) => (
        <svg
          className={`h-5 w-5 mr-3 transition-colors ${active ? 'text-[#00272b] dark:text-[#e0ff4f]' : 'text-muted group-hover:text-main'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-app text-main">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-surface backdrop-blur-xl border-r border-subtle">
        <div className="flex flex-col flex-grow pt-5 pb-4 overflow-y-auto">
          {/* Logo */}
          <div className="flex items-center px-6 mb-8">
            <div className="h-9 w-9 rounded-xl bg-[#e0ff4f] flex items-center justify-center shadow-lg shadow-[#e0ff4f]/25">
              <svg className="h-5 w-5 text-[#00272b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="ml-3 text-xl font-black tracking-wider text-main">
              STOCKED
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 px-4 space-y-1.5">
            {navigation.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                    active
                      ? 'bg-[#e0ff4f]/15 dark:bg-[#e0ff4f]/10 text-main border-l-4 border-[#e0ff4f] font-bold shadow-sm'
                      : 'text-secondary hover:bg-surface-hover hover:text-main'
                  }`}
                >
                  {item.icon(active)}
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Theme switcher & User profile section */}
        <div className="flex-shrink-0 flex flex-col border-t border-subtle p-4 bg-surface space-y-3">
          {/* Quick Theme Switcher */}
          <button
            onClick={toggleTheme}
            type="button"
            className="w-full flex items-center justify-between px-3.5 py-2.5 border border-subtle bg-surface-elevated hover:bg-surface-hover text-secondary hover:text-main text-xs font-semibold rounded-xl transition-all duration-200 cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              {resolvedTheme === 'dark' ? (
                <Sun className="h-4 w-4 text-[#e0ff4f]" />
              ) : (
                <Moon className="h-4 w-4 text-[#00272b]" />
              )}
              <span>{resolvedTheme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
            </div>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-app border border-subtle text-muted">
              Toggle
            </span>
          </button>

          <div className="flex items-center w-full">
            <div className="h-9 w-9 rounded-full bg-[#e0ff4f] text-[#00272b] border border-[#00272b]/20 dark:bg-[#04434a] dark:text-[#e0ff4f] dark:border-[#e0ff4f]/40 flex items-center justify-center font-bold text-sm shadow-md">
              {user.email.substring(0, 2).toUpperCase()}
            </div>
            <div className="ml-3 overflow-hidden flex-1">
              <p className="text-sm font-semibold text-main truncate">{user.email}</p>
              <p className="text-[10px] font-bold text-[#00272b] dark:text-[#e0ff4f] uppercase tracking-wide">{user.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center px-4 py-2 border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl transition-all duration-200 cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          {/* Overlay backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer content */}
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-surface border-r border-subtle pt-5 pb-4">
            <div className="absolute top-0 right-0 -mr-12 pt-4">
              <button
                type="button"
                className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#e0ff4f]"
                onClick={() => setMobileMenuOpen(false)}
              >
                <svg className="h-6 w-6 text-main" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex items-center px-6 mb-8">
              <div className="h-9 w-9 rounded-xl bg-[#e0ff4f] flex items-center justify-center shadow-lg shadow-[#e0ff4f]/25">
                <svg className="h-5 w-5 text-[#00272b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <span className="ml-3 text-xl font-black tracking-wider text-main">STOCKED</span>
            </div>

            <nav className="flex-1 px-4 space-y-1.5">
              {navigation.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                      active
                        ? 'bg-[#e0ff4f]/15 dark:bg-[#e0ff4f]/10 text-main border-l-4 border-[#e0ff4f] font-bold'
                        : 'text-secondary hover:bg-surface-hover hover:text-main'
                    }`}
                  >
                    {item.icon(active)}
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            <div className="flex-shrink-0 flex flex-col border-t border-subtle p-4 bg-surface space-y-3">
              <button
                onClick={toggleTheme}
                type="button"
                className="w-full flex items-center justify-between px-3.5 py-2 border border-subtle bg-surface-elevated hover:bg-surface-hover text-secondary hover:text-main text-xs font-semibold rounded-xl transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  {resolvedTheme === 'dark' ? (
                    <Sun className="h-4 w-4 text-[#e0ff4f]" />
                  ) : (
                    <Moon className="h-4 w-4 text-[#00272b]" />
                  )}
                  <span>{resolvedTheme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                </div>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-app border border-subtle text-muted">
                  Toggle
                </span>
              </button>

              <div className="flex items-center">
                <div className="h-9 w-9 rounded-full bg-[#e0ff4f] text-[#00272b] border border-[#00272b]/20 dark:bg-[#04434a] dark:text-[#e0ff4f] dark:border-[#e0ff4f]/40 flex items-center justify-center font-bold text-sm">
                  {user.email.substring(0, 2).toUpperCase()}
                </div>
                <div className="ml-3">
                  <p className="text-sm font-semibold text-main">{user.email}</p>
                  <p className="text-[10px] text-[#00272b] dark:text-[#e0ff4f] font-bold uppercase">{user.role}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="w-full flex items-center justify-center px-4 py-2 border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 overflow-hidden md:pl-64">
        {/* Mobile Header Bar */}
        <header className="md:hidden flex items-center justify-between h-16 px-4 bg-surface border-b border-subtle shrink-0 relative z-30">
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-lg bg-[#e0ff4f] flex items-center justify-center shadow shadow-[#e0ff4f]/30">
              <svg className="h-4 w-4 text-[#00272b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="ml-2.5 font-black tracking-wider text-main text-lg">STOCKED</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Toggle Theme"
              className="p-2 rounded-lg text-secondary hover:bg-surface-hover focus:outline-none cursor-pointer"
              onClick={toggleTheme}
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="h-5 w-5 text-[#e0ff4f]" />
              ) : (
                <Moon className="h-5 w-5 text-[#00272b]" />
              )}
            </button>
            <button
              type="button"
              className="p-2 rounded-lg text-secondary hover:bg-surface-hover focus:outline-none"
              onClick={() => setMobileMenuOpen(true)}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </header>

        {/* Content body wrapper */}
        <main className="flex-1 overflow-y-auto relative bg-app p-4 pb-16 sm:p-6 sm:pb-20 md:p-8 md:pb-24 text-main">
          {/* Neon mesh background glow */}
          <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-[#e0ff4f]/5 rounded-full blur-[120px] pointer-events-none -z-10" />
          <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-[#00272b]/10 dark:bg-[#00272b]/40 rounded-full blur-[100px] pointer-events-none -z-10" />

          <div className="max-w-7xl mx-auto min-h-full flex flex-col">
            {apiStatus && apiStatus.provider !== 'manual' && (
              <div className={`mb-6 p-4 rounded-2xl border backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-semibold shadow-lg transition-all duration-300 ${
                apiStatus.statusText === 'Rate Limited'
                  ? 'bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-300'
                  : !apiStatus.connected
                    ? 'bg-rose-500/10 border-rose-500/25 text-rose-600 dark:text-rose-300'
                    : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-300'
              }`}>
                <div className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${
                    apiStatus.statusText === 'Rate Limited'
                      ? 'bg-amber-500 animate-pulse'
                      : !apiStatus.connected
                        ? 'bg-rose-500'
                        : 'bg-emerald-500'
                  }`} />
                  <span>
                    <span className="font-extrabold uppercase tracking-wider mr-1">
                      {apiStatus.provider === 'alphavantage' ? 'Alpha Vantage' : 'Polygon.io'} Feed:
                    </span>{' '}
                    {apiStatus.statusText === 'Rate Limited'
                      ? 'Request limit reached. Data updates are temporarily paused.'
                      : !apiStatus.connected
                        ? 'Connection offline. Please check your API credentials.'
                        : 'Live pricing active.'}
                  </span>
                </div>
                {apiStatus.callsRemainingText && (
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-90 bg-surface-elevated px-3 py-1 rounded-xl border border-subtle text-secondary">
                    {apiStatus.callsRemainingText}
                  </span>
                )}
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
