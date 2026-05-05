"use client";

import { useEffect, useState } from "react";
import { useToast } from "./Toast";

interface NicheInfo {
  id: string;
  channelName: string;
  niche: string;
}

interface Props {
  onChange?: (niche: string) => void;
}

export default function NicheSelector({ onChange }: Props) {
  const [active, setActive] = useState<string>("mom_wallet");
  const [niches, setNiches] = useState<NicheInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  async function load() {
    try {
      const r = await fetch("/api/system/niche", { cache: "no-store" });
      const j = await r.json();
      setActive(j.active);
      setNiches(j.niches ?? []);
    } catch {}
  }

  useEffect(() => {
    load();
  }, []);

  async function switchNiche(name: string) {
    if (name === active) return;
    setBusy(true);
    try {
      const r = await fetch("/api/system/niche", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await r.json();
      if (!j.ok) {
        push({ kind: "error", title: "니치 전환 실패", message: j.error });
        return;
      }
      setActive(name);
      onChange?.(name);
      const info = niches.find((n) => n.id === name);
      push({
        kind: "success",
        title: `채널/니치 전환됨`,
        message: info ? `${info.channelName} (${name})` : name,
      });
    } finally {
      setBusy(false);
    }
  }

  const current = niches.find((n) => n.id === active);

  return (
    <div className="flex items-center gap-2 bg-panel border border-line rounded-lg px-3 py-2">
      <span className="text-xs text-subtext">채널/니치</span>
      <select
        className="bg-transparent text-text outline-none text-sm pr-2"
        value={active}
        onChange={(e) => switchNiche(e.target.value)}
        disabled={busy || niches.length === 0}
      >
        {niches.map((n) => (
          <option key={n.id} value={n.id}>
            {n.channelName} ({n.id})
          </option>
        ))}
      </select>
      {current?.niche && (
        <span className="text-[10px] text-subtext truncate max-w-[260px]" title={current.niche}>
          — {current.niche}
        </span>
      )}
    </div>
  );
}
