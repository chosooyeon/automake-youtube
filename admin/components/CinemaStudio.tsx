"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "./Toast";

type LengthType = "shorts" | "short_film" | "series_pilot";

interface Character {
  id: string;
  name: string;
  role: string;
  appearance: string;
  personality: string;
  visual_keywords: string;
}

interface Scene {
  id: string;
  number: number;
  heading: string;
  beat: string;
  action: string;
  dialog: string;
  shotlist: string;
  video_prompt: string;
  image_prompt: string;
  duration_sec: number;
}

interface OstTrack {
  id: string;
  scene_ids: string[];
  mood: string;
  genre: string;
  tempo_bpm: string;
  instrumentation: string;
  reference_tracks: string;
  search_queries: string;
}

interface CinemaProject {
  slug: string;
  title: string;
  length_type: LengthType;
  genre: string;
  tone: string;
  concept: string;
  logline: string;
  synopsis: string;
  characters: Character[];
  scenes: Scene[];
  ost: OstTrack[];
  notes: string;
  created_at: string;
  updated_at: string;
}

interface ProjectListItem {
  slug: string;
  title: string;
  length_type: LengthType;
  updated_at: string;
}

const LENGTH_LABELS: Record<LengthType, string> = {
  shorts: "🎯 쇼츠 (30초~1분)",
  short_film: "🎬 미니영화 (2~5분)",
  series_pilot: "📺 시리즈 파일럿",
};

type Step = "logline" | "synopsis" | "characters" | "scenes" | "scene_prompt" | "ost";

export default function CinemaStudio() {
  const { push } = useToast();
  const [list, setList] = useState<ProjectListItem[]>([]);
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [project, setProject] = useState<CinemaProject | null>(null);
  const [busyStep, setBusyStep] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [loglineSuggest, setLoglineSuggest] = useState<{ candidates: string[]; reason: string } | null>(null);

  const refreshList = useCallback(async () => {
    try {
      const r = await fetch("/api/cinema/projects", { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setList(j.projects);
    } catch {
      push({ kind: "error", title: "프로젝트 목록 로드 실패" });
    }
  }, [push]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const loadProject = useCallback(
    async (slug: string) => {
      try {
        const r = await fetch(`/api/cinema/projects/${slug}`, { cache: "no-store" });
        const j = await r.json();
        if (j.ok) {
          setProject(j.project);
          setCurrentSlug(slug);
          setLoglineSuggest(null);
        } else {
          push({ kind: "error", title: "프로젝트 로드 실패", message: j.error });
        }
      } catch {
        push({ kind: "error", title: "프로젝트 로드 실패" });
      }
    },
    [push]
  );

  async function saveProject(next: CinemaProject) {
    setProject(next);
    try {
      const r = await fetch(`/api/cinema/projects/${next.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "save_failed");
      refreshList();
    } catch (e) {
      push({ kind: "error", title: "저장 실패", message: (e as Error).message });
    }
  }

  async function generate(step: Step, opts?: { scene_id?: string; hint?: string }) {
    if (!project) return;
    setBusyStep(step + (opts?.scene_id ? `:${opts.scene_id}` : ""));
    try {
      const r = await fetch(`/api/cinema/projects/${project.slug}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, scene_id: opts?.scene_id, hint: opts?.hint }),
      });
      const j = await r.json();
      if (!j.ok) {
        push({ kind: "error", title: `${step} 생성 실패`, message: j.error + (j.detail ? `\n${j.detail.slice(0, 200)}` : "") });
        return;
      }
      setProject(j.project);
      if (step === "logline" && j.generated) {
        setLoglineSuggest({ candidates: j.generated.candidates, reason: j.generated.reason });
      }
      refreshList();
      push({ kind: "success", title: `${step} 완료` });
    } catch (e) {
      push({ kind: "error", title: `${step} 호출 실패`, message: (e as Error).message });
    } finally {
      setBusyStep(null);
    }
  }

  async function deleteProject() {
    if (!project) return;
    if (!confirm(`'${project.title}' 프로젝트를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      const r = await fetch(`/api/cinema/projects/${project.slug}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setProject(null);
      setCurrentSlug(null);
      refreshList();
      push({ kind: "success", title: "삭제됨" });
    } catch (e) {
      push({ kind: "error", title: "삭제 실패", message: (e as Error).message });
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-panel border border-line rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-subtext uppercase tracking-widest mb-1">시나리오 · 감독 모드</div>
            <h2 className="text-xl font-bold">🎬 시나리오 스튜디오</h2>
            <p className="text-sm text-subtext mt-2">
              로그라인 → 시놉시스 → 캐릭터 → 씬 브레이크다운 → 씬별 영상/이미지 프롬프트 → OST.
              <br />이미지/영상은 외부 툴(Sora·Veo·Midjourney 등)로 직접 만들고, 여기서는 시나리오와 프롬프트만 다듬습니다.
            </p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="bg-accent text-bg font-semibold rounded-md px-4 py-2 text-sm hover:bg-accent2"
          >
            + 새 프로젝트
          </button>
        </div>
      </div>

      {/* 프로젝트 셀렉터 */}
      <div className="bg-panel border border-line rounded-xl p-4 flex items-center gap-3 flex-wrap">
        <span className="text-xs text-subtext uppercase tracking-wider">프로젝트</span>
        <select
          value={currentSlug ?? ""}
          onChange={(e) => {
            if (e.target.value) loadProject(e.target.value);
            else {
              setProject(null);
              setCurrentSlug(null);
            }
          }}
          className="bg-bg border border-line rounded-md px-3 py-2 text-sm flex-1 min-w-[280px]"
        >
          <option value="">— 선택 —</option>
          {list.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.title} · {LENGTH_LABELS[p.length_type]} · {p.updated_at.slice(0, 10)}
            </option>
          ))}
        </select>
        {project && (
          <button
            onClick={deleteProject}
            className="text-xs border border-bad/40 text-bad rounded px-2 py-1 hover:bg-bad/10"
          >
            🗑️ 삭제
          </button>
        )}
      </div>

      {!project && (
        <div className="bg-panel/40 border border-line border-dashed rounded-xl p-10 text-center text-sm text-subtext">
          {list.length === 0
            ? "아직 프로젝트가 없습니다. '+ 새 프로젝트' 로 시작하세요."
            : "위에서 프로젝트를 선택하거나 새로 만드세요."}
        </div>
      )}

      {project && (
        <>
          <MetaCard project={project} onSave={saveProject} />
          <LoglineCard
            project={project}
            busy={busyStep === "logline"}
            suggest={loglineSuggest}
            onSave={saveProject}
            onGenerate={(hint) => generate("logline", { hint })}
            onPick={(c) => saveProject({ ...project, logline: c })}
          />
          <SynopsisCard
            project={project}
            busy={busyStep === "synopsis"}
            onSave={saveProject}
            onGenerate={(hint) => generate("synopsis", { hint })}
          />
          <CharactersCard
            project={project}
            busy={busyStep === "characters"}
            onSave={saveProject}
            onGenerate={(hint) => generate("characters", { hint })}
          />
          <ScenesCard
            project={project}
            busyStep={busyStep}
            onSave={saveProject}
            onGenerateAll={(hint) => generate("scenes", { hint })}
            onGenerateScenePrompt={(scene_id, hint) => generate("scene_prompt", { scene_id, hint })}
          />
          <OstCard
            project={project}
            busy={busyStep === "ost"}
            onSave={saveProject}
            onGenerate={(hint) => generate("ost", { hint })}
          />
          <NotesCard project={project} onSave={saveProject} />
        </>
      )}

      {showNewModal && (
        <NewProjectModal
          onClose={() => setShowNewModal(false)}
          onCreated={(slug) => {
            setShowNewModal(false);
            refreshList();
            loadProject(slug);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------- 메타 카드 ------------------------------- */
function MetaCard({ project, onSave }: { project: CinemaProject; onSave: (p: CinemaProject) => void }) {
  const [title, setTitle] = useState(project.title);
  const [lengthType, setLengthType] = useState<LengthType>(project.length_type);
  const [genre, setGenre] = useState(project.genre);
  const [tone, setTone] = useState(project.tone);
  const [concept, setConcept] = useState(project.concept);

  useEffect(() => {
    setTitle(project.title);
    setLengthType(project.length_type);
    setGenre(project.genre);
    setTone(project.tone);
    setConcept(project.concept);
  }, [project.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty =
    title !== project.title ||
    lengthType !== project.length_type ||
    genre !== project.genre ||
    tone !== project.tone ||
    concept !== project.concept;

  return (
    <Card title="📋 프로젝트 메타">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="제목">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </Field>
        <Field label="길이">
          <select value={lengthType} onChange={(e) => setLengthType(e.target.value as LengthType)} className={inputCls}>
            {(Object.keys(LENGTH_LABELS) as LengthType[]).map((k) => (
              <option key={k} value={k}>
                {LENGTH_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="장르">
          <input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="드라마, SF, 코미디, 누아르..." className={inputCls} />
        </Field>
        <Field label="톤">
          <input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="잔잔함, 긴장감, 따뜻함..." className={inputCls} />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="감독 컨셉 메모 (자유)">
          <textarea
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            rows={4}
            placeholder="이 영상으로 뭘 보여주고 싶은지, 영감이 된 영화나 장면, 분위기 키워드 등 자유롭게"
            className={inputCls + " leading-relaxed"}
          />
        </Field>
      </div>
      {dirty && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => onSave({ ...project, title, length_type: lengthType, genre, tone, concept })}
            className="text-sm bg-accent text-bg rounded-md px-3 py-1.5 font-medium hover:bg-accent2"
          >
            저장
          </button>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------- 로그라인 ------------------------------- */
function LoglineCard({
  project,
  busy,
  suggest,
  onSave,
  onGenerate,
  onPick,
}: {
  project: CinemaProject;
  busy: boolean;
  suggest: { candidates: string[]; reason: string } | null;
  onSave: (p: CinemaProject) => void;
  onGenerate: (hint?: string) => void;
  onPick: (text: string) => void;
}) {
  const [val, setVal] = useState(project.logline);
  const [hint, setHint] = useState("");
  useEffect(() => setVal(project.logline), [project.slug, project.logline]);

  return (
    <Card
      title="✏️ 1. 로그라인 (한 줄 컨셉)"
      right={
        <GenerateBtn busy={busy} onClick={() => onGenerate(hint.trim() || undefined)} label="AI 제안 3개" />
      }
    >
      <textarea value={val} onChange={(e) => setVal(e.target.value)} rows={2} className={inputCls + " leading-relaxed"} placeholder="주인공 + 욕망 + 장애물 (25~50자)" />
      <div className="flex gap-2 mt-2 items-center">
        <input
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder="AI에게 추가 요청 (선택, 예: '좀 더 차갑게', '여자 주인공으로')"
          className={inputCls + " flex-1"}
        />
        {val !== project.logline && (
          <button onClick={() => onSave({ ...project, logline: val })} className="text-sm bg-accent text-bg rounded-md px-3 py-1.5 font-medium hover:bg-accent2">
            저장
          </button>
        )}
      </div>
      {suggest && suggest.candidates.length > 0 && (
        <div className="mt-3 bg-bg/60 border border-line rounded-md p-3">
          <div className="text-xs text-subtext mb-2">AI 제안 후보 · {suggest.reason}</div>
          <ul className="space-y-1.5">
            {suggest.candidates.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <button onClick={() => onPick(c)} className="text-xs border border-line rounded px-2 py-0.5 hover:bg-panel2 shrink-0">
                  채택
                </button>
                <span className="flex-1">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------- 시놉시스 ------------------------------- */
function SynopsisCard({
  project,
  busy,
  onSave,
  onGenerate,
}: {
  project: CinemaProject;
  busy: boolean;
  onSave: (p: CinemaProject) => void;
  onGenerate: (hint?: string) => void;
}) {
  const [val, setVal] = useState(project.synopsis);
  const [hint, setHint] = useState("");
  useEffect(() => setVal(project.synopsis), [project.slug, project.synopsis]);

  return (
    <Card
      title="📖 2. 시놉시스 (3문단)"
      right={<GenerateBtn busy={busy} onClick={() => onGenerate(hint.trim() || undefined)} label="AI 생성" />}
    >
      <textarea value={val} onChange={(e) => setVal(e.target.value)} rows={8} className={inputCls + " leading-relaxed"} placeholder="1. 세계관/주인공\n2. 사건/갈등\n3. 클라이맥스/마무리" />
      <div className="flex gap-2 mt-2 items-center">
        <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="AI에게 추가 요청 (선택)" className={inputCls + " flex-1"} />
        {val !== project.synopsis && (
          <button onClick={() => onSave({ ...project, synopsis: val })} className="text-sm bg-accent text-bg rounded-md px-3 py-1.5 font-medium hover:bg-accent2">
            저장
          </button>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------- 캐릭터 ------------------------------- */
function CharactersCard({
  project,
  busy,
  onSave,
  onGenerate,
}: {
  project: CinemaProject;
  busy: boolean;
  onSave: (p: CinemaProject) => void;
  onGenerate: (hint?: string) => void;
}) {
  const [hint, setHint] = useState("");

  function update(idx: number, patch: Partial<Character>) {
    const next = project.characters.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onSave({ ...project, characters: next });
  }
  function remove(idx: number) {
    onSave({ ...project, characters: project.characters.filter((_, i) => i !== idx) });
  }
  function add() {
    onSave({
      ...project,
      characters: [
        ...project.characters,
        { id: "ch-" + Math.random().toString(36).slice(2, 8), name: "", role: "단역", appearance: "", personality: "", visual_keywords: "" },
      ],
    });
  }

  return (
    <Card
      title={`👥 3. 캐릭터 시트 (${project.characters.length}명)`}
      right={
        <div className="flex gap-2">
          <button onClick={add} className="text-xs border border-line rounded px-2 py-1 hover:bg-panel2">
            + 직접 추가
          </button>
          <GenerateBtn busy={busy} onClick={() => onGenerate(hint.trim() || undefined)} label="AI 자동 생성 (덮어쓰기)" />
        </div>
      }
    >
      <div className="mb-3">
        <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="AI에게 추가 요청 (선택, 예: '여자 주인공 1명만', '쌍둥이 자매')" className={inputCls + " w-full"} />
      </div>
      {project.characters.length === 0 ? (
        <p className="text-sm text-subtext italic">아직 캐릭터 없음. 시놉시스를 먼저 작성하고 ‘AI 자동 생성’ 을 눌러보세요.</p>
      ) : (
        <div className="space-y-3">
          {project.characters.map((c, i) => (
            <div key={c.id} className="bg-bg/60 border border-line rounded-md p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input value={c.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="이름" className={inputCls + " font-semibold"} />
                <input value={c.role} onChange={(e) => update(i, { role: e.target.value })} placeholder="역할" className={inputCls + " w-32"} />
                <button onClick={() => remove(i)} className="text-xs text-bad border border-bad/30 rounded px-2 py-1 hover:bg-bad/10">
                  삭제
                </button>
              </div>
              <Field label="외모">
                <input value={c.appearance} onChange={(e) => update(i, { appearance: e.target.value })} className={inputCls} />
              </Field>
              <Field label="성격">
                <input value={c.personality} onChange={(e) => update(i, { personality: e.target.value })} className={inputCls} />
              </Field>
              <Field label="🎨 영상/이미지 프롬프트용 키워드 (영문 권장)">
                <input value={c.visual_keywords} onChange={(e) => update(i, { visual_keywords: e.target.value })} className={inputCls + " mono text-xs"} placeholder="late-30s woman, short bob hair, grey trench coat, glasses" />
              </Field>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------- 씬 ------------------------------- */
function ScenesCard({
  project,
  busyStep,
  onSave,
  onGenerateAll,
  onGenerateScenePrompt,
}: {
  project: CinemaProject;
  busyStep: string | null;
  onSave: (p: CinemaProject) => void;
  onGenerateAll: (hint?: string) => void;
  onGenerateScenePrompt: (scene_id: string, hint?: string) => void;
}) {
  const [hint, setHint] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  function update(id: string, patch: Partial<Scene>) {
    const next = project.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s));
    onSave({ ...project, scenes: next });
  }
  function remove(id: string) {
    const next = project.scenes
      .filter((s) => s.id !== id)
      .map((s, i) => ({ ...s, number: i + 1 }));
    onSave({ ...project, scenes: next });
  }
  function add() {
    const id = "sc-" + Math.random().toString(36).slice(2, 8);
    onSave({
      ...project,
      scenes: [
        ...project.scenes,
        {
          id,
          number: project.scenes.length + 1,
          heading: "",
          beat: "",
          action: "",
          dialog: "",
          shotlist: "",
          video_prompt: "",
          image_prompt: "",
          duration_sec: 0,
        },
      ],
    });
    setOpenId(id);
  }

  const totalDur = project.scenes.reduce((a, s) => a + (s.duration_sec || 0), 0);

  return (
    <Card
      title={`🎞️ 4. 씬 브레이크다운 (${project.scenes.length}씬 · 총 ${totalDur}초)`}
      right={
        <div className="flex gap-2">
          <button onClick={add} className="text-xs border border-line rounded px-2 py-1 hover:bg-panel2">
            + 직접 추가
          </button>
          <GenerateBtn busy={busyStep === "scenes"} onClick={() => onGenerateAll(hint.trim() || undefined)} label="AI 자동 생성 (덮어쓰기)" />
        </div>
      }
    >
      <div className="mb-3">
        <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="AI에게 추가 요청 (선택, 예: '8씬으로', '비 오는 날부터 시작')" className={inputCls + " w-full"} />
      </div>
      {project.scenes.length === 0 ? (
        <p className="text-sm text-subtext italic">아직 씬 없음. 시놉시스와 캐릭터를 먼저 채우고 ‘AI 자동 생성’ 을 누르세요.</p>
      ) : (
        <div className="space-y-2">
          {project.scenes.map((s) => {
            const isOpen = openId === s.id;
            const isBusy = busyStep === `scene_prompt:${s.id}`;
            return (
              <div key={s.id} className="bg-bg/60 border border-line rounded-md">
                <button onClick={() => setOpenId(isOpen ? null : s.id)} className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-panel2">
                  <span className="text-xs text-subtext mono shrink-0 w-8">#{s.number}</span>
                  <span className="text-sm font-medium shrink-0 max-w-[40%] truncate">{s.heading || "(헤딩 없음)"}</span>
                  <span className="text-xs text-subtext flex-1 truncate">— {s.beat}</span>
                  <span className="text-[11px] text-subtext mono shrink-0">{s.duration_sec}s</span>
                  {s.video_prompt && <span className="text-[10px] bg-good/15 text-good border border-good/30 rounded px-1.5 py-0.5 shrink-0">🎬</span>}
                  <span className="text-subtext text-xs shrink-0">{isOpen ? "▴" : "▾"}</span>
                </button>
                {isOpen && (
                  <div className="border-t border-line p-3 space-y-2">
                    <div className="flex gap-2">
                      <input value={s.heading} onChange={(e) => update(s.id, { heading: e.target.value })} placeholder="INT. 카페 - 낮" className={inputCls + " flex-1"} />
                      <input
                        type="number"
                        value={s.duration_sec}
                        onChange={(e) => update(s.id, { duration_sec: Number(e.target.value) || 0 })}
                        className={inputCls + " w-20"}
                        placeholder="초"
                      />
                      <button onClick={() => remove(s.id)} className="text-xs text-bad border border-bad/30 rounded px-2 py-1 hover:bg-bad/10">
                        삭제
                      </button>
                    </div>
                    <Field label="beat (한 줄)">
                      <input value={s.beat} onChange={(e) => update(s.id, { beat: e.target.value })} className={inputCls} />
                    </Field>
                    <Field label="액션 (행동 묘사)">
                      <textarea value={s.action} onChange={(e) => update(s.id, { action: e.target.value })} rows={3} className={inputCls + " leading-relaxed"} />
                    </Field>
                    <Field label="대사">
                      <textarea value={s.dialog} onChange={(e) => update(s.id, { dialog: e.target.value })} rows={3} className={inputCls + " leading-relaxed"} placeholder="인물명: 대사" />
                    </Field>

                    <div className="bg-panel/50 border border-line rounded-md p-3 space-y-2 mt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-subtext uppercase tracking-wider">🎥 영상화 자료</span>
                        <GenerateBtn busy={isBusy} onClick={() => onGenerateScenePrompt(s.id)} label="이 씬 프롬프트 생성" small />
                      </div>
                      <Field label="샷리스트 (WS/MS/CU)">
                        <textarea value={s.shotlist} onChange={(e) => update(s.id, { shotlist: e.target.value })} rows={3} className={inputCls + " mono text-xs leading-relaxed"} />
                      </Field>
                      <Field label="Sora/Veo 영상 프롬프트 (영문)">
                        <textarea value={s.video_prompt} onChange={(e) => update(s.id, { video_prompt: e.target.value })} rows={3} className={inputCls + " mono text-xs leading-relaxed"} />
                        {s.video_prompt && <CopyBtn text={s.video_prompt} label="영상 프롬프트" />}
                      </Field>
                      <Field label="키프레임 이미지 프롬프트 (영문)">
                        <textarea value={s.image_prompt} onChange={(e) => update(s.id, { image_prompt: e.target.value })} rows={2} className={inputCls + " mono text-xs leading-relaxed"} />
                        {s.image_prompt && <CopyBtn text={s.image_prompt} label="이미지 프롬프트" />}
                      </Field>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------- OST ------------------------------- */
function OstCard({
  project,
  busy,
  onSave,
  onGenerate,
}: {
  project: CinemaProject;
  busy: boolean;
  onSave: (p: CinemaProject) => void;
  onGenerate: (hint?: string) => void;
}) {
  const [hint, setHint] = useState("");

  function update(idx: number, patch: Partial<OstTrack>) {
    const next = project.ost.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    onSave({ ...project, ost: next });
  }
  function remove(idx: number) {
    onSave({ ...project, ost: project.ost.filter((_, i) => i !== idx) });
  }

  return (
    <Card
      title={`🎵 5. OST / BGM (${project.ost.length}트랙)`}
      right={<GenerateBtn busy={busy} onClick={() => onGenerate(hint.trim() || undefined)} label="AI 자동 추천 (덮어쓰기)" />}
    >
      <div className="mb-3">
        <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="AI에게 추가 요청 (선택, 예: '피아노 메인', 'lofi 위주')" className={inputCls + " w-full"} />
      </div>
      {project.ost.length === 0 ? (
        <p className="text-sm text-subtext italic">아직 트랙 없음. 씬을 채운 뒤 ‘AI 자동 추천’ 을 눌러보세요.</p>
      ) : (
        <div className="space-y-3">
          {project.ost.map((t, i) => (
            <div key={t.id} className="bg-bg/60 border border-line rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">트랙 {i + 1}</div>
                <button onClick={() => remove(i)} className="text-xs text-bad border border-bad/30 rounded px-2 py-1 hover:bg-bad/10">
                  삭제
                </button>
              </div>
              <Field label="분위기">
                <input value={t.mood} onChange={(e) => update(i, { mood: e.target.value })} className={inputCls} />
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Field label="장르 / 스타일">
                  <input value={t.genre} onChange={(e) => update(i, { genre: e.target.value })} className={inputCls} />
                </Field>
                <Field label="BPM / 템포">
                  <input value={t.tempo_bpm} onChange={(e) => update(i, { tempo_bpm: e.target.value })} className={inputCls} />
                </Field>
              </div>
              <Field label="악기 구성">
                <input value={t.instrumentation} onChange={(e) => update(i, { instrumentation: e.target.value })} className={inputCls} />
              </Field>
              <Field label="레퍼런스 곡">
                <input value={t.reference_tracks} onChange={(e) => update(i, { reference_tracks: e.target.value })} className={inputCls} placeholder="아티스트 - 곡명" />
              </Field>
              <Field label="🔎 검색어 (Epidemic Sound · Artlist · YouTube Audio Library)">
                <div className="flex gap-2">
                  <input value={t.search_queries} onChange={(e) => update(i, { search_queries: e.target.value })} className={inputCls + " flex-1 mono text-xs"} />
                  {t.search_queries && <CopyBtn text={t.search_queries} label="검색어" />}
                </div>
              </Field>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------- 노트 ------------------------------- */
function NotesCard({ project, onSave }: { project: CinemaProject; onSave: (p: CinemaProject) => void }) {
  const [val, setVal] = useState(project.notes);
  useEffect(() => setVal(project.notes), [project.slug, project.notes]);
  return (
    <Card title="📝 감독 노트 (자유 메모)">
      <textarea value={val} onChange={(e) => setVal(e.target.value)} rows={4} className={inputCls + " leading-relaxed"} placeholder="촬영·편집·BGM 관련 메모, TODO 등" />
      {val !== project.notes && (
        <div className="mt-2 flex justify-end">
          <button onClick={() => onSave({ ...project, notes: val })} className="text-sm bg-accent text-bg rounded-md px-3 py-1.5 font-medium hover:bg-accent2">
            저장
          </button>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------- 신규 모달 ------------------------------- */
function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (slug: string) => void }) {
  const { push } = useToast();
  const [title, setTitle] = useState("");
  const [lengthType, setLengthType] = useState<LengthType>("short_film");
  const [genre, setGenre] = useState("");
  const [tone, setTone] = useState("");
  const [concept, setConcept] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (title.trim().length < 1) {
      push({ kind: "warn", title: "제목을 입력하세요" });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/cinema/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), length_type: lengthType, genre: genre.trim(), tone: tone.trim(), concept: concept.trim() }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      onCreated(j.project.slug);
    } catch (e) {
      push({ kind: "error", title: "생성 실패", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-panel border border-line rounded-2xl p-6 w-full max-w-lg space-y-4">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-bold">🎬 새 시나리오 프로젝트</h3>
          <button onClick={onClose} className="text-subtext hover:text-text">
            ✕
          </button>
        </div>
        <Field label="제목 *">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="예: 비 오는 일요일 카페" />
        </Field>
        <Field label="길이">
          <select value={lengthType} onChange={(e) => setLengthType(e.target.value as LengthType)} className={inputCls}>
            {(Object.keys(LENGTH_LABELS) as LengthType[]).map((k) => (
              <option key={k} value={k}>
                {LENGTH_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="장르">
            <input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="드라마, SF, 누아르..." className={inputCls} />
          </Field>
          <Field label="톤">
            <input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="잔잔함, 긴장감..." className={inputCls} />
          </Field>
        </div>
        <Field label="컨셉 메모 (선택)">
          <textarea value={concept} onChange={(e) => setConcept(e.target.value)} rows={4} className={inputCls + " leading-relaxed"} placeholder="아이디어, 영감, 키워드 자유롭게" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="text-sm border border-line rounded-md px-3 py-1.5 hover:bg-panel2">
            취소
          </button>
          <button onClick={submit} disabled={busy} className="text-sm bg-accent text-bg rounded-md px-3 py-1.5 font-medium hover:bg-accent2 disabled:opacity-50">
            {busy ? "생성 중..." : "만들기"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- 공용 ------------------------------- */
const inputCls = "w-full bg-bg border border-line rounded-md px-3 py-2 text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-subtext block mb-1">{label}</span>
      {children}
    </label>
  );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h3 className="text-base font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function GenerateBtn({ busy, onClick, label, small }: { busy: boolean; onClick: () => void; label: string; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={
        (small ? "text-xs px-2 py-1 " : "text-sm px-3 py-1.5 ") +
        "border border-accent text-accent rounded-md hover:bg-accent/10 disabled:opacity-50 disabled:cursor-wait"
      }
    >
      {busy ? "⏳ 생성 중..." : `✨ ${label}`}
    </button>
  );
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const { push } = useToast();
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          push({ kind: "success", title: `${label} 복사됨` });
        } catch {
          push({ kind: "error", title: "복사 실패" });
        }
      }}
      className="text-[11px] border border-line rounded px-2 py-1 hover:bg-panel2 mt-1"
    >
      📋 복사
    </button>
  );
}
