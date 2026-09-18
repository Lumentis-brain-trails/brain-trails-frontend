"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { cn } from "@/components/ui";

interface Toast {
  id: number;
  kind: "success" | "error";
  text: string;
}

const ToastContext = createContext<(kind: Toast["kind"], text: string) => void>(
  () => {}
);

export function useToast() {
  return useContext(ToastContext);
}

/**
 * Transient status pills at the top of the viewport. They confirm meaningful
 * actions only (completion, error) - never routine ones - and vanish on their
 * own, so no dismiss control is needed.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-100 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            data-motion="status"
            className={cn(
              "material-glass enter-up pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full border border-hairline py-2.5 pr-5 pl-3.5 text-[14px] font-medium text-ink shadow-(--shadow-sheet)"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                t.kind === "success" ? "bg-ok" : "bg-danger"
              )}
            />
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
