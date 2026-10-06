import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { platform } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onUnauthorized = () => {
      try {
        sessionStorage.setItem('bo_login_notice', 'Sesiunea a expirat. Autentifică-te din nou.');
      } catch {
        /* ignore */
      }
      setUser(null);
    };
    window.addEventListener('bo:unauthorized', onUnauthorized);
    return () => window.removeEventListener('bo:unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    platform
      .me()
      .then((data) => {
        const u = data?.user ?? data;
        setUser(u?.is_platform_admin ? u : null);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        const data = await platform.login(email, password);
        const u = data?.user ?? data;
        if (!u?.is_platform_admin) {
          await platform.logout().catch(() => {});
          throw new Error('Consola backoffice e doar pentru operatorii Formely.');
        }
        setUser(u);
        return u;
      },
      logout: async () => {
        await platform.logout().catch(() => {});
        setUser(null);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
