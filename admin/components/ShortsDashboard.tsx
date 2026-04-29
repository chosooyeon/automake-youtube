"use client";

import { useEffect, useState } from "react";
import { useToast } from "./Toast";

type ShortsStageId = "S1-script" | "S2-audio" | "S3-edit" | "S4-upload";

const SHORTS_STAGES: ShortsStageId[] = ["S1-script", "S2-audio", "S3-edit", "S4-upload"];

const SHORTS_STAGE_LABELS: Record<ShortsStageId, string> = {
  "S1-script": "숏폼 대본",
  "S2-audio": "음성/자막",
  "S3-edit": "9:16 편집",
  "S4-upload": "업로드 준비",
};

interface ShortsProject {
  slug: string;
  parentSlug: string;
  createdAt?: string;
  stages: Record<ShortsStageId, "done" | "in_progress" | "pending">;
}

export default function ShortsDashboard() {
  const [projects, setProjects] = useState<ShortsProject[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const { push } = useToast();

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/shorts", { cache: "no-store" });
      const j = await r.json();
      const list: ShortsProject[] = j.projects || [];
      setProjects(list);
      if (list.length > 0 && (!selected || !list.find((p) => p.slug === selected))) {
        setSelected(list[0].slug);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, []);

  const current = projects.find((p) => p.slug === selected);

  return (
    <div className="space-y-6">
      <div className="bg-panel border border-line rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-subtext uppercase tracking-widest mb-1">숏폼 파이프라인</div>
            <h2 className="text-xl font-bold">📱 YouTube Shorts</h2>
            <p className="text-sm text-subtext mt-2">
              롱폼 영상 기반으로 30~59초 숏폼을 자동 제작합니다. 새 이미지/영상은 만들지 않고 기존 자산을 재활용합니다.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-accent text-bg font-semibold rounded-lg px-4 py-2.5 text-sm hover:opacity-90 shrink-0"
          >
            + 숏폼 만들기
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="bg-panel border border-line rounded-xl p-10 text-center text-sm text-subtext">
          아직 숏폼 프로젝트가 없어요.{" "}
          <button className="text-text underline" onClick={() => setShowCreate(true)}>
            새로 만들기
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-xs text-subtext shrink-0">프로젝트</label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="bg-panel border border-line rounded-md px-3 py-1.5 text-sm flex-1 max-w-xs"
            >
              {projects.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.slug}
                </option>
              ))}
            </select>
            <button onClick={refresh} disabled={loading} className="text-xs text-subtext hover:text-text">
              {loading ? "…" : "↻"}
            </button>
          </div>

          {current && <ShortsProjectView project={current} onRefresh={refresh} />}
        </div>
      )}

      {showCreate && (
        <CreateShortsModal
          onClose={() => setShowCreate(false)}
          onCreated={(slug) => {
            push({ kind: "success", title: "숏폼 프로젝트 생성됨", message: slug });
            setShowCreate(false);
            refresh();
            setSelected(slug);
          }}
        />
      )}
    </div>
  );
}

function ShortsProjectView({ project, onRefresh }: { project: ShortsProject; onRefresh: () => void }) {
  const [runningStage, setRunningStage] = useState<ShortsStageId | null>(null);
  const [logStage, setLogStage] = useState<ShortsStageId | null>(null);
  const [logs, setLogs] = useState("");
  const { push } = useToast();

  useEffect(() => {
    if (!logStage) return;
    let alive = true;
    let timer: NodeJS.Timeout;
    async function tick() {
      try {
        const r = await fetch(`/api/shorts/${encodeURIComponent(project.slug)}/logs?stage=${logStage}`, { cache: "no-store" });
        const j = await r.json();
        if (alive) setLogs(j.logs || "");
      } catch {}
      if (alive) timer = setTimeout(tick, 2500);
    }
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [logStage, project.slug]);

  async function runStage(stage: ShortsStageId) {
    setRunningStage(stage);
    setLogStage(stage);
    setLogs("");
    try {
      const r = await fetch(`/api/shorts/${encodeURIComponent(project.slug)}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const j = await r.json();
      if (!j.ok) {
        push({ kind: "error", title: `${stage} 실행 실패`, message: j.error });
      } else {
        push({ kind: "info", title: `${stage} 실행 시작됨`, message: "로그를 확인하세요." });
      }
    } finally {
      setRunningStage(null);
      setTimeout(onRefresh, 3000);
    }
  }

  const STATUS_COLORS: Record<string, string> = {
    done: "text-good border-good/40 bg-good/10",
    in_progress: "text-warn border-warn/40 bg-warn/10",
    pending: "text-subtext border-line bg-panel",
  };

  const STATUS_LABELS: Record<string, string> = {
    done: "완료",
    in_progress: "실행중",
    pending: "대기",
  };

  return (
    <div className="space-y-4">
      <div className="bg-panel border border-line rounded-xl p-4 text-sm">
        <div className="text-subtext text-xs mb-1">부모 롱폼</div>
        <div className="font-mono text-accent">projects/{project.parentSlug}/</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {SHORTS_STAGES.map((stage) => {
          const status = project.stages[stage] || "pending";
          const isRunning = runningStage === stage;
          const prevDone = stage === "S1-script" || project.stages[SHORTS_STAGES[SHORTS_STAGES.indexOf(stage) - 1]] === "done";
          return (
            <div
              key={stage}
              className={`rounded-xl border p-4 flex flex-col gap-2 ${STATUS_COLORS[status]}`}
            >
              <div className="flex items-center justify-between">
                <div className="text-xs font-mono opacity-60">{stage}</div>
                <div className={`text-[10px] border rounded px-1.5 py-0.5 ${STATUS_COLORS[status]}`}>
                  {STATUS_LABELS[status]}
                </div>
              </div>
              <div className="text-sm font-semibold">{SHORTS_STAGE_LABELS[stage]}</div>
              <div className="flex gap-1 mt-auto flex-wrap">
                <button
                  onClick={() => runStage(stage)}
                  disabled={isRunning || !prevDone}
                  className="text-xs bg-accent text-bg font-semibold rounded px-2 py-1 disabled:opacity-40"
                >
                  {isRunning ? "실행중…" : status === "done" ? "재실행" : "실행"}
                </button>
                {status !== "pending" && (
                  <button
                    onClick={() => setLogStage(logStage === stage ? null : stage)}
                    className="text-xs border border-line rounded px-2 py-1 text-subtext hover:text-text"
                  >
                    로그
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {logStage && (
        <div className="bg-panel border border-line rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">📜 로그 — {logStage}</h3>
            <button onClick={() => setLogStage(null)} className="text-xs text-subtext hover:text-text">닫기</button>
          </div>
          <pre className="mono text-[11px] leading-snug bg-bg border border-line rounded-md p-3 h-56 overflow-auto whitespace-pre-wrap">
            {logs || "(로그 대기 중…)"}
          </pre>
        </div>
      )}

      {project.stages["S4-upload"] === "done" && (
        <div className="bg-panel border border-line rounded-xl p-4 text-sm space-y-2">
          <div className="font-semibold">📤 업로드 준비</div>
          <ul className="text-xs space-y-1 text-subtext">
            <li>1. S3-edit/capcut_short.json → CapCut 임포트 → 익스포트 → <code className="mono">S4-upload/final_short.mp4</code></li>
            <li>2. 썸네일 직접 제작 → <code className="mono">S4-upload/thumbnail.jpg</code></li>
            <li>3. <code className="mono">S4-upload/upload_metadata.json</code> 확인 후 YouTube에 수동 업로드</li>
          </ul>
          <div className="text-[11px] text-warn border border-warn/30 rounded px-2 py-1 bg-warn/5">
            숏폼은 아직 admin에서 자동 업로드를 지원하지 않습니다. YouTube Studio에서 직접 업로드해주세요.
          </div>
        </div>
      )}
    </div>
  );
}

function CreateShortsModal({ onClose, onCreated }: { onClose: () => void; onCreated: (slug: string) => void }) {
  const [longformSlugs, setLongformSlugs] = useState<string[]>([]);
  const [parentSlug, setParentSlug] = useState("");
  const [slugOverride, setSlugOverride] = useState("");
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    fetch("/api/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const slugs: string[] = (j.projects || [])
          .map((p: any) => p.slug as string)
          .filter((s: string) => !s.startsWith("_") && !s.endsWith("-short") && !s.includes("-short-"));
        setLongformSlugs(slugs);
        if (slugs.length > 0) setParentSlug(slugs[0]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (parentSlug) setSlugOverride(`${parentSlug}-short`);
  }, [parentSlug]);

  async function create() {
    if (!parentSlug) { push({ kind: "error", title: "부모 프로젝트를 선택해주세요." }); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/shorts/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentSlug, slugOverride: slugOverride.trim() || undefined }),
      });
      const j = await r.json();
      if (!j.ok) {
        push({ kind: "error", title: "생성 실패", message: j.error });
      } else {
        onCreated(j.slug);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-panel border border-line rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">📱 새 숏폼 프로젝트</h2>
          <button onClick={onClose} className="text-subtext hover:text-text">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-subtext block mb-1">기반 롱폼 프로젝트 *</label>
            {longformSlugs.length > 0 ? (
              <select
                value={parentSlug}
                onChange={(e) => setParentSlug(e.target.value)}
                className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm"
              >
                {longformSlugs.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : (
              <input
                value={parentSlug}
                onChange={(e) => setParentSlug(e.target.value)}
                placeholder="롱폼 프로젝트 슬러그"
                className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm"
              />
            )}
          </div>

          <div>
            <label className="text-xs text-subtext block mb-1">숏폼 슬러그 (수정 가능)</label>
            <input
              value={slugOverride}
              onChange={(e) => setSlugOverride(e.target.value.toLowerCase())}
              className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm mono"
            />
            <div className="text-[10px] text-subtext mt-0.5">→ projects/{slugOverride || `${parentSlug}-short`}/</div>
          </div>

          <div className="text-xs text-subtext bg-bg border border-line rounded-md px-3 py-2">
            📋 롱폼의 03-script, 05-visual 이미지를 재사용합니다.<br />
            새 이미지 생성 없이 9:16으로 편집합니다.
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="text-sm rounded-md border border-line bg-panel2 px-3 py-2">취소</button>
          <button
            onClick={create}
            disabled={busy || !parentSlug}
            className="text-sm rounded-md bg-accent text-bg font-semibold px-4 py-2 disabled:opacity-50"
          >
            {busy ? "만드는중…" : "만들기"}
          </button>
        </div>
      </div>
    </div>
  );
}
