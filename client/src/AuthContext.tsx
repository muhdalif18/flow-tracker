import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from './api';

interface User {
  userId: string;
  username: string;
  role: string;
}

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
  isOwner: (createdBy: string | null | undefined) => boolean;
  login:  (username: string, password: string) => Promise<'ok' | 'wrong_credentials' | 'error'>;
  logout: () => void;
}

const Ctx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const userId   = localStorage.getItem('ft_userId');
    const username = localStorage.getItem('ft_username');
    const role     = localStorage.getItem('ft_role') || 'tester';
    return userId && username ? { userId, username, role } : null;
  });

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
      localStorage.setItem('ft_role',     data.role || 'tester');
      setUser({ userId: data.userId, username: data.username, role: data.role || 'tester' });
      return 'ok';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      return msg.includes('401') ? 'wrong_credentials' : 'error';
    }
  };

  const logout = () => {
    localStorage.removeItem('ft_token');
    localStorage.removeItem('ft_userId');
    localStorage.removeItem('ft_username');
    localStorage.removeItem('ft_role');
    setUser(null);
  };

  const isAdmin = user?.role === 'admin';

  // Any authenticated user can edit
  const isOwner = (createdBy: string | null | undefined) => !!user;

  return (
    <Ctx.Provider value={{ user, isAdmin, isOwner, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
