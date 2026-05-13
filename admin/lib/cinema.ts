import fs from "node:fs";
import path from "node:path";
import { CINEMA_DIR, cinemaFile, cinemaProjectDir } from "./paths";

export type LengthType = "shorts" | "short_film" | "series_pilot";

export const LENGTH_LABELS: Record<LengthType, string> = {
  shorts: "쇼츠 (30초~1분, 5~10컷)",
  short_film: "미니영화 (2~5분, 10~20씬)",
  series_pilot: "시리즈 파일럿 (3~8분, 시즌 가능)",
};

export interface Character {
  id: string;
  name: string;
  role: string; // 주인공/조연/배경 등
  appearance: string; // 외모 한 줄 (이미지 생성 일관성용)
  personality: string;
  visual_keywords: string; // Sora/Veo/MJ 프롬프트에 박을 짧은 키워드
}

export interface Scene {
  id: string;
  number: number;
  heading: string; // 예: "INT. 카페 - 낮"
  beat: string; // 이 씬에서 이야기적으로 무슨 일이 일어나는지 한 줄
  action: string; // 행동 묘사 (영화 시나리오 톤)
  dialog: string; // 대사 (있다면)
  shotlist: string; // WS/MS/CU 샷 분할, 카메라 무브, 화각
  video_prompt: string; // Sora/Veo 용 1~3문장 영상 프롬프트
  image_prompt: string; // 키프레임 이미지용 프롬프트
  duration_sec: number; // 추정 길이
}

export interface OstTrack {
  id: string;
  scene_ids: string[]; // 이 트랙이 깔리는 씬 (전체면 [])
  mood: string; // 분위기 한 줄
  genre: string; // 장르/스타일
  tempo_bpm: string; // BPM 범위 또는 단어 (slow/mid/fast)
  instrumentation: string; // 어떤 악기/소리
  reference_tracks: string; // 비슷한 실제 곡 1~3개 (~~ 풍)
  search_queries: string; // 저작권free 사이트 검색어 후보 (Epidemic Sound, Artlist, YouTube Audio Library)
}

export interface CinemaProject {
  slug: string;
  title: string;
  length_type: LengthType;
  genre: string; // 장르 (드라마/SF/코미디 등) — 자유 텍스트
  tone: string; // 톤 한두 줄
  concept: string; // 초기 컨셉 메모 (사용자 원시 입력)
  logline: string;
  synopsis: string;
  characters: Character[];
  scenes: Scene[];
  ost: OstTrack[];
  notes: string; // 감독 메모 (자유)
  created_at: string;
  updated_at: string;
}

export function emptyProject(slug: string): CinemaProject {
  const now = new Date().toISOString();
  return {
    slug,
    title: slug,
    length_type: "short_film",
    genre: "",
    tone: "",
    concept: "",
    logline: "",
    synopsis: "",
    characters: [],
    scenes: [],
    ost: [],
    notes: "",
    created_at: now,
    updated_at: now,
  };
}

export function ensureCinemaDir(): void {
  if (!fs.existsSync(CINEMA_DIR)) {
    fs.mkdirSync(CINEMA_DIR, { recursive: true });
  }
}

export function listProjects(): { slug: string; title: string; length_type: LengthType; updated_at: string }[] {
  ensureCinemaDir();
  const slugs = fs
    .readdirSync(CINEMA_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const items: { slug: string; title: string; length_type: LengthType; updated_at: string }[] = [];
  for (const slug of slugs) {
    const file = cinemaFile(slug);
    if (!fs.existsSync(file)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8")) as CinemaProject;
      items.push({
        slug: data.slug,
        title: data.title || data.slug,
        length_type: data.length_type,
        updated_at: data.updated_at,
      });
    } catch {
      /* ignore corrupt */
    }
  }
  items.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return items;
}

export function readProject(slug: string): CinemaProject | null {
  const file = cinemaFile(slug);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as CinemaProject;
  } catch {
    return null;
  }
}

export function writeProject(project: CinemaProject): void {
  ensureCinemaDir();
  const dir = cinemaProjectDir(project.slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  project.updated_at = new Date().toISOString();
  fs.writeFileSync(cinemaFile(project.slug), JSON.stringify(project, null, 2), "utf8");
}

export function deleteProject(slug: string): boolean {
  const dir = cinemaProjectDir(slug);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

export function makeSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const stamp = new Date().toISOString().slice(0, 10);
  return base ? `cine-${stamp}-${base}` : `cine-${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}

export function newSceneId(): string {
  return "sc-" + Math.random().toString(36).slice(2, 8);
}

export function newCharacterId(): string {
  return "ch-" + Math.random().toString(36).slice(2, 8);
}

export function newOstId(): string {
  return "ost-" + Math.random().toString(36).slice(2, 8);
}
