/**
 * 네이버 자동완성(ac.search.naver.com) 기반 키워드 발굴.
 *
 * 왜 이걸 쓰나:
 * - Google Trends 급상승은 연예·스포츠 위주라 블로그 주제로 못 쓴다 (검증함).
 * - 네이버 자동완성은 "실제 사람들이 네이버에 치는 검색어"라 블로그 유입과 직결된다.
 * - API 키가 필요 없다. (검색광고 API 로 월간검색량까지 붙이려면 키 필요 — 후속 과제)
 *
 * 자동완성 노출 순서 ≒ 검색량 순이라, rank 를 점수에 반영한다.
 */

const AC_ENDPOINT = "https://ac.search.naver.com/nx/ac";

/** 블로그 주제로 부적합한 검색어를 걸러내는 공통 노이즈 패턴 */
const NOISE = /(알바|구인|채용|중고|당근|토렌트|다시보기|무료보기|주가|디시|성인)/;

export interface Keyword {
  text: string;
  /** 확장 깊이: 1 = 시드 직속, 2 = 롱테일 확장 */
  depth: number;
  /** 어느 시드에서 나왔는지 */
  seed: string;
  /** 자동완성 노출 순위 (0부터) */
  rank: number;
  /** 추천 점수 (높을수록 블로그 주제로 유리) */
  score: number;
  /** 점수 근거 라벨 */
  reasons: string[];
}

/** 자동완성 1회 조회 */
async function suggest(query: string, timeoutMs = 7000): Promise<string[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url =
      `${AC_ENDPOINT}?q=${encodeURIComponent(query)}` +
      `&st=100&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Referer: "https://search.naver.com/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    // 형식: { items: [ [ ["키워드"], ["키워드2"], … ] ] }
    const raw = json?.items?.[0];
    if (!Array.isArray(raw)) return [];
    return raw.map((a: any) => (Array.isArray(a) ? a[0] : a)).filter((s: any) => typeof s === "string");
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** 동시 요청 수를 제한해서 배치 실행 (네이버에 예의) */
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  }
  return out;
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * 블로그 주제로서의 유리함을 점수화.
 * 롱테일(어절 많음) + 지역 포함 = 경쟁 낮고 유입 확실 → 높은 점수.
 */
function scoreKeyword(text: string, depth: number, rank: number, region: string): {
  score: number;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];

  const wc = wordCount(text);
  if (wc >= 3) {
    score += 3;
    reasons.push("롱테일");
  } else if (wc === 2) {
    score += 1;
  }

  if (region && text.includes(region)) {
    score += 3;
    reasons.push("지역");
  }

  // 자동완성 상위 = 검색량 많음
  if (rank <= 2) {
    score += 2;
    reasons.push("검색량↑");
  } else if (rank <= 5) {
    score += 1;
  }

  // 정보 탐색형 어미 = 블로그가 먹히는 의도
  if (/(방법|후기|추천|비용|가격|신청|준비물|순서|차이|비교|언제|얼마|조건|자격)/.test(text)) {
    score += 2;
    reasons.push("정보검색형");
  }

  // depth 2 는 더 세부적인 롱테일
  if (depth === 2) {
    score += 1;
  }

  return { score, reasons };
}

export interface CollectOptions {
  seeds: string[];
  region: string;
  /** 2단계 확장에 사용할 1단계 키워드 수 (0이면 확장 안 함) */
  expandTop: number;
  limit: number;
}

export interface SeedStat {
  seed: string;
  count: number;
}

export interface CollectResult {
  keywords: Keyword[];
  seedsUsed: string[];
  /** 시드별 자동완성 결과 수 — 0건 시드를 UI 에 드러내기 위함 */
  seedStats: SeedStat[];
  /** 실제로 보낸 자동완성 요청 수 */
  requests: number;
}

export async function collectKeywords(opts: CollectOptions): Promise<CollectResult> {
  const { seeds, region, expandTop, limit } = opts;
  const seen = new Map<string, Keyword>();
  let requests = 0;

  function add(text: string, depth: number, seed: string, rank: number) {
    const t = text.trim();
    if (!t || t.length < 2 || NOISE.test(t)) return;
    const key = t.replace(/\s+/g, "");
    const existing = seen.get(key);
    // 같은 키워드가 여러 시드에서 나오면 더 얕은 depth(=더 대표적인 것) 유지
    if (existing && existing.depth <= depth) return;
    const { score, reasons } = scoreKeyword(t, depth, rank, region);
    seen.set(key, { text: t, depth, seed, rank, score, reasons });
  }

  // 1단계: 시드 확장
  const lvl1 = await mapLimit(seeds, 6, async (s) => {
    requests++;
    return { seed: s, results: await suggest(s) };
  });
  const seedStats: SeedStat[] = lvl1.map(({ seed, results }) => ({
    seed,
    count: results.length,
  }));
  for (const { seed, results } of lvl1) {
    results.forEach((r, i) => add(r, 1, seed, i));
  }

  // 2단계: 1단계 상위 키워드를 다시 확장해 롱테일 확보
  if (expandTop > 0) {
    const level1 = [...seen.values()].filter((k) => k.depth === 1);
    const toExpand = level1
      .sort((a, b) => b.score - a.score)
      .slice(0, expandTop)
      .map((k) => k.text);

    const lvl2 = await mapLimit(toExpand, 6, async (s) => {
      requests++;
      return { seed: s, results: await suggest(s) };
    });
    for (const { seed, results } of lvl2) {
      results.forEach((r, i) => add(r, 2, seed, i));
    }
  }

  const keywords = [...seen.values()]
    .sort((a, b) => b.score - a.score || a.text.length - b.text.length)
    .slice(0, limit);

  return { keywords, seedsUsed: seeds, seedStats, requests };
}
