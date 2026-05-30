'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigation = [
    {
      name: 'Dashboard',
      href: '/',
      icon: (active: boolean) => (
        <svg
          className={`h-5 w-5 mr-3 transition-colors ${active ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`}
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
          className={`h-5 w-5 mr-3 transition-colors ${active ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`}
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
      name: 'Stocks Counter',
      href: '/stocks',
      icon: (active: boolean) => (
        <svg
          className={`h-5 w-5 mr-3 transition-colors ${active ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`}
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
          className={`h-5 w-5 mr-3 transition-colors ${active ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`}
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
      name: 'Transactions Ledger',
      href: '/transactions',
      icon: (active: boolean) => (
        <svg
          className={`h-5 w-5 mr-3 transition-colors ${active ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`}
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
          className={`h-5 w-5 mr-3 transition-colors ${active ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`}
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
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-slate-900/60 backdrop-blur-xl border-r border-slate-800">
        <div className="flex flex-col flex-grow pt-5 pb-4 overflow-y-auto">
          {/* Logo */}
          <div className="flex items-center px-6 mb-8">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="h-5 w-5 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="ml-3 text-xl font-bold tracking-wider bg-gradient-to-r from-indigo-200 via-slate-100 to-emerald-200 bg-clip-text text-transparent">
              STOCKED
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 px-4 space-y-1">
            {navigation.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                    active
                      ? 'bg-indigo-500/10 text-indigo-200 border-l-4 border-indigo-500 shadow-inner'
                      : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                  }`}
                >
                  {item.icon(active)}
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User profile section */}
        <div className="flex-shrink-0 flex border-t border-slate-800 p-4 bg-slate-900/40">
          <div className="flex items-center w-full">
            <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-indigo-600 to-pink-500 flex items-center justify-center text-slate-100 font-bold text-sm shadow-md">
              JD
            </div>
            <div className="ml-3 overflow-hidden">
              <p className="text-sm font-semibold text-slate-200 truncate">John Doe</p>
              <p className="text-xs font-medium text-indigo-400/90 truncate">mock-user-123 (User)</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          {/* Overlay backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer content */}
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-slate-900 border-r border-slate-850 pt-5 pb-4">
            <div className="absolute top-0 right-0 -mr-12 pt-4">
              <button
                type="button"
                className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                onClick={() => setMobileMenuOpen(false)}
              >
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex items-center px-6 mb-8">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-emerald-400 flex items-center justify-center">
                <svg className="h-5 w-5 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <span className="ml-3 text-xl font-bold tracking-wider text-slate-100">STOCKED</span>
            </div>

            <nav className="flex-1 px-4 space-y-1">
              {navigation.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                      active
                        ? 'bg-indigo-500/10 text-indigo-200 border-l-4 border-indigo-500'
                        : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                    }`}
                  >
                    {item.icon(active)}
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            <div className="flex-shrink-0 flex border-t border-slate-800 p-4 bg-slate-950/20">
              <div className="flex items-center">
                <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-indigo-600 to-pink-500 flex items-center justify-center text-slate-100 font-bold text-sm">
                  JD
                </div>
                <div className="ml-3">
                  <p className="text-sm font-semibold text-slate-200">John Doe</p>
                  <p className="text-xs text-indigo-400 font-medium">mock-user-123</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 overflow-hidden md:pl-64">
        {/* Mobile Header Bar */}
        <header className="md:hidden flex items-center justify-between h-16 px-4 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-emerald-400 flex items-center justify-center">
              <svg className="h-4 w-4 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="ml-2.5 font-bold tracking-wider text-slate-100 text-lg">STOCKED</span>
          </div>

          <button
            type="button"
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 focus:outline-none"
            onClick={() => setMobileMenuOpen(true)}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        {/* Content body wrapper with nice dark styling */}
        <main className="flex-1 overflow-y-auto relative bg-slate-950 p-4 sm:p-6 md:p-8">
          {/* Neon mesh background glow */}
          <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none -z-10" />
          <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none -z-10" />

          <div className="max-w-7xl mx-auto h-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
