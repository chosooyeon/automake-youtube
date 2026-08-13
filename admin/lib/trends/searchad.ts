import crypto from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * 네이버 검색광고 API — 키워드도구(keywordstool).
 *
 * 자동완성(naver-ac.ts)이 "무슨 키워드가 있나"를 알려준다면,
 * 여기는 "그게 월 몇 번 검색되고 경쟁이 얼마나 센가"를 알려준다.
 * 둘을 합쳐야 황금키워드(검색량 높고 경쟁 낮음)를 고를 수 있다.
 *
 * 인증: X-Signature = base64(HMAC-SHA256(secret, `${timestamp}.${method}.${path}`))
 * 키가 없으면 조용히 비활성 — 자동완성만으로도 패널은 동작해야 한다.
 */

const BASE = "https://api.searchad.naver.com";
const PATH = "/keywordstool";

/** 키워드도구는 한 요청에 힌트 키워드 5개까지 */
const HINTS_PER_REQUEST = 5;

export type CompetitionIndex = "높음" | "중간" | "낮음";

export interface KeywordMetric {
  /** 공백 제거된 정규화 키워드 (매칭 키) */
  key: string;
  keyword: string;
  /** 월간 PC 검색수 */
  pc: number;
  /** 월간 모바일 검색수 */
  mobile: number;
  /** pc + mobile */
  total: number;
  /** 검색수가 '< 10' 으로 마스킹된 저볼륨 키워드인지 */
  masked: boolean;
  competition: CompetitionIndex | null;
  /** 노출 광고 평균 depth (높을수록 상업성·경쟁 큼) */
  adDepth: number | null;
}

export function hasSearchAdKeys(): boolean {
  return Boolean(
    getEnv("NAVER_SEARCHAD_API_KEY") &&
      getEnv("NAVER_SEARCHAD_SECRET") &&
      getEnv("NAVER_SEARCHAD_CUSTOMER_ID")
  );
}

/** 어떤 키가 비어있는지 사용자에게 알려주기 위한 진단 */
export function missingSearchAdKeys(): string[] {
  const need = [
    "NAVER_SEARCHAD_API_KEY",
    "NAVER_SEARCHAD_SECRET",
    "NAVER_SEARCHAD_CUSTOMER_ID",
  ];
  return need.filter((k) => !getEnv(k));
}

function sign(timestamp: string, method: string, path: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${method}.${path}`)
    .digest("base64");
}

/** '1,230' / '< 10' / 숫자 → number */
function parseCount(v: unknown): { n: number; masked: boolean } {
  if (typeof v === "number") return { n: v, masked: false };
  if (typeof v !== "string") return { n: 0, masked: false };
  const s = v.trim();
  if (s.startsWith("<")) {
    // '< 10' 은 실제 값을 안 알려줌 — 보수적으로 9 로 취급
    return { n: 9, masked: true };
  }
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  return { n: Number.isFinite(n) ? n : 0, masked: false };
}

export function normalizeKey(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchBatch(hints: string[], timeoutMs = 10000): Promise<KeywordMetric[]> {
  const apiKey = getEnv("NAVER_SEARCHAD_API_KEY")!;
  const secret = getEnv("NAVER_SEARCHAD_SECRET")!;
  const customerId = getEnv("NAVER_SEARCHAD_CUSTOMER_ID")!;

  const timestamp = String(Date.now());
  // 힌트 키워드는 공백을 제거해서 넘겨야 한다 (API 규격)
  const hintParam = hints.map((h) => h.replace(/\s+/g, "")).join(",");
  const url = `${BASE}${PATH}?hintKeywords=${encodeURIComponent(hintParam)}&showDetail=1`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "X-Timestamp": timestamp,
        "X-API-KEY": apiKey,
        "X-Customer": customerId,
        "X-Signature": sign(timestamp, "GET", PATH, secret),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new Error(`검색광고 API ${res.status}: ${body.slice(0, 160)}`);
      (err as any).status = res.status;
      throw err;
    }
    const json: any = await res.json();
    const list = Array.isArray(json?.keywordList) ? json.keywordList : [];
    return list.map((k: any): KeywordMetric => {
      const pc = parseCount(k.monthlyPcQcCnt);
      const mo = parseCount(k.monthlyMobileQcCnt);
      const depth = Number(k.plAvgDepth);
      return {
        key: normalizeKey(String(k.relKeyword ?? "")),
        keyword: String(k.relKeyword ?? ""),
        pc: pc.n,
        mobile: mo.n,
        total: pc.n + mo.n,
        masked: pc.masked || mo.masked,
        competition: ["높음", "중간", "낮음"].includes(k.compIdx) ? k.compIdx : null,
        adDepth: Number.isFinite(depth) ? depth : null,
      };
    });
  } finally {
    clearTimeout(timer);
  }
}

export interface MetricsResult {
  /** 조회로 알게 된 모든 키워드의 지표 (정규화 키워드 → 지표) */
  all: Map<string, KeywordMetric>;
  requests: number;
  error: string | null;
}

/**
 * 힌트 키워드들의 검색량을 조회한다.
 *
 * 키워드도구는 힌트 2개만 넣어도 연관키워드를 1,000개 넘게 돌려준다.
 * 그래서 힌트를 많이 보낼 필요가 없다 — 요청 수를 늘리면 429 만 난다.
 * 대표 힌트 몇 개만 보내고, 반환된 대량의 연관키워드에서 우리 키워드를 찾아 쓴다.
 */
export async function fetchMetrics(hints: string[], maxRequests = 3): Promise<MetricsResult> {
  const empty: MetricsResult = { all: new Map(), requests: 0, error: null };
  if (!hasSearchAdKeys()) {
    return { ...empty, error: `키 없음: ${missingSearchAdKeys().join(", ")}` };
  }
  if (hints.length === 0) return empty;

  const batches: string[][] = [];
  for (let i = 0; i < hints.length && batches.length < maxRequests; i += HINTS_PER_REQUEST) {
    batches.push(hints.slice(i, i + HINTS_PER_REQUEST));
  }

  const all = new Map<string, KeywordMetric>();
  let requests = 0;
  let error: string | null = null;

  for (let b = 0; b < batches.length; b++) {
    // 검색광고 API 는 초당 제한이 빡세다 → 순차 + 간격
    if (b > 0) await sleep(600);
    try {
      let rows: KeywordMetric[];
      try {
        rows = await fetchBatch(batches[b]);
      } catch (e) {
        // 429 는 잠깐 쉬고 한 번만 재시도
        if ((e as any)?.status === 429) {
          await sleep(1500);
          rows = await fetchBatch(batches[b]);
        } else {
          throw e;
        }
      }
      requests++;
      for (const row of rows) {
        if (row.key && !all.has(row.key)) all.set(row.key, row);
      }
    } catch (e) {
      // 여기까지 모은 건 그대로 쓴다 — 부분 성공이 전부 실패보다 낫다
      error = (e as Error).message;
      break;
    }
  }

  return { all, requests, error };
}

/** 검색량 대비 경쟁도로 '황금키워드' 판정 */
export function isGolden(m: KeywordMetric): boolean {
  return m.total >= 100 && m.competition !== "높음";
}
