"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ToastKind = "info" | "success" | "warn" | "error";
interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}
interface Ctx {
  push: (t: Omit<Toast, "id">) => void;
}
const ToastCtx = createContext<Ctx | null>(null);

export function useToast() {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("ToastProvider missing");
  return c;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { ...t, id }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 5500);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed top-4 right-4 z-50 space-y-2 w-[360px]">
        {items.map((t) => (
          <div
            key={t.id}
            className={
              "rounded-lg border px-4 py-3 shadow-lg text-sm " +
              {
                info: "bg-panel border-line",
                success: "bg-good/15 border-good/40 text-good",
                warn: "bg-warn/15 border-warn/40 text-warn",
                error: "bg-bad/15 border-bad/50 text-bad",
              }[t.kind]
            }
          >
            <div className="font-semibold">{t.title}</div>
            {t.message ? <div className="text-xs mt-1 opacity-90 whitespace-pre-wrap">{t.message}</div> : null}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
