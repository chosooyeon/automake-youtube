"use client";

import { useEffect, useState } from "react";
import { useToast } from "./Toast";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (slug: string) => void;
}

export default function NewProjectModal({ open, onClose, onCreated }: Props) {
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeNiche, setActiveNiche] = useState<string>("");
  const [activeNicheLabel, setActiveNicheLabel] = useState<string>("");
  const { push } = useToast();

  useEffect(() => {
    if (!open) return;
    fetch("/api/system/niche", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setActiveNiche(j.active);
        const info = (j.niches ?? []).find((n: any) => n.id === j.active);
        setActiveNicheLabel(info?.channelName ?? j.active);
      })
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  async function submit() {
    if (!slug.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: slug.trim(), niche: activeNiche || undefined }),
      });
      const j = await r.json();
      if (!j.ok) {
        push({ kind: "error", title: "생성 실패", message: j.error });
      } else {
        push({ kind: "success", title: "프로젝트 생성됨", message: `${j.slug} (${j.niche})` });
        onCreated(j.slug);
        onClose();
        setSlug("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-panel border border-line rounded-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">+ 새 프로젝트</h2>
          <button onClick={onClose} className="text-subtext hover:text-text">✕</button>
        </div>
        <div className="text-xs text-subtext mb-2">
          <code className="mono">projects/_example</code> 를 복사해 새 슬러그로 만듭니다.
        </div>
        {activeNiche && (
          <div className="mb-3 text-[11px] text-subtext bg-panel2 border border-line rounded-md px-3 py-2">
            니치: <span className="text-text font-semibold">{activeNicheLabel}</span>{" "}
            <span className="mono opacity-60">({activeNiche})</span>
            <span className="opacity-60"> — channel_config.json 자동 생성</span>
          </div>
        )}
        <input
          autoFocus
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="예) mom-support-2026-05"
          className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm mb-3"
        />
        <div className="text-[11px] text-subtext mb-3">
          영문/숫자/-/_ 만, 2~61자. 만든 후 <span className="text-text">brief.md</span> 를 채워주세요.
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm rounded-md border border-line bg-panel2 px-3 py-2">취소</button>
          <button
            onClick={submit}
            disabled={busy || !slug}
            className="text-sm rounded-md bg-accent text-bg font-semibold px-3 py-2 disabled:opacity-50"
          >
            {busy ? "만드는중…" : "만들기"}
          </button>
        </div>
      </div>
    </div>
  );
}
