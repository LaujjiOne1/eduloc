import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AdminSession } from '../types';
import * as http from './http';

interface AuthContextType {
  admin: AdminSession | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // La session survit au rechargement tant que les jetons sont là ; un 401 non renouvelable la ferme (voir http.ts).
  const [admin, setAdmin] = useState<AdminSession | null>(() => (http.tokenStore.hasSession() ? http.tokenStore.session() : null));

  useEffect(() => {
    http.setSessionLostHandler(() => setAdmin(null));
    return () => http.setSessionLostHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await http.login(email, password);
    setAdmin({ id: res.user.id, firstName: res.user.firstName, lastName: res.user.lastName });
  }, []);

  const logout = useCallback(async () => {
    setAdmin(null);
    await http.logout();
  }, []);

  const value = useMemo(() => ({ admin, login, logout }), [admin, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans un AuthProvider');
  return ctx;
};
