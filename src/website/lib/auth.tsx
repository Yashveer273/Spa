import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  loaded: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthState>({ user: null, loaded: false, refresh: async () => {}, logout: async () => {} });
export const useAuth = () => useContext(AuthContext);

/** Knows whether a customer is logged in (cookie checked by the server via /api/me). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    try { setUser((await api.me()).user); } catch { setUser(null); }
    setLoaded(true);
  }, []);
  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setUser(null);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return <AuthContext.Provider value={{ user, loaded, refresh, logout }}>{children}</AuthContext.Provider>;
}
