/**
 * 종목 → 업종 코드 조회 (국내 전용).
 *
 * 왜 필요한가: "최대 5종목" 규칙은 종목 수만 세고 업종은 안 센다.
 * 그래서 KB금융·신한지주·하나금융지주를 같은 날 세 칸에 담을 수 있었고,
 * 은행주가 한 번 흔들리자 세 칸이 같이 죽었다 (2026-06-05 → 06-08, 3연속 손절).
 * 분산으로 보이는 집중을 막으려면 업종을 알아야 한다.
 *
 * 출처는 네이버 `integration` 엔드포인트의 `industryCode` 다. 숫자 코드만 오고
 * 사람이 읽는 이름은 안 온다 — **그래도 충분하다.** 필요한 건 "같은 업종인가" 뿐이고,
 * 이름을 얻으려고 요청을 한 번 더 하면 종목 수만큼 비용이 두 배가 된다.
 *
 * ⚠ 오늘 기준 스냅샷이다. 과거 시점의 업종 분류가 아니라서, 지주사 전환처럼
 * 업종이 바뀐 종목은 과거 구간에 오늘 분류가 소급된다. 은행/자동차 같은
 * 큰 덩어리를 가르는 용도에선 문제가 없지만 정밀한 귀속에는 쓰지 말 것.
 */

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../paths";

const CACHE_DIR = path.join(REPO_ROOT, ".cache", "stock");
const CACHE_FILE = path.join(CACHE_DIR, "industry-KR.json");
/** 업종은 거의 안 바뀐다 — 30일 */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface CacheShape {
  fetchedAt: number;
  /** 종목코드 → 업종코드. 조회 실패는 빈 문자열로 남겨 재시도를 줄인다 */
  map: Record<string, string>;
}

function readCache(): CacheShape {
  try {
    const c = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as CacheShape;
    if (Date.now() - c.fetchedAt < TTL_MS && c.map) return c;
  } catch {
    /* 없거나 깨졌으면 새로 만든다 */
  }
  return { fetchedAt: Date.now(), map: {} };
}

function writeCache(c: CacheShape): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(c, null, 2), "utf8");
}

async function fetchOne(code: string): Promise<string> {
  try {
    const res = await fetch(`https://m.stock.naver.com/api/stock/${code}/integration`, {
      headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*" },
    });
    if (!res.ok) return "";
    const j = (await res.json()) as { industryCode?: string };
    return String(j.industryCode ?? "");
  } catch {
    // 비공식 API라 언제든 실패할 수 있다. 한 종목 실패로 백테스트 전체를 멈추지 않는다
    return "";
  }
}

/**
 * 종목코드 목록 → 업종코드 맵. 캐시에 없는 것만 네트워크로 받는다.
 * 업종을 못 받은 종목은 맵에서 빠지고, 호출부는 그런 종목을 **제약 없음**으로 다룬다
 * (알 수 없다는 이유로 매매 기회를 지우면 백테스트 결과가 조용히 왜곡된다).
 */
export async function fetchIndustries(codes: string[]): Promise<Map<string, string>> {
  const cache = readCache();
  const missing = codes.filter((c) => cache.map[c] === undefined);

  if (missing.length) {
    process.stdout.write(`업종 조회 중 (${missing.length}종목, 캐시 ${codes.length - missing.length})...`);
    // 비공식 API라 동시요청을 낮게 — 8개씩
    for (let i = 0; i < missing.length; i += 8) {
      const batch = missing.slice(i, i + 8);
      const got = await Promise.all(batch.map(fetchOne));
      batch.forEach((c, k) => (cache.map[c] = got[k]));
    }
    cache.fetchedAt = Date.now();
    writeCache(cache);
    process.stdout.write(" 완료\n");
  }

  const out = new Map<string, string>();
  for (const c of codes) {
    const v = cache.map[c];
    if (v) out.set(c, v);
  }
  return out;
}
