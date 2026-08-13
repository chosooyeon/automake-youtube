import { NextResponse } from "next/server";
import { collectKeywords } from "@/lib/trends/naver-ac";
import { isBlogCategory, seedsFor, newsCategoryFor } from "@/lib/trends/blog-seeds";
import { feedsFor } from "@/lib/news/feeds";
import { collectFeeds, type NewsItem } from "@/lib/news/rss";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    collectKeywords({ seeds, region, expandTop: 8, limit }),
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

  return NextResponse.json({
    ok: true,
    category,
    region: region || null,
    fetchedAt: new Date().toISOString(),
    keywords: kw.keywords,
    seedsUsed: kw.seedsUsed,
    requests: kw.requests,
    news: news.items,
  });
}
