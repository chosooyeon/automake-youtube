"use client";

import {
  useInstagramJob,
  useInstaElapsed,
  formatMmSs,
} from "./InstagramJobContext";

interface Props {
  onJumpToInsta: () => void;
  currentTabIsInsta: boolean;
}

export default function InstagramProgressBar({ onJumpToInsta, currentTabIsInsta }: Props) {
  const { generate, clearGenerate, requestFocusInstaTab } = useInstagramJob();
  const elapsed = useInstaElapsed(generate.startedAt);

  const running = generate.status === "running";
  const showDone =
    generate.status === "done" &&
    !currentTabIsInsta &&
    generate.finishedAt &&
    Date.now() - generate.finishedAt < 60_000;
  const showErr = generate.status === "error" && !currentTabIsInsta;

  if (!running && !showDone && !showErr) return null;

  if (running) {
    return (
      <Bar
        kind="running"
        text={`인스타 카드 생성 + 출처 검증 중 · ${formatMmSs(elapsed)} 경과 (보통 90~150초)`}
        rightChildren={
          !currentTabIsInsta && (
            <button
              onClick={() => {
                requestFocusInstaTab();
                onJumpToInsta();
              }}
              className="text-xs border border-line rounded px-2 py-1 hover:bg-panel2"
            >
              인스타 카드 탭으로
            </button>
          )
        }
      />
    );
  }

  if (showDone) {
    return (
      <Bar
        kind="done"
        text={`✅ 인스타 카드 ${generate.result?.cards.length ?? 0}장 생성 완료`}
        rightChildren={
          <>
            <button
              onClick={() => {
                requestFocusInstaTab();
                onJumpToInsta();
                requestAnimationFrame(() => {
                  document.getElementById("instagram-result-anchor")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                });
              }}
              className="text-xs border border-good/60 text-good rounded px-2 py-1 hover:bg-good/10"
            >
              결과 보기 →
            </button>
            <button
              onClick={clearGenerate}
              className="text-xs border border-line rounded px-2 py-1 hover:bg-panel2"
              aria-label="닫기"
            >
              ✕
            </button>
          </>
        }
      />
    );
  }

  if (showErr) {
    return (
      <Bar
        kind="error"
        text={`❌ 인스타 카드 생성 실패: ${generate.error}`}
        rightChildren={
          <button
            onClick={clearGenerate}
            className="text-xs border border-line rounded px-2 py-1 hover:bg-panel2"
          >
            닫기
          </button>
        }
      />
    );
  }

  return null;
}

function Bar({
  kind,
  text,
  rightChildren,
}: {
  kind: "running" | "done" | "error";
  text: string;
  rightChildren?: React.ReactNode;
}) {
  const palette =
    kind === "running"
      ? "border-accent/50 bg-accent/10 text-accent2"
      : kind === "done"
      ? "border-good/40 bg-good/10 text-text"
      : "border-bad/50 bg-bad/10 text-text";
  return (
    <div className={"sticky top-0 z-30 -mx-6 px-6 py-2 border-b backdrop-blur " + palette}>
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          {kind === "running" && (
            <span className="inline-block h-2 w-2 rounded-full bg-accent animate-pulse" />
          )}
          <span>{text}</span>
        </div>
        <div className="flex items-center gap-2">{rightChildren}</div>
      </div>
    </div>
  );
}
