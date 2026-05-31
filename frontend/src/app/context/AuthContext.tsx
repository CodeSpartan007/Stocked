'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  role: 'admin' | 'user' | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (email: string, password: string) => Promise<{ success: boolean; errors?: { field: string; message: string }[]; message?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Dynamically read environment variable with fallback for local workspace environments
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5001';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const isAuthenticated = !!user;
  const role = user ? user.role : null;

  // Hydrate session from HTTP-only cookie on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          // Send HTTP-only cookies in CORS requests
          credentials: 'include',
        });

        if (response.ok) {
          const json = await response.json();
          if (json.success && json.user) {
            setUser(json.user);
          }
        }
      } catch (error) {
        console.error('Session hydration failed:', error);
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, []);

  // Intercept unauthenticated page transitions client-side securely with path assertions to prevent loop flashes
  useEffect(() => {
    if (!loading) {
      const isAuthPage = pathname?.startsWith('/auth');
      if (!user) {
        if (!isAuthPage && pathname !== '/auth/login') {
          router.replace('/auth/login');
        }
      } else {
        if (isAuthPage && pathname !== '/') {
          router.replace('/');
        }
      }
    }
  }, [user, loading, pathname, router]);

  const login = async (email: string, password: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      const json = await response.json();
      if (response.ok && json.success) {
        setUser(json.user);
        if (pathname !== '/') {
          router.replace('/');
        }
        return { success: true };
      } else {
        return { success: false, message: json.message || 'Login failed.' };
      }
    } catch (error) {
      console.error('Login action error:', error);
      return { success: false, message: 'Server communication error.' };
    }
  };

  const register = async (email: string, password: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      const json = await response.json();
      if (response.ok && json.success) {
        setUser(json.user);
        if (pathname !== '/') {
          router.replace('/');
        }
        return { success: true };
      } else {
        return { 
          success: false, 
          errors: json.errors, 
          message: json.message || 'Registration failed.' 
        };
      }
    } catch (error) {
      console.error('Registration action error:', error);
      return { success: false, message: 'Server communication error.' };
    }
  };

  const logout = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout request error:', error);
    } finally {
      setUser(null);
      if (pathname !== '/auth/login') {
        router.replace('/auth/login');
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        role,
        loading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
