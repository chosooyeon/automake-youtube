"use client";

import { useEffect, useState } from "react";
import { useToast } from "./Toast";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function KeywordsEditor({ open, onClose }: Props) {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const { push } = useToast();

  useEffect(() => {
    if (!open) return;
    fetch("/api/system/keywords").then((r) => r.json()).then((j) => setKeywords(j.keywords || []));
  }, [open]);

  if (!open) return null;

  function add() {
    if (!draft.trim()) return;
    setKeywords((k) => [...k, draft.trim()]);
    setDraft("");
  }
  function remove(i: number) {
    setKeywords((k) => k.filter((_, idx) => idx !== i));
  }

  async function save() {
    setBusy(true);
    try {
      const r = await fetch("/api/system/keywords", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keywords }),
      });
      const j = await r.json();
      if (!j.ok) push({ kind: "error", title: "저장 실패", message: j.error });
      else {
        push({ kind: "success", title: "벤치마크 키워드 저장됨", message: `${keywords.length}개` });
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-panel border border-line rounded-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">🔎 벤치마크 키워드 (1번 봇용)</h2>
          <button onClick={onClose} className="text-subtext hover:text-text">✕</button>
        </div>
        <div className="text-xs text-subtext mb-3">
          <code>config/global.json.apis.search.youtube_research_queries</code> 에 저장됩니다.
        </div>

        <ul className="space-y-1 mb-3 max-h-72 overflow-auto">
          {keywords.map((k, i) => (
            <li key={i} className="flex items-center justify-between bg-bg border border-line rounded-md px-3 py-1.5 text-sm">
              <span>{k}</span>
              <button onClick={() => remove(i)} className="text-bad hover:opacity-80 text-xs">삭제</button>
            </li>
          ))}
          {keywords.length === 0 && <li className="text-xs text-subtext">아직 키워드가 없어요.</li>}
        </ul>

        <div className="flex gap-2 mb-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="새 키워드"
            className="flex-1 bg-bg border border-line rounded-md px-3 py-2 text-sm"
          />
          <button onClick={add} className="text-sm rounded-md bg-panel2 border border-line px-3 py-2">
            추가
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm rounded-md border border-line bg-panel2 px-3 py-2">취소</button>
          <button
            onClick={save}
            disabled={busy}
            className="text-sm rounded-md bg-accent text-bg font-semibold px-3 py-2 disabled:opacity-50"
          >
            {busy ? "저장중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
