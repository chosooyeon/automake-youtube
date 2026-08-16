"use client";

/**
 * 메인 퀘스트 보드 — 12주짜리 시즌 플랜을 챕터로 나눠 게임처럼 보여준다.
 *
 * 데일리 퀘스트가 "오늘 뭘 하지"라면 여기는 "지금 어디쯤 왔지"다.
 * **트랙은 한 번에 하나만 보인다** — 수익화와 이직을 동시에 펼쳐놓으면
 * 어느 쪽도 진행 중이 아닌 것처럼 보이고, 그게 범위를 넓히는 첫걸음이다.
 * 잠금 표시는 순서를 안내할 뿐 체크를 막지 않는다 — 도구가 사람을 막아서면 안 열게 된다.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "./Toast";
import {
  DEFAULT_TRACK,
  MISSION_TRACKS,
  chapterMeta,
  chapterStats,
  missionsOf,
  nextMission,
  totalStat,
  trackMeta,
  type Mission,
} from "@/lib/mission";
import { toDateStr } from "@/lib/quest";

export default function MissionBoard() {
  const { push } = useToast();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [track, setTrack] = useState<string>(DEFAULT_TRACK);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [today, setToday] = useState("");

  useEffect(() => {
    setToday(toDateStr(new Date()));
    fetch("/api/missions", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d?.ok && setMissions(d.missions ?? []))
      .catch(() => push({ kind: "error", title: "메인 퀘스트를 불러오지 못했습니다" }))
      .finally(() => setLoading(false));
  }, [push]);

  const call = useCallback(
    async (init: RequestInit & { url?: string }) => {
      try {
        const r = await fetch(init.url ?? "/api/missions", init);
        const d = await r.json();
        if (!d?.ok) throw new Error(d?.error ?? "실패");
        setMissions(d.missions);
        return true;
      } catch (e) {
        push({ kind: "error", title: "저장 실패", message: String(e) });
        return false;
      }
    },
    [push]
  );

  const patch = useCallback(
    (id: string, body: Record<string, unknown>) =>
      call({
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      }),
    [call]
  );

  const meta = useMemo(() => trackMeta(track), [track]);
  const stats = useMemo(() => chapterStats(missions, track), [missions, track]);
  const total = useMemo(() => totalStat(missions, track), [missions, track]);
  const next = useMemo(() => nextMission(missions, track), [missions, track]);

  if (loading || !today) {
    return <div className="text-sm text-subtext py-10 text-center">불러오는 중…</div>;
  }

  return (
    <div className="space-y-4">
      {/* 트랙 — 한 번에 하나만 본다 */}
      <div className="flex flex-wrap gap-1.5">
        {MISSION_TRACKS.map((t) => {
          const st = totalStat(missions, t.id);
          const active = t.id === track;
          return (
            <button
              key={t.id}
              onClick={() => {
                setTrack(t.id);
                setOpen(null);
              }}
              className={
                "px-3 py-1.5 rounded-lg border text-xs transition " +
                (active
                  ? "border-accent bg-accent/10 text-text font-semibold"
                  : "border-line bg-panel text-subtext hover:text-text hover:border-subtext/40")
              }
            >
              {t.emoji} {t.label}
              <span className="ml-1.5 mono tabular-nums opacity-70">
                {st.done}/{st.total}
              </span>
            </button>
          );
        })}
      </div>

      {/* 전체 진행도 */}
      <div className="bg-panel border border-line rounded-xl p-4">
        <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
          <div>
            <h2 className="text-base font-semibold">
              🗺️ 메인 퀘스트 — {meta.headline}
            </h2>
            <p className="text-xs text-subtext mt-0.5">{meta.note}</p>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold mono tabular-nums">{total.done}</span>
            <span className="text-sm text-subtext mono">/ {total.total}</span>
            <span className="text-xs text-subtext ml-1">클리어</span>
          </div>
        </div>

        <div className="h-3 rounded-full bg-panel2 overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500"
            style={{ width: `${total.pct * 100}%` }}
          />
        </div>

        {next ? (
          <div className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2.5">
            <div className="text-[11px] text-subtext">지금 할 것 하나</div>
            <div className="text-sm font-semibold mt-0.5">{next.title}</div>
            <div className="text-[11px] text-subtext mt-1">
              CHAPTER {next.chapter} · {chapterMeta(track, next.chapter).title}
            </div>
          </div>
        ) : (
          total.total > 0 && (
            <div className="mt-3 rounded-lg border border-good/40 bg-good/10 px-3 py-2.5 text-sm font-semibold">
              🏆 전부 클리어했습니다. 시즌 회고할 시간이에요.
            </div>
          )
        )}
      </div>

      {/* 챕터 */}
      {meta.chapters.map((c) => {
        const st = stats.find((s) => s.chapter === c.id)!;
        const items = missionsOf(missions, track, c.id);
        const dim = !st.unlocked && !st.cleared && st.done === 0;

        return (
          <section
            key={c.id}
            className={
              "rounded-xl border transition " +
              (st.cleared ? "border-good/50 bg-good/5" : "border-line bg-panel") +
              (dim ? " opacity-60" : "")
            }
          >
            <div className="px-4 pt-4 pb-3 border-b border-line/60">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold tracking-widest text-subtext mono">
                  CHAPTER {c.id}
                </span>
                <h3 className="text-sm font-semibold">{c.title}</h3>
                <span className="text-[11px] text-subtext">{c.weeks}</span>
                {st.cleared && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-good/50 bg-good/15 text-good">
                    ✓ CLEAR
                  </span>
                )}
                {dim && <span className="text-[11px] text-subtext">🔒 앞 챕터 먼저</span>}
                <span className="flex-1" />
                <span className="text-xs mono tabular-nums text-subtext">
                  {st.done}/{st.total}
                </span>
              </div>
              <p className="text-[11px] text-subtext mt-1">{c.subtitle}</p>
              <div className="h-1.5 rounded-full bg-panel2 overflow-hidden mt-2.5">
                <div
                  className={
                    "h-full rounded-full transition-all duration-500 " +
                    (st.cleared ? "bg-good" : "bg-accent")
                  }
                  style={{ width: `${st.pct * 100}%` }}
                />
              </div>
            </div>

            <div className="p-2.5 space-y-1.5">
              {items.map((m) => (
                <MissionRow
                  key={m.id}
                  mission={m}
                  expanded={open === m.id}
                  isNext={next?.id === m.id}
                  onToggleOpen={() => setOpen(open === m.id ? null : m.id)}
                  onToggleDone={() => patch(m.id, { doneDate: m.doneDate ? null : today })}
                  onPatch={(body) => patch(m.id, body)}
                  onDelete={async () => {
                    if (!confirm(`"${m.title}" 미션을 지울까요?`)) return;
                    await call({ url: `/api/missions?id=${encodeURIComponent(m.id)}`, method: "DELETE" });
                    setOpen(null);
                  }}
                />
              ))}
              <AddMission
                chapter={c.id}
                onAdd={(title) =>
                  call({
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ track, chapter: c.id, title }),
                  })
                }
              />
            </div>
          </section>
        );
      })}

      <p className="text-[11px] text-subtext">
        저장 위치: <span className="mono">config/missions.json</span> (커밋됨)
      </p>
    </div>
  );
}

function MissionRow({
  mission: m,
  expanded,
  isNext,
  onToggleOpen,
  onToggleDone,
  onPatch,
  onDelete,
}: {
  mission: Mission;
  expanded: boolean;
  isNext: boolean;
  onToggleOpen: () => void;
  onToggleDone: () => void;
  onPatch: (body: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const done = Boolean(m.doneDate);
  return (
    <div
      className={
        "rounded-lg border transition " +
        (done
          ? "bg-good/10 border-good/40"
          : isNext
            ? "bg-panel2 border-accent/50"
            : "bg-panel2 border-line hover:border-subtext/40")
      }
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <button
          onClick={onToggleDone}
          title={done ? "완료 취소" : "완료로 표시"}
          className={
            "w-5 h-5 mt-0.5 rounded-md border-2 shrink-0 flex items-center justify-center text-[11px] transition " +
            (done ? "bg-good border-good text-panel" : "border-subtext/50 text-transparent hover:border-accent")
          }
        >
          ✓
        </button>
        <button onClick={onToggleOpen} className="flex-1 min-w-0 text-left">
          <div className={"text-sm " + (done ? "text-subtext line-through" : "text-text font-medium")}>
            {m.title}
          </div>
          {m.reward && !done && (
            <div className="text-[11px] text-accent mt-1">🎁 {m.reward}</div>
          )}
          {done && (
            <div className="text-[11px] text-subtext mono mt-1">{m.doneDate} 클리어</div>
          )}
        </button>
        {isNext && !done && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-accent/50 bg-accent/10 text-accent shrink-0">
            NOW
          </span>
        )}
      </div>

      {expanded && (
        <div className="border-t border-line px-3 py-2.5 space-y-2">
          {m.detail && (
            <p className="text-xs text-subtext leading-relaxed whitespace-pre-wrap">{m.detail}</p>
          )}
          <input
            className="input-base text-xs"
            defaultValue={m.title}
            onBlur={(e) => e.target.value.trim() !== m.title && onPatch({ title: e.target.value })}
          />
          <input
            className="input-base text-xs"
            defaultValue={m.reward}
            placeholder="보상 — 이걸 끝내면 얻는 것"
            onBlur={(e) => e.target.value !== m.reward && onPatch({ reward: e.target.value })}
          />
          <textarea
            className="input-base text-xs resize-y min-h-[54px]"
            defaultValue={m.detail}
            placeholder="어떻게 / 왜 하는지"
            onBlur={(e) => e.target.value !== m.detail && onPatch({ detail: e.target.value })}
          />
          <div className="flex justify-end">
            <button
              onClick={onDelete}
              className="px-2 py-1 rounded border border-line text-[11px] text-subtext hover:text-bad hover:border-bad/50"
            >
              삭제
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddMission({
  chapter,
  onAdd,
}: {
  chapter: number;
  onAdd: (title: string) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const submit = async () => {
    if (!title.trim()) return;
    if (await onAdd(title.trim())) setTitle("");
  };
  return (
    <div className="flex gap-1.5 pt-1">
      <input
        className="input-base text-xs"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={`CHAPTER ${chapter} 에 미션 추가`}
      />
      <button
        onClick={submit}
        disabled={!title.trim()}
        className="px-3 py-1.5 rounded-md border border-line text-xs text-subtext hover:text-text disabled:opacity-40 shrink-0"
      >
        추가
      </button>
    </div>
  );
}
