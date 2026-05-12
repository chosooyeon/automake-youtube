"use client";

import { useBlogJob, useElapsed, formatMmSs } from "./BlogJobContext";

interface Props {
  /** 블로그 탭이 아닌 곳에서 "결과 보기" 누르면 블로그 탭으로 전환 */
  onJumpToBlog: () => void;
  /** 현재 탭이 blog 면 결과 보기 버튼 숨김 (이미 거기 있음) */
  currentTabIsBlog: boolean;
}

export default function BlogProgressBar({ onJumpToBlog, currentTabIsBlog }: Props) {
  const { generate, verify, clearGenerate, clearVerify, requestFocusBlogTab } = useBlogJob();
  const genElapsed = useElapsed(generate.startedAt);
  const verElapsed = useElapsed(verify.startedAt);

  const running =
    generate.status === "running" ? "generate" : verify.status === "running" ? "verify" : null;

  // 완료/에러는 사용자가 명시적으로 닫을 때까지 잠깐 표시 (단, 탭이 blog 면 결과를 그쪽에서 보니까 안 띄움)
  const showDoneGen =
    generate.status === "done" && !currentTabIsBlog && generate.finishedAt &&
    Date.now() - generate.finishedAt < 60_000;
  const showErrGen = generate.status === "error" && !currentTabIsBlog;
  const showDoneVer =
    verify.status === "done" && !currentTabIsBlog && verify.finishedAt &&
    Date.now() - verify.finishedAt < 60_000;
  const showErrVer = verify.status === "error" && !currentTabIsBlog;

  if (!running && !showDoneGen && !showErrGen && !showDoneVer && !showErrVer) {
    return null;
  }

  if (running === "generate") {
    return (
      <Bar
        kind="running"
        text={`블로그 초안 생성 중 · ${formatMmSs(genElapsed)} 경과 (보통 60~120초)`}
        rightChildren={
          !currentTabIsBlog && (
            <button
              onClick={() => {
                requestFocusBlogTab("result");
                onJumpToBlog();
              }}
              className="text-xs border border-line rounded px-2 py-1 hover:bg-panel2"
            >
              블로그 탭으로
            </button>
          )
        }
      />
    );
  }

  if (running === "verify") {
    return (
      <Bar
        kind="running"
        text={`사실 검증 중 · ${formatMmSs(verElapsed)} 경과 (보통 60~120초)`}
        rightChildren={
          !currentTabIsBlog && (
            <button
              onClick={() => {
                requestFocusBlogTab("verify");
                onJumpToBlog();
              }}
              className="text-xs border border-line rounded px-2 py-1 hover:bg-panel2"
            >
              블로그 탭으로
            </button>
          )
        }
      />
    );
  }

  if (showDoneGen) {
    return (
      <Bar
        kind="done"
        text="✅ 블로그 초안 생성 완료"
        rightChildren={
          <>
            <button
              onClick={() => {
                requestFocusBlogTab("result");
                onJumpToBlog();
                // 탭 전환 후 BlogGenerator 가 보이는 시점에 한번 스크롤
                requestAnimationFrame(() => {
                  document.getElementById("blog-result-anchor")?.scrollIntoView({
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

  if (showDoneVer) {
    return (
      <Bar
        kind="done"
        text="✅ 사실 검증 완료"
        rightChildren={
          <>
            <button
              onClick={() => {
                requestFocusBlogTab("verify");
                onJumpToBlog();
                requestAnimationFrame(() => {
                  document.getElementById("blog-verify-anchor")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                });
              }}
              className="text-xs border border-good/60 text-good rounded px-2 py-1 hover:bg-good/10"
            >
              검증 결과 보기 →
            </button>
            <button
              onClick={clearVerify}
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

  if (showErrGen) {
    return (
      <Bar
        kind="error"
        text={`❌ 블로그 생성 실패: ${generate.error}`}
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

  if (showErrVer) {
    return (
      <Bar
        kind="error"
        text={`❌ 검증 실패: ${verify.error}`}
        rightChildren={
          <button
            onClick={clearVerify}
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
    <div
      className={
        "sticky top-0 z-30 -mx-6 px-6 py-2 border-b backdrop-blur " +
        palette
      }
    >
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
