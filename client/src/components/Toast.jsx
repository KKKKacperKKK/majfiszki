import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';

const ToastContext = createContext(() => {});

/** Zwraca funkcję `toast(komunikat, { type: 'success' | 'error' })`. */
export const useToast = () => useContext(ToastContext);

/** Krótkie powiadomienia u dołu ekranu („Zestaw usunięty”, „Nie udało się zapisać”). */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message, { type = 'success' } = {}) => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((list) => [...list.slice(-2), { id, message, type }]); // najwyżej trzy naraz
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), type === 'error' ? 6500 : 3500),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {toasts.map((item) => (
          <div
            key={item.id}
            role={item.type === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl bg-ink py-2.5 pl-3.5 pr-2 text-sm font-medium text-canvas shadow-pop animate-toast-in"
          >
            {item.type === 'error' ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ) : (
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 py-px wrap-anywhere">{item.message}</span>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Zamknij powiadomienie"
              className="-my-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-canvas/70 outline-canvas hover:text-canvas"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
