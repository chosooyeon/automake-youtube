import { NextResponse } from "next/server";
import { collectKeywords, type Keyword } from "@/lib/trends/naver-ac";
import { isBlogCategory, seedsFor, newsCategoryFor } from "@/lib/trends/blog-seeds";
import {
  fetchMetrics,
  hasSearchAdKeys,
  missingSearchAdKeys,
  normalizeKey,
  isGolden,
  type KeywordMetric,
} from "@/lib/trends/searchad";
import { feedsFor } from "@/lib/news/feeds";
import { collectFeeds, type NewsItem } from "@/lib/news/rss";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/** 검색량을 아는 키워드는 자동완성 휴리스틱보다 실제 지표로 재채점한다 */
function rescore(k: Keyword, m: KeywordMetric): { score: number; reasons: string[] } {
  const reasons = k.reasons.filter((r) => r !== "검색량↑");
  let score = k.score;

  // 검색량 구간별 가점 (휴리스틱 '검색량↑' 를 실측으로 대체)
  if (m.total >= 10000) {
    score += 6;
    reasons.push("검색량 1만+");
  } else if (m.total >= 1000) {
    score += 5;
    reasons.push("검색량 1천+");
  } else if (m.total >= 300) {
    score += 3;
    reasons.push("검색량 300+");
  } else if (m.total >= 100) {
    score += 2;
  } else {
    score -= 2; // 검색량이 거의 없으면 써도 유입이 없다
  }

  if (m.competition === "낮음") {
    score += 4;
    reasons.push("경쟁 낮음");
  } else if (m.competition === "중간") {
    score += 2;
  } else if (m.competition === "높음") {
    score -= 2;
  }

  if (isGolden(m)) reasons.push("황금키워드");

  return { score, reasons };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = url.searchParams.get("category");
  const region = (url.searchParams.get("region") ?? "").trim();
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "40", 10) || 40, 10), 80);

  if (!isBlogCategory(category)) {
    return NextResponse.json({ ok: false, error: "invalid_category" }, { status: 400 });
  }

  const seeds = seedsFor(category, region);
  if (seeds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "no_seeds", message: "이 카테고리는 지역명을 입력해야 키워드를 찾을 수 있어요." },
      { status: 400 }
    );
  }

  const newsCat = newsCategoryFor(category);

  // 키워드 발굴과 뉴스 수집은 서로 독립 → 병렬
  const [kw, news] = await Promise.all([
    collectKeywords({ seeds, region, expandTop: 8, limit: limit * 2 }),
    newsCat
      ? collectFeeds(feedsFor(newsCat), 8).catch(() => ({ items: [] as NewsItem[], results: [] }))
      : Promise.resolve({ items: [] as NewsItem[], results: [] }),
  ]);

  if (kw.keywords.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "no_keywords",
        message: "네이버 자동완성에서 키워드를 못 받았습니다. 잠시 후 다시 시도하세요.",
      },
      { status: 502 }
    );
  }

  // 검색광고 API 키가 있으면 실제 월간검색수·경쟁도를 붙인다.
  // 키가 없거나 실패해도 자동완성 결과만으로 정상 응답한다.
  // 힌트는 대표 10개만 — 그것만으로 연관키워드 1,000개+ 가 딸려온다.
  const hintTargets = kw.keywords.slice(0, 10).map((k) => k.text);
  const mx = await fetchMetrics(hintTargets, 2);

  const enriched = kw.keywords.map((k) => {
    const m = mx.all.get(normalizeKey(k.text));
    if (!m) return { ...k, metric: null as KeywordMetric | null };
    const { score, reasons } = rescore(k, m);
    return { ...k, score, reasons, metric: m };
  });

  // 검색광고가 덤으로 준 연관키워드 중 검색량 좋은 것도 후보에 합류.
  // 단 연관키워드는 주제에서 잘 샌다 (정부지원금 검색에 커뮤니티 브랜드명이 딸려옴).
  // → 시드에서 뽑은 핵심 토큰을 하나라도 포함해야 통과시킨다.
  const coreTokens = [
    ...new Set(
      seeds
        .flatMap((s) => s.split(/\s+/))
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    ),
  ];
  const onTopic = (text: string) => coreTokens.some((t) => text.includes(t));

  const known = new Set(enriched.map((k) => normalizeKey(k.text)));
  const bonus = [...mx.all.values()]
    .filter(
      (m) =>
        !known.has(m.key) &&
        m.total >= 300 &&
        m.competition !== "높음" &&
        onTopic(m.keyword)
    )
    .sort((a, b) => b.total - a.total)
    .slice(0, 15)
    .map((m) => ({
      text: m.keyword,
      depth: 1,
      seed: "검색광고 연관",
      rank: 0,
      score: (m.total >= 1000 ? 7 : 5) + (m.competition === "낮음" ? 3 : 0),
      reasons: [
        "연관키워드",
        m.total >= 1000 ? "검색량 1천+" : "검색량 300+",
        ...(m.competition === "낮음" ? ["경쟁 낮음"] : []),
        ...(isGolden(m) ? ["황금키워드"] : []),
      ],
      metric: m,
    }));

  const keywords = [...enriched, ...bonus]
    .sort((a, b) => b.score - a.score || (b.metric?.total ?? 0) - (a.metric?.total ?? 0))
    .slice(0, limit);

  return NextResponse.json({
    ok: true,
    category,
    region: region || null,
    fetchedAt: new Date().toISOString(),
    keywords,
    seedsUsed: kw.seedsUsed,
    seedStats: kw.seedStats,
    deadSeeds: kw.seedStats.filter((s) => s.count === 0).map((s) => s.seed),
    requests: kw.requests,
    news: news.items,
    searchAd: {
      enabled: hasSearchAdKeys(),
      missing: missingSearchAdKeys(),
      requests: mx.requests,
      matched: enriched.filter((k) => k.metric).length,
      pool: mx.all.size,
      error: mx.error,
    },
  });
}
