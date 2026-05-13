"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "./Toast";

interface Props {
  slug: string;
}

type State = "idle" | "running" | "concatenating" | "done" | "error";

interface Status {
  state: State;
  current?: number;
  total?: number;
  finalMp4?: string;
  titledMp4?: string | null;
  duration_sec?: number;
  built_at?: string;
  lastLogLine?: string;
  error?: string;
}

export default function BuildVideoButton({ slug }: Props) {
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [busy, setBusy] = useState(false);
  const tickRef = useRef<number | null>(null);
  const { push } = useToast();

  async function fetchStatus() {
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(slug)}/build-status`, {
        cache: "no-store",
      });
      const j = (await r.json()) as Status;
      setStatus(j);
    } catch {}
  }

  useEffect(() => {
    if (!slug) return;
    fetchStatus();
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(fetchStatus, 3000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function startBuild(opts: { forceAudio?: boolean } = {}) {
    if (!slug) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(slug)}/build-video`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(opts),
      });
      const j = await r.json();
      if (!j.ok) {
        push({ kind: "error", title: "빌드 시작 실패", message: j.error });
      } else {
        push({ kind: "success", title: "🎬 빌드 시작됨", message: "이미지·음성 생성 중..." });
        setStatus({ state: "running", current: 0, total: 0 });
        fetchStatus();
      }
    } finally {
      setBusy(false);
    }
  }

  async function openFolder() {
    await fetch(`/api/projects/${encodeURIComponent(slug)}/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "edit" }),
    });
  }

  const isRunning = status.state === "running" || status.state === "concatenating";
  const pct =
    status.total && status.current != null ? Math.round((status.current / status.total) * 100) : 0;

  return (
    <div className="bg-panel border border-line rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold">🎬 영상 빌드 (이미지 + 음성 + 합성)</h3>
          <p className="text-xs text-subtext mt-1">
            03-script + 05-visual 을 읽어 Pollinations 이미지 + Edge TTS + ffmpeg 로{" "}
            <span className="mono">final.mp4</span> 자동 생성.
          </p>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={() => startBuild()}
            disabled={busy || isRunning}
            className="bg-accent text-bg font-semibold rounded-lg px-4 py-2 text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isRunning ? "빌드 중..." : status.state === "done" ? "🔁 다시 빌드" : "▶ 빌드 시작"}
          </button>
          {status.state === "done" && (
            <button
              onClick={() => startBuild({ forceAudio: true })}
              disabled={busy}
              className="text-[10px] text-subtext hover:text-text border border-line rounded px-2 py-1"
              title="대본 수정 후 음성만 다시 생성"
            >
              🔊 음성만 재생성
            </button>
          )}
        </div>
      </div>

      {isRunning && (
        <div className="text-xs text-subtext space-y-2">
          {status.state === "concatenating" ? (
            <div className="flex items-center gap-2">
              <span className="animate-pulse">⚙</span>
              <span>클립 합치는 중 (ffmpeg concat)…</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span>
                  씬 <span className="text-text font-semibold">{status.current ?? 0}</span> /{" "}
                  {status.total ?? "?"} 처리 중
                </span>
                <span className="mono">{pct}%</span>
              </div>
              <div className="w-full bg-panel2 rounded h-1.5 overflow-hidden">
                <div
                  className="bg-accent h-full rounded transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </>
          )}
          {status.lastLogLine && (
            <div className="mono text-[10px] opacity-60 truncate" title={status.lastLogLine}>
              {status.lastLogLine}
            </div>
          )}
        </div>
      )}

      {status.state === "done" && (
        <div className="text-xs bg-good/10 border border-good/40 rounded-md p-3 space-y-2">
          <div className="text-good font-semibold">✅ 완성</div>
          {status.titledMp4 && (
            <div className="mono text-text break-all leading-snug">
              📹 {status.titledMp4.replace(/^06-edit-upload\//, "")}
            </div>
          )}
          <div className="flex items-center gap-3 text-subtext">
            {status.duration_sec != null && (
              <span>⏱ {Math.floor(status.duration_sec / 60)}분 {Math.round(status.duration_sec % 60)}초</span>
            )}
            {status.built_at && (
              <span className="opacity-60">{new Date(status.built_at).toLocaleString("ko-KR")}</span>
            )}
          </div>
          <button
            onClick={openFolder}
            className="text-xs bg-panel2 border border-line rounded px-2 py-1 hover:border-accent"
          >
            📂 06-edit-upload 폴더 열기
          </button>
        </div>
      )}

      {status.state === "error" && (
        <div className="text-xs bg-bad/10 border border-bad/40 rounded-md p-3 space-y-1">
          <div className="text-bad font-semibold">❌ 실패</div>
          <div className="opacity-80">{status.error}</div>
          {status.current != null && status.total ? (
            <div className="opacity-60">
              마지막: 씬 {status.current}/{status.total}
            </div>
          ) : null}
        </div>
      )}

      {status.state === "idle" && (
        <div className="text-[11px] text-subtext">
          아직 빌드된 적 없는 프로젝트. <span className="mono">03-script/output.json</span> 이 준비되어 있으면 바로 시작 가능.
        </div>
      )}
    </div>
  );
}
