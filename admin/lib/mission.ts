/**
 * 메인 퀘스트 — 12주짜리 시즌 플랜의 일회성 미션.
 *
 * 데일리 퀘스트(반복)와 목적이 다르다. 이쪽은 "한 번 하면 끝나지만
 * 안 하면 나머지가 안 열리는 일"들이다. 그래서 챕터로 묶고 순서를 보여준다.
 *
 * **트랙이 여러 개다.** 수익화와 이직 준비는 목표도 기간도 달라서
 * 한 진행바에 섞으면 둘 다 흐려진다 (13/26 은 아무것도 말해주지 않는다).
 * 챕터 번호는 트랙 안에서만 유효하다 — 트랙이 다르면 CHAPTER 1 이 둘 있다.
 *
 * 잠금은 **시각적 안내일 뿐 강제하지 않는다.** 순서를 어겨도 체크할 수 있어야 한다 —
 * 도구가 사람을 막아서면 판을 안 열게 되고, 그게 이 프로젝트의 실패 경로다.
 */

export interface MissionChapter {
  id: number;
  title: string;
  weeks: string;
  subtitle: string;
}

export interface MissionTrack {
  id: string;
  emoji: string;
  /** 탭에 보이는 짧은 이름 */
  label: string;
  /** 보드 상단 제목 */
  headline: string;
  /** 이 시즌이 뭘 안 하는지 — 범위를 좁혀두는 문장 */
  note: string;
  chapters: MissionChapter[];
}

export const MISSION_TRACKS: MissionTrack[] = [
  {
    id: "income",
    emoji: "💰",
    label: "수익화",
    headline: "12주 수익화",
    note: "한 번만 하면 끝나지만, 안 하면 다음이 안 열리는 일들입니다.",
    chapters: [
      { id: 1, title: "문 열기", weeks: "1~2주차", subtitle: "콘텐츠를 늘리지 않습니다. 신청만 합니다." },
      { id: 2, title: "첫 수익", weeks: "3~4주차", subtitle: "제품 하나로 채널 두 개를 채웁니다." },
      { id: 3, title: "리듬 만들기", weeks: "5~8주차", subtitle: "같은 걸 네 번 반복합니다. 새로운 건 하지 않습니다." },
      { id: 4, title: "회수", weeks: "9~12주차", subtitle: "앞에서 쌓은 걸 돈으로 바꿉니다." },
    ],
  },
  {
    id: "career",
    emoji: "🧭",
    label: "이직 (블록 1)",
    headline: "금융권 이직 · 블록 1",
    note: "1년을 3개월씩 넷으로 자른 것 중 첫 조각입니다. 암기는 한 줄도 없습니다 — 자격증 대신 실제 지원이 마감일을 만듭니다.",
    chapters: [
      {
        id: 1,
        title: "판 확인하기",
        weeks: "1~2주차",
        subtitle: "지원하지 않습니다. 이미 가진 카드를 세고, 시장이 뭘 요구하는지 읽기만 합니다.",
      },
      {
        id: 2,
        title: "물건 만들기",
        weeks: "3~6주차",
        subtitle: "지원할 물건을 먼저 만듭니다. 없으면 기회가 와도 못 잡습니다.",
      },
      {
        id: 3,
        title: "지원 시작",
        weeks: "7~9주차",
        subtitle: "붙으려고가 아니라, 내 서류가 어디서 걸리는지 보려고 냅니다.",
      },
      {
        id: 4,
        title: "말해보기",
        weeks: "10~12주차",
        subtitle: "7년치를 문장으로 만들고, 실제로 입으로 말해봅니다.",
      },
    ],
  },
];

export const DEFAULT_TRACK = "income";

export function trackMeta(id: string): MissionTrack {
  return MISSION_TRACKS.find((t) => t.id === id) ?? MISSION_TRACKS[0];
}

export function isTrackId(id: unknown): id is string {
  return typeof id === "string" && MISSION_TRACKS.some((t) => t.id === id);
}

export function chapterMeta(track: string, id: number): MissionChapter {
  const t = trackMeta(track);
  return t.chapters.find((c) => c.id === id) ?? t.chapters[0];
}

export interface Mission {
  id: string;
  /** 어느 시즌 플랜인지 — 챕터 번호는 이 안에서만 유효하다 */
  track: string;
  chapter: number;
  title: string;
  /** 어떻게 하는지 / 왜 하는지 */
  detail: string;
  /** 이걸 끝내면 얻는 것 — 동기를 눈에 보이게 */
  reward: string;
  order: number;
  /** "YYYY-MM-DD" 완료일. null 이면 미완료 */
  doneDate: string | null;
}

export interface ChapterStat {
  chapter: number;
  total: number;
  done: number;
  /** 0~1 */
  pct: number;
  cleared: boolean;
  /** 앞 챕터를 다 끝냈는지 (표시용 — 체크를 막지는 않는다) */
  unlocked: boolean;
}

export function missionsOf(missions: Mission[], track: string, chapter: number): Mission[] {
  return missions
    .filter((m) => m.track === track && m.chapter === chapter)
    .sort((a, b) => a.order - b.order);
}

export function chapterStats(missions: Mission[], track: string): ChapterStat[] {
  let prevCleared = true;
  return trackMeta(track).chapters.map((c) => {
    const items = missionsOf(missions, track, c.id);
    const done = items.filter((m) => m.doneDate).length;
    const cleared = items.length > 0 && done === items.length;
    const stat: ChapterStat = {
      chapter: c.id,
      total: items.length,
      done,
      pct: items.length ? done / items.length : 0,
      cleared,
      unlocked: prevCleared,
    };
    prevCleared = cleared;
    return stat;
  });
}

export function totalStat(
  missions: Mission[],
  track: string
): { done: number; total: number; pct: number } {
  const items = missions.filter((m) => m.track === track);
  const done = items.filter((m) => m.doneDate).length;
  return { done, total: items.length, pct: items.length ? done / items.length : 0 };
}

/** 다음에 손대야 할 미션 하나 — "지금 뭐 하지"에 대한 답 */
export function nextMission(missions: Mission[], track: string): Mission | null {
  const pending = missions
    .filter((m) => m.track === track && !m.doneDate)
    .sort((a, b) => a.chapter - b.chapter || a.order - b.order);
  return pending[0] ?? null;
}
