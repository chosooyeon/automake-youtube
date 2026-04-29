"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  slug: string;
  stage?: string;
}

export default function LogStream({ slug, stage }: Props) {
  const [logs, setLogs] = useState("");
  const [auto, setAuto] = useState(true);
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let alive = true;
    let timer: NodeJS.Timeout;
    async function tick() {
      try {
        const url = `/api/projects/${encodeURIComponent(slug)}/logs${stage ? `?stage=${stage}` : ""}`;
        const r = await fetch(url, { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        setLogs(j.logs || "");
        if (auto && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
      } catch {}
      if (alive) timer = setTimeout(tick, 2000);
    }
    tick();
    return () => {
      alive = false;
      clearTimeout(timer!);
    };
  }, [slug, stage, auto]);

  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold">실행 로그 (라이브)</h2>
        <label className="text-xs text-subtext flex items-center gap-1">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          자동 스크롤
        </label>
      </div>
      <pre
        ref={ref}
        className="mono text-[11px] leading-snug bg-bg border border-line rounded-md p-3 h-72 overflow-auto whitespace-pre-wrap"
      >
        {logs || "(아직 실행한 봇이 없거나 로그가 비어있어요)"}
      </pre>
    </div>
  );
}
