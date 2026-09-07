'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

export type BaseCurrency = 'USD' | 'KES';

export interface ExchangeRateInfo {
  rate: number;
  inverseRate: number;
  source: 'live' | 'custom' | 'cache' | 'stored' | 'fallback';
  updatedAt: string | null;
  baseCurrency: BaseCurrency;
  customExchangeRate: number | null;
}

export interface CurrencyContextType {
  baseCurrency: BaseCurrency;
  exchangeRate: number;
  customExchangeRate: number | null;
  rateSource: string;
  rateUpdatedAt: string | null;
  inverseRate: number;
  symbol: string;
  loading: boolean;
  setBaseCurrency: (currency: BaseCurrency) => Promise<boolean>;
  setCustomRate: (rate: number | null) => Promise<boolean>;
  refreshExchangeRate: () => Promise<boolean>;
  convert: (amount: number, from: BaseCurrency, to?: BaseCurrency) => number;
  formatMoney: (amount: number | null | undefined, currency?: BaseCurrency, decimals?: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5001';

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [baseCurrency, setBaseCurrencyState] = useState<BaseCurrency>('USD');
  const [exchangeRate, setExchangeRate] = useState<number>(130.0);
  const [customExchangeRate, setCustomExchangeRate] = useState<number | null>(null);
  const [rateSource, setRateSource] = useState<string>('live');
  const [rateUpdatedAt, setRateUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchExchangeRate = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/settings/exchange-rate`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setBaseCurrencyState(json.data.baseCurrency || 'USD');
          setExchangeRate(Number(json.data.rate) || 130.0);
          setCustomExchangeRate(
            json.data.customExchangeRate !== null && json.data.customExchangeRate !== undefined
              ? Number(json.data.customExchangeRate)
              : null
          );
          setRateSource(json.data.source || 'fallback');
          setRateUpdatedAt(json.data.updatedAt || null);
        }
      }
    } catch (err) {
      console.error('[CurrencyContext] Failed to fetch exchange rate details:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    if (!isAuthenticated) {
      return;
    }

    async function loadExchangeRate() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/settings/exchange-rate`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });

        if (res.ok) {
          const json = await res.json();
          if (!ignore && json.success && json.data) {
            setBaseCurrencyState(json.data.baseCurrency || 'USD');
            setExchangeRate(Number(json.data.rate) || 130.0);
            setCustomExchangeRate(
              json.data.customExchangeRate !== null && json.data.customExchangeRate !== undefined
                ? Number(json.data.customExchangeRate)
                : null
            );
            setRateSource(json.data.source || 'fallback');
            setRateUpdatedAt(json.data.updatedAt || null);
          }
        }
      } catch (err) {
        console.error('[CurrencyContext] Failed to fetch exchange rate details:', err);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadExchangeRate();

    return () => {
      ignore = true;
    };
  }, [isAuthenticated]);

  const setBaseCurrency = useCallback(
    async (currency: BaseCurrency): Promise<boolean> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/settings/feed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ baseCurrency: currency }),
        });

        if (res.ok) {
          setBaseCurrencyState(currency);
          await fetchExchangeRate();
          return true;
        }
        return false;
      } catch (err) {
        console.error('[CurrencyContext] Failed to update base currency:', err);
        return false;
      }
    },
    [fetchExchangeRate]
  );

  const setCustomRate = useCallback(
    async (rate: number | null): Promise<boolean> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/settings/feed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ customExchangeRate: rate }),
        });

        if (res.ok) {
          setCustomExchangeRate(rate);
          await fetchExchangeRate();
          return true;
        }
        return false;
      } catch (err) {
        console.error('[CurrencyContext] Failed to update custom exchange rate:', err);
        return false;
      }
    },
    [fetchExchangeRate]
  );

  const refreshExchangeRate = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/settings/exchange-rate/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setExchangeRate(Number(json.data.rate) || 130.0);
          setRateSource(json.data.source || 'live');
          setRateUpdatedAt(json.data.updatedAt || null);
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error('[CurrencyContext] Failed to refresh exchange rate:', err);
      return false;
    }
  }, []);

  const convert = useCallback(
    (amount: number, from: BaseCurrency, to: BaseCurrency = baseCurrency): number => {
      if (isNaN(amount) || amount === 0) return 0;
      if (from === to) return amount;
      const rate = exchangeRate || 130.0;
      if (from === 'USD' && to === 'KES') {
        return amount * rate;
      }
      if (from === 'KES' && to === 'USD') {
        return amount / rate;
      }
      return amount;
    },
    [baseCurrency, exchangeRate]
  );

  const formatMoney = useCallback(
    (
      amount: number | null | undefined,
      currency: BaseCurrency = baseCurrency,
      decimals?: number
    ): string => {
      if (amount === null || amount === undefined || isNaN(amount)) {
        const prefix = currency === 'KES' ? 'KSh ' : '$';
        return `${prefix}0.00`;
      }

      // Adaptive precision for micro penny stocks below 0.05
      let dec = decimals;
      if (dec === undefined) {
        dec = Math.abs(amount) < 0.05 && amount !== 0 ? 4 : 2;
      }

      const formattedNum = amount.toLocaleString('en-US', {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      });

      const prefix = currency === 'KES' ? 'KSh ' : '$';
      return `${prefix}${formattedNum}`;
    },
    [baseCurrency]
  );

  const symbol = baseCurrency === 'KES' ? 'KSh ' : '$';
  const inverseRate = exchangeRate > 0 ? 1 / exchangeRate : 0;

  return (
    <CurrencyContext.Provider
      value={{
        baseCurrency,
        exchangeRate,
        customExchangeRate,
        rateSource,
        rateUpdatedAt,
        inverseRate,
        symbol,
        loading,
        setBaseCurrency,
        setCustomRate,
        refreshExchangeRate,
        convert,
        formatMoney,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}
