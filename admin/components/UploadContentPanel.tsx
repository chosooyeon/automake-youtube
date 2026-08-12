"use client";

import { useEffect, useState } from "react";
import { useToast } from "./Toast";

interface Props {
  slug: string;
  refreshKey?: number; // 빌드 완료 후 갱신 트리거
}

interface UploadMeta {
  exists: boolean;
  title?: string;
  description?: string;
  tags?: string[];
  chapters?: string[];
  pinned_comment_suggestion?: string;
  thumbnail_text_overlay_suggestion?: string;
  output_video_file?: string;
}

function CopyButton({ text, label = "복사" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
      className="text-[11px] bg-panel2 border border-line rounded px-2 py-1 hover:border-accent shrink-0"
    >
      {copied ? "✓ 복사됨" : `📋 ${label}`}
    </button>
  );
}

export default function UploadContentPanel({ slug, refreshKey }: Props) {
  const [meta, setMeta] = useState<UploadMeta | null>(null);
  const [loading, setLoading] = useState(false);
  useToast(); // ensure toast context

  async function load() {
    if (!slug) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(slug)}/upload-meta`, {
        cache: "no-store",
      });
      const j = await r.json();
      setMeta(j);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, refreshKey]);

  if (!slug) return null;
  if (loading && !meta) {
    return <div className="text-xs text-subtext">로딩…</div>;
  }
  if (!meta?.exists) {
    return (
      <div className="bg-panel border border-line rounded-xl p-4 text-xs text-subtext">
        📋 업로드 내용 (제목·설명·태그·고정 댓글) — 빌드 후 자동 생성됩니다.
      </div>
    );
  }

  const tagsLine = (meta.tags ?? []).join(", ");

  return (
    <div className="bg-panel border border-line rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">📋 YouTube 업로드 내용 (복붙용)</h3>
        <button
          onClick={load}
          className="text-[10px] text-subtext hover:text-text border border-line rounded px-2 py-1"
        >
          🔄 새로고침
        </button>
      </div>

      {/* 제목 */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-subtext">제목</label>
          {meta.title && <CopyButton text={meta.title} />}
        </div>
        <div className="text-sm bg-panel2 border border-line rounded-md px-3 py-2 break-words">
          {meta.title || <span className="text-subtext">—</span>}
        </div>
      </section>

      {/* 설명 */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-subtext">설명 (description)</label>
          {meta.description && <CopyButton text={meta.description} label="설명 복사" />}
        </div>
        <pre className="text-[11px] bg-panel2 border border-line rounded-md px-3 py-2 whitespace-pre-wrap break-words max-h-64 overflow-y-auto font-sans leading-relaxed">
          {meta.description || "—"}
        </pre>
      </section>

      {/* 챕터 (설명에 이미 포함되지만 따로도) */}
      {meta.chapters && meta.chapters.length > 0 && (
        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-subtext">챕터만 따로</label>
            <CopyButton text={meta.chapters.join("\n")} label="챕터 복사" />
          </div>
          <pre className="text-[11px] bg-panel2 border border-line rounded-md px-3 py-2 mono">
            {meta.chapters.join("\n")}
          </pre>
        </section>
      )}

      {/* 태그 */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-subtext">태그 ({(meta.tags ?? []).length}개)</label>
          {meta.tags && meta.tags.length > 0 && <CopyButton text={tagsLine} label="태그 복사" />}
        </div>
        <div className="text-xs bg-panel2 border border-line rounded-md px-3 py-2 flex flex-wrap gap-1.5">
          {(meta.tags ?? []).map((t) => (
            <span key={t} className="bg-panel border border-line rounded px-2 py-0.5">
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* 고정 댓글 후보 */}
      {meta.pinned_comment_suggestion && (
        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-subtext">📌 고정 댓글 후보</label>
            <CopyButton text={meta.pinned_comment_suggestion} label="고정 댓글 복사" />
          </div>
          <div className="text-sm bg-good/5 border border-good/30 rounded-md px-3 py-2 break-words">
            {meta.pinned_comment_suggestion}
          </div>
        </section>
      )}

      {/* 썸네일 텍스트 후보 */}
      {meta.thumbnail_text_overlay_suggestion && (
        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-subtext">🖼 썸네일 텍스트</label>
            <CopyButton text={meta.thumbnail_text_overlay_suggestion} />
          </div>
          <div className="text-base bg-warn/5 border border-warn/30 rounded-md px-3 py-2 font-bold">
            {meta.thumbnail_text_overlay_suggestion}
          </div>
        </section>
      )}

      <div className="text-[10px] text-subtext opacity-60 mt-2">
        파일 위치:{" "}
        <code className="mono">
          projects/{slug}/06-edit-upload/upload_metadata.json
        </code>{" "}
        — 직접 편집 가능, 다음 빌드 시 보존됨
      </div>
    </div>
  );
}
