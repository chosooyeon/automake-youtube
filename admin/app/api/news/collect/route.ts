import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@/lib/paths";
import { CATEGORY_LIST, type CategoryId } from "@/lib/instagram/categories";
import { feedsFor } from "@/lib/news/feeds";
import { collectFeeds, type FeedFetchResult, type NewsItem } from "@/lib/news/rss";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CACHE_DIR = path.join(REPO_ROOT, ".cache", "news");
const CACHE_TTL_MS = 30 * 60 * 1000;

interface CacheShape {
  category: CategoryId;
  fetchedAt: string;
  items: NewsItem[];
  feeds: FeedFetchResult[];
}

function cacheFile(category: CategoryId): string {
  return path.join(CACHE_DIR, `${category}.json`);
}

function readCache(category: CategoryId): CacheShape | null {
  try {
    const raw = JSON.parse(fs.readFileSync(cacheFile(category), "utf8")) as CacheShape;
    if (!raw?.fetchedAt || !Array.isArray(raw.items)) return null;
    if (Date.now() - Date.parse(raw.fetchedAt) > CACHE_TTL_MS) return null;
    return raw;
  } catch {
    return null;
  }
}

function writeCache(data: CacheShape): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile(data.category), JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn("[news/collect] cache write failed:", (e as Error).message);
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = url.searchParams.get("category") as CategoryId | null;
  const refresh = url.searchParams.get("refresh") === "1";
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "30", 10) || 30, 5), 60);

  const valid = CATEGORY_LIST.map((c) => c.id) as string[];
  if (!category || !valid.includes(category)) {
    return NextResponse.json({ ok: false, error: "invalid_category" }, { status: 400 });
  }

  if (!refresh) {
    const cached = readCache(category);
    if (cached) {
      return NextResponse.json({
        ok: true,
        category,
        cached: true,
        fetchedAt: cached.fetchedAt,
        items: cached.items.slice(0, limit),
        feeds: cached.feeds,
      });
    }
  }

  const feeds = feedsFor(category);
  if (feeds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "no_feeds", message: `${category} 에 등록된 뉴스 소스가 없습니다.` },
      { status: 400 }
    );
  }

  const { items, results } = await collectFeeds(feeds, 60);

  if (items.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "no_items",
        message: "뉴스를 하나도 못 가져왔습니다. 네트워크 또는 피드 URL을 확인하세요.",
        feeds: results,
      },
      { status: 502 }
    );
  }

  const payload: CacheShape = {
    category,
    fetchedAt: new Date().toISOString(),
    items,
    feeds: results,
  };
  writeCache(payload);

  return NextResponse.json({
    ok: true,
    category,
    cached: false,
    fetchedAt: payload.fetchedAt,
    items: items.slice(0, limit),
    feeds: results,
  });
}
