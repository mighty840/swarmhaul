import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ErrorToast {
  id: string;
  message: string;
  source?: string;
  at: number;
}

interface ErrorContextValue {
  push: (message: string, source?: string) => void;
}

const ErrorContext = createContext<ErrorContextValue | null>(null);

export function useErrorReporter(): ErrorContextValue {
  const ctx = useContext(ErrorContext);
  if (!ctx) {
    return { push: () => {} };
  }
  return ctx;
}

export function ErrorProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ErrorToast[]>([]);
  const counter = useRef(0);

  const push = useCallback((message: string, source?: string) => {
    counter.current += 1;
    const t: ErrorToast = {
      id: `err-${counter.current}`,
      message,
      source,
      at: Date.now(),
    };
    setToasts((prev) => [t, ...prev].slice(0, 4));
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const timers = toasts.map((t) =>
      setTimeout(() => dismiss(t.id), 8000),
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  return (
    <ErrorContext.Provider value={{ push }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed top-3 right-3 z-[500] space-y-2 w-[min(380px,calc(100vw-24px))]">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="panel border-[var(--color-blood)] bg-[var(--color-graphite)] shadow-[0_0_0_1px_var(--color-blood-dim),0_12px_32px_rgba(0,0,0,0.6)]"
              style={{ animation: "slide-down 220ms ease-out" }}
            >
              <div className="flex items-start gap-3 px-3 py-2.5">
                <span className="text-[var(--color-blood)] text-[11px] font-bold mt-0.5">
                  ✕
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-[var(--color-blood)]">
                      ERROR
                    </span>
                    {t.source && (
                      <span className="text-[9px] tracking-[0.14em] uppercase text-[var(--color-ash)]">
                        ▸ {t.source}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--color-bone)] leading-snug break-words">
                    {t.message}
                  </div>
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="dismiss"
                  className="text-[var(--color-ash)] hover:text-[var(--color-bone)] text-[14px] leading-none"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </ErrorContext.Provider>
  );
}
