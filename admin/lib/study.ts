/**
 * 공부 노트 (클라우드 · 파이썬 · 라이브코테) — 순수 타입·집계. 서버·클라이언트 공용.
 *
 * 내용은 config/study/{subject}.json 에 있고 이 파일은 "형식" 만 안다.
 * 복습은 라이트너 상자(Leitner box) 5칸 — 맞히면 다음 칸(간격이 길어짐), 틀리면 1칸으로.
 * 달성률·연속일수는 일부러 계산하지 않는다. 이 화면은 성적표가 아니라 책이다.
 */

export type Block =
  | { type: "table"; title?: string; columns: string[]; rows: string[][]; note?: string }
  | { type: "code"; title?: string; lang?: string; code: string; note?: string }
  | { type: "note"; title?: string; text: string }
  | { type: "flow"; title?: string; steps: { label: string; sub?: string }[]; note?: string }
  | { type: "compare"; title?: string; items: { name: string; points: string[] }[]; note?: string }
  | { type: "tree"; title?: string; root: TreeNode; note?: string };

export type TreeNode = { label: string; sub?: string; children?: TreeNode[] };

export type Card = { id: string; q: string; a: string; hint?: string };

export type Chapter = {
  id: string;
  title: string;
  summary: string;
  blocks: Block[];
  cards: Card[];
};

export type Subject = {
  id: string;
  title: string;
  emoji: string;
  intro: string;
  order: number;
  chapters: Chapter[];
};

/** 카드 1장의 복습 상태. key = `${subject}/${chapter}/${card}` */
export type CardState = { box: number; due: string; seen: number; lastGrade?: Grade; lastAt?: string };
export type Progress = { cards: Record<string, CardState> };

export type Grade = "again" | "good";

export const BOX_MAX = 5;
/** 상자별 다음 복습까지 일수. 1칸=내일, 5칸=한 달 뒤 */
export const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30] as const;

export function cardKey(subjectId: string, chapterId: string, cardId: string): string {
  return `${subjectId}/${chapterId}/${cardId}`;
}

export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return todayKey(dt);
}

/** 채점 → 다음 상태. 틀리면 1칸으로 떨어지지만 seen 은 계속 쌓인다 (본 횟수는 실패가 아니다) */
export function grade(prev: CardState | undefined, g: Grade, today: string): CardState {
  const box = g === "good" ? Math.min(BOX_MAX, (prev?.box ?? 0) + 1) : 1;
  return {
    box,
    due: addDays(today, BOX_INTERVAL_DAYS[box]),
    seen: (prev?.seen ?? 0) + 1,
    lastGrade: g,
    lastAt: today,
  };
}

export function isDue(state: CardState | undefined, today: string): boolean {
  return !state || state.due <= today;
}

/** 오늘 복습할 카드 수 (안 본 카드 + 기한 지난 카드) */
export function countDue(subject: Subject, progress: Progress, today: string): number {
  let n = 0;
  for (const ch of subject.chapters)
    for (const c of ch.cards) if (isDue(progress.cards[cardKey(subject.id, ch.id, c.id)], today)) n++;
  return n;
}

export function countCards(subject: Subject): number {
  return subject.chapters.reduce((s, c) => s + c.cards.length, 0);
}

/** 상자 분포 [미학습, 1칸, …, 5칸] — 막대 하나로 "어디까지 익었나" 를 보여주는 용도 */
export function boxHistogram(subject: Subject, progress: Progress, chapterId?: string): number[] {
  const h = new Array(BOX_MAX + 1).fill(0);
  for (const ch of subject.chapters) {
    if (chapterId && ch.id !== chapterId) continue;
    for (const c of ch.cards) {
      const st = progress.cards[cardKey(subject.id, ch.id, c.id)];
      h[st?.box ?? 0]++;
    }
  }
  return h;
}

/**
 * 복습 큐. 기한 지난 것 → 안 본 것 순. 같은 등급 안에서는 챕터 순서 유지.
 * 셔플하지 않는다 — 책 순서로 봐야 앞 챕터 개념이 뒤 챕터 답에 연결된다.
 */
export function reviewQueue(
  subject: Subject,
  progress: Progress,
  today: string,
  chapterId?: string
): { key: string; chapter: Chapter; card: Card; state?: CardState }[] {
  const due: ReturnType<typeof reviewQueue> = [];
  const fresh: ReturnType<typeof reviewQueue> = [];
  for (const ch of subject.chapters) {
    if (chapterId && ch.id !== chapterId) continue;
    for (const card of ch.cards) {
      const key = cardKey(subject.id, ch.id, card.id);
      const state = progress.cards[key];
      if (!state) fresh.push({ key, chapter: ch, card });
      else if (state.due <= today) due.push({ key, chapter: ch, card, state });
    }
  }
  return [...due, ...fresh];
}

/** 표 셀·노트에서 검색. 용어를 어느 챕터 어느 표에서 봤는지 바로 찾기 위한 것 */
export function searchSubject(
  subject: Subject,
  needle: string
): { chapter: Chapter; where: string; text: string }[] {
  const q = needle.trim().toLowerCase();
  if (!q) return [];
  const hits: { chapter: Chapter; where: string; text: string }[] = [];
  for (const ch of subject.chapters) {
    for (const b of ch.blocks) {
      if (b.type === "table") {
        for (const row of b.rows) {
          const line = row.join(" · ");
          if (line.toLowerCase().includes(q)) hits.push({ chapter: ch, where: b.title ?? "표", text: line });
        }
      } else if (b.type === "note" && b.text.toLowerCase().includes(q)) {
        hits.push({ chapter: ch, where: b.title ?? "메모", text: b.text.slice(0, 160) });
      } else if (b.type === "compare") {
        for (const it of b.items) {
          const line = `${it.name}: ${it.points.join(" / ")}`;
          if (line.toLowerCase().includes(q)) hits.push({ chapter: ch, where: b.title ?? "비교", text: line });
        }
      }
    }
    for (const c of ch.cards) {
      if (c.q.toLowerCase().includes(q) || c.a.toLowerCase().includes(q))
        hits.push({ chapter: ch, where: "카드", text: `${c.q} → ${c.a}` });
    }
    if (hits.length > 60) break;
  }
  return hits.slice(0, 60);
}
