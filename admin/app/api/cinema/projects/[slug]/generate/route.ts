import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { REPO_ROOT } from "@/lib/paths";
import {
  newCharacterId,
  newOstId,
  newSceneId,
  readProject,
  writeProject,
  type CinemaProject,
  type Character,
  type LengthType,
  type OstTrack,
  type Scene,
} from "@/lib/cinema";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Step = "logline" | "synopsis" | "characters" | "scenes" | "scene_prompt" | "ost";

interface GenerateBody {
  step: Step;
  scene_id?: string; // scene_prompt 일 때만
  hint?: string; // 사용자가 추가로 던지는 힌트/요청
}

const LENGTH_SCENE_HINT: Record<LengthType, string> = {
  shorts: "5~8개의 짧은 컷 단위 씬",
  short_film: "10~16개의 씬",
  series_pilot: "12~18개의 씬 (파일럿 1화 분량)",
};

function commonHeader(p: CinemaProject): string {
  return [
    `[프로젝트] ${p.title}`,
    `[형식] ${p.length_type}`,
    p.genre ? `[장르] ${p.genre}` : "",
    p.tone ? `[톤] ${p.tone}` : "",
    p.concept ? `[감독 컨셉 메모]\n${p.concept}` : "",
    p.logline ? `[기존 로그라인] ${p.logline}` : "",
    p.synopsis ? `[기존 시놉시스]\n${p.synopsis}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPrompt(step: Step, p: CinemaProject, body: GenerateBody): string {
  const header = commonHeader(p);
  const hint = body.hint?.trim() ? `\n[감독의 추가 요청] ${body.hint.trim()}\n` : "";

  if (step === "logline") {
    return [
      "너는 영화 시나리오 컨설턴트다. 한국 인디 단편/유튜브 영상용 시나리오를 도와준다.",
      "아래 프로젝트에 어울리는 로그라인 3개를 제안해라.",
      "로그라인 = 주인공 + 욕망 + 장애물 + 한 줄 컨셉. 25~50자 권장.",
      "",
      header,
      hint,
      "",
      "출력 형식 — JSON 한 덩어리만:",
      `{ "candidates": ["로그라인1", "로그라인2", "로그라인3"], "recommendation_index": 0, "reason": "왜 이게 추천인지 1~2줄" }`,
    ].join("\n");
  }

  if (step === "synopsis") {
    return [
      "너는 시나리오 컨설턴트다. 아래 프로젝트의 시놉시스를 3문단으로 작성해라.",
      "1문단: 세계관/주인공 소개. 2문단: 사건/갈등. 3문단: 클라이맥스와 마무리(열린/닫힌).",
      "한국어. 영화 시놉시스 톤. 톤·장르 일관성 유지.",
      "",
      header,
      hint,
      "",
      "출력 형식 — JSON 한 덩어리만:",
      `{ "synopsis": "1문단\\n\\n2문단\\n\\n3문단" }`,
    ].join("\n");
  }

  if (step === "characters") {
    return [
      "너는 캐스팅 디렉터다. 아래 프로젝트의 등장인물 시트를 만든다.",
      "주인공/조연 합쳐 2~4명. 시리즈면 3~5명. 각자 시각적 일관성 유지를 위해 외모/스타일 키워드를 명확히.",
      "이 키워드는 Sora/Veo/Midjourney 같은 영상·이미지 생성 도구에 그대로 박을 거니까 구체적이어야 한다.",
      "(예: '30대 후반 여성, 짧은 단발, 회색 트렌치코트, 안경, 차분한 표정')",
      "",
      header,
      hint,
      "",
      "출력 형식 — JSON 한 덩어리만:",
      `{
  "characters": [
    {
      "name": "이름",
      "role": "주인공/조연/단역 중 하나",
      "appearance": "외모 한 줄 (한국어, 구체적)",
      "personality": "성격 한 줄",
      "visual_keywords": "영상·이미지 프롬프트에 박을 짧은 영문 키워드, 쉼표 구분 (예: 'late-30s woman, short bob hair, grey trench coat, glasses, calm expression')"
    }
  ]
}`,
    ].join("\n");
  }

  if (step === "scenes") {
    const charBlock =
      p.characters.length > 0
        ? "\n[캐릭터]\n" +
          p.characters
            .map(
              (c) =>
                `- ${c.name} (${c.role}): ${c.appearance} / 성격: ${c.personality}`
            )
            .join("\n")
        : "";
    return [
      "너는 시나리오 작가다. 아래 프로젝트의 씬 브레이크다운을 만든다.",
      `씬 개수: ${LENGTH_SCENE_HINT[p.length_type]}.`,
      "각 씬에는 heading(슬러그라인: INT./EXT. 장소 - 시간대), beat(이야기상 무슨 일이 일어나는지 한 줄), action(행동 묘사 시나리오 톤), dialog(대사. 없으면 빈 문자열), duration_sec(추정 초).",
      "샷리스트와 영상 프롬프트는 이 단계에서 만들지 마라. 다른 단계에서 씬별로 따로 만든다.",
      "한국어. 시간 순서대로.",
      "",
      header,
      charBlock,
      hint,
      "",
      "출력 형식 — JSON 한 덩어리만:",
      `{
  "scenes": [
    {
      "heading": "INT. 카페 - 낮",
      "beat": "이 씬에서 어떤 변화가 일어나는지 한 줄",
      "action": "행동 묘사 (한국어, 2~5문장)",
      "dialog": "대사가 있다면 인물명: 대사 형식. 없으면 빈 문자열",
      "duration_sec": 25
    }
  ]
}`,
    ].join("\n");
  }

  if (step === "scene_prompt") {
    const scene = p.scenes.find((s) => s.id === body.scene_id);
    if (!scene) throw new Error("scene_not_found");
    const charBlock =
      p.characters.length > 0
        ? "[캐릭터 시각 키워드 — 영상에 등장하면 반드시 이 묘사 유지]\n" +
          p.characters
            .map((c) => `- ${c.name}: ${c.appearance} | ${c.visual_keywords}`)
            .join("\n")
        : "";
    return [
      "너는 영상 프롬프트 엔지니어다. Sora / Veo 같은 텍스트→영상 모델에 그대로 박을 프롬프트를 만든다.",
      "지금은 단일 씬 하나에 대해 (1) 샷리스트 (2) 영상 프롬프트 (3) 키프레임 이미지 프롬프트 를 만든다.",
      "",
      header,
      charBlock,
      "",
      "[이번 씬]",
      `씬 ${scene.number}: ${scene.heading}`,
      `beat: ${scene.beat}`,
      `action: ${scene.action}`,
      scene.dialog ? `dialog: ${scene.dialog}` : "",
      `예상 길이: ${scene.duration_sec}초`,
      hint,
      "",
      "[샷리스트 작성 규칙]",
      "- 한국어로 작성. 각 줄 형식: '샷N | WS/MS/CU/ECU | 카메라 무브(있다면) | 한 줄 묘사'.",
      "- 한 씬에 3~6개 샷.",
      "",
      "[영상 프롬프트 작성 규칙 (Sora/Veo 용)]",
      "- 영어로 작성. 1~3 문장.",
      "- subject + action + setting + camera + lighting + mood 순으로 자연어. 캐릭터 시각 키워드를 그대로 박을 것.",
      "- 길이는 '5 seconds, slow zoom in' 같이 명시.",
      "",
      "[키프레임 이미지 프롬프트 작성 규칙]",
      "- 영어로 작성. Midjourney/DALL-E 톤.",
      "- 영상의 가장 상징적인 한 프레임을 캡처한다고 가정. 화각·조명·색감 키워드 포함.",
      "",
      "출력 형식 — JSON 한 덩어리만:",
      `{
  "shotlist": "샷1 | WS | 페이드인 | ...\\n샷2 | MS | 정지 | ...\\n샷3 | CU | 슬로우 푸쉬인 | ...",
  "video_prompt": "...",
  "image_prompt": "..."
}`,
    ].join("\n");
  }

  if (step === "ost") {
    return [
      "너는 영상 음악 디렉터다. 아래 프로젝트에 어울리는 BGM/OST 컨셉을 제안한다.",
      "프로젝트 전체용 1트랙 + (씬이 있으면) 분위기가 다른 주요 모먼트용 1~2트랙. 합쳐서 2~4트랙.",
      "각 트랙은 '실제로 검색해서 찾을 수 있도록' 구체적이어야 한다. 추상적인 단어 금지.",
      "",
      header,
      p.scenes.length > 0
        ? "[씬 요약]\n" + p.scenes.map((s) => `${s.number}. ${s.heading} — ${s.beat}`).join("\n")
        : "",
      hint,
      "",
      "[트랙별 작성 규칙]",
      "- mood: 한 줄 (예: '잔잔하고 약간 쓸쓸한, 비 오는 일요일 오후')",
      "- genre: 구체적 (예: 'lo-fi piano with light strings', 'minimal ambient with field recording', 'cinematic neo-soul')",
      "- tempo_bpm: 'slow (60-75 BPM)' 같이",
      "- instrumentation: 실제 악기/소리",
      "- reference_tracks: 비슷한 분위기의 실제 곡 1~3개. '아티스트 - 곡명' 형식. 없으면 빈 문자열.",
      "- search_queries: Epidemic Sound / Artlist / YouTube Audio Library 같은 곳에서 그대로 검색창에 박을 영문 키워드 2~4개 (예: 'lofi piano emotional', 'cinematic minimal ambient rain')",
      "- scene_ids: 빈 배열이면 전체용. 특정 씬용이면 위 '씬 요약' 의 번호로부터 id 를 추론할 수 없으니 [] 로 두고 reference_tracks 안에 '씬 N~M 용' 같이 명시.",
      "",
      "출력 형식 — JSON 한 덩어리만:",
      `{
  "ost": [
    {
      "mood": "...",
      "genre": "...",
      "tempo_bpm": "...",
      "instrumentation": "...",
      "reference_tracks": "...",
      "search_queries": "..."
    }
  ]
}`,
    ].join("\n");
  }

  throw new Error("unknown_step");
}

function pickModel(step: Step): string {
  // CLAUDE.md 티어 매핑: 전략·창작은 opus, 절차 변환은 haiku
  if (step === "logline" || step === "synopsis" || step === "scenes") {
    return "claude-opus-4-7";
  }
  if (step === "characters" || step === "ost") {
    return "claude-sonnet-4-6";
  }
  return "claude-haiku-4-5-20251001"; // scene_prompt
}

function extractJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("응답에서 JSON 블록을 찾지 못했습니다.\n원본:\n" + stdout.slice(0, 2000));
  }
  const candidate = trimmed.slice(first, last + 1);
  try {
    return JSON.parse(candidate);
  } catch (e) {
    throw new Error(
      "JSON 파싱 실패: " + (e as Error).message + "\n후보:\n" + candidate.slice(0, 2000)
    );
  }
}

function callClaude(prompt: string, model: string): Promise<{ ok: true; parsed: unknown } | { ok: false; error: string; detail?: string }> {
  return new Promise((resolve) => {
    const args = ["-p", prompt, "--model", model, "--max-turns", "5"];
    const child = spawn("claude", args, { cwd: REPO_ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (c) => out.push(c));
    child.stderr.on("data", (c) => err.push(c));
    child.on("error", (e) => resolve({ ok: false, error: "spawn_error", detail: e.message }));
    child.on("close", (code) => {
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      if (code !== 0) {
        resolve({ ok: false, error: "claude_exit_nonzero", detail: stderr.slice(0, 2000) });
        return;
      }
      try {
        const parsed = extractJson(stdout);
        resolve({ ok: true, parsed });
      } catch (e) {
        resolve({ ok: false, error: "parse_failed", detail: (e as Error).message + "\n---\n" + stdout.slice(0, 4000) });
      }
    });
  });
}

interface LoglineResp { candidates: string[]; recommendation_index?: number; reason?: string }
interface SynopsisResp { synopsis: string }
interface CharactersResp { characters: Array<Omit<Character, "id">> }
interface ScenesResp { scenes: Array<Omit<Scene, "id" | "number" | "shotlist" | "video_prompt" | "image_prompt">> }
interface ScenePromptResp { shotlist: string; video_prompt: string; image_prompt: string }
interface OstResp { ost: Array<Omit<OstTrack, "id" | "scene_ids"> & { scene_ids?: string[] }> }

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json_body" }, { status: 400 });
  }
  const project = readProject(ctx.params.slug);
  if (!project) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  let prompt: string;
  try {
    prompt = buildPrompt(body.step, project, body);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }

  const result = await callClaude(prompt, pickModel(body.step));
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, detail: result.detail }, { status: 500 });
  }

  const parsed = result.parsed as Record<string, unknown>;

  // step별로 프로젝트에 머지하고 저장
  if (body.step === "logline") {
    const r = parsed as unknown as LoglineResp;
    const candidates = Array.isArray(r.candidates) ? r.candidates : [];
    const idx = typeof r.recommendation_index === "number" ? r.recommendation_index : 0;
    if (candidates[idx]) project.logline = candidates[idx];
    writeProject(project);
    return NextResponse.json({ ok: true, project, generated: { candidates, recommendation_index: idx, reason: r.reason ?? "" } });
  }

  if (body.step === "synopsis") {
    const r = parsed as unknown as SynopsisResp;
    project.synopsis = (r.synopsis || "").trim();
    writeProject(project);
    return NextResponse.json({ ok: true, project });
  }

  if (body.step === "characters") {
    const r = parsed as unknown as CharactersResp;
    project.characters = (r.characters || []).map((c) => ({
      id: newCharacterId(),
      name: c.name || "",
      role: c.role || "",
      appearance: c.appearance || "",
      personality: c.personality || "",
      visual_keywords: c.visual_keywords || "",
    }));
    writeProject(project);
    return NextResponse.json({ ok: true, project });
  }

  if (body.step === "scenes") {
    const r = parsed as unknown as ScenesResp;
    project.scenes = (r.scenes || []).map((s, i) => ({
      id: newSceneId(),
      number: i + 1,
      heading: s.heading || "",
      beat: s.beat || "",
      action: s.action || "",
      dialog: s.dialog || "",
      duration_sec: typeof s.duration_sec === "number" ? s.duration_sec : 0,
      shotlist: "",
      video_prompt: "",
      image_prompt: "",
    }));
    writeProject(project);
    return NextResponse.json({ ok: true, project });
  }

  if (body.step === "scene_prompt") {
    const r = parsed as unknown as ScenePromptResp;
    const scene = project.scenes.find((s) => s.id === body.scene_id);
    if (!scene) return NextResponse.json({ ok: false, error: "scene_not_found" }, { status: 400 });
    scene.shotlist = r.shotlist || "";
    scene.video_prompt = r.video_prompt || "";
    scene.image_prompt = r.image_prompt || "";
    writeProject(project);
    return NextResponse.json({ ok: true, project });
  }

  if (body.step === "ost") {
    const r = parsed as unknown as OstResp;
    project.ost = (r.ost || []).map((t) => ({
      id: newOstId(),
      scene_ids: Array.isArray(t.scene_ids) ? t.scene_ids : [],
      mood: t.mood || "",
      genre: t.genre || "",
      tempo_bpm: t.tempo_bpm || "",
      instrumentation: t.instrumentation || "",
      reference_tracks: t.reference_tracks || "",
      search_queries: t.search_queries || "",
    }));
    writeProject(project);
    return NextResponse.json({ ok: true, project });
  }

  return NextResponse.json({ ok: false, error: "unknown_step" }, { status: 400 });
}
