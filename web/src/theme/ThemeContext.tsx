import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';

export type AppTheme = 'light' | 'dark';

const STORAGE_KEY = 'marpol.ppm.theme';

/** Uygulama temasi -> SAP Horizon tema adi. */
const UI5_THEME: Record<AppTheme, string> = {
  light: 'sap_horizon',
  dark: 'sap_horizon_dark',
};

interface ThemeContextValue {
  theme: AppTheme;
  toggleTheme: () => void;
  setAppTheme: (theme: AppTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Kayitli tercih yoksa isletim sisteminin tercihine uyar. */
function initialTheme(): AppTheme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(initialTheme);

  // Hem UI5 temasini hem de kendi CSS'imizin okudugu data-mp-theme'i uygular.
  useEffect(() => {
    void setTheme(UI5_THEME[theme]);
    document.documentElement.dataset.mpTheme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setAppTheme = useCallback((next: AppTheme) => setThemeState(next), []);
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
    [],
  );

  const value = useMemo(
    () => ({ theme, toggleTheme, setAppTheme }),
    [theme, toggleTheme, setAppTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme yalnizca AppThemeProvider icinde kullanilabilir.');
  return ctx;
}
