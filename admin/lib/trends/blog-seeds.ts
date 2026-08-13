import type { CategoryId as NewsCategoryId } from "@/lib/instagram/categories";

export type BlogCategory =
  | "gov_support"
  | "baby_review"
  | "newlywed_diary"
  | "food_cafe"
  | "wedding_prep";

export const BLOG_CATEGORIES: BlogCategory[] = [
  "gov_support",
  "baby_review",
  "newlywed_diary",
  "food_cafe",
  "wedding_prep",
];

interface SeedDef {
  /** 지역명이 있을 때 "{지역} XXX" 로 조합할 시드 */
  regional: string[];
  /** 지역 무관 시드 */
  general: string[];
  /** 뉴스 RSS 도 같이 붙일 카테고리 (lib/news/feeds.ts 재사용) */
  newsCategory?: NewsCategoryId;
}

/**
 * 블로그 카테고리별 자동완성 시드.
 * 지역이 입력되면 regional 시드가 "남양주 출산지원금" 처럼 조합되어
 * 로컬 롱테일 키워드(경쟁 낮고 유입 확실)를 우선 발굴한다.
 */
const SEEDS: Record<BlogCategory, SeedDef> = {
  gov_support: {
    regional: ["출산지원금", "임산부 혜택", "육아 지원", "어린이집", "출산축하금"],
    general: ["부모급여", "첫만남이용권", "아동수당", "육아휴직 급여", "임신 바우처"],
    newsCategory: "parenting_subsidy",
  },
  baby_review: {
    regional: [],
    general: ["육아템", "신생아 용품", "기저귀", "카시트", "유모차", "아기띠", "젖병"],
  },
  newlywed_diary: {
    regional: ["신혼부부 전세", "아파트"],
    general: ["신혼집", "신혼집 인테리어", "신혼부부 대출", "결혼 1년차"],
  },
  food_cafe: {
    regional: ["맛집", "카페", "키즈카페", "브런치", "아기랑 갈만한 곳", "데이트"],
    general: [],
  },
  wedding_prep: {
    regional: ["웨딩홀", "스튜디오"],
    general: ["결혼준비", "상견례", "청첩장", "신혼가전", "스드메", "예단"],
  },
};

export function seedsFor(category: BlogCategory, region: string): string[] {
  const def = SEEDS[category];
  if (!def) return [];
  const r = region.trim();
  const regional = r ? def.regional.map((s) => `${r} ${s}`) : [];
  // 지역이 없는데 regional 시드만 있는 카테고리(맛집 등)는 시드가 비므로 일반형으로 대체
  const fallback = !r && def.general.length === 0 ? def.regional : [];
  return [...regional, ...def.general, ...fallback];
}

export function newsCategoryFor(category: BlogCategory): NewsCategoryId | null {
  return SEEDS[category]?.newsCategory ?? null;
}

export function isBlogCategory(v: unknown): v is BlogCategory {
  return typeof v === "string" && (BLOG_CATEGORIES as string[]).includes(v);
}
