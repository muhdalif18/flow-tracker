import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from './api';

interface User {
  userId: string;
  username: string;
}

interface AuthContextValue {
  user: User | null;
  isOwner: (createdBy: string | null | undefined) => boolean;
  login:    (username: string, password: string) => Promise<'ok' | 'wrong_credentials' | 'error'>;
  register: (username: string, password: string) => Promise<'ok' | 'taken' | 'invalid' | 'error'>;
  logout:   () => void;
}

const Ctx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const userId   = localStorage.getItem('ft_userId');
    const username = localStorage.getItem('ft_username');
    return userId && username ? { userId, username } : null;
  });

  // Listen for forced logouts triggered by api.ts 401 handler
  useEffect(() => {
    const handler = () => setUser(null);
    window.addEventListener('ft:logout', handler);
    return () => window.removeEventListener('ft:logout', handler);
  }, []);

  const login = async (username: string, password: string): Promise<'ok' | 'wrong_credentials' | 'error'> => {
    try {
      const data = await api.login(username, password);
      localStorage.setItem('ft_token',    data.token);
      localStorage.setItem('ft_userId',   data.userId);
      localStorage.setItem('ft_username', data.username);
      setUser({ userId: data.userId, username: data.username });
      return 'ok';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      return msg.includes('401') ? 'wrong_credentials' : 'error';
    }
  };

  const register = async (username: string, password: string): Promise<'ok' | 'taken' | 'invalid' | 'error'> => {
    try {
      const data = await api.register(username, password);
      localStorage.setItem('ft_token',    data.token);
      localStorage.setItem('ft_userId',   data.userId);
      localStorage.setItem('ft_username', data.username);
      setUser({ userId: data.userId, username: data.username });
      return 'ok';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('409')) return 'taken';
      if (msg.includes('400')) return 'invalid';
      return 'error';
    }
  };

  const logout = () => {
    localStorage.removeItem('ft_token');
    localStorage.removeItem('ft_userId');
    localStorage.removeItem('ft_username');
    setUser(null);
  };

  const isOwner = (createdBy: string | null | undefined) =>
    !createdBy || createdBy === user?.userId;

  return (
    <Ctx.Provider value={{ user, isOwner, login, register, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
