"use client";

/**
 * 프로젝트 소개서 탭 — 면접에서 이 저장소를 설명하기 위한 화면.
 *
 * 문서(docs/*.md)가 아니라 탭으로 만든 이유: 문서는 안 열게 되고 탭은 눈에 띈다.
 * 내용은 전부 lib/projectBrief.ts 에 있고 여기는 표시만 한다.
 *
 * 화면의 중심은 기술 스택 목록이 아니라 **판단 카드**다 —
 * 스택은 이력서에 이미 있고, 면접에서 갈리는 건 "왜 그렇게 했나"라서.
 */

import { useMemo, useState } from "react";
import {
  DECISIONS,
  ENTRYPOINTS,
  GAPS,
  LAYERS,
  PITCH,
  QA,
  STATS,
  type Decision,
} from "@/lib/projectBrief";

type View = "overview" | "decisions" | "qa";

const VIEWS: { id: View; label: string; hint: string }[] = [
  { id: "overview", label: "① 구조", hint: "무엇을 만들었나" },
  { id: "decisions", label: "② 판단", hint: "왜 그렇게 만들었나 — 면접의 핵심" },
  { id: "qa", label: "③ 예상 질문", hint: "그대로 읽어도 되는 답변" },
];

export default function ProjectBrief() {
  const [view, setView] = useState<View>("overview");

  return (
    <div className="space-y-4">
      <div className="bg-panel border border-line rounded-xl p-4">
        <h2 className="text-base font-semibold">🗂️ 이 프로젝트 설명하기</h2>
        <p className="text-sm text-subtext mt-2 leading-relaxed">{PITCH}</p>
        <p className="text-[11px] text-subtext mt-3 border-t border-line pt-2.5">
          내용 원본은 <span className="mono">admin/lib/projectBrief.ts</span> · 코드를 고치면 여기도 같이 고칠 것
          — 면접에서 말할 내용이라 틀리면 안 된다
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            title={v.hint}
            className={
              "px-3 py-1.5 rounded-lg border text-xs transition " +
              (v.id === view
                ? "border-accent bg-accent/10 text-text font-semibold"
                : "border-line bg-panel text-subtext hover:text-text hover:border-subtext/40")
            }
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "overview" && <Overview />}
      {view === "decisions" && <Decisions />}
      {view === "qa" && <QaView />}
    </div>
  );
}

/* ────────────────────────────── ① 구조 ────────────────────────────── */

function Overview() {
  return (
    <div className="space-y-4">
      <section className="bg-panel border border-line rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">규모</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-lg border border-line bg-panel2 px-3 py-2.5" title={s.hint}>
              <div className="text-lg font-bold mono tabular-nums">{s.value}</div>
              <div className="text-[11px] text-subtext mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-subtext mt-3">
          숫자를 외울 필요는 없습니다. &ldquo;API 라우트 60개&rdquo; 정도만 기억하면 규모 감각은 전달됩니다.
        </p>
      </section>

      <section className="bg-panel border border-line rounded-xl p-4">
        <h3 className="text-sm font-semibold">레이어</h3>
        <p className="text-[11px] text-subtext mt-1 mb-3">
          위에서 아래로 흐릅니다. <strong className="text-text">아래가 위를 import 하지 않는 것</strong>이 규칙이고,
          그래서 같은 로직을 웹에서도 CLI에서도 씁니다.
        </p>
        <div className="space-y-1.5">
          {LAYERS.map((l, i) => (
            <div key={l.path}>
              <div className="rounded-lg border border-line bg-panel2 px-3 py-2.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium">{l.name}</span>
                  <span className="text-[11px] mono text-accent">{l.path}</span>
                </div>
                <div className="text-xs text-subtext mt-1">{l.role}</div>
              </div>
              {i < LAYERS.length - 1 && (
                <div className="text-center text-subtext text-xs leading-none py-0.5">↓</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="bg-panel border border-line rounded-xl p-4">
        <h3 className="text-sm font-semibold">진입점이 셋이다</h3>
        <p className="text-[11px] text-subtext mt-1 mb-3">
          면접에서 <strong className="text-text">&ldquo;웹앱 하나 만들었어요&rdquo;와 갈리는 지점</strong>입니다.
          같은 도메인 로직을 세 가지 방식으로 실행합니다.
        </p>
        <div className="space-y-1.5">
          {ENTRYPOINTS.map((e) => (
            <div key={e.name} className="rounded-lg border border-line bg-panel2 px-3 py-2.5">
              <div className="text-xs mono text-accent">{e.name}</div>
              <div className="text-xs text-subtext mt-1 leading-relaxed">{e.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-warn/40 bg-warn/5 p-4">
        <h3 className="text-sm font-semibold">지금 약한 곳</h3>
        <p className="text-[11px] text-subtext mt-1 mb-3">
          <strong className="text-text">물어보기 전에 먼저 말하세요.</strong> 아는 사람으로 보입니다.
          약점을 숨기다 들키는 것보다, 먼저 꺼내고 순서까지 말하는 쪽이 훨씬 강합니다.
        </p>
        <ul className="space-y-1.5">
          {GAPS.map((g) => (
            <li key={g.name} className="text-xs">
              <span className="text-text font-medium">· {g.name}</span>
              <span className="text-subtext"> — {g.detail}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ────────────────────────────── ② 판단 ────────────────────────────── */

function Decisions() {
  const [open, setOpen] = useState<string | null>(DECISIONS[0]?.id ?? null);
  const [tag, setTag] = useState<string | null>(null);

  const tags = useMemo(
    () => Array.from(new Set(DECISIONS.flatMap((d) => d.tags))).sort(),
    []
  );
  const shown = tag ? DECISIONS.filter((d) => d.tags.includes(tag)) : DECISIONS;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-accent/40 bg-accent/5 px-4 py-3">
        <p className="text-xs leading-relaxed">
          <strong>이 탭이 제일 중요합니다.</strong> 스택은 이력서에 이미 있고, 면접에서 갈리는 건
          &ldquo;왜 그렇게 했나&rdquo;입니다. 카드마다{" "}
          <span className="text-accent font-semibold">💬 이렇게 말한다</span> 문장이 있으니 그대로 읽어도 됩니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setTag(null)}
          className={
            "px-2.5 py-1 rounded-full border text-[11px] transition " +
            (tag === null ? "border-accent bg-accent/10 text-text" : "border-line text-subtext hover:text-text")
          }
        >
          전체 {DECISIONS.length}
        </button>
        {tags.map((t) => (
          <button
            key={t}
            onClick={() => setTag(t === tag ? null : t)}
            className={
              "px-2.5 py-1 rounded-full border text-[11px] transition " +
              (t === tag ? "border-accent bg-accent/10 text-text" : "border-line text-subtext hover:text-text")
            }
          >
            {t}
          </button>
        ))}
      </div>

      {shown.map((d) => (
        <DecisionCard
          key={d.id}
          d={d}
          expanded={open === d.id}
          onToggle={() => setOpen(open === d.id ? null : d.id)}
        />
      ))}
    </div>
  );
}

function DecisionCard({
  d,
  expanded,
  onToggle,
}: {
  d: Decision;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="rounded-xl border border-line bg-panel">
      <button onClick={onToggle} className="w-full text-left px-4 py-3">
        <div className="flex items-start gap-2">
          <span className="text-sm font-semibold flex-1">{d.title}</span>
          <span className="text-subtext text-xs shrink-0 mt-0.5">{expanded ? "▾" : "▸"}</span>
        </div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {d.tags.map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full border border-line text-subtext">
              {t}
            </span>
          ))}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-line px-4 py-3 space-y-3">
          <Field label="무엇을" text={d.what} />
          <Field label="왜" text={d.why} />
          <div className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2.5">
            <div className="text-[11px] text-accent font-semibold mb-1">💬 면접에서 이렇게 말한다</div>
            <p className="text-xs leading-relaxed">{d.say}</p>
          </div>
          <div className="text-[11px] text-subtext mono">📁 {d.where}</div>
        </div>
      )}
    </section>
  );
}

function Field({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="text-[11px] text-subtext font-semibold mb-1">{label}</div>
      <p className="text-xs leading-relaxed text-text">{text}</p>
    </div>
  );
}

/* ──────────────────────────── ③ 예상 질문 ──────────────────────────── */

function QaView() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-line bg-panel px-4 py-3">
        <p className="text-xs text-subtext leading-relaxed">
          답을 외우지 마세요. <strong className="text-text">소리 내어 한 번 읽는 것</strong>이 목적입니다 —
          입으로 말해본 적이 있느냐가 실제 면접에서 갈립니다.
        </p>
      </div>

      {QA.map((qa, i) => {
        const expanded = open === i;
        return (
          <section key={qa.q} className="rounded-xl border border-line bg-panel">
            <button
              onClick={() => setOpen(expanded ? null : i)}
              className="w-full text-left px-4 py-3 flex items-start gap-2"
            >
              <span className="text-sm font-medium flex-1">Q. {qa.q}</span>
              <span className="text-subtext text-xs shrink-0 mt-0.5">{expanded ? "▾" : "▸"}</span>
            </button>
            {expanded && (
              <div className="border-t border-line px-4 py-3">
                <p className="text-xs leading-relaxed whitespace-pre-line">{qa.a}</p>
                {qa.ref && (
                  <div className="text-[11px] text-subtext mt-2">
                    ↳ [② 판단] 탭의 관련 카드: <span className="mono">{qa.ref}</span>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
