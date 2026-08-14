"use client";

/**
 * 아이디어 파킹판.
 *
 * 이 화면의 목적은 아이디어를 "관리"하는 게 아니라 **착수를 막는 것**이다.
 * 새 갈래가 떠오르면 바로 시작하는 대신 여기 적어두고, 시즌이 끝날 때만 꺼내 본다.
 * 그래서 시즌 후보 슬롯이 3개로 고정돼 있고, 넘치면 화면이 대놓고 경고한다.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "./Toast";
import {
  CATEGORY_IDS,
  IDEA_CATEGORIES,
  IDEA_STATUSES,
  SHORTLIST_MAX,
  categoryColor,
  categoryMeta,
  countByCategory,
  countByStatus,
  statusMeta,
  type CategoryId,
  type Idea,
  type StatusId,
} from "@/lib/idea";

export default function IdeaBoard() {
  const { push } = useToast();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CategoryId | "all">("all");
  const [status, setStatus] = useState<StatusId | "all">("all");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ideas", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d?.ok && setIdeas(d.ideas ?? []))
      .catch(() => push({ kind: "error", title: "아이디어를 불러오지 못했습니다" }))
      .finally(() => setLoading(false));
  }, [push]);

  const call = useCallback(
    async (init: RequestInit & { url?: string }) => {
      try {
        const r = await fetch(init.url ?? "/api/ideas", init);
        const d = await r.json();
        if (!d?.ok) throw new Error(d?.error ?? "실패");
        setIdeas(d.ideas);
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

  const byStatus = useMemo(() => countByStatus(ideas), [ideas]);
  const byCat = useMemo(() => countByCategory(ideas), [ideas]);
  const shortlist = useMemo(() => ideas.filter((i) => i.status === "shortlist"), [ideas]);
  const doing = useMemo(() => ideas.filter((i) => i.status === "doing"), [ideas]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ideas.filter(
      (i) =>
        (cat === "all" || i.category === cat) &&
        (status === "all" || i.status === status) &&
        (!needle ||
          i.title.toLowerCase().includes(needle) ||
          i.note.toLowerCase().includes(needle))
    );
  }, [ideas, q, cat, status]);

  const sections = useMemo(
    () =>
      CATEGORY_IDS.map((c) => ({
        cat: c,
        items: filtered.filter((i) => i.category === c),
      })).filter((s) => s.items.length > 0),
    [filtered]
  );

  if (loading) {
    return <div className="text-sm text-subtext py-10 text-center">불러오는 중…</div>;
  }

  return (
    <div className="space-y-4">
      <Header total={ideas.length} byCat={byCat} byStatus={byStatus} />

      <SeasonSlots
        shortlist={shortlist}
        doing={doing}
        onOpen={(id) => {
          setOpen(id);
          setQ("");
          setCat("all");
          setStatus("all");
        }}
        onPark={(id) => patch(id, { status: "parked" })}
      />

      <Toolbar
        q={q}
        setQ={setQ}
        cat={cat}
        setCat={setCat}
        status={status}
        setStatus={setStatus}
        byCat={byCat}
        byStatus={byStatus}
        onAdd={(title, category) =>
          call({
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title, category }),
          })
        }
      />

      {sections.length === 0 && (
        <div className="bg-panel border border-line rounded-xl py-16 text-center text-sm text-subtext">
          조건에 맞는 아이디어가 없어요.
        </div>
      )}

      {sections.map(({ cat: c, items }) => (
        <section key={c}>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-3 h-3 rounded-sm" style={{ background: categoryColor(c) }} />
            <h3 className="text-sm font-semibold">
              {categoryMeta(c).emoji} {categoryMeta(c).label}
            </h3>
            <span className="text-xs text-subtext mono">{items.length}</span>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {items.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                expanded={open === idea.id}
                onToggle={() => setOpen(open === idea.id ? null : idea.id)}
                onPatch={(body) => patch(idea.id, body)}
                onDelete={async () => {
                  if (!confirm(`"${idea.title}" 을(를) 지울까요?\n안 하기로 한 거면 [🧊 보류] 를 쓰세요.`))
                    return;
                  await call({ url: `/api/ideas?id=${encodeURIComponent(idea.id)}`, method: "DELETE" });
                  setOpen(null);
                }}
              />
            ))}
          </div>
        </section>
      ))}

      <p className="text-[11px] text-subtext pt-2">
        저장 위치: <span className="mono">config/ideas.json</span> (커밋되므로 기록이 남습니다)
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- 헤더

function Header({
  total,
  byCat,
  byStatus,
}: {
  total: number;
  byCat: Record<CategoryId, number>;
  byStatus: Record<StatusId, number>;
}) {
  const used = CATEGORY_IDS.filter((c) => byCat[c] > 0);
  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold">💡 아이디어 파킹판</h2>
          <p className="text-xs text-subtext mt-0.5">
            떠오르면 여기 적고 덮는다. 꺼내 보는 건 12주 시즌이 끝날 때.
          </p>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-bold mono tabular-nums">{total}</span>
          <span className="text-xs text-subtext">개 파킹됨</span>
        </div>
      </div>

      {/* 카테고리 분포 — 2px 틈으로 경계를 만들어 색 대비에 기대지 않는다 */}
      <div className="flex gap-0.5 h-2.5 rounded-full overflow-hidden bg-panel2">
        {used.map((c) => (
          <div
            key={c}
            title={`${categoryMeta(c).label} ${byCat[c]}개`}
            style={{ flex: byCat[c], background: categoryColor(c) }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5 text-[11px] text-subtext">
        {used.map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: categoryColor(c) }} />
            {categoryMeta(c).label}
            <span className="mono tabular-nums text-text">{byCat[c]}</span>
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {IDEA_STATUSES.map((s) => (
          <div
            key={s.id}
            className="flex-1 min-w-[92px] rounded-lg border border-line bg-panel2 px-3 py-2"
          >
            <div className="text-[11px] text-subtext">
              {s.emoji} {s.label}
            </div>
            <div className="text-lg font-bold mono tabular-nums">{byStatus[s.id] ?? 0}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 시즌 슬롯

function SeasonSlots({
  shortlist,
  doing,
  onOpen,
  onPark,
}: {
  shortlist: Idea[];
  doing: Idea[];
  onOpen: (id: string) => void;
  onPark: (id: string) => void;
}) {
  const over = shortlist.length > SHORTLIST_MAX;
  const slots = Math.max(SHORTLIST_MAX, shortlist.length);

  return (
    <div
      className={
        "rounded-xl border p-4 " +
        (over ? "border-warn/50 bg-warn/5" : "border-accent/40 bg-accent/5")
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold">
          ⭐ 이번 시즌 후보{" "}
          <span className={"mono ml-1 " + (over ? "text-warn" : "text-subtext")}>
            {shortlist.length}/{SHORTLIST_MAX}
          </span>
        </h3>
        {doing.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-subtext">
            🔥 진행중:
            {doing.map((d) => (
              <span key={d.id} className="px-2 py-0.5 rounded-full border border-line bg-panel">
                {d.title}
              </span>
            ))}
          </div>
        )}
      </div>

      {over && (
        <p className="text-xs text-warn mb-3">
          후보가 {SHORTLIST_MAX}개를 넘었어요. 이게 딴 길로 새는 신호입니다 — 하나를 고르고 나머지는 파킹으로
          돌려보내세요.
        </p>
      )}

      <div className="grid sm:grid-cols-3 gap-2.5">
        {Array.from({ length: slots }, (_, i) => {
          const idea = shortlist[i];
          if (!idea) {
            return (
              <div
                key={`empty${i}`}
                className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-subtext"
              >
                빈 슬롯
                <div className="text-[10px] mt-0.5 opacity-70">아래에서 ⭐ 를 눌러 올리세요</div>
              </div>
            );
          }
          return (
            <div
              key={idea.id}
              className="rounded-lg border border-line bg-panel px-3 py-2.5 flex items-start gap-2"
              style={{ borderLeftWidth: 3, borderLeftColor: categoryColor(idea.category) }}
            >
              <button onClick={() => onOpen(idea.id)} className="flex-1 text-left min-w-0">
                <div className="text-sm font-medium truncate">{idea.title}</div>
                <div className="text-[11px] text-subtext mt-0.5">
                  {categoryMeta(idea.category).emoji} {categoryMeta(idea.category).label}
                </div>
              </button>
              <button
                onClick={() => onPark(idea.id)}
                title="파킹으로 되돌리기"
                className="text-subtext hover:text-text text-xs shrink-0"
              >
                ↩
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 툴바

function Toolbar({
  q,
  setQ,
  cat,
  setCat,
  status,
  setStatus,
  byCat,
  byStatus,
  onAdd,
}: {
  q: string;
  setQ: (v: string) => void;
  cat: CategoryId | "all";
  setCat: (v: CategoryId | "all") => void;
  status: StatusId | "all";
  setStatus: (v: StatusId | "all") => void;
  byCat: Record<CategoryId, number>;
  byStatus: Record<StatusId, number>;
  onAdd: (title: string, category: CategoryId) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [newCat, setNewCat] = useState<CategoryId>("content");

  const submit = async () => {
    if (!title.trim()) return;
    if (await onAdd(title.trim(), newCat)) setTitle("");
  };

  return (
    <div className="bg-panel border border-line rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          className="input-base flex-1 min-w-[240px]"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="새로 떠오른 생각을 여기에… (실행하지 말고 일단 적어두기)"
        />
        <select
          className="input-base w-44"
          value={newCat}
          onChange={(e) => setNewCat(e.target.value as CategoryId)}
        >
          {IDEA_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.label}
            </option>
          ))}
        </select>
        <button
          onClick={submit}
          disabled={!title.trim()}
          className="px-4 py-2 rounded-lg bg-accent text-panel text-sm font-medium disabled:opacity-40"
        >
          파킹
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <input
          className="input-base w-44 mr-1"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색"
        />
        <Chip active={cat === "all"} onClick={() => setCat("all")}>
          전체
        </Chip>
        {IDEA_CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            active={cat === c.id}
            color={categoryColor(c.id)}
            onClick={() => setCat(cat === c.id ? "all" : c.id)}
          >
            {c.emoji} {c.label} <span className="mono opacity-60">{byCat[c.id] ?? 0}</span>
          </Chip>
        ))}
        <span className="w-px h-5 bg-line mx-1" />
        <Chip active={status === "all"} onClick={() => setStatus("all")}>
          상태 전체
        </Chip>
        {IDEA_STATUSES.map((s) => (
          <Chip
            key={s.id}
            active={status === s.id}
            onClick={() => setStatus(status === s.id ? "all" : s.id)}
          >
            {s.emoji} {s.label} <span className="mono opacity-60">{byStatus[s.id] ?? 0}</span>
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({
  children,
  active,
  color,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "px-2.5 py-1 rounded-full border text-xs transition flex items-center gap-1.5 " +
        (active
          ? "bg-accent/15 border-accent/50 text-text"
          : "bg-panel2 border-line text-subtext hover:text-text")
      }
    >
      {color && <span className="w-2 h-2 rounded-sm" style={{ background: color }} />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- 카드

function IdeaCard({
  idea,
  expanded,
  onToggle,
  onPatch,
  onDelete,
}: {
  idea: Idea;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (body: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const st = statusMeta(idea.status);
  const dim = idea.status === "icebox" || idea.status === "done";

  return (
    <div
      className={
        "rounded-lg border bg-panel transition " +
        (expanded ? "border-accent/50 shadow-lg" : "border-line hover:border-subtext/40") +
        (dim && !expanded ? " opacity-55" : "")
      }
      style={{ borderLeftWidth: 3, borderLeftColor: categoryColor(idea.category) }}
    >
      <button onClick={onToggle} className="w-full text-left px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className="flex-1 text-sm font-medium leading-snug">{idea.title}</span>
          <span
            className={
              "text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 " +
              (idea.status === "shortlist"
                ? "border-accent/50 bg-accent/10 text-accent"
                : idea.status === "doing"
                  ? "border-good/50 bg-good/10 text-good"
                  : "border-line bg-panel2 text-subtext")
            }
          >
            {st.emoji} {st.label}
          </span>
        </div>
        {idea.note && (
          <p className="text-[11px] text-subtext mt-1 leading-relaxed line-clamp-2">{idea.note}</p>
        )}
      </button>

      {expanded && (
        <div className="border-t border-line px-3 py-2.5 space-y-2.5">
          <textarea
            className="input-base text-xs resize-y min-h-[54px]"
            defaultValue={idea.note}
            placeholder="메모 — 왜 하고 싶은지, 뭐가 걸리는지"
            onBlur={(e) => e.target.value !== idea.note && onPatch({ note: e.target.value })}
          />
          <div className="flex flex-wrap gap-1.5">
            {IDEA_STATUSES.map((s) => (
              <button
                key={s.id}
                onClick={() => onPatch({ status: s.id })}
                title={s.hint}
                className={
                  "px-2 py-1 rounded border text-[11px] transition " +
                  (idea.status === s.id
                    ? "bg-accent/15 border-accent/50 text-text"
                    : "bg-panel2 border-line text-subtext hover:text-text")
                }
              >
                {s.emoji} {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <select
              className="input-base text-xs flex-1"
              value={idea.category}
              onChange={(e) => onPatch({ category: e.target.value })}
            >
              {IDEA_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
            <button
              onClick={onDelete}
              className="px-2 py-1.5 rounded border border-line text-[11px] text-subtext hover:text-bad hover:border-bad/50"
            >
              삭제
            </button>
          </div>
          <div className="text-[10px] text-subtext mono">
            적은 날 {idea.createdAt.slice(0, 10)}
          </div>
        </div>
      )}
    </div>
  );
}
