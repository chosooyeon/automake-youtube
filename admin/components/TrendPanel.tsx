"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "./Toast";
import type { BlogCategory } from "@/lib/trends/blog-seeds";

interface KeywordMetric {
  total: number;
  pc: number;
  mobile: number;
  masked: boolean;
  competition: "높음" | "중간" | "낮음" | null;
}

interface Keyword {
  text: string;
  depth: number;
  seed: string;
  rank: number;
  score: number;
  reasons: string[];
  metric: KeywordMetric | null;
}

interface SearchAdStatus {
  enabled: boolean;
  missing: string[];
  requests: number;
  matched: number;
  error: string | null;
}

const COMP_COLOR: Record<string, string> = {
  낮음: "text-good",
  중간: "text-warn",
  높음: "text-bad",
};

function fmtCount(n: number, masked: boolean): string {
  if (masked) return "<10";
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}천`;
  return String(n);
}

interface NewsItem {
  key: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
}

interface Props {
  category: BlogCategory;
  region: string;
  /** 선택한 키워드/기사를 부모 입력란에 넘긴다 */
  onInsert: (text: string) => void;
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return "";
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

export default function TrendPanel({ category, region, onInsert }: Props) {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [seeds, setSeeds] = useState<string[]>([]);
  const [searchAd, setSearchAd] = useState<SearchAdStatus | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [showSeeds, setShowSeeds] = useState(false);
  const { push } = useToast();

  // 카테고리/지역이 바뀌면 이전 결과는 무효
  useEffect(() => {
    setKeywords([]);
    setNews([]);
    setSeeds([]);
    setSearchAd(null);
    setFetchedAt(null);
    setError(null);
    setPicked(new Set());
  }, [category, region]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/trends/collect?category=${encodeURIComponent(category)}&region=${encodeURIComponent(
          region.trim()
        )}&limit=40`
      );
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.message || j.error || `HTTP ${r.status}`);
      setKeywords(j.keywords as Keyword[]);
      setNews((j.news ?? []) as NewsItem[]);
      setSeeds((j.seedsUsed ?? []) as string[]);
      setSearchAd((j.searchAd ?? null) as SearchAdStatus | null);
      setFetchedAt(j.fetchedAt ?? null);
      setPicked(new Set());

      const sa = j.searchAd as SearchAdStatus | undefined;
      if (sa?.error) {
        push({
          kind: "warn",
          title: `키워드 ${j.keywords.length}개 (검색량 없음)`,
          message: `검색광고 API: ${sa.error}`,
        });
      } else {
        push({
          kind: "success",
          title: `키워드 ${j.keywords.length}개 발굴`,
          message: sa?.matched
            ? `검색량 ${sa.matched}개 조회됨 · 자동완성 ${j.requests}회`
            : `시드 ${j.seedsUsed?.length ?? 0}개 → 자동완성 ${j.requests}회 조회`,
        });
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [category, region, push]);

  function toggle(text: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(text)) next.delete(text);
      else next.add(text);
      return next;
    });
  }

  function insertPicked() {
    const kws = keywords.filter((k) => picked.has(k.text));
    const arts = news.filter((n) => picked.has(n.link));
    if (kws.length === 0 && arts.length === 0) {
      push({ kind: "warn", title: "키워드를 1개 이상 선택하세요" });
      return;
    }
    const parts: string[] = [];
    if (kws.length > 0) {
      // 검색량이 큰 것을 앞에 둬서 프롬프트가 주력 키워드를 알 수 있게 한다
      const sorted = [...kws].sort((a, b) => (b.metric?.total ?? 0) - (a.metric?.total ?? 0));
      parts.push(
        [
          "[노리는 검색 키워드] (앞쪽일수록 주력)",
          ...sorted.map((k) =>
            k.metric
              ? `- ${k.text} (월간검색 ${k.metric.total}${
                  k.metric.competition ? `, 경쟁 ${k.metric.competition}` : ""
                })`
              : `- ${k.text}`
          ),
        ].join("\n")
      );
    }
    if (arts.length > 0) {
      parts.push(
        ["[참고 기사]", ...arts.map((a) => `- ${a.title} (${a.source}) ${a.link}`)].join("\n")
      );
    }
    onInsert(parts.join("\n\n"));
    push({ kind: "success", title: `${kws.length + arts.length}건 입력란에 추가됨` });
  }

  const total = picked.size;

  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <div className="flex items-start justify-between mb-3 gap-2">
        <div>
          <h3 className="text-base font-semibold">📈 트렌드 키워드 자동 수집</h3>
          <p className="text-[11px] text-subtext mt-0.5">
            {fetchedAt
              ? `${relTime(fetchedAt)} 수집 · 키워드 ${keywords.length}개${
                  news.length > 0 ? ` · 기사 ${news.length}건` : ""
                }`
              : "네이버 자동완성에서 실제 검색되는 롱테일 키워드를 찾아옵니다"}
          </p>
        </div>
        {keywords.length > 0 && (
          <button
            onClick={load}
            disabled={loading}
            className="text-xs border border-line rounded px-2 py-1 hover:bg-panel2 disabled:opacity-50 shrink-0"
          >
            ↻ 다시
          </button>
        )}
      </div>

      {keywords.length === 0 && (
        <>
          <button
            onClick={load}
            disabled={loading}
            className="w-full bg-accent text-bg font-semibold rounded-md py-3 text-sm disabled:opacity-50 disabled:cursor-wait hover:bg-accent2 transition"
          >
            {loading ? "발굴 중… (보통 3~5초)" : "📈 트렌드 키워드 가져오기"}
          </button>
          <p className="text-[11px] text-subtext text-center mt-2">
            지역명을 넣으면 <strong className="text-text">[지역+키워드]</strong> 롱테일을 우선 찾습니다
            {region.trim() ? ` — 현재: ${region.trim()}` : " (지금은 비어있음)"}
          </p>
        </>
      )}

      {error && (
        <div className="mt-3 text-xs text-bad bg-bad/10 border border-bad/40 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {keywords.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2 text-[11px] text-subtext">
            <span>점수 높은 순 · 클릭해서 담기</span>
            <button
              onClick={() => setPicked(new Set())}
              disabled={total === 0}
              className="underline hover:text-text disabled:opacity-40"
            >
              선택 해제
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-[300px] overflow-y-auto pr-1">
            {keywords.map((k) => {
              const on = picked.has(k.text);
              const m = k.metric;
              const golden = k.reasons.includes("황금키워드");
              return (
                <button
                  key={k.text}
                  onClick={() => toggle(k.text)}
                  title={
                    `점수 ${k.score} · ${k.reasons.join("·") || "일반"} · 시드: ${k.seed}` +
                    (m ? `\n월간검색 PC ${m.pc} / 모바일 ${m.mobile} · 경쟁 ${m.competition ?? "-"}` : "")
                  }
                  className={
                    "text-xs rounded-full border px-3 py-1.5 transition text-left " +
                    (on
                      ? "border-accent bg-accent/15 text-text"
                      : golden
                      ? "border-good/50 bg-good/5 text-text hover:border-good"
                      : "border-line bg-bg/40 text-subtext hover:text-text hover:border-accent/50")
                  }
                >
                  {golden && <span className="mr-1">🏆</span>}
                  {k.text}
                  {k.reasons.includes("지역") && <span className="ml-1 text-accent">◆</span>}
                  {m && (
                    <span className="ml-1.5 mono text-[10px]">
                      <span className="text-text">{fmtCount(m.total, m.masked)}</span>
                      {m.competition && (
                        <span className={`ml-1 ${COMP_COLOR[m.competition] ?? ""}`}>
                          {m.competition}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="text-[10px] text-subtext mt-2 leading-relaxed">
            🏆 황금키워드(검색량 100+ / 경쟁 안 높음) · <span className="text-accent">◆</span> 지역 ·
            숫자 = 월간검색수 · <span className="text-good">낮음</span>/
            <span className="text-warn">중간</span>/<span className="text-bad">높음</span> = 광고 경쟁도
            {searchAd && !searchAd.enabled && (
              <>
                <br />
                <span className="text-warn">
                  검색량 표시 off — .env.local 에 {searchAd.missing.join(", ")} 설정 필요
                </span>
              </>
            )}
            {searchAd?.error && (
              <>
                <br />
                <span className="text-bad">검색광고 API: {searchAd.error}</span>
              </>
            )}
          </p>

          {news.length > 0 && (
            <div className="mt-4 pt-3 border-t border-line">
              <div className="text-xs font-medium mb-2">📰 관련 최신 기사</div>
              <ul className="space-y-1">
                {news.map((n) => {
                  const on = picked.has(n.link);
                  return (
                    <li key={n.key} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(n.link)}
                        className="mt-1 accent-accent shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <a
                          href={n.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-text hover:underline leading-snug block"
                        >
                          {n.title}
                        </a>
                        <span className="text-[10px] text-subtext">
                          {n.source} · {relTime(n.publishedAt)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <button
            onClick={insertPicked}
            disabled={total === 0}
            className="w-full mt-3 bg-accent text-bg font-semibold rounded-md py-2.5 text-sm disabled:opacity-40 hover:bg-accent2 transition"
          >
            {total === 0 ? "키워드를 선택하세요" : `⬇ 선택 ${total}건 → 아래 입력란에 넣기`}
          </button>

          {seeds.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowSeeds((v) => !v)}
                className="text-[11px] text-subtext underline hover:text-text"
              >
                {showSeeds ? "시드 접기" : `시드 키워드 ${seeds.length}개 보기`}
              </button>
              {showSeeds && (
                <p className="text-[11px] text-subtext mt-1.5 leading-relaxed">
                  {seeds.join(" · ")}
                  <br />
                  <span className="mono text-text">admin/lib/trends/blog-seeds.ts</span> 에서 수정
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
