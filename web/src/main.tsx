import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@ui5/webcomponents-react';
import '@ui5/webcomponents-icons/dist/AllIcons.js';
import '@ui5/webcomponents-react/dist/Assets.js';
import App from './App.js';
import { AppThemeProvider } from './theme/ThemeContext.js';
import { AuthProvider } from './auth/AuthContext.js';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /*
       * Gecici bir ag kesintisi sorguyu kalici olarak hataya dusurmesin.
       * Yetki/oturum hatalarinda yeniden denemek anlamsiz: kullanici zaten
       * giris ekranina yonlendirilir.
       */
      retry: (failureCount, error) => {
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppThemeProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </AppThemeProvider>
  </React.StrictMode>,
);
