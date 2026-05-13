"use client";

import { useEffect, useState } from "react";
import {
  useInstagramJob,
  type CardResult,
  type LayoutType,
} from "./InstagramJobContext";

const LAYOUT_BADGE: Record<LayoutType, { label: string; cls: string }> = {
  cover: { label: "표지", cls: "bg-accent/15 text-accent border-accent/40" },
  body: { label: "본문", cls: "bg-line/30 text-text border-line" },
  comparison: { label: "비교", cls: "bg-line/30 text-text border-line" },
  stat: { label: "숫자", cls: "bg-line/30 text-text border-line" },
  cta: { label: "CTA", cls: "bg-good/15 text-good border-good/40" },
};

interface Props {
  slug: string;
  card: CardResult;
}

export default function InstagramCardPreview({ slug, card }: Props) {
  const { regenerateCard, regeneratingIndex } = useInstagramJob();
  const [modalOpen, setModalOpen] = useState(false);
  const regenBusy = regeneratingIndex === card.index;
  const badge = LAYOUT_BADGE[card.layout];

  function download() {
    const a = document.createElement("a");
    a.href = card.dataUrl;
    a.download = `${slug}-card-${String(card.index).padStart(2, "0")}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ESC 키로 모달 닫기
  useEffect(() => {
    if (!modalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setModalOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  return (
    <>
      <div className="bg-panel border border-line rounded-xl overflow-hidden flex flex-col">
        <button
          onClick={() => setModalOpen(true)}
          className="relative aspect-square bg-bg border-b border-line group"
          aria-label={`카드 ${card.index} 크게 보기`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.dataUrl}
            alt={`card ${card.index}`}
            className="w-full h-full object-cover"
          />
          {regenBusy && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg/70 backdrop-blur-sm">
              <span className="text-sm text-accent">재생성 중…</span>
            </div>
          )}
          <span className="absolute top-2 left-2 text-[10px] mono bg-bg/80 border border-line rounded px-1.5 py-0.5">
            {String(card.index).padStart(2, "0")}
          </span>
          <span
            className={`absolute top-2 right-2 text-[10px] uppercase tracking-wider border rounded px-1.5 py-0.5 ${badge.cls}`}
          >
            {badge.label}
          </span>
        </button>
        <div className="p-2 space-y-1.5">
          <div className="flex gap-1">
            <button
              onClick={() => regenerateCard(slug, card.index)}
              disabled={regenBusy}
              className="flex-1 text-[11px] border border-line rounded px-2 py-1 hover:bg-panel2 disabled:opacity-50"
            >
              🔄 배경 재생성
            </button>
            <button
              onClick={download}
              className="flex-1 text-[11px] border border-line rounded px-2 py-1 hover:bg-panel2"
            >
              ⬇ PNG
            </button>
          </div>
          {card.sources.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {card.sources.slice(0, 3).map((s, i) => (
                <a
                  key={i}
                  href={s}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-subtext underline hover:text-text"
                >
                  출처{i + 1}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-bg/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-panel border border-line rounded-2xl p-4 max-w-3xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm mono text-subtext">카드 {String(card.index).padStart(2, "0")}</span>
                <span
                  className={`text-[10px] uppercase tracking-wider border rounded px-1.5 py-0.5 ${badge.cls}`}
                >
                  {badge.label}
                </span>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-xs border border-line rounded px-2 py-1 hover:bg-panel2"
              >
                ✕ 닫기 (ESC)
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.dataUrl}
              alt={`card ${card.index} large`}
              className="w-full rounded-lg border border-line"
            />
            <div className="mt-3 flex gap-2 flex-wrap">
              <button
                onClick={() => regenerateCard(slug, card.index)}
                disabled={regenBusy}
                className="text-xs border border-accent text-accent rounded px-3 py-1.5 hover:bg-accent/10 disabled:opacity-50"
              >
                🔄 배경 재생성
              </button>
              <button
                onClick={download}
                className="text-xs border border-line rounded px-3 py-1.5 hover:bg-panel2"
              >
                ⬇ PNG 다운로드
              </button>
            </div>
            {card.sources.length > 0 && (
              <div className="mt-3 text-xs text-subtext space-y-1">
                <div className="font-semibold text-text">출처</div>
                {card.sources.map((s, i) => (
                  <a
                    key={i}
                    href={s}
                    target="_blank"
                    rel="noreferrer"
                    className="block underline hover:text-text break-all"
                  >
                    {s}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
