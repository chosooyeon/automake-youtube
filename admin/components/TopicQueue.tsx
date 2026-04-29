"use client";

import { useEffect, useState } from "react";
import { useToast } from "./Toast";

interface Candidate {
  topic_oneliner: string;
  why_now?: string;
  audience?: string;
  promise?: string;
  must_cover?: string[];
  primary_sources?: string[];
  deadline?: { type?: string; date?: string };
  season_tag?: string;
  fitness_score?: number;
  estimated_video_length_sec?: number;
  slug_suggestion: string;
  title_seed?: string;
}

interface QueueEntry {
  id: string;
  generatedAt: string;
  candidates: Candidate[];
  interpretation?: string;
}

interface ArchiveEntry {
  id: string;
  topic: string;
  slug: string;
  movedAt?: string;
}

export default function TopicQueue() {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [archive, setArchive] = useState<ArchiveEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [logs, setLogs] = useState("");
  const [promoteFor, setPromoteFor] = useState<{
    queueId: string;
    candidateIndex: number;
    candidate: Candidate;
  } | null>(null);
  const { push } = useToast();

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/topics", { cache: "no-store" });
      const j = await r.json();
      setQueue(j.queue || []);
      setArchive(j.archive || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, []);

  // 라이브 로그 폴링 (실행 중일 때만)
  useEffect(() => {
    if (!runId) return;
    let alive = true;
    let timer: NodeJS.Timeout;
    async function tick() {
      try {
        const r = await fetch(`/api/topics/${encodeURIComponent(runId as string)}/log`, { cache: "no-store" });
        const j = await r.json();
        if (alive) setLogs(j.logs || "");
      } catch {}
      if (alive) timer = setTimeout(tick, 2000);
    }
    tick();
    return () => {
      alive = false;
      clearTimeout(timer!);
    };
  }, [runId]);

  async function runNew() {
    setRunning(true);
    try {
      const r = await fetch("/api/topics/run", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = await r.json();
      if (!j.ok) {
        push({ kind: "error", title: "주제 봇 실행 실패", message: j.error });
      } else {
        push({ kind: "info", title: "주제 봇 백그라운드 실행", message: `로그 ID: ${j.started}` });
        setRunId(j.started);
        setTimeout(refresh, 4000);
      }
    } finally {
      setRunning(false);
    }
  }

  async function deleteQueue(id: string) {
    if (!confirm(`정말로 큐 \"${id}\" 를 삭제할까요? (archive 로 이동되지 않음)`)) return;
    const r = await fetch(`/api/topics/${encodeURIComponent(id)}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) {
      push({ kind: "success", title: "큐 삭제됨" });
      refresh();
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-panel border border-line rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-subtext uppercase tracking-widest mb-1">주제 큐 · 0번 봇</div>
            <h2 className="text-xl font-bold">💡 다음 영상 주제 추천</h2>
            <p className="text-sm text-subtext mt-2">
              파이프라인과 분리. 이 봇만 따로 계속 돌려서 후보를 쌓아두고, 마음에 드는 1개를 골라 자동으로 프로젝트로 만들 수 있어요.
            </p>
          </div>
          <button
            onClick={runNew}
            disabled={running}
            className="bg-accent text-bg font-semibold rounded-lg px-4 py-2.5 text-sm hover:opacity-90 disabled:opacity-50"
          >
            {running ? "실행 중…" : "🔄 새로 5개 뽑기"}
          </button>
        </div>
      </div>

      {/* 라이브 로그 (실행 직후만 보여짐) */}
      {runId && (
        <div className="bg-panel border border-line rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">📜 실행 로그 — {runId}</h3>
            <button onClick={() => setRunId(null)} className="text-xs text-subtext hover:text-text">
              닫기
            </button>
          </div>
          <pre className="mono text-[11px] leading-snug bg-bg border border-line rounded-md p-3 h-48 overflow-auto whitespace-pre-wrap">
            {logs || "(로그 대기 중…)"}
          </pre>
        </div>
      )}

      {/* 후보 카드 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold">큐에 있는 후보 ({queue.reduce((n, q) => n + q.candidates.length, 0)})</h3>
          <button onClick={refresh} disabled={loading} className="text-xs text-subtext hover:text-text">
            {loading ? "새로고침…" : "↻ 새로고침"}
          </button>
        </div>
        {queue.length === 0 ? (
          <div className="bg-panel border border-line rounded-xl p-10 text-center text-sm text-subtext">
            아직 후보가 없어요. 위의 <span className="text-text">🔄 새로 5개 뽑기</span> 버튼을 눌러주세요.
          </div>
        ) : (
          <div className="space-y-6">
            {queue.map((q) => (
              <div key={q.id} className="bg-panel border border-line rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-xs text-subtext mono">{q.id}</div>
                    <div className="text-[11px] text-subtext">생성: {q.generatedAt}</div>
                  </div>
                  <button onClick={() => deleteQueue(q.id)} className="text-xs text-bad hover:opacity-80">
                    삭제
                  </button>
                </div>
                {q.interpretation && (
                  <div className="text-xs text-subtext italic mb-3 border-l-2 border-line pl-2">
                    💬 {q.interpretation}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {q.candidates.map((c, i) => (
                    <CandidateCard
                      key={i}
                      c={c}
                      onPromote={() => setPromoteFor({ queueId: q.id, candidateIndex: i, candidate: c })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Archive */}
      <div className="bg-panel border border-line rounded-xl p-4">
        <h3 className="text-base font-semibold mb-2">📦 Archive (이미 프로젝트로 만든 주제, 중복 회피용)</h3>
        {archive.length === 0 ? (
          <div className="text-xs text-subtext">아직 archive 항목이 없어요.</div>
        ) : (
          <ul className="text-xs space-y-1">
            {archive.slice(0, 30).map((a) => (
              <li key={a.id} className="flex justify-between border-b border-line/60 py-1">
                <span className="truncate">{a.topic}</span>
                <span className="mono text-subtext shrink-0">→ {a.slug}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {promoteFor && (
        <PromoteModal
          info={promoteFor}
          onClose={() => setPromoteFor(null)}
          onDone={(slug) => {
            push({ kind: "success", title: "프로젝트 생성됨", message: `슬러그: ${slug} (롱폼 탭에서 작업 시작)` });
            setPromoteFor(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function CandidateCard({ c, onPromote }: { c: Candidate; onPromote: () => void }) {
  const score = c.fitness_score;
  return (
    <div className="bg-bg border border-line rounded-lg p-3 flex flex-col justify-between h-full hover:border-accent transition">
      <div>
        <div className="text-sm font-semibold mb-1">{c.topic_oneliner}</div>
        <div className="text-[11px] text-subtext mono mb-2">{c.slug_suggestion}</div>
        {c.why_now && <div className="text-[11px] text-warn mb-2">⏰ {c.why_now}</div>}
        {c.audience && <Field label="타깃" value={c.audience} />}
        {c.promise && <Field label="약속" value={c.promise} />}
        {c.must_cover && c.must_cover.length > 0 && (
          <div className="mt-1.5">
            <div className="text-[10px] uppercase tracking-wider text-subtext">다룰 포인트</div>
            <ul className="text-[11px] list-disc pl-4 space-y-0.5">
              {c.must_cover.slice(0, 3).map((m, i) => (
                <li key={i}>{m}</li>
              ))}
              {c.must_cover.length > 3 && <li className="text-subtext">+ {c.must_cover.length - 3}개</li>}
            </ul>
          </div>
        )}
        {c.deadline?.date && (
          <div className="text-[11px] text-bad mt-2">📅 {c.deadline.type ?? "deadline"}: {c.deadline.date}</div>
        )}
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-line/60">
        {score != null ? (
          <div className="text-xs">
            <span className="text-subtext">적합도</span>{" "}
            <span className="font-bold text-accent">{score.toFixed(1)}</span>
            <span className="text-subtext">/10</span>
          </div>
        ) : <span />}
        <button
          onClick={onPromote}
          className="text-xs bg-accent text-bg font-semibold rounded-md px-2.5 py-1.5"
        >
          이걸로 프로젝트 만들기
        </button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-[11px] mt-1">
      <span className="text-subtext">{label}:</span> {value}
    </div>
  );
}

function PromoteModal({
  info,
  onClose,
  onDone,
}: {
  info: { queueId: string; candidateIndex: number; candidate: Candidate };
  onClose: () => void;
  onDone: (slug: string) => void;
}) {
  const [slug, setSlug] = useState(info.candidate.slug_suggestion ?? "");
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  async function go() {
    if (!/^[a-z0-9][a-z0-9-_]{1,60}$/i.test(slug)) {
      push({ kind: "error", title: "잘못된 슬러그", message: "영문/숫자/-/_ 만, 2~61자" });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/topics/${encodeURIComponent(info.queueId)}/promote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateIndex: info.candidateIndex, slugOverride: slug }),
      });
      const j = await r.json();
      if (!j.ok) push({ kind: "error", title: "프로젝트 생성 실패", message: j.error });
      else onDone(j.slug);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-panel border border-line rounded-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">📁 새 프로젝트로 만들기</h2>
          <button onClick={onClose} className="text-subtext hover:text-text">✕</button>
        </div>
        <div className="text-sm text-subtext mb-3">
          <div className="font-semibold text-text">{info.candidate.topic_oneliner}</div>
          {info.candidate.why_now && <div className="text-xs text-warn mt-1">⏰ {info.candidate.why_now}</div>}
        </div>

        <label className="text-xs text-subtext block mb-1">슬러그 (수정 가능)</label>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm mb-3 mono"
        />
        <div className="text-[11px] text-subtext mb-4">
          → <code className="mono">projects/{slug}/</code> 폴더가 만들어지고, 자동으로 brief.md 가 채워집니다.<br />
          → 큐에서 archive 로 이동되어 다시 추천되지 않아요.
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm rounded-md border border-line bg-panel2 px-3 py-2">취소</button>
          <button
            onClick={go}
            disabled={busy}
            className="text-sm rounded-md bg-accent text-bg font-semibold px-3 py-2 disabled:opacity-50"
          >
            {busy ? "만드는중…" : "프로젝트 만들기"}
          </button>
        </div>
      </div>
    </div>
  );
}
