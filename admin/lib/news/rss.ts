/**
 * 의존성 없는 RSS 2.0 / Atom 파서 + 페처.
 *
 * 외부 XML 라이브러리를 쓰지 않는 이유: admin 은 이미 무거운 편이고,
 * RSS/Atom 은 구조가 단순해서 정규식 파싱으로 충분히 안정적임.
 * 파싱 실패한 피드는 통째로 버리고 나머지만 반환한다 (전체 실패 금지).
 */

export interface NewsItem {
  /** 정규화된 고유키 (중복 제거용) */
  key: string;
  title: string;
  link: string;
  /** 발행 매체명. Google News 는 <source>, 그 외는 피드 라벨 */
  source: string;
  /** ISO8601. 파싱 실패 시 null */
  publishedAt: string | null;
  /** 본문 요약 (태그 제거·280자 컷) */
  summary: string;
}

export interface FeedFetchResult {
  label: string;
  url: string;
  ok: boolean;
  count: number;
  error?: string;
}

/**
 * Google 뉴스 RSS 는 저품질 매체의 도배 글도 같이 물어온다
 * (실제로 "포커 토토사이트" 류가 육아 지원금 쿼리에 섞여 들어옴).
 * 제목에 이게 걸리면 통째로 버린다.
 */
const SPAM = /(토토|카지노|바카라|슬롯|먹튀|betting|파워볼|성인용품|비아그라|대출\s*상담|출장\s*(마사지|안마))/i;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  "#039": "'",
  "#34": '"',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+|#0?\d+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, " ");
}

function clean(raw: string | null, maxLen = 0): string {
  if (!raw) return "";
  let s = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  s = decodeEntities(stripTags(s)).replace(/\s+/g, " ").trim();
  if (maxLen > 0 && s.length > maxLen) s = s.slice(0, maxLen).trimEnd() + "…";
  return s;
}

/** 블록 안에서 첫 번째 <name>…</name> 의 내부 텍스트를 꺼낸다 */
function tagText(block: string, name: string): string | null {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i");
  const m = block.match(re);
  return m ? m[1] : null;
}

/** <link ... href="..."/> 형태 (Atom) */
function atomLink(block: string): string | null {
  // rel="alternate" 우선, 없으면 rel 없는 첫 link
  const all = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  const pick =
    all.find((a) => /rel\s*=\s*["']alternate["']/i.test(a)) ??
    all.find((a) => !/rel\s*=\s*["']/i.test(a)) ??
    all[0];
  if (!pick) return null;
  const href = pick.match(/href\s*=\s*["']([^"']+)["']/i);
  return href ? decodeEntities(href[1]) : null;
}

function parseDate(raw: string | null): string | null {
  if (!raw) return null;
  const t = Date.parse(clean(raw));
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

/** 추적 파라미터를 떼고 중복 판정용 키를 만든다 */
function makeKey(link: string, title: string): string {
  let base = link;
  try {
    const u = new URL(link);
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|ref|fbclid|gclid|oc$)/i.test(p)) u.searchParams.delete(p);
    }
    base = u.toString();
  } catch {
    /* 상대 URL 등 — 원문 그대로 */
  }
  const normTitle = title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return base || normTitle;
}

/**
 * Google News 는 제목이 "실제 제목 - 매체명" 형태이고 <source> 에 매체명이 들어있다.
 * 매체명 접미사를 떼어 카드 제목이 지저분해지지 않게 한다.
 */
function trimSourceSuffix(title: string, source: string): string {
  if (!source) return title;
  const suffix = ` - ${source}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
}

export function parseFeed(xml: string, fallbackSource: string): NewsItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)];
  const items: NewsItem[] = [];

  for (const [, , block] of blocks) {
    const title = clean(tagText(block, "title"));
    if (!title || SPAM.test(title)) continue;

    const linkRaw = clean(tagText(block, "link")) || atomLink(block) || "";
    const link = linkRaw.trim();
    if (!link) continue;

    // Google News RSS: <source url="…">매체명</source>
    const source = clean(tagText(block, "source")) || fallbackSource;

    const publishedAt =
      parseDate(tagText(block, "pubDate")) ??
      parseDate(tagText(block, "published")) ??
      parseDate(tagText(block, "updated")) ??
      parseDate(tagText(block, "dc:date"));

    const summary = clean(
      tagText(block, "description") ??
        tagText(block, "summary") ??
        tagText(block, "content:encoded") ??
        tagText(block, "content"),
      280
    );

    items.push({
      key: makeKey(link, title),
      title: trimSourceSuffix(title, source),
      link,
      source,
      publishedAt,
      summary,
    });
  }
  return items;
}

export async function fetchFeed(
  url: string,
  label: string,
  timeoutMs = 9000
): Promise<{ items: NewsItem[]; result: FeedFetchResult }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        // 일부 매체는 UA 없는 요청을 403 으로 막는다
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) {
      return { items: [], result: { label, url, ok: false, count: 0, error: `HTTP ${res.status}` } };
    }
    const xml = await res.text();
    const items = parseFeed(xml, label);
    return { items, result: { label, url, ok: true, count: items.length } };
  } catch (e) {
    const msg = (e as Error)?.name === "AbortError" ? "timeout" : (e as Error)?.message || "fetch failed";
    return { items: [], result: { label, url, ok: false, count: 0, error: msg } };
  } finally {
    clearTimeout(timer);
  }
}

/** 여러 피드를 병렬 수집 → 중복 제거 → 최신순 정렬 */
export async function collectFeeds(
  feeds: Array<{ label: string; url: string }>,
  limit: number
): Promise<{ items: NewsItem[]; results: FeedFetchResult[] }> {
  const settled = await Promise.all(feeds.map((f) => fetchFeed(f.url, f.label)));

  // 링크 기준만으로는 부족하다: 같은 기사가 여러 Google 뉴스 쿼리에서
  // 서로 다른 리다이렉트 URL 로 오기 때문에 제목 기준 중복도 같이 걸러야 한다.
  const seenLink = new Set<string>();
  const seenTitle = new Set<string>();
  const merged: NewsItem[] = [];
  for (const s of settled) {
    for (const it of s.items) {
      const titleKey = it.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      if (seenLink.has(it.key) || seenTitle.has(titleKey)) continue;
      seenLink.add(it.key);
      seenTitle.add(titleKey);
      merged.push(it);
    }
  }

  merged.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });

  return { items: merged.slice(0, limit), results: settled.map((s) => s.result) };
}
