"use client";

import { useEffect, useState } from "react";
import { useToast } from "./Toast";

interface Props {
  open: boolean;
  onClose: () => void;
  slug: string;
}

export default function BriefEditor({ open, onClose, slug }: Props) {
  const [content, setContent] = useState("");
  const [exists, setExists] = useState(false);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    if (!open) return;
    fetch(`/api/projects/${encodeURIComponent(slug)}/brief`)
      .then((r) => r.json())
      .then((j) => {
        setContent(j.content || "");
        setExists(j.exists);
      });
  }, [open, slug]);

  if (!open) return null;

  async function save() {
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(slug)}/brief`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const j = await r.json();
      if (!j.ok) push({ kind: "error", title: "저장 실패", message: j.error });
      else {
        push({ kind: "success", title: "brief.md 저장됨" });
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  const placeholder = `# 영상 브리프

## 주제
- 한 문장으로 무엇에 대한 영상인가

## 타깃
- 누구를 위해 만드는가

## 길이 / 포맷
- 8~9분 롱폼 / 16:9

## 꼭 다뤄야 할 포인트
- 1)
- 2)
- 3)

## 절대 금지
- 광고/협찬 표현
- 출처 불명 수치

## 자료 소스
- https://...
`;

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-panel border border-line rounded-2xl w-full max-w-3xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">📝 brief.md {exists ? "(편집)" : "(새로 작성)"}</h2>
          <button onClick={onClose} className="text-subtext hover:text-text">✕</button>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={placeholder}
          className="w-full h-[420px] bg-bg border border-line rounded-md p-3 text-sm mono"
        />
        <div className="flex justify-end gap-2 mt-3">
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
