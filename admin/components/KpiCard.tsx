"use client";

import { useEffect, useState } from "react";

interface Kpi {
  ok: boolean;
  reason?: string;
  channelTitle?: string;
  subs?: number;
  totalViews?: number;
  videosCount?: number;
  last7dUploads?: number;
  recent?: { id: string; title: string; publishedAt: string; views?: number }[];
}

export default function KpiCard() {
  const [kpi, setKpi] = useState<Kpi | null>(null);
  useEffect(() => {
    fetch("/api/system/kpi", { cache: "no-store" })
      .then((r) => r.json())
      .then(setKpi)
      .catch(() => setKpi({ ok: false, reason: "fetch failed" }));
  }, []);

  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <h2 className="text-base font-semibold mb-3">채널 KPI</h2>
      {kpi == null && <div className="text-xs text-subtext">로딩중…</div>}
      {kpi && !kpi.ok && (
        <div className="text-xs text-subtext">
          연결 안 됨: <span className="text-bad">{kpi.reason}</span>
          <div className="mt-1">YouTube OAuth 토큰을 한 번 만들면 표시됩니다.</div>
        </div>
      )}
      {kpi?.ok && (
        <>
          <div className="text-sm text-subtext">{kpi.channelTitle}</div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <Stat label="구독자" value={kpi.subs} />
            <Stat label="총 조회수" value={kpi.totalViews} />
            <Stat label="영상 수" value={kpi.videosCount} />
            <Stat label="최근 7일 업로드" value={kpi.last7dUploads} accent />
          </div>
          {kpi.recent && kpi.recent.length > 0 && (
            <div className="mt-4">
              <div className="text-xs text-subtext mb-1">최근 업로드</div>
              <ul className="text-xs space-y-1 max-h-40 overflow-auto pr-1">
                {kpi.recent.slice(0, 5).map((v) => (
                  <li key={v.id} className="flex justify-between gap-2 border-b border-line/60 py-1">
                    <a
                      className="truncate hover:text-accent"
                      href={`https://youtu.be/${v.id}`}
                      target="_blank"
                    >
                      {v.title}
                    </a>
                    <span className="mono text-subtext shrink-0">
                      {v.views?.toLocaleString() ?? "-"} · {v.publishedAt.slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value?: number; accent?: boolean }) {
  return (
    <div className={"rounded-md border border-line p-2 " + (accent ? "bg-accent/15" : "bg-panel2")}>
      <div className="text-[11px] text-subtext">{label}</div>
      <div className="text-lg font-bold mono">{value?.toLocaleString() ?? "-"}</div>
    </div>
  );
}
