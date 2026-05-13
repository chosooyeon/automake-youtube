"use client";

import { useEffect, useState } from "react";
import { useToast } from "./Toast";

type MarketId = "kakao" | "ogq" | "line";

interface MarketInfo {
  id: MarketId;
  label: string;
  count: number;
  size: string;
  difficulty: string;
  hint?: string;
}

const MARKETS: MarketInfo[] = [
  {
    id: "ogq",
    label: "네이버 OGQ 마켓",
    count: 24,
    size: "740×640",
    difficulty: "보통",
    hint: "본인 블로그와 시너지 큼. 첫 도전 추천.",
  },
  {
    id: "kakao",
    label: "카카오 이모티콘",
    count: 32,
    size: "360×360",
    difficulty: "매우 어려움 (통과율 1~2%)",
  },
  {
    id: "line",
    label: "라인 크리에이터스",
    count: 40,
    size: "370×320",
    difficulty: "보통 (글로벌)",
  },
];

interface Expression {
  index: number;
  label: string;
  prompt: string;
}
interface Generated {
  index: number;
  expression: string;
  file: string;
  createdAt: string;
}
interface Project {
  id: string;
  market: MarketId;
  concept: string;
  references: string[];
  expressions: Expression[];
  generated: Generated[];
  createdAt: string;
  updatedAt: string;
}

export default function EmoticonStudio() {
  const { push } = useToast();
  const [market, setMarket] = useState<MarketId>("ogq");
  const [concept, setConcept] = useState("");
  const [refFiles, setRefFiles] = useState<File[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [busyCreate, setBusyCreate] = useState(false);

  // 표현 리스트
  const [busyExpr, setBusyExpr] = useState(false);

  // 시안
  const [busyConcept, setBusyConcept] = useState(false);
  const [conceptPreview, setConceptPreview] = useState<string | null>(null);

  // 생성 진행 상태 (index → loading/done)
  const [genBusy, setGenBusy] = useState<Set<number>>(new Set());

  // 일괄 생성
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchPlanned, setBatchPlanned] = useState(0);
  const [batchDone, setBatchDone] = useState(0);
  const [batchFailed, setBatchFailed] = useState(0);
  const [batchMsg, setBatchMsg] = useState<string>("");
  const [batchAbort, setBatchAbort] = useState<AbortController | null>(null);

  // 기존 프로젝트 목록
  const [recent, setRecent] = useState<Project[]>([]);

  useEffect(() => {
    fetch("/api/emoticon/projects")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setRecent(j.items as Project[]);
      })
      .catch(() => {});
  }, [project?.updatedAt]);

  const marketInfo = MARKETS.find((m) => m.id === market)!;

  async function loadProject(id: string) {
    const r = await fetch(`/api/emoticon/projects/${id}`);
    const j = await r.json();
    if (j.ok) setProject(j.project as Project);
  }

  async function onCreateProject() {
    if (concept.trim().length < 5) {
      push({ kind: "warn", title: "캐릭터 컨셉을 5자 이상 입력하세요" });
      return;
    }
    setBusyCreate(true);
    try {
      const fd = new FormData();
      fd.set("market", market);
      fd.set("concept", concept.trim());
      for (const f of refFiles) fd.append("references", f);
      const r = await fetch("/api/emoticon/projects", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        push({ kind: "error", title: "프로젝트 생성 실패", message: j.message || j.error });
        return;
      }
      setProject(j.project as Project);
      setRefFiles([]);
      push({ kind: "success", title: "프로젝트 생성됨" });
    } catch (e: any) {
      push({ kind: "error", title: "요청 오류", message: e?.message || String(e) });
    } finally {
      setBusyCreate(false);
    }
  }

  async function onGenerateExpressions() {
    if (!project) return;
    setBusyExpr(true);
    try {
      const r = await fetch("/api/emoticon/expressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market: project.market,
          concept: project.concept,
          keep: project.expressions.map((e) => e.label).filter(Boolean),
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        push({ kind: "error", title: "표현 리스트 실패", message: j.message || j.error });
        return;
      }
      const r2 = await fetch("/api/emoticon/projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: project.id, expressions: j.expressions }),
      });
      const j2 = await r2.json();
      if (j2.ok) setProject(j2.project as Project);
      push({ kind: "success", title: `표현 ${j.expressions.length}개 생성됨` });
    } catch (e: any) {
      push({ kind: "error", title: "요청 오류", message: e?.message || String(e) });
    } finally {
      setBusyExpr(false);
    }
  }

  async function onGenerateConcept() {
    if (!project) return;
    setBusyConcept(true);
    setConceptPreview(null);
    try {
      const r = await fetch("/api/emoticon/concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market: project.market, concept: project.concept }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        push({ kind: "error", title: "시안 생성 실패", message: j.message || j.error });
        return;
      }
      setConceptPreview(j.image_base64 as string);
    } catch (e: any) {
      push({ kind: "error", title: "요청 오류", message: e?.message || String(e) });
    } finally {
      setBusyConcept(false);
    }
  }

  async function onAdoptConcept() {
    if (!project || !conceptPreview) return;
    const r = await fetch(`/api/emoticon/projects/${project.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adoptBase64: conceptPreview }),
    });
    const j = await r.json();
    if (j.ok) {
      setProject(j.project as Project);
      setConceptPreview(null);
      push({ kind: "success", title: "시안이 reference 로 채택됨" });
    } else {
      push({ kind: "error", title: "채택 실패", message: j.message || j.error });
    }
  }

  async function onGenerateOne(index: number) {
    if (!project) return;
    setGenBusy((s) => new Set(s).add(index));
    try {
      const r = await fetch("/api/emoticon/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, index }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        push({
          kind: "error",
          title: `#${index} 생성 실패`,
          message: j.message || j.error,
        });
        return;
      }
      // 최신 메타 다시 로드
      await loadProject(project.id);
    } catch (e: any) {
      push({ kind: "error", title: "요청 오류", message: e?.message || String(e) });
    } finally {
      setGenBusy((s) => {
        const n = new Set(s);
        n.delete(index);
        return n;
      });
    }
  }

  async function onStartBatch(mode: "missing" | "all") {
    if (!project) return;
    if (project.references.length === 0) {
      push({ kind: "warn", title: "참조 이미지를 먼저 만들거나 업로드하세요" });
      return;
    }
    if (project.expressions.length === 0) {
      push({ kind: "warn", title: "표현 리스트를 먼저 생성하세요" });
      return;
    }
    setBatchRunning(true);
    setBatchPlanned(0);
    setBatchDone(0);
    setBatchFailed(0);
    setBatchMsg(`연결 중…`);

    const abort = new AbortController();
    setBatchAbort(abort);

    try {
      const r = await fetch(
        `/api/emoticon/batch/${project.id}?mode=${mode}&gapMs=3500`,
        { method: "POST", signal: abort.signal }
      );
      if (!r.ok || !r.body) {
        push({ kind: "error", title: "일괄 생성 시작 실패", message: `HTTP ${r.status}` });
        return;
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 2);
          if (!chunk.startsWith("data:")) continue;
          const payload = chunk.replace(/^data:\s*/, "");
          let ev: any;
          try { ev = JSON.parse(payload); } catch { continue; }
          if (ev.type === "start") {
            setBatchPlanned(ev.planned);
            setBatchMsg(`총 ${ev.planned}장 생성 시작`);
          } else if (ev.type === "item") {
            if (ev.status === "ok") {
              setBatchDone((n) => n + 1);
              setBatchMsg(`#${ev.index} ${ev.label} ✅`);
              // 갤러리 즉시 갱신
              setProject((p) =>
                p
                  ? {
                      ...p,
                      generated: (() => {
                        const i = p.generated.findIndex((g) => g.index === ev.index);
                        const rec = {
                          index: ev.index,
                          expression: ev.label,
                          file: ev.file,
                          createdAt: new Date().toISOString(),
                        };
                        if (i >= 0) {
                          const arr = [...p.generated];
                          arr[i] = rec;
                          return arr;
                        }
                        return [...p.generated, rec];
                      })(),
                      updatedAt: new Date().toISOString(),
                    }
                  : p
              );
            } else if (ev.status === "failed") {
              setBatchFailed((n) => n + 1);
              setBatchMsg(`#${ev.index} ${ev.label} ❌ ${ev.message ?? ""}`);
            } else {
              setBatchMsg(`#${ev.index} ${ev.label} skip`);
            }
          } else if (ev.type === "wait") {
            setBatchMsg(`⏸ ${ev.reason}`);
          } else if (ev.type === "end") {
            setBatchMsg(`완료 — 성공 ${ev.ok} / 실패 ${ev.failed}`);
            push({
              kind: ev.failed > 0 ? "warn" : "success",
              title: "일괄 생성 종료",
              message: `성공 ${ev.ok} / 실패 ${ev.failed}`,
            });
          } else if (ev.type === "error") {
            setBatchMsg(`에러: ${ev.message}`);
            push({ kind: "error", title: "일괄 생성 에러", message: ev.message });
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        push({ kind: "error", title: "스트림 오류", message: e?.message ?? String(e) });
      }
    } finally {
      setBatchRunning(false);
      setBatchAbort(null);
      // 끝나면 서버에서 최신 메타 한번 더 가져와서 sync
      if (project) await loadProject(project.id);
    }
  }

  function onStopBatch() {
    batchAbort?.abort();
    setBatchMsg("중단됨");
  }

  function exprToGenerated(e: Expression): Generated | undefined {
    return project?.generated.find((g) => g.index === e.index);
  }

  function imgUrl(id: string, kind: "reference" | "output", filename: string) {
    return `/api/emoticon/image/${id}/${kind}/${filename}`;
  }

  function onPickRefs(files: FileList | null) {
    if (!files) return;
    setRefFiles(Array.from(files));
  }

  async function onAddMoreRefs(files: FileList | null) {
    if (!project || !files || files.length === 0) return;
    const fd = new FormData();
    for (let i = 0; i < files.length; i++) fd.append("references", files.item(i)!);
    const r = await fetch(`/api/emoticon/projects/${project.id}`, {
      method: "POST",
      body: fd,
    });
    const j = await r.json();
    if (j.ok) {
      setProject(j.project as Project);
      push({ kind: "success", title: "참조 이미지 추가됨" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-panel border border-line rounded-2xl p-6">
        <div className="text-xs text-subtext uppercase tracking-widest mb-1">
          이모티콘 자동 생성 (Gemini 2.5 Flash Image)
        </div>
        <h2 className="text-xl font-bold">🎨 마켓 등록용 이모티콘 세트</h2>
        <p className="text-sm text-subtext mt-2">
          마켓 선택 → 캐릭터 컨셉 입력 → reference 업로드 또는 AI 시안 채택 → 표현 리스트 자동 생성 →
          한 장씩 generate → 갤러리 확인. 마켓 심사 제출은 별도 (수동).
        </p>
      </div>

      {/* Step 1: 프로젝트 생성 (또는 기존 불러오기) */}
      {!project && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card title="1. 마켓 선택">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {MARKETS.map((m) => (
                  <label
                    key={m.id}
                    className={
                      "block rounded-md border px-3 py-2 cursor-pointer text-sm transition " +
                      (market === m.id
                        ? "border-accent bg-accent/10 text-text"
                        : "border-line bg-bg/40 text-subtext hover:text-text")
                    }
                  >
                    <input
                      type="radio"
                      className="mr-2 accent-accent"
                      checked={market === m.id}
                      onChange={() => setMarket(m.id)}
                    />
                    <span className="font-medium">{m.label}</span>
                    <div className="text-[11px] text-subtext mt-1 ml-5">
                      {m.count}장 · {m.size}
                    </div>
                    <div className="text-[10px] text-subtext mt-0.5 ml-5">{m.difficulty}</div>
                    {m.hint && (
                      <div className="text-[10px] text-good mt-0.5 ml-5">💡 {m.hint}</div>
                    )}
                  </label>
                ))}
              </div>
            </Card>

            <Card title="2. 캐릭터 컨셉">
              <textarea
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                rows={6}
                placeholder={`예시:
분홍색 통통한 토끼 캐릭터.
큰 동그란 눈, 짧은 팔다리, 항상 살짝 졸려 보이는 표정.
색감은 파스텔톤. 굵은 검정 외곽선.
이름: 뚜둔이. 27살 직장인 컨셉.`}
                className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm mono"
              />
              <p className="text-[11px] text-subtext mt-2">
                구체적일수록 일관성이 잘 잡힘. 색/외곽선/체형/특징 1~2가지 포함 권장.
              </p>
            </Card>

            <Card title="3. 참조 이미지 (선택)">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(e) => onPickRefs(e.target.files)}
                className="text-xs"
              />
              <p className="text-[11px] text-subtext mt-2">
                없어도 OK — 아래 단계에서 AI 가 시안을 만들어 채택할 수 있습니다.
                있으면 일관성이 더 좋아져요 (1~5장 권장).
              </p>
              {refFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {refFiles.map((f, i) => (
                    <span
                      key={i}
                      className="text-[11px] bg-bg border border-line rounded px-2 py-1"
                    >
                      {f.name}
                    </span>
                  ))}
                </div>
              )}
            </Card>

            <button
              onClick={onCreateProject}
              disabled={busyCreate}
              className="w-full bg-accent text-bg font-semibold rounded-md py-3 disabled:opacity-50 hover:bg-accent2 transition"
            >
              {busyCreate ? "생성 중…" : "프로젝트 시작"}
            </button>
          </div>

          {/* 기존 프로젝트 */}
          <div className="space-y-4">
            <Card title="이전 프로젝트">
              {recent.length === 0 ? (
                <p className="text-xs text-subtext">아직 없음</p>
              ) : (
                <ul className="space-y-1">
                  {recent.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => setProject(p)}
                        className="w-full text-left text-xs bg-bg border border-line rounded-md px-3 py-2 hover:bg-panel2"
                      >
                        <div className="font-mono text-[10px] text-subtext">{p.id}</div>
                        <div className="text-text">
                          {MARKETS.find((m) => m.id === p.market)?.label} · {p.generated.length}/
                          {p.expressions.length} 장
                        </div>
                        <div className="text-[10px] text-subtext truncate mt-0.5">
                          {p.concept}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      {project && (
        <ProjectView
          project={project}
          marketInfo={marketInfo}
          busyExpr={busyExpr}
          busyConcept={busyConcept}
          conceptPreview={conceptPreview}
          genBusy={genBusy}
          batchRunning={batchRunning}
          batchPlanned={batchPlanned}
          batchDone={batchDone}
          batchFailed={batchFailed}
          batchMsg={batchMsg}
          onBack={() => setProject(null)}
          onGenerateExpressions={onGenerateExpressions}
          onGenerateConcept={onGenerateConcept}
          onAdoptConcept={onAdoptConcept}
          onAddMoreRefs={onAddMoreRefs}
          onGenerateOne={onGenerateOne}
          onStartBatch={onStartBatch}
          onStopBatch={onStopBatch}
          imgUrl={imgUrl}
          exprToGenerated={exprToGenerated}
        />
      )}
    </div>
  );
}

interface ProjectViewProps {
  project: Project;
  marketInfo: MarketInfo;
  busyExpr: boolean;
  busyConcept: boolean;
  conceptPreview: string | null;
  genBusy: Set<number>;
  batchRunning: boolean;
  batchPlanned: number;
  batchDone: number;
  batchFailed: number;
  batchMsg: string;
  onBack: () => void;
  onGenerateExpressions: () => void;
  onGenerateConcept: () => void;
  onAdoptConcept: () => void;
  onAddMoreRefs: (files: FileList | null) => void;
  onGenerateOne: (index: number) => void;
  onStartBatch: (mode: "missing" | "all") => void;
  onStopBatch: () => void;
  imgUrl: (id: string, kind: "reference" | "output", filename: string) => string;
  exprToGenerated: (e: Expression) => Generated | undefined;
}

function ProjectView(p: ProjectViewProps) {
  const marketLabel = MARKETS.find((m) => m.id === p.project.market)?.label;
  const totalNeeded =
    MARKETS.find((m) => m.id === p.project.market)?.count ?? p.project.expressions.length;
  const generatedCount = p.project.generated.length;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <button
            onClick={p.onBack}
            className="text-xs text-subtext hover:text-text underline mb-2"
          >
            ← 다른 프로젝트
          </button>
          <h3 className="text-lg font-semibold">
            {marketLabel} <span className="font-mono text-xs text-subtext">{p.project.id}</span>
          </h3>
          <p className="text-xs text-subtext mt-1 max-w-2xl whitespace-pre-line">
            {p.project.concept}
          </p>
        </div>
        <div className="text-right text-xs">
          <div className="text-2xl font-bold">
            {generatedCount}
            <span className="text-subtext">/{totalNeeded}</span>
          </div>
          <div className="text-subtext">생성됨</div>
        </div>
      </div>

      {/* Reference */}
      <Card title={`참조 이미지 (${p.project.references.length}장)`}>
        <div className="flex flex-wrap gap-2">
          {p.project.references.length === 0 && (
            <p className="text-xs text-subtext">없음 — 아래에서 AI 시안을 만들어 채택하세요.</p>
          )}
          {p.project.references.map((f) => (
            <img
              key={f}
              src={p.imgUrl(p.project.id, "reference", f)}
              alt={f}
              className="h-24 w-24 object-contain bg-bg border border-line rounded-md"
            />
          ))}
        </div>
        <div className="mt-3">
          <label className="text-xs text-subtext cursor-pointer">
            추가 업로드
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              className="ml-2 text-xs"
              onChange={(e) => p.onAddMoreRefs(e.target.files)}
            />
          </label>
        </div>
      </Card>

      {/* AI 시안 — reference 없을 때만 노출 */}
      {p.project.references.length === 0 && (
        <Card title="🪄 AI 캐릭터 시안">
          <p className="text-xs text-subtext mb-3">
            컨셉을 바탕으로 1장 시안을 생성해 채택하면 reference 가 됩니다. 마음에 안 들면 다시 생성.
          </p>
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex flex-col gap-2">
              <button
                onClick={p.onGenerateConcept}
                disabled={p.busyConcept}
                className="text-sm border border-accent text-accent rounded-md px-3 py-2 hover:bg-accent/10 disabled:opacity-50"
              >
                {p.busyConcept ? "생성 중… (10~20초)" : "✨ 시안 생성"}
              </button>
              {p.conceptPreview && (
                <button
                  onClick={p.onAdoptConcept}
                  className="text-sm border border-good text-good rounded-md px-3 py-2 hover:bg-good/10"
                >
                  이걸로 채택
                </button>
              )}
            </div>
            {p.conceptPreview && (
              <img
                src={`data:image/png;base64,${p.conceptPreview}`}
                alt="시안"
                className="h-48 w-48 object-contain bg-bg border border-line rounded-md"
              />
            )}
          </div>
        </Card>
      )}

      {/* 일괄 생성 / 다운로드 */}
      {p.project.expressions.length > 0 && (
        <Card
          title="일괄 작업"
          right={
            <a
              href={`/api/emoticon/export/${p.project.id}`}
              className={
                "text-xs border rounded px-2 py-1 transition " +
                (p.project.generated.length > 0
                  ? "border-good/60 text-good hover:bg-good/10"
                  : "border-line text-subtext pointer-events-none opacity-50")
              }
              aria-disabled={p.project.generated.length === 0}
            >
              ⬇️ 마켓 규격 zip 다운로드
            </a>
          }
        >
          <div className="flex flex-wrap gap-2 items-center">
            {!p.batchRunning ? (
              <>
                <button
                  onClick={() => p.onStartBatch("missing")}
                  disabled={p.project.references.length === 0}
                  className="text-sm border border-accent text-accent rounded-md px-3 py-2 hover:bg-accent/10 disabled:opacity-50"
                  title={
                    p.project.references.length === 0 ? "참조 이미지가 필요합니다" : ""
                  }
                >
                  🚀 미생성 항목 전부 생성
                </button>
                <button
                  onClick={() => {
                    if (confirm("이미 생성된 것까지 전부 재생성합니다. 계속할까요?")) {
                      p.onStartBatch("all");
                    }
                  }}
                  disabled={p.project.references.length === 0}
                  className="text-xs border border-line rounded-md px-3 py-2 hover:bg-panel2 disabled:opacity-50"
                >
                  🔁 전체 재생성
                </button>
              </>
            ) : (
              <button
                onClick={p.onStopBatch}
                className="text-sm border border-bad text-bad rounded-md px-3 py-2 hover:bg-bad/10"
              >
                ⏹ 중단
              </button>
            )}
            <div className="text-[11px] text-subtext">
              요청 사이 3.5초 간격 + 429 발생 시 자동 백오프(최대 60초, 5회).
            </div>
          </div>
          {(p.batchRunning || p.batchMsg) && (
            <div className="mt-3 space-y-1">
              <div className="h-2 bg-bg border border-line rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{
                    width:
                      p.batchPlanned > 0
                        ? `${Math.min(100, (p.batchDone / p.batchPlanned) * 100)}%`
                        : "0%",
                  }}
                />
              </div>
              <div className="text-[11px] text-subtext flex justify-between">
                <span>{p.batchMsg}</span>
                <span className="mono">
                  성공 {p.batchDone}
                  {p.batchFailed > 0 ? ` · 실패 ${p.batchFailed}` : ""}
                  {p.batchPlanned > 0 ? ` / ${p.batchPlanned}` : ""}
                </span>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 표현 리스트 */}
      <Card
        title={`표현 리스트 (${p.project.expressions.length}/${totalNeeded})`}
        right={
          <button
            onClick={p.onGenerateExpressions}
            disabled={p.busyExpr}
            className="text-xs border border-accent text-accent rounded px-2 py-1 hover:bg-accent/10 disabled:opacity-50"
          >
            {p.busyExpr
              ? "생성 중…"
              : p.project.expressions.length === 0
              ? "✨ 자동 생성"
              : "🔄 부족분 자동 보충"}
          </button>
        }
      >
        {p.project.expressions.length === 0 ? (
          <p className="text-xs text-subtext">
            아직 없음. 위 버튼을 누르면 컨셉에 맞춰 {totalNeeded}개를 자동 제안합니다.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {p.project.expressions.map((e) => {
              const g = p.exprToGenerated(e);
              const isBusy = p.genBusy.has(e.index);
              return (
                <div
                  key={e.index}
                  className="bg-bg border border-line rounded-md p-2 flex gap-3"
                >
                  <div className="h-24 w-24 shrink-0 bg-panel border border-line rounded flex items-center justify-center overflow-hidden">
                    {g ? (
                      <img
                        src={`${p.imgUrl(p.project.id, "output", g.file)}?v=${encodeURIComponent(
                          g.createdAt
                        )}`}
                        alt={e.label}
                        className="h-full w-full object-contain"
                      />
                    ) : isBusy ? (
                      <span className="text-[10px] text-subtext animate-pulse">생성 중…</span>
                    ) : (
                      <span className="text-[10px] text-subtext">미생성</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase text-subtext mono">
                        #{String(e.index).padStart(2, "0")}
                      </span>
                      <span className="text-sm font-medium truncate">{e.label}</span>
                    </div>
                    <div className="text-[11px] text-subtext line-clamp-2 mt-0.5">
                      {e.prompt}
                    </div>
                    <button
                      onClick={() => p.onGenerateOne(e.index)}
                      disabled={isBusy || p.project.references.length === 0}
                      className="mt-2 text-[11px] border border-line rounded px-2 py-0.5 hover:bg-panel2 disabled:opacity-50"
                      title={
                        p.project.references.length === 0
                          ? "참조 이미지를 먼저 추가/채택하세요"
                          : ""
                      }
                    >
                      {isBusy ? "생성 중…" : g ? "재생성" : "생성"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Card({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}
