import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UserDto } from '@tcms/shared';
import { api, getStoredToken, setStoredToken } from '../lib/api';

interface AuthContextValue {
  user: UserDto | null;
  isLoading: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  loginWithGoogle: (credential: string, remember?: boolean) => Promise<void>;
  logout: () => void;
  setUser: (user: UserDto | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    api
      .me()
      .then((u) => setUser(u))
      .catch(() => {
        setStoredToken(null);
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(
    async (email: string, password: string, remember = true) => {
      const res = await api.login(email, password);
      queryClient.clear();
      setStoredToken(res.accessToken, remember);
      setUser(res.user);
    },
    [queryClient],
  );

  const loginWithGoogle = useCallback(
    async (credential: string, remember = true) => {
      const res = await api.loginWithGoogle(credential);
      queryClient.clear();
      setStoredToken(res.accessToken, remember);
      setUser(res.user);
    },
    [queryClient],
  );

  const logout = useCallback(() => {
    setStoredToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, loginWithGoogle, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
