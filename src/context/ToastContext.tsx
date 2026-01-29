import React, { createContext, useContext, useState, useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  title: string;
  message: string;
  type: ToastType;
  visible: boolean;
  autoClose: boolean;
  timeout: number;
}

interface ShowToastOptions {
  title?: string;
  message: string;
  type?: ToastType;
  timeout?: number;
  autoClose?: boolean;
  onClose?: () => void;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (options: ShowToastOptions) => () => void;
  hideToast: (id: string) => void;
  clearAllToasts: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const DEFAULT_TIMEOUT = 5000;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((options: ShowToastOptions) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const toast: Toast = {
      id,
      title: options.title || 'Notification',
      message: options.message,
      type: options.type || 'info',
      timeout: options.timeout || DEFAULT_TIMEOUT,
      visible: false,
      autoClose: options.autoClose !== false
    };

    const hideThisToast = () => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: false } : t)));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        options.onClose?.();
      }, 300);
    };

    setToasts((prev) => [...prev, toast]);

    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: true } : t)));
    }, 100);

    if (toast.autoClose) {
      setTimeout(hideThisToast, toast.timeout);
    }

    return hideThisToast;
  }, []);

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: false } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, hideToast, clearAllToasts }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={hideToast} />
    </ToastContext.Provider>
  );
};

// Toast Container Component
const ToastContainer: React.FC<{ toasts: Toast[]; onDismiss: (id: string) => void }> = ({
  toasts,
  onDismiss
}) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            px-4 py-3 rounded-lg shadow-lg max-w-sm transition-all duration-300
            ${toast.visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}
            ${toast.type === 'success' ? 'bg-green-600 text-white' : ''}
            ${toast.type === 'error' ? 'bg-red-600 text-white' : ''}
            ${toast.type === 'warning' ? 'bg-yellow-500 text-black' : ''}
            ${toast.type === 'info' ? 'bg-blue-600 text-white' : ''}
          `}
          onClick={() => onDismiss(toast.id)}
        >
          <div className="font-semibold text-sm">{toast.title}</div>
          <div className="text-sm opacity-90">{toast.message}</div>
        </div>
      ))}
    </div>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export default ToastContext;
