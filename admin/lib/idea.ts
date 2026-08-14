/**
 * 아이디어 파킹 — 타입과 순수 함수 (클라이언트 공용, fs 없음).
 *
 * 목적이 "아이디어 관리"가 아니라 **실행 억제**라는 게 중요하다.
 * 새 갈래가 떠오르면 착수하는 대신 여기 적어두고, 시즌이 끝날 때만 꺼내 본다.
 * 그래서 시즌 후보(shortlist)에 상한이 있다.
 */

export const IDEA_CATEGORIES = [
  { id: "content", label: "콘텐츠 소재", emoji: "🎬", series: 1 },
  { id: "automation", label: "자동화 · 파이프라인", emoji: "⚙️", series: 3 },
  { id: "product", label: "앱 · 제품", emoji: "📱", series: 7 },
  { id: "money", label: "수익화", emoji: "💰", series: 6 },
  { id: "brand", label: "브랜드 원칙", emoji: "🎨", series: 5 },
  { id: "research", label: "알아볼 것", emoji: "🔍", series: 2 },
] as const;

export type CategoryId = (typeof IDEA_CATEGORIES)[number]["id"];
export const CATEGORY_IDS = IDEA_CATEGORIES.map((c) => c.id) as readonly CategoryId[];

export function categoryMeta(id: CategoryId) {
  return IDEA_CATEGORIES.find((c) => c.id === id) ?? IDEA_CATEGORIES[0];
}

/**
 * 색은 globals.css 의 --c-series-*.
 * 카테고리는 항상 이모지+이름을 달고 다니므로 색은 보조 신호다 (색만으로 구분하지 않는다).
 */
export function categoryColor(id: CategoryId): string {
  return `rgb(var(--c-series-${categoryMeta(id).series}))`;
}

export const IDEA_STATUSES = [
  { id: "parked", label: "파킹", emoji: "🅿️", hint: "적어두고 잊는다" },
  { id: "shortlist", label: "시즌 후보", emoji: "⭐", hint: "다음 시즌에 할지 검토" },
  { id: "doing", label: "진행중", emoji: "🔥", hint: "지금 하고 있다" },
  { id: "done", label: "완료", emoji: "✅", hint: "해냈다" },
  { id: "icebox", label: "보류", emoji: "🧊", hint: "안 하기로 했다 (지우진 않음)" },
] as const;

export type StatusId = (typeof IDEA_STATUSES)[number]["id"];
export const STATUS_IDS = IDEA_STATUSES.map((s) => s.id) as readonly StatusId[];

export function statusMeta(id: StatusId) {
  return IDEA_STATUSES.find((s) => s.id === id) ?? IDEA_STATUSES[0];
}

/** 한 시즌(12주)에 손댈 수 있는 새 갈래의 상한. 이걸 넘으면 딴 길로 새는 중이다. */
export const SHORTLIST_MAX = 3;

export interface Idea {
  id: string;
  title: string;
  note: string;
  category: CategoryId;
  status: StatusId;
  createdAt: string;
  updatedAt: string;
}

export function countByStatus(ideas: Idea[]): Record<StatusId, number> {
  const out = Object.fromEntries(STATUS_IDS.map((s) => [s, 0])) as Record<StatusId, number>;
  for (const i of ideas) out[i.status] = (out[i.status] ?? 0) + 1;
  return out;
}

export function countByCategory(ideas: Idea[]): Record<CategoryId, number> {
  const out = Object.fromEntries(CATEGORY_IDS.map((c) => [c, 0])) as Record<CategoryId, number>;
  for (const i of ideas) out[i.category] = (out[i.category] ?? 0) + 1;
  return out;
}
