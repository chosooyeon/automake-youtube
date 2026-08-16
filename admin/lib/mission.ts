/**
 * 메인 퀘스트 — 12주 수익화 플랜의 일회성 미션.
 *
 * 데일리 퀘스트(반복)와 목적이 다르다. 이쪽은 "한 번 하면 끝나지만
 * 안 하면 나머지가 안 열리는 일"들이다. 그래서 챕터로 묶고 순서를 보여준다.
 *
 * 잠금은 **시각적 안내일 뿐 강제하지 않는다.** 순서를 어겨도 체크할 수 있어야 한다 —
 * 도구가 사람을 막아서면 판을 안 열게 되고, 그게 이 프로젝트의 실패 경로다.
 */

export const MISSION_CHAPTERS = [
  {
    id: 1,
    title: "문 열기",
    weeks: "1~2주차",
    subtitle: "콘텐츠를 늘리지 않습니다. 신청만 합니다.",
  },
  {
    id: 2,
    title: "첫 수익",
    weeks: "3~4주차",
    subtitle: "제품 하나로 채널 두 개를 채웁니다.",
  },
  {
    id: 3,
    title: "리듬 만들기",
    weeks: "5~8주차",
    subtitle: "같은 걸 네 번 반복합니다. 새로운 건 하지 않습니다.",
  },
  {
    id: 4,
    title: "회수",
    weeks: "9~12주차",
    subtitle: "앞에서 쌓은 걸 돈으로 바꿉니다.",
  },
] as const;

export type ChapterId = (typeof MISSION_CHAPTERS)[number]["id"];

export function chapterMeta(id: number) {
  return MISSION_CHAPTERS.find((c) => c.id === id) ?? MISSION_CHAPTERS[0];
}

export interface Mission {
  id: string;
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

export function missionsOf(missions: Mission[], chapter: number): Mission[] {
  return missions.filter((m) => m.chapter === chapter).sort((a, b) => a.order - b.order);
}

export function chapterStats(missions: Mission[]): ChapterStat[] {
  let prevCleared = true;
  return MISSION_CHAPTERS.map((c) => {
    const items = missionsOf(missions, c.id);
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

export function totalStat(missions: Mission[]): { done: number; total: number; pct: number } {
  const done = missions.filter((m) => m.doneDate).length;
  return { done, total: missions.length, pct: missions.length ? done / missions.length : 0 };
}

/** 다음에 손대야 할 미션 하나 — "지금 뭐 하지"에 대한 답 */
export function nextMission(missions: Mission[]): Mission | null {
  const pending = missions
    .filter((m) => !m.doneDate)
    .sort((a, b) => a.chapter - b.chapter || a.order - b.order);
  return pending[0] ?? null;
}
