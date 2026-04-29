"use client";

import { useEffect, useState } from "react";
import { useToast } from "./Toast";

interface Item {
  id: string;
  label: string;
  status: "ok" | "warn" | "bad" | "unknown";
  detail?: string;
}

const COLOR = {
  ok: "border-good/40 bg-good/10 text-good",
  warn: "border-warn/40 bg-warn/10 text-warn",
  bad: "border-bad/50 bg-bad/15 text-bad",
  unknown: "border-line bg-panel2 text-subtext",
} as const;

const DOT = { ok: "🟢", warn: "🟡", bad: "🔴", unknown: "⚪" } as const;

export default function ApiStatusCard() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(false);
  const { push } = useToast();

  async function refresh(notify = false) {
    setLoading(true);
    try {
      const r = await fetch("/api/system/api-status", { cache: "no-store" });
      const j = await r.json();
      setItems(j.items || []);
      if (notify) {
        for (const it of j.items as Item[]) {
          if (it.status === "bad")
            push({ kind: "error", title: `${it.label} 오류`, message: it.detail || "" });
          else if (it.status === "warn")
            push({ kind: "warn", title: `${it.label} 경고`, message: it.detail || "" });
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(true);
    const t = setInterval(() => refresh(false), 60_000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold">API 상태</h2>
        <button
          onClick={() => refresh(true)}
          disabled={loading}
          className="text-xs bg-panel2 border border-line hover:border-accent rounded-md px-2 py-1"
        >
          {loading ? "확인중…" : "재확인"}
        </button>
      </div>
      <div className="space-y-2">
        {(items ?? []).map((it) => (
          <div key={it.id} className={`text-sm rounded-md border px-3 py-2 ${COLOR[it.status]}`}>
            <div className="flex items-center justify-between">
              <div className="font-medium">
                {DOT[it.status]} {it.label}
              </div>
              <div className="text-[11px] uppercase tracking-wider opacity-80">{it.status}</div>
            </div>
            {it.detail ? <div className="text-[11px] mt-1 opacity-80">{it.detail}</div> : null}
          </div>
        ))}
        {items === null && <div className="text-xs text-subtext">확인중…</div>}
      </div>
    </div>
  );
}
