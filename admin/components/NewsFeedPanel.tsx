"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "./Toast";
import type { CategoryId } from "./InstagramJobContext";

export interface NewsItem {
  key: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
  summary: string;
}

interface FeedResult {
  label: string;
  url: string;
  ok: boolean;
  count: number;
  error?: string;
}

interface Props {
  category: CategoryId;
  accent: string;
  /** 사용자가 친 키워드 — 전용 뉴스 검색 피드로 추가된다 */
  keyword: string;
  /** 선택한 기사들을 부모의 입력란 + sourceLinks 로 넘긴다 */
  onInsert: (text: string, links: string[]) => void;
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return "";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}

export default function NewsFeedPanel({ category, accent, keyword, onInsert }: Props) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [feeds, setFeeds] = useState<FeedResult[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showFeeds, setShowFeeds] = useState(false);
  const { push } = useToast();

  // 카테고리나 키워드가 바뀌면 이전 결과는 무효
  useEffect(() => {
    setItems([]);
    setFeeds([]);
    setFetchedAt(null);
    setError(null);
    setSelected(new Set());
  }, [category, keyword]);

  const load = useCallback(
    async (refresh: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/news/collect?category=${encodeURIComponent(category)}` +
            `&q=${encodeURIComponent(keyword.trim())}&limit=30${refresh ? "&refresh=1" : ""}`
        );
        const j = await r.json();
        if (!r.ok || !j.ok) {
          setFeeds(j.feeds ?? []);
          throw new Error(j.message || j.error || `HTTP ${r.status}`);
        }
        setItems(j.items as NewsItem[]);
        setFeeds((j.feeds ?? []) as FeedResult[]);
        setFetchedAt(j.fetchedAt ?? null);
        setSelected(new Set());
        const failed = ((j.feeds ?? []) as FeedResult[]).filter((f) => !f.ok);
        if (failed.length > 0) {
          push({
            kind: "warn",
            title: `${j.items.length}건 수집 (소스 ${failed.length}개 실패)`,
            message: failed.map((f) => `${f.label}: ${f.error}`).join(" / "),
          });
        } else {
          push({ kind: "success", title: `뉴스 ${j.items.length}건 수집됨` });
        }
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    },
    [category, keyword, push]
  );

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function insertSelected() {
    const picked = items.filter((i) => selected.has(i.key));
    if (picked.length === 0) {
      push({ kind: "warn", title: "기사를 1건 이상 선택하세요" });
      return;
    }
    const text = picked
      .map((i) => {
        const lines = [`## ${i.title}`, `- 매체: ${i.source}${i.publishedAt ? ` (${relTime(i.publishedAt)})` : ""}`];
        if (i.summary) lines.push(`- 요약: ${i.summary}`);
        lines.push(`- 원문: ${i.link}`);
        return lines.join("\n");
      })
      .join("\n\n");
    onInsert(text, picked.map((i) => i.link));
    push({ kind: "success", title: `${picked.length}건 입력란에 추가됨` });
  }

  const failedCount = feeds.filter((f) => !f.ok).length;

  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div>
          <h3 className="text-base font-semibold">📰 뉴스 자동 수집</h3>
          <p className="text-[11px] text-subtext mt-0.5">
            {fetchedAt
              ? `${relTime(fetchedAt)} 수집 · ${items.length}건${
                  failedCount > 0 ? ` · 소스 ${failedCount}개 실패` : ""
                }`
              : keyword.trim()
              ? `'${keyword.trim()}' 전용 검색 + 카테고리 기본 소스`
              : "RSS 로 최신 소재를 끌어옵니다 (30분 캐시)"}
          </p>
        </div>
        {items.length > 0 && (
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="text-xs border border-line rounded px-2 py-1 hover:bg-panel2 disabled:opacity-50 shrink-0"
          >
            ↻ 새로고침
          </button>
        )}
      </div>

      {items.length === 0 && (
        <button
          onClick={() => load(false)}
          disabled={loading}
          className="w-full font-semibold rounded-md py-3 text-sm text-bg disabled:opacity-50 disabled:cursor-wait transition hover:opacity-90"
          style={{ backgroundColor: accent }}
        >
          {loading ? "수집 중… (최대 10초)" : "📰 최신 뉴스 가져오기"}
        </button>
      )}

      {error && (
        <div className="mt-3 text-xs text-bad bg-bad/10 border border-bad/40 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2 text-[11px] text-subtext">
            <span>제목 클릭 = 원문 열기 · 체크 = 카드 소재로 담기</span>
            <button
              onClick={() => setSelected(new Set())}
              className="underline hover:text-text"
              disabled={selected.size === 0}
            >
              선택 해제
            </button>
          </div>

          <ul className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
            {items.map((it) => {
              const on = selected.has(it.key);
              return (
                <li
                  key={it.key}
                  className={
                    "rounded-md border px-3 py-2 transition " +
                    (on ? "bg-bg" : "border-line bg-bg/40 hover:bg-bg/70")
                  }
                  style={on ? { borderColor: accent } : undefined}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(it.key)}
                      className="mt-1 shrink-0"
                      style={{ accentColor: accent }}
                    />
                    <div className="min-w-0 flex-1">
                      <a
                        href={it.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-text hover:underline leading-snug block"
                      >
                        {it.title}
                      </a>
                      <div className="text-[11px] text-subtext mt-1 flex items-center gap-2 flex-wrap">
                        <span
                          className="inline-block rounded-full px-2 py-0.5"
                          style={{ backgroundColor: accent + "22", color: accent }}
                        >
                          {it.source}
                        </span>
                        <span>{relTime(it.publishedAt)}</span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <button
            onClick={insertSelected}
            disabled={selected.size === 0}
            className="w-full mt-3 font-semibold rounded-md py-2.5 text-sm text-bg disabled:opacity-40 transition hover:opacity-90"
            style={{ backgroundColor: accent }}
          >
            {selected.size === 0
              ? "기사를 선택하세요"
              : `⬇ 선택 ${selected.size}건 → 아래 입력란에 넣기`}
          </button>

          {feeds.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowFeeds((v) => !v)}
                className="text-[11px] text-subtext underline hover:text-text"
              >
                {showFeeds ? "소스 목록 접기" : `소스 ${feeds.length}개 상태 보기`}
              </button>
              {showFeeds && (
                <ul className="mt-2 space-y-1">
                  {feeds.map((f, i) => (
                    <li key={i} className="text-[11px] flex items-center gap-2">
                      <span className={f.ok ? "text-good" : "text-bad"}>{f.ok ? "●" : "○"}</span>
                      <span className="text-text">{f.label}</span>
                      <span className="text-subtext mono">
                        {f.ok ? `${f.count}건` : f.error}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-subtext mt-2">
                소스 추가/변경: <span className="mono text-text">admin/data/news_feeds.json</span>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
