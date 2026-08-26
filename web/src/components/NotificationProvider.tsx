import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { MessageStrip, Toast } from '@ui5/webcomponents-react';

interface NotifyContextValue {
  /** Kisa sureli basari/bilgi mesaji. */
  toast: (message: string) => void;
  /** Ekranin ustunde kalici hata seridi. */
  error: (message: string) => void;
  clearError: () => void;
  errorMessage: string | null;
}

const NotifyContext = createContext<NotifyContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const [toastOpen, setToastOpen] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const toast = useCallback((text: string) => {
    setMessage(text);
    setToastOpen(false);
    // Ayni mesaj tekrar gonderildiginde de yeniden acilsin.
    requestAnimationFrame(() => setToastOpen(true));
  }, []);

  const error = useCallback((text: string) => setErrorText(text), []);
  const clearError = useCallback(() => setErrorText(null), []);

  return (
    <NotifyContext.Provider value={{ toast, error, clearError, errorMessage: errorText }}>
      {errorText && (
        <div style={{ padding: '0.5rem 1.5rem 0' }}>
          <MessageStrip design="Negative" onClose={clearError}>
            {errorText}
          </MessageStrip>
        </div>
      )}
      {children}
      <Toast open={toastOpen} duration={3500} onClose={() => setToastOpen(false)}>
        {message}
      </Toast>
    </NotifyContext.Provider>
  );
}

export function useNotify(): NotifyContextValue {
  const ctx = useContext(NotifyContext);
  if (!ctx) throw new Error('useNotify yalnizca NotificationProvider icinde kullanilabilir.');
  return ctx;
}
