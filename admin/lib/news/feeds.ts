import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@/lib/paths";
import type { CategoryId } from "@/lib/instagram/categories";

export interface FeedSource {
  label: string;
  url: string;
  /** 정렬 가중치. 키워드 전용 피드만 >0 */
  priority?: number;
}

/** Google 뉴스 RSS 검색 (공식 엔드포인트, 크롤링 아님) */
function googleNewsKo(query: string, window = "7d"): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(
    `${query} when:${window}`
  )}&hl=ko&gl=KR&ceid=KR:ko`;
}

function googleNewsEn(query: string, window = "7d"): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(
    `${query} when:${window}`
  )}&hl=en-US&gl=US&ceid=US:en`;
}

/**
 * 카테고리별 기본 뉴스 소스.
 * admin/data/news_feeds.json 을 만들면 카테고리 단위로 덮어쓸 수 있다.
 * 형식: { "it_news": [{ "label": "…", "url": "https://…" }] }
 */
const DEFAULT_FEEDS: Record<CategoryId, FeedSource[]> = {
  parenting_subsidy: [
    { label: "부모급여·아동수당", url: googleNewsKo("부모급여 OR 아동수당 지원") },
    { label: "첫만남이용권·출산지원금", url: googleNewsKo("첫만남이용권 OR 출산지원금") },
    { label: "보육료·어린이집 지원", url: googleNewsKo("어린이집 보육료 지원 정책") },
    { label: "육아휴직·육아기 단축", url: googleNewsKo("육아휴직 급여 OR 육아기 근로시간 단축") },
    { label: "지자체 출산장려금", url: googleNewsKo("출산장려금") },
  ],
  youth_subsidy: [
    { label: "청년도약계좌", url: googleNewsKo("청년도약계좌") },
    { label: "청년 주거지원", url: googleNewsKo("청년월세 지원 OR 청년 전세보증금") },
    { label: "청년 취업지원", url: googleNewsKo("국민취업지원제도 OR 청년 취업지원금") },
    { label: "청년 정책 일반", url: googleNewsKo("청년 지원사업 신청 접수") },
  ],
  stocks: [
    { label: "국내 증시", url: googleNewsKo("코스피 OR 코스닥 증시 마감") },
    { label: "ETF·배당", url: googleNewsKo("ETF 배당 상장") },
    { label: "금리·환율", url: googleNewsKo("한국은행 기준금리 OR 원달러 환율") },
    { label: "미국 증시", url: googleNewsEn("S&P 500 OR Nasdaq market") },
    { label: "연준·매크로", url: googleNewsEn("Federal Reserve interest rate decision") },
  ],
  it_news: [
    { label: "Hacker News", url: "https://hnrss.org/frontpage?points=200" },
    { label: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
    { label: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
    { label: "TechCrunch", url: "https://techcrunch.com/feed/" },
    { label: "AI 업계", url: googleNewsEn("OpenAI OR Anthropic OR Google DeepMind") },
    { label: "빅테크 (국내보도)", url: googleNewsKo("빅테크 AI 발표") },
  ],
};

/**
 * 키워드 뉴스 검색에 붙일 카테고리 맥락.
 * '남양주' 만 검색하면 공공택지·공연 같은 일반 뉴스가 나온다.
 *
 * 한정어는 반드시 1단어여야 한다 — 실측 결과 '남양주 출산 육아 지원금' 은 0건,
 * '남양주 출산' 은 18건이었다. 조합이 길수록 Google 뉴스가 못 찾는다.
 * 지역 단위 소식은 자주 안 나오므로 기간도 90일로 넓힌다.
 */
const KEYWORD_QUALIFIER: Record<CategoryId, string[]> = {
  parenting_subsidy: ["출산", "육아"],
  youth_subsidy: ["청년"],
  stocks: ["증시"],
  it_news: ["AI"],
};

const KEYWORD_WINDOW = "90d";

const OVERRIDE_FILE = path.join(REPO_ROOT, "admin", "data", "news_feeds.json");

function loadOverrides(): Partial<Record<CategoryId, FeedSource[]>> {
  try {
    const raw = JSON.parse(fs.readFileSync(OVERRIDE_FILE, "utf8"));
    if (!raw || typeof raw !== "object") return {};
    const out: Partial<Record<CategoryId, FeedSource[]>> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!Array.isArray(v)) continue;
      const list = v.filter(
        (f: any) => f && typeof f.label === "string" && typeof f.url === "string"
      );
      if (list.length > 0) out[k as CategoryId] = list;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * 카테고리 기본 피드 + (선택) 사용자가 친 키워드 전용 피드.
 *
 * 기본 피드는 카테고리 고정이라 '남양주' 를 입력해도 결과가 안 바뀐다.
 * 그래서 키워드가 들어오면 그 키워드 전용 뉴스 검색 피드를 맨 앞에 붙인다.
 */
export function feedsFor(category: CategoryId, keyword = ""): FeedSource[] {
  const overrides = loadOverrides();
  const base = overrides[category] ?? DEFAULT_FEEDS[category] ?? [];

  const q = keyword.trim();
  if (!q) return base;

  const extra: FeedSource[] = [
    // 카테고리 맥락을 묶은 검색을 먼저 — 주제에 맞는 소재가 여기서 나온다
    // 카테고리 맥락이 붙은 검색이 가장 정확 → priority 2
    ...(KEYWORD_QUALIFIER[category] ?? []).map((qual) => ({
      label: `🔍 ${q} ${qual}`,
      url: googleNewsKo(`${q} ${qual}`, KEYWORD_WINDOW),
      priority: 2,
    })),
    { label: `🔍 ${q}`, url: googleNewsKo(q), priority: 1 },
  ];
  // 해외 IT 는 영문 검색도 같이 걸어야 원문 기사가 잡힌다
  if (category === "it_news") {
    extra.push({ label: `🔍 ${q} (EN)`, url: googleNewsEn(q), priority: 1 });
  }
  return [...extra, ...base];
}

export { DEFAULT_FEEDS, OVERRIDE_FILE };
