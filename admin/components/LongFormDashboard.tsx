"use client";

import { useEffect, useState } from "react";
import ProjectSelector from "./ProjectSelector";
import PipelineGrid from "./PipelineGrid";
import QuickActions from "./QuickActions";
import ApiStatusCard from "./ApiStatusCard";
import KpiCard from "./KpiCard";
import LogStream from "./LogStream";
import ThumbnailGallery from "./ThumbnailGallery";
import UploadModal from "./UploadModal";
import NewProjectModal from "./NewProjectModal";
import BriefEditor from "./BriefEditor";
import KeywordsEditor from "./KeywordsEditor";
import BuildVideoButton from "./BuildVideoButton";
import { useToast } from "./Toast";

interface Summary {
  slug: string;
  hasBrief: boolean;
  stages: Record<string, "done" | "in_progress" | "pending" | "missing_inputs">;
  lastModified: number;
}

export default function LongFormDashboard() {
  const [slug, setSlug] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [thumbKey, setThumbKey] = useState(0);

  const [openUpload, setOpenUpload] = useState(false);
  const [openNew, setOpenNew] = useState(false);
  const [openBrief, setOpenBrief] = useState(false);
  const [openKeywords, setOpenKeywords] = useState(false);

  const { push } = useToast();

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    async function tick() {
      try {
        const r = await fetch(`/api/projects/${encodeURIComponent(slug as string)}/status`, { cache: "no-store" });
        const j = await r.json();
        if (alive) setSummary(j);
      } catch {}
    }
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [slug, refreshKey]);

  async function runSingle(stage: string) {
    if (!slug) return;
    const r = await fetch(`/api/projects/${encodeURIComponent(slug)}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    const j = await r.json();
    if (!j.ok) push({ kind: "error", title: "실행 실패", message: j.error });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <ProjectSelector
          value={slug}
          onChange={setSlug}
          onCreate={() => setOpenNew(true)}
          refreshKey={refreshKey}
        />
        <div className="text-xs text-subtext">
          {slug ? <span className="mono">📂 projects/{slug}</span> : "프로젝트를 선택하세요"}
        </div>
      </div>

      {!slug ? (
        <EmptyState onCreate={() => setOpenNew(true)} />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-panel border border-line rounded-xl p-4">
                <PipelineGrid
                  slug={slug}
                  stages={summary?.stages ?? ({} as any)}
                  onRunSingle={runSingle}
                  onUploadClick={() => setOpenUpload(true)}
                />
              </div>

              <div className="bg-panel border border-line rounded-xl p-4">
                <QuickActions
                  slug={slug}
                  onOpenBrief={() => setOpenBrief(true)}
                  onOpenUpload={() => setOpenUpload(true)}
                  onOpenThumbnails={() => setThumbKey((k) => k + 1)}
                  onOpenKeywords={() => setOpenKeywords(true)}
                />
              </div>

              <BuildVideoButton slug={slug} />

              <ThumbnailGallery slug={slug} refreshKey={thumbKey} />
              <LogStream slug={slug} />
            </div>

            <div className="space-y-6">
              <ApiStatusCard />
              <KpiCard />
              <UploadScheduleHint />
            </div>
          </div>
        </>
      )}

      <UploadModal open={openUpload} onClose={() => setOpenUpload(false)} slug={slug ?? ""} />
      <NewProjectModal
        open={openNew}
        onClose={() => setOpenNew(false)}
        onCreated={(s) => {
          setSlug(s);
          setRefreshKey((k) => k + 1);
        }}
      />
      <BriefEditor open={openBrief} onClose={() => setOpenBrief(false)} slug={slug ?? ""} />
      <KeywordsEditor open={openKeywords} onClose={() => setOpenKeywords(false)} />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="bg-panel border border-line rounded-xl p-10 text-center">
      <h2 className="text-lg font-semibold mb-2">아직 프로젝트가 없어요</h2>
      <p className="text-sm text-subtext mb-4">
        <code className="mono">projects/_example</code> 를 복사해서 첫 영상을 만들어보세요.
      </p>
      <button onClick={onCreate} className="bg-accent text-bg font-semibold rounded-lg px-4 py-2">
        + 새 프로젝트 만들기
      </button>
    </div>
  );
}

function UploadScheduleHint() {
  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <h2 className="text-base font-semibold mb-2">업로드 주기 가이드</h2>
      <ul className="text-xs text-subtext space-y-1.5 list-disc pl-4">
        <li>초기 8주: <span className="text-text">주 1편 (같은 요일·같은 시간)</span></li>
        <li>안정 후: 평일 1편 + 주말 1편 (주 2편)</li>
        <li>API 자체 한도는 일 1편도 여유. 알고리즘은 일관성 우선.</li>
        <li>5번 봇 완료 → CapCut 검수 후 6번 진행 (휴먼 게이트)</li>
      </ul>
    </div>
  );
}
