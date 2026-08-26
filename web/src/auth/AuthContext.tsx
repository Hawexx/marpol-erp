import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AUTH_EXPIRED_EVENT, api, tokenStore } from '../api/client.js';
import type { ModuleKey, SessionUser } from '../api/types.js';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'approve';

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  /** Kullanicinin ilgili sekmede istenen yetkisi var mi? */
  can: (module: ModuleKey, action?: PermissionAction) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const FIELD: Record<PermissionAction, keyof import('../api/types.js').PermissionRow> = {
  view: 'canView',
  create: 'canCreate',
  edit: 'canEdit',
  delete: 'canDelete',
  approve: 'canApprove',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Sayfa yenilendiginde kayitli token ile oturumu geri yukle.
  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    api
      .get<{ user: SessionUser }>('/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => {
        tokenStore.clear();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // Token suresi dolarsa oturumu kapat.
  useEffect(() => {
    const handler = () => setUser(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post<{ token: string; user: SessionUser }>('/auth/login', {
      username,
      password,
    });
    tokenStore.set(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    // Sunucu tarafinda tokenVersion artirilir; boylece kopyalanmis bir token
    // cikis sonrasi gecerli kalmaz. Istek basarisiz olsa da yerel oturum
    // her durumda kapatilir.
    api.post('/auth/logout', {}).catch(() => undefined);
    tokenStore.clear();
    setUser(null);
  }, []);

  const can = useCallback(
    (module: ModuleKey, action: PermissionAction = 'view') => {
      if (!user) return false;
      if (user.isAdmin) return true;
      const row = user.permissions.find((p) => p.module === module);
      return Boolean(row?.[FIELD[action]]);
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, can }),
    [user, loading, login, logout, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth yalnizca AuthProvider icinde kullanilabilir.');
  return ctx;
}
