"use client";

import { useToast } from "./Toast";

interface Props {
  slug: string;
  onOpenBrief: () => void;
  onOpenUpload: () => void;
  onOpenThumbnails: () => void;
  onOpenKeywords: () => void;
}

export default function QuickActions({ slug, onOpenBrief, onOpenUpload, onOpenThumbnails, onOpenKeywords }: Props) {
  const { push } = useToast();

  async function openFolder(target: "edit" | "capcut" | "project") {
    const r = await fetch(`/api/projects/${encodeURIComponent(slug)}/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target }),
    });
    const j = await r.json();
    if (!j.ok) push({ kind: "error", title: "폴더 열기 실패", message: j.error });
    else push({ kind: "success", title: "Finder에서 열림", message: j.opened });
  }

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">빠른 액션</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <BtnSlim onClick={onOpenBrief} label="📝 주제 선정 / 브리프 편집" />
        <BtnSlim onClick={onOpenKeywords} label="🔎 벤치마크 키워드" />
        <BtnSlim onClick={onOpenThumbnails} label="🖼️ 썸네일 5장 보기" />
        <BtnSlim onClick={() => openFolder("edit")} label="📁 06-edit 폴더 열기" />
        <BtnSlim onClick={() => openFolder("capcut")} label="🎬 CapCut Projects 폴더" />
        <BtnSlim onClick={() => openFolder("project")} label="📂 프로젝트 루트 열기" />
        <BtnSlim onClick={onOpenUpload} label="📤 final.mp4 업로드 모달" highlight />
      </div>
    </div>
  );
}

function BtnSlim({
  label,
  onClick,
  highlight = false,
}: {
  label: string;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "text-left text-sm rounded-lg border px-3 py-2.5 transition " +
        (highlight
          ? "bg-accent/15 border-accent/50 hover:bg-accent/25"
          : "bg-panel border-line hover:border-accent")
      }
    >
      {label}
    </button>
  );
}
