import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

const ToastContext = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

/** One small message bubble near the bottom of the screen ("SPA20 copied", "coming soon"...). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const timer = useRef<number>();
  const toast = useCallback((m: string) => {
    setMsg(m);
    setShow(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShow(false), 2000);
  }, []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className={`hd-toast ${show ? 'show' : ''}`} role="status" aria-live="polite">{msg}</div>
    </ToastContext.Provider>
  );
}
