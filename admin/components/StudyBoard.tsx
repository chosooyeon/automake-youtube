"use client";

/**
 * 공부 노트 — 클라우드 · 파이썬 · 라이브코테 (config/study/*.json).
 *
 * 이 화면은 "책" 이다. 챕터별 용어표·비교표·흐름도를 읽고, 같은 챕터의 카드로 복습한다.
 * 달성률·연속일수·경고 배너는 일부러 없다 — 안 본 날이 쌓여도 화면이 혼내지 않는다.
 * 복습은 라이트너 5칸: 맞히면 다음 칸(1→3→7→14→30일), 틀리면 1칸.
 *
 * 외우기 도구 2개:
 *  - [🙈 가리기] 표의 정의 열을 흐리게 → 마우스 올리면 보임 (빨간 셀로판지)
 *  - [🃏 복습]  오늘 기한 카드 → 안 본 카드 순으로 넘기며 채점
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "./Toast";
import { renderInline } from "./Markdown";
import {
  BOX_MAX,
  boxHistogram,
  countCards,
  countDue,
  reviewQueue,
  searchSubject,
  todayKey,
  type Block,
  type Chapter,
  type Grade,
  type Progress,
  type Subject,
  type TreeNode,
} from "@/lib/study";

/* ───────────────────────── 인라인 텍스트 ───────────────────────── */

/** 줄바꿈을 살린 인라인 마크다운 (`코드`·**굵게**) */
function Inline({ text, k }: { text: string; k: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((ln, i) => (
        <span key={i}>
          {renderInline(ln, `${k}-${i}`)}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

/* ───────────────────────── 블록 렌더러 ───────────────────────── */

function BlockTitle({ title, kind }: { title?: string; kind: string }) {
  if (!title) return null;
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[11px] uppercase tracking-wider text-subtext border border-line rounded px-1.5 py-0.5">
        {kind}
      </span>
      <h4 className="font-semibold text-text">{title}</h4>
    </div>
  );
}

function BlockNote({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <p className="mt-2 text-sm text-subtext leading-relaxed">
      <Inline text={note} k="n" />
    </p>
  );
}

function TableBlock({ b, k, hide }: { b: Extract<Block, { type: "table" }>; k: string; hide: boolean }) {
  return (
    <div>
      <BlockTitle title={b.title} kind="표" />
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-panel2 text-left">
              {b.columns.map((c, i) => (
                <th key={i} className="px-3 py-2 font-semibold text-text border-b border-line whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((row, ri) => (
              <tr key={ri} className="odd:bg-panel even:bg-panel2/40 align-top">
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={
                      "px-3 py-2 border-b border-line/60 leading-relaxed " +
                      (ci === 0
                        ? "font-semibold text-text whitespace-nowrap"
                        : "text-text/90 ") +
                      (hide && ci > 0 ? " blur-[5px] hover:blur-0 transition cursor-pointer select-none" : "")
                    }
                    title={hide && ci > 0 ? "마우스를 올리면 보입니다" : undefined}
                  >
                    <Inline text={cell} k={`${k}-${ri}-${ci}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <BlockNote note={b.note} />
    </div>
  );
}

function CodeBlock({ b }: { b: Extract<Block, { type: "code" }> }) {
  return (
    <div>
      <BlockTitle title={b.title} kind={b.lang ?? "code"} />
      <pre className="mono text-[13px] leading-relaxed bg-bg border border-line rounded-xl p-4 overflow-x-auto whitespace-pre">
        {b.code}
      </pre>
      <BlockNote note={b.note} />
    </div>
  );
}

function NoteBlock({ b, k }: { b: Extract<Block, { type: "note" }>; k: string }) {
  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
      {b.title && <div className="font-semibold text-text mb-1">💡 {b.title}</div>}
      <p className="text-sm leading-relaxed text-text/90">
        <Inline text={b.text} k={k} />
      </p>
    </div>
  );
}

function FlowBlock({ b, k }: { b: Extract<Block, { type: "flow" }>; k: string }) {
  return (
    <div>
      <BlockTitle title={b.title} kind="흐름" />
      <div className="flex flex-wrap items-stretch gap-2">
        {b.steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="rounded-xl border border-line bg-panel2 px-3 py-2 min-w-[7rem] max-w-[14rem]">
              <div className="text-[11px] text-subtext">{i + 1}</div>
              <div className="font-semibold text-text text-sm">{s.label}</div>
              {s.sub && (
                <div className="text-xs text-subtext mt-0.5 leading-snug">
                  <Inline text={s.sub} k={`${k}-${i}`} />
                </div>
              )}
            </div>
            {i < b.steps.length - 1 && <span className="text-subtext text-lg">→</span>}
          </div>
        ))}
      </div>
      <BlockNote note={b.note} />
    </div>
  );
}

function CompareBlock({ b, k }: { b: Extract<Block, { type: "compare" }>; k: string }) {
  const cols = Math.min(4, Math.max(2, b.items.length));
  return (
    <div>
      <BlockTitle title={b.title} kind="비교" />
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${Math.max(180, Math.floor(720 / cols))}px, 1fr))` }}
      >
        {b.items.map((it, i) => (
          <div key={i} className="rounded-xl border border-line bg-panel overflow-hidden">
            <div
              className="px-3 py-2 font-semibold text-sm text-text border-b border-line"
              style={{ borderTop: `3px solid rgb(var(--c-series-${(i % 8) + 1}))` }}
            >
              {it.name}
            </div>
            <ul className="px-3 py-2 space-y-1 text-sm text-text/90">
              {it.points.map((p, j) => (
                <li key={j} className="flex gap-2">
                  <span className="text-subtext">·</span>
                  <span>
                    <Inline text={p} k={`${k}-${i}-${j}`} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <BlockNote note={b.note} />
    </div>
  );
}

function TreeNodeView({ n, depth, k }: { n: TreeNode; depth: number; k: string }) {
  return (
    <li className={depth ? "pl-4 border-l border-line ml-2" : ""}>
      <div className="py-1">
        <span
          className={
            "inline-block rounded-lg px-2 py-0.5 text-sm " +
            (depth === 0
              ? "bg-accent/15 text-text font-semibold"
              : depth === 1
                ? "bg-panel2 text-text font-medium"
                : "text-text/90")
          }
        >
          {n.label}
        </span>
        {n.sub && (
          <span className="ml-2 text-xs text-subtext">
            <Inline text={n.sub} k={k} />
          </span>
        )}
      </div>
      {n.children?.length ? (
        <ul>
          {n.children.map((c, i) => (
            <TreeNodeView key={i} n={c} depth={depth + 1} k={`${k}-${i}`} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function TreeBlock({ b, k }: { b: Extract<Block, { type: "tree" }>; k: string }) {
  return (
    <div>
      <BlockTitle title={b.title} kind="구조" />
      <ul className="rounded-xl border border-line bg-panel px-3 py-2">
        <TreeNodeView n={b.root} depth={0} k={k} />
      </ul>
      <BlockNote note={b.note} />
    </div>
  );
}

function BlockView({ b, k, hide }: { b: Block; k: string; hide: boolean }) {
  switch (b.type) {
    case "table":
      return <TableBlock b={b} k={k} hide={hide} />;
    case "code":
      return <CodeBlock b={b} />;
    case "note":
      return <NoteBlock b={b} k={k} />;
    case "flow":
      return <FlowBlock b={b} k={k} />;
    case "compare":
      return <CompareBlock b={b} k={k} />;
    case "tree":
      return <TreeBlock b={b} k={k} />;
  }
}

/* ───────────────────────── 챕터 본문 ───────────────────────── */

function ChapterView({
  subject,
  chapter,
  index,
  hide,
  progress,
  today,
  onReview,
}: {
  subject: Subject;
  chapter: Chapter;
  index: number;
  hide: boolean;
  progress: Progress;
  today: string;
  onReview: () => void;
}) {
  const due = reviewQueue(subject, progress, today, chapter.id).length;
  return (
    <article className="space-y-5" id={`ch-${chapter.id}`}>
      <header>
        <div className="text-xs text-subtext">{index + 1}장</div>
        <h3 className="text-xl font-bold text-text">{chapter.title}</h3>
        {chapter.summary && (
          <p className="mt-1 text-sm text-subtext leading-relaxed">
            <Inline text={chapter.summary} k={`s-${chapter.id}`} />
          </p>
        )}
      </header>
      {chapter.blocks.map((b, i) => (
        <BlockView key={i} b={b} k={`${chapter.id}-${i}`} hide={hide} />
      ))}
      {chapter.cards.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-dashed border-line px-4 py-3">
          <div className="text-sm text-subtext">
            🃏 이 챕터 카드 {chapter.cards.length}장
            {due > 0 && <span className="ml-2 text-text">· 지금 볼 것 {due}장</span>}
          </div>
          <button
            onClick={onReview}
            className="px-3 py-1.5 text-sm rounded-lg border border-accent/50 bg-accent/10 text-text hover:bg-accent/20"
          >
            이 챕터 복습
          </button>
        </div>
      )}
    </article>
  );
}

/* ───────────────────────── 복습 모드 ───────────────────────── */

function BoxStrip({ hist }: { hist: number[] }) {
  const total = hist.reduce((a, b) => a + b, 0) || 1;
  const labels = ["아직", "1칸", "2칸", "3칸", "4칸", "5칸"];
  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden bg-panel2">
        {hist.map((n, i) => (
          <div
            key={i}
            style={{
              width: `${(n / total) * 100}%`,
              background: i === 0 ? "rgb(var(--c-line))" : `rgb(var(--c-heat-${Math.min(4, i)}))`,
            }}
            title={`${labels[i]} ${n}장`}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-3 text-[11px] text-subtext">
        {hist.map((n, i) => (
          <span key={i}>
            {labels[i]} {n}
          </span>
        ))}
      </div>
    </div>
  );
}

function ReviewMode({
  subject,
  chapterId,
  progress,
  today,
  onGrade,
  onClose,
}: {
  subject: Subject;
  chapterId?: string;
  progress: Progress;
  today: string;
  onGrade: (key: string, g: Grade) => Promise<boolean>;
  onClose: () => void;
}) {
  // 큐는 진입 시점에 고정한다 — 채점 때마다 다시 계산하면 방금 틀린 카드가 바로 뒤에 또 나온다
  const [queue] = useState(() => reviewQueue(subject, progress, today, chapterId));
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState({ good: 0, again: 0 });

  const cur = queue[i];
  const chapterTitle = chapterId ? subject.chapters.find((c) => c.id === chapterId)?.title : undefined;

  const answer = useCallback(
    async (g: Grade) => {
      if (!cur || busy) return;
      setBusy(true);
      const ok = await onGrade(cur.key, g);
      setBusy(false);
      if (!ok) return;
      setDone((d) => ({ ...d, [g]: d[g] + 1 }));
      setFlipped(false);
      setI((x) => x + 1);
    },
    [cur, busy, onGrade]
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && e.key === "1") void answer("again");
      else if (flipped && e.key === "2") void answer("good");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [flipped, answer, onClose]);

  const hist = boxHistogram(subject, progress, chapterId);

  return (
    <div className="rounded-2xl border border-line bg-panel p-5 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-subtext">복습 · {subject.title}</div>
          <div className="font-semibold text-text">{chapterTitle ?? "과목 전체"}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-subtext">
            {Math.min(i + 1, queue.length)} / {queue.length}
          </span>
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border border-line text-subtext hover:text-text">
            닫기 (Esc)
          </button>
        </div>
      </div>

      <BoxStrip hist={hist} />

      {!cur ? (
        <div className="py-10 text-center space-y-2">
          <div className="text-2xl">☕</div>
          <div className="text-text font-semibold">
            {queue.length === 0 ? "오늘 볼 카드가 없습니다" : "이번 묶음 끝"}
          </div>
          {queue.length > 0 && (
            <div className="text-sm text-subtext">
              알았다 {done.good} · 다시 {done.again} — 틀린 건 내일 다시 나옵니다
            </div>
          )}
          {queue.length === 0 && (
            <div className="text-sm text-subtext">기한이 된 카드가 생기면 여기 다시 나옵니다. 그동안은 표를 읽으세요.</div>
          )}
        </div>
      ) : (
        <>
          <button
            onClick={() => setFlipped((f) => !f)}
            className="w-full text-left rounded-2xl border border-line bg-bg px-6 py-8 min-h-[12rem] transition hover:border-accent/50"
          >
            <div className="text-[11px] text-subtext mb-2">
              {cur.chapter.title}
              {cur.state ? ` · ${cur.state.box}칸` : " · 처음"}
            </div>
            <div className="text-lg font-semibold text-text leading-relaxed">
              <Inline text={cur.card.q} k={`q-${cur.key}`} />
            </div>
            {flipped ? (
              <div className="mt-4 pt-4 border-t border-line text-text/90 leading-relaxed">
                <Inline text={cur.card.a} k={`a-${cur.key}`} />
              </div>
            ) : (
              <div className="mt-4 text-sm text-subtext">
                {cur.card.hint ? (
                  <span>
                    힌트: <Inline text={cur.card.hint} k={`h-${cur.key}`} />
                  </span>
                ) : (
                  "클릭 또는 스페이스로 답 보기"
                )}
              </div>
            )}
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button
              disabled={!flipped || busy}
              onClick={() => answer("again")}
              className="py-3 rounded-xl border border-line bg-panel2 text-text disabled:opacity-40 hover:border-warn/60"
            >
              🙈 다시 <span className="text-xs text-subtext">(1) 내일</span>
            </button>
            <button
              disabled={!flipped || busy}
              onClick={() => answer("good")}
              className="py-3 rounded-xl border border-good/50 bg-good/10 text-text disabled:opacity-40 hover:bg-good/20"
            >
              ✅ 알았다{" "}
              <span className="text-xs text-subtext">
                (2) {cur.state ? `${Math.min(BOX_MAX, cur.state.box + 1)}칸으로` : "1칸으로"}
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── 메인 ───────────────────────── */

export default function StudyBoard() {
  const { push } = useToast();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [progress, setProgress] = useState<Progress>({ cards: {} });
  const [loading, setLoading] = useState(true);
  const [subjectId, setSubjectId] = useState<string>("");
  const [chapterId, setChapterId] = useState<string>("");
  const [hide, setHide] = useState(false);
  const [bookMode, setBookMode] = useState(false);
  const [q, setQ] = useState("");
  const [review, setReview] = useState<{ chapterId?: string } | null>(null);
  const today = useMemo(() => todayKey(), []);

  useEffect(() => {
    fetch("/api/study", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.ok) throw new Error(d?.error ?? "load_failed");
        setSubjects(d.subjects ?? []);
        setProgress(d.progress ?? { cards: {} });
        let last: { s?: string; c?: string } = {};
        try {
          last = JSON.parse(localStorage.getItem("study.last") ?? "{}");
        } catch {
          /* 무시 */
        }
        const first: Subject | undefined = (d.subjects ?? []).find((s: Subject) => s.id === last.s) ?? d.subjects?.[0];
        if (first) {
          setSubjectId(first.id);
          const ch = first.chapters.find((c) => c.id === last.c) ?? first.chapters[0];
          if (ch) setChapterId(ch.id);
        }
      })
      .catch(() => push({ kind: "error", title: "공부 노트를 불러오지 못했습니다" }))
      .finally(() => setLoading(false));
  }, [push]);

  // 마지막으로 보던 자리 — 책갈피
  useEffect(() => {
    if (!subjectId) return;
    try {
      localStorage.setItem("study.last", JSON.stringify({ s: subjectId, c: chapterId }));
    } catch {
      /* 무시 */
    }
  }, [subjectId, chapterId]);

  const subject = subjects.find((s) => s.id === subjectId);
  const chapterIndex = subject ? Math.max(0, subject.chapters.findIndex((c) => c.id === chapterId)) : 0;
  const chapter = subject?.chapters[chapterIndex];

  const onGrade = useCallback(
    async (key: string, g: Grade) => {
      try {
        const r = await fetch("/api/study/review", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key, grade: g }),
        });
        const d = await r.json();
        if (!d?.ok) throw new Error(d?.error ?? "failed");
        setProgress(d.progress);
        return true;
      } catch (e) {
        push({ kind: "error", title: "채점 저장 실패", message: String(e) });
        return false;
      }
    },
    [push]
  );

  const resetSubject = async () => {
    if (!subject) return;
    if (!confirm(`${subject.title} 복습 기록을 지우고 처음부터 외울까요?`)) return;
    const r = await fetch(`/api/study?prefix=${encodeURIComponent(subject.id + "/")}`, { method: "DELETE" });
    const d = await r.json();
    if (d?.ok) {
      setProgress(d.progress);
      push({ kind: "success", title: "복습 기록을 비웠습니다" });
    }
  };

  const hits = useMemo(() => (subject ? searchSubject(subject, q) : []), [subject, q]);

  if (loading) return <div className="text-sm text-subtext py-10 text-center">불러오는 중…</div>;
  if (!subjects.length)
    return (
      <div className="text-sm text-subtext py-10 text-center">
        <code className="mono">config/study/</code> 에 과목 파일이 없습니다.
      </div>
    );

  return (
    <div className="space-y-4">
      {/* 과목 선택 + 도구 */}
      <div className="flex flex-wrap items-center gap-2">
        {subjects.map((s) => {
          const due = countDue(s, progress, today);
          return (
            <button
              key={s.id}
              onClick={() => {
                setSubjectId(s.id);
                setChapterId(s.chapters[0]?.id ?? "");
                setReview(null);
                setQ("");
              }}
              className={
                "px-3 py-1.5 text-sm rounded-lg border transition " +
                (s.id === subjectId
                  ? "bg-accent/15 border-accent/50 text-text"
                  : "bg-panel border-line text-subtext hover:text-text")
              }
            >
              {s.emoji} {s.title}
              <span className="ml-1.5 text-[11px] text-subtext">
                {s.chapters.length}장 · 카드 {countCards(s)}
                {due > 0 && ` · 볼 것 ${due}`}
              </span>
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="용어 찾기 (이 과목 안)"
            className="px-3 py-1.5 text-sm rounded-lg border border-line bg-panel text-text w-48 outline-none focus:border-accent/60"
          />
          <button
            onClick={() => setHide((h) => !h)}
            title="표의 정의 열을 흐리게 — 마우스를 올리면 보입니다"
            className={
              "px-3 py-1.5 text-sm rounded-lg border transition " +
              (hide ? "bg-warn/15 border-warn/50 text-text" : "bg-panel border-line text-subtext hover:text-text")
            }
          >
            🙈 가리기
          </button>
          <button
            onClick={() => setBookMode((b) => !b)}
            title="챕터를 한 페이지에 전부 펼칩니다"
            className={
              "px-3 py-1.5 text-sm rounded-lg border transition " +
              (bookMode ? "bg-accent/15 border-accent/50 text-text" : "bg-panel border-line text-subtext hover:text-text")
            }
          >
            📖 전체 펼치기
          </button>
          <button
            onClick={() => setReview({})}
            className="px-3 py-1.5 text-sm rounded-lg border border-accent/50 bg-accent/10 text-text hover:bg-accent/20"
          >
            🃏 복습
          </button>
        </div>
      </div>

      {subject && review && (
        <ReviewMode
          key={review.chapterId ?? "all"}
          subject={subject}
          chapterId={review.chapterId}
          progress={progress}
          today={today}
          onGrade={onGrade}
          onClose={() => setReview(null)}
        />
      )}

      {subject && !review && (
        <div className="grid gap-4" style={{ gridTemplateColumns: "15rem minmax(0, 1fr)" }}>
          {/* 목차 */}
          <aside className="self-start sticky top-4 rounded-2xl border border-line bg-panel p-3 space-y-1">
            <div className="px-2 pb-2 text-xs text-subtext leading-relaxed">
              <Inline text={subject.intro} k="intro" />
            </div>
            {subject.chapters.map((c, i) => {
              const due = reviewQueue(subject, progress, today, c.id).length;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setChapterId(c.id);
                    setQ("");
                    if (bookMode) document.getElementById(`ch-${c.id}`)?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className={
                    "w-full text-left px-2 py-1.5 rounded-lg text-sm transition flex items-baseline gap-2 " +
                    (c.id === chapterId && !bookMode
                      ? "bg-accent/15 text-text"
                      : "text-subtext hover:text-text hover:bg-panel2")
                  }
                >
                  <span className="text-[11px] w-4 shrink-0">{i + 1}</span>
                  <span className="flex-1 leading-snug">{c.title}</span>
                  {due > 0 && <span className="text-[10px] text-accent shrink-0">{due}</span>}
                </button>
              );
            })}
            <div className="pt-2 border-t border-line mt-2">
              <button onClick={resetSubject} className="w-full text-left px-2 py-1 text-[11px] text-subtext hover:text-text">
                복습 기록 초기화
              </button>
            </div>
          </aside>

          {/* 본문 */}
          <section className="min-w-0 rounded-2xl border border-line bg-panel p-6">
            {q.trim() ? (
              <div className="space-y-2">
                <div className="text-sm text-subtext">
                  &ldquo;{q}&rdquo; — {hits.length}건
                </div>
                {hits.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setChapterId(h.chapter.id);
                      setQ("");
                    }}
                    className="w-full text-left rounded-xl border border-line px-3 py-2 hover:border-accent/50"
                  >
                    <div className="text-[11px] text-subtext">
                      {h.chapter.title} · {h.where}
                    </div>
                    <div className="text-sm text-text">
                      <Inline text={h.text} k={`hit-${i}`} />
                    </div>
                  </button>
                ))}
                {!hits.length && <div className="text-sm text-subtext py-6 text-center">없습니다</div>}
              </div>
            ) : bookMode ? (
              <div className="space-y-12">
                {subject.chapters.map((c, i) => (
                  <ChapterView
                    key={c.id}
                    subject={subject}
                    chapter={c}
                    index={i}
                    hide={hide}
                    progress={progress}
                    today={today}
                    onReview={() => setReview({ chapterId: c.id })}
                  />
                ))}
              </div>
            ) : chapter ? (
              <>
                <ChapterView
                  subject={subject}
                  chapter={chapter}
                  index={chapterIndex}
                  hide={hide}
                  progress={progress}
                  today={today}
                  onReview={() => setReview({ chapterId: chapter.id })}
                />
                <div className="mt-8 pt-4 border-t border-line flex justify-between text-sm">
                  <button
                    disabled={chapterIndex === 0}
                    onClick={() => setChapterId(subject.chapters[chapterIndex - 1].id)}
                    className="text-subtext hover:text-text disabled:opacity-30"
                  >
                    ← {subject.chapters[chapterIndex - 1]?.title ?? ""}
                  </button>
                  <button
                    disabled={chapterIndex >= subject.chapters.length - 1}
                    onClick={() => setChapterId(subject.chapters[chapterIndex + 1].id)}
                    className="text-subtext hover:text-text disabled:opacity-30"
                  >
                    {subject.chapters[chapterIndex + 1]?.title ?? ""} →
                  </button>
                </div>
              </>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
