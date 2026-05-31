'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/app/context/AuthContext';

export default function RegisterPage() {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Client-side Password Confirmation check
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await register(email, password);
      if (!res.success) {
        if (res.errors && res.errors.length > 0) {
          const errorsMap: { [key: string]: string } = {};
          res.errors.forEach((err) => {
            errorsMap[err.field] = err.message;
          });
          setFieldErrors(errorsMap);
        } else {
          setError(res.message || 'Registration failed.');
        }
      }
    } catch (err) {
      setError('A connection error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-slate-100 relative overflow-hidden px-4">
      {/* Dynamic ambient mesh glows */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Glassmorphic Card Wrapper */}
      <div className="w-full max-w-md bg-slate-900/30 backdrop-blur-2xl border border-slate-800/80 rounded-3xl p-8 sm:p-10 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-455 opacity-80" />

        {/* Brand Logo Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4 transform group-hover:rotate-12 transition-transform duration-300">
            <svg className="h-6 w-6 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m2 9h4a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black tracking-wider bg-gradient-to-r from-indigo-200 via-slate-100 to-emerald-250 bg-clip-text text-transparent">
            REGISTER ACCOUNT
          </h2>
          <p className="text-xs text-slate-400 mt-1.5 text-center">
            Sign up to create your isolated portfolio tracking system
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl text-xs font-semibold flex items-center">
            <svg className="h-4.5 w-4.5 mr-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email Input */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
              </span>
              <input
                type="email"
                placeholder="you@stocked.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-slate-950/60 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-11 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-all duration-200"
              />
            </div>
            {fieldErrors.email && (
              <p className="text-[10px] text-rose-450 font-bold mt-1 pl-1">{fieldErrors.email}</p>
            )}
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Secure Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </span>
              <input
                type="password"
                placeholder="Min 8 characters, upper, number..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-slate-950/60 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-11 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-all duration-200"
              />
            </div>
            {fieldErrors.password ? (
              <p className="text-[10px] text-rose-455 font-bold mt-1 pl-1">{fieldErrors.password}</p>
            ) : (
              <div className="p-2.5 bg-slate-950/30 border border-slate-850 rounded-xl mt-1 space-y-1">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Password Requirements:</p>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] text-slate-450 font-medium list-disc pl-3">
                  <li className={password.length >= 8 ? 'text-emerald-450 font-bold' : ''}>Min 8 characters</li>
                  <li className={/[A-Z]/.test(password) ? 'text-emerald-450 font-bold' : ''}>Uppercase letter</li>
                  <li className={/[a-z]/.test(password) ? 'text-emerald-450 font-bold' : ''}>Lowercase letter</li>
                  <li className={/[0-9]/.test(password) ? 'text-emerald-450 font-bold' : ''}>Numeric digit</li>
                  <li className={/[@$!%*?&#]/.test(password) ? 'text-emerald-450 font-bold' : ''}>Special character</li>
                </ul>
              </div>
            )}
          </div>

          {/* Confirm Password Input */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Confirm Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                </svg>
              </span>
              <input
                type="password"
                placeholder="Re-type password..."
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full bg-slate-950/60 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-11 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-all duration-200"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center px-6 py-3 rounded-xl text-sm font-bold text-slate-900 bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400 hover:opacity-90 active:scale-[0.98] transition-all duration-200 shadow-xl shadow-indigo-500/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {submitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2.5 h-4.5 w-4.5 text-slate-900" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Registering Account...
              </>
            ) : (
              'Create Isolated Account'
            )}
          </button>
        </form>

        {/* Footer Toggle Actions */}
        <div className="mt-6 pt-5 border-t border-slate-800/60 text-center">
          <p className="text-xs text-slate-450">
            Already have an enterprise account?{' '}
            <Link href="/auth/login" className="font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
