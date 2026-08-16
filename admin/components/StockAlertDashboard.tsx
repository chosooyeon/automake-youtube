"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "./Toast";
import TelegramSetupCard from "./TelegramSetupCard";
import BacktestBoard from "./BacktestBoard";
import MethodBoard from "./MethodBoard";
import PaperBoard from "./PaperBoard";
import {
  MARKET_FLAG,
  MARKET_SHORT,
  type Market,
  type MarketFilter,
  type MarketMethod,
  type MethodPayload,
} from "./stockTypes";

type Verdict = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";

interface StockRef {
  symbol: string;
  code: string;
  name: string;
  market: Market;
  exchange: string;
}

interface WatchItem extends StockRef {
  addedAt: string;
  enabled: boolean;
  memo?: string;
}

interface Signal {
  id: string;
  side: "buy" | "sell";
  weight: number;
  label: string;
  detail: string;
  /** context = 추세 배경. 이것만으로는 매매 판정을 내리지 않는다 */
  kind: "primary" | "context";
}

interface Snapshot {
  close: number;
  date: string;
  rsi: number | null;
  sma5: number | null;
  sma20: number | null;
  sma60: number | null;
  macdHist: number | null;
  bbUpper: number | null;
  bbLower: number | null;
  bbWidth: number | null;
  volumeRatio: number | null;
}

interface Analysis {
  verdict: Verdict;
  buyScore: number;
  sellScore: number;
  netScore: number;
  signals: Signal[];
  snapshot: Snapshot;
  insufficientData: boolean;
}

interface Quote {
  price: number;
  change: number;
  changePct: number;
  currency: string;
  marketStatus: string;
  tradedAt: string | null;
}

interface ScanResult {
  item: WatchItem;
  quote: Quote | null;
  analysis: Analysis | null;
  notified: boolean;
  skipReason?: string;
  error?: string;
}

const VERDICT_META: Record<Verdict, { label: string; emoji: string; cls: string }> = {
  STRONG_BUY: { label: "적극 매수", emoji: "🟢", cls: "bg-good/20 text-good border-good/50" },
  BUY: { label: "매수 관심", emoji: "🟢", cls: "bg-good/10 text-good border-good/30" },
  HOLD: { label: "관망", emoji: "⚪", cls: "bg-panel2 text-subtext border-line" },
  SELL: { label: "매도 관심", emoji: "🔴", cls: "bg-bad/10 text-bad border-bad/30" },
  STRONG_SELL: { label: "적극 매도", emoji: "🔴", cls: "bg-bad/20 text-bad border-bad/50" },
};

/** 자동 스캔 주기 — 일봉 기준 판정이라 잦게 돌 이유가 없다 */
const AUTO_SCAN_MS = 10 * 60 * 1000;

function fmtPrice(v: number, market: Market): string {
  if (!Number.isFinite(v)) return "-";
  return market === "KR"
    ? `${Math.round(v).toLocaleString("ko-KR")}원`
    : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(v: number | null, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return "-";
  return v.toLocaleString("ko-KR", { maximumFractionDigits: digits });
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
  return `${Math.floor(hr / 24)}일 전`;
}

/** "20260812" → "2026-08-12" */
function prettyDate(d: string): string {
  return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d;
}

/** 볼린저 밴드 내 위치 (0=하단, 100=상단) — 밴드 대비 어디쯤인지 한눈에 */
function bandPosition(s: Snapshot): number | null {
  if (s.bbUpper == null || s.bbLower == null || s.bbUpper === s.bbLower) return null;
  const pct = ((s.close - s.bbLower) / (s.bbUpper - s.bbLower)) * 100;
  return Math.max(0, Math.min(100, pct));
}

type StockView = "scan" | "method" | "backtest" | "paper";

const STOCK_VIEWS: Array<{ id: StockView; label: string; hint: string }> = [
  { id: "scan", label: "🔔 신호 스캔", hint: "지금 무엇을 볼까 — 관심종목 실시간 판정" },
  { id: "method", label: "📐 방법론", hint: "국내와 미국이 어떤 규칙으로 다르게 굴러가나" },
  { id: "backtest", label: "🧪 백테스트", hint: "그 규칙이 과거에 통했나 — 설정별 성적" },
  { id: "paper", label: "📝 페이퍼", hint: "그 규칙이 지금도 통하나 — 실시간 가상매매 기록" },
];

const MARKET_TABS: Array<{ id: MarketFilter; label: string }> = [
  { id: "ALL", label: "🌍 전체" },
  { id: "KR", label: "🇰🇷 국내" },
  { id: "US", label: "🇺🇸 미국" },
];

/**
 * 주식 탭 셸.
 *
 * 축이 둘이다: **어느 시장을 보나**(위) × **무엇을 보나**(아래).
 * 시장을 위로 올린 이유는 국내와 미국이 같은 규칙으로 굴지 않기 때문이다 —
 * 두 시장을 한 화면에 섞어 놓으면 어느 쪽 규칙으로 본 숫자인지 알 수 없다.
 *
 * '전체'는 스캔에서만 의미가 있다. 백테스트는 통화(원/달러)를 환산하지 않으므로
 * 섞으면 금액 지표가 헛것이 되고, 그래서 전체를 고르면 국내부터 보여준다.
 */
export default function StockAlertDashboard() {
  const [market, setMarket] = useState<MarketFilter>("ALL");
  const [view, setView] = useState<StockView>("scan");
  const [methods, setMethods] = useState<MethodPayload | null>(null);

  // 시장별 규칙은 요약 스트립·방법론 화면이 함께 쓰므로 여기서 한 번만 받는다
  useEffect(() => {
    let alive = true;
    fetch("/api/stock/method", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (alive && j.ok) setMethods(j as MethodPayload);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const focus: Market | null = market === "ALL" ? null : market;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-subtext mr-1">시장</span>
          {MARKET_TABS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMarket(m.id)}
              className={
                "px-3 py-1.5 text-sm rounded-lg border transition " +
                (market === m.id
                  ? "bg-accent/15 border-accent/50 text-text"
                  : "bg-panel border-line text-subtext hover:text-text")
              }
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[11px] text-subtext mr-1">화면</span>
          {STOCK_VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              title={v.hint}
              className={
                "px-3 py-1.5 text-sm rounded-lg border transition " +
                (view === v.id
                  ? "bg-accent/15 border-accent/50 text-text"
                  : "bg-panel border-line text-subtext hover:text-text")
              }
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === "scan" && (
        <ScanView market={market} methods={methods} onPickMarket={setMarket} onOpenMethod={() => setView("method")} />
      )}
      {view === "method" && <MethodBoard data={methods} focus={focus} />}
      {view === "backtest" && <BacktestBoard market={focus} />}
      {view === "paper" && <PaperBoard market={focus} />}
    </div>
  );
}

/** 판정을 급한 순으로 — 관망 20종목을 스크롤해서 매수 신호를 찾게 만들면 안 된다 */
const VERDICT_RANK: Record<Verdict, number> = {
  STRONG_BUY: 0,
  BUY: 1,
  STRONG_SELL: 2,
  SELL: 3,
  HOLD: 4,
};

/** 요약 스트립에 쓰는 3분류 — 🟢 살 때 / 🔴 팔 때 / ⚪ 그 외 */
function verdictBucket(v: Verdict): "buy" | "sell" | "hold" {
  if (v === "STRONG_BUY" || v === "BUY") return "buy";
  if (v === "STRONG_SELL" || v === "SELL") return "sell";
  return "hold";
}

/**
 * "한눈에" 스트립 — 시장 한 줄에 종목 수·신호 분포·그 시장의 매매 규칙까지 담는다.
 * 규칙을 여기 같이 적는 이유: 같은 🟢라도 국내는 20일 안에 정리하고 미국은 40일을
 * 들고 가는데, 그걸 모르면 두 시장의 초록색을 같은 뜻으로 읽는다.
 */
function MarketSummaryRow({
  market,
  total,
  counts,
  method,
  active,
  onClick,
  onOpenMethod,
}: {
  market: Market;
  total: number;
  counts: { buy: number; sell: number; hold: number; nodata: number; paused: number };
  method?: MarketMethod;
  active: boolean;
  onClick: () => void;
  onOpenMethod: () => void;
}) {
  return (
    <div
      className={
        "border rounded-xl p-3 transition " +
        (active ? "bg-panel border-accent/50" : "bg-panel border-line hover:border-subtext/40")
      }
    >
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onClick} className="flex items-center gap-2 min-w-0 text-left">
          <span className="text-base">{MARKET_FLAG[market]}</span>
          <span className="text-sm font-semibold text-text">{MARKET_SHORT[market]}</span>
          <span className="text-[11px] text-subtext">{total}종목</span>
        </button>

        <div className="flex items-center gap-3 text-xs mono">
          <span className={counts.buy > 0 ? "text-good font-semibold" : "text-subtext"}>
            🟢 {counts.buy}
          </span>
          <span className={counts.sell > 0 ? "text-bad font-semibold" : "text-subtext"}>
            🔴 {counts.sell}
          </span>
          <span className="text-subtext">⚪ {counts.hold}</span>
          {counts.nodata > 0 && <span className="text-subtext">· 미분석 {counts.nodata}</span>}
          {counts.paused > 0 && <span className="text-subtext">· 중지 {counts.paused}</span>}
        </div>

        {method && (
          <button
            onClick={onOpenMethod}
            title="이 시장의 매매 규칙 전체 보기"
            className="ml-auto text-[10px] text-subtext hover:text-text border border-line rounded-full px-2 py-1 flex items-center gap-1.5"
          >
            <span className="mono">{method.summary}</span>
            {!method.verifiedAt && <span className="text-warn">⚠ 검증 전</span>}
          </button>
        )}
      </div>
    </div>
  );
}

function ScanView({
  market: marketFilter,
  methods,
  onPickMarket,
  onOpenMethod,
}: {
  market: MarketFilter;
  methods: MethodPayload | null;
  onPickMarket: (m: MarketFilter) => void;
  onOpenMethod: () => void;
}) {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [results, setResults] = useState<Record<string, ScanResult>>({});
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [autoScan, setAutoScan] = useState(true);
  const [telegramReady, setTelegramReady] = useState(false);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockRef[]>([]);
  const [searching, setSearching] = useState(false);

  const { push } = useToast();
  const scanningRef = useRef(false);

  const loadWatchlist = useCallback(async () => {
    const r = await fetch("/api/stock/watchlist");
    const j = await r.json();
    if (j.ok) setItems(j.items as WatchItem[]);
    return (j.items ?? []) as WatchItem[];
  }, []);

  /**
   * 기본은 조회만 한다 (notify 없음).
   *
   * 화면에서도 발송하면 GitHub Actions 와 발송 주체가 둘이 된다.
   * 알림 이력 파일이 맥과 깃허브에 따로 존재하는데 서로 동기화되지 않아
   * 같은 신호가 두 번 갈 수 있다 — 그래서 정기 발송은 깃허브에만 맡긴다.
   * 손으로 지금 보내고 싶을 때만 notify: true 로 부른다.
   */
  const scan = useCallback(
    async (opts: { silent?: boolean; notify?: boolean } = {}) => {
      if (scanningRef.current) return;
      scanningRef.current = true;
      setScanning(true);
      try {
        const r = await fetch(`/api/stock/scan${opts.notify ? "?notify=1" : ""}`, {
          method: "POST",
        });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.message || `HTTP ${r.status}`);

        const map: Record<string, ScanResult> = {};
        for (const res of j.results as ScanResult[]) map[res.item.symbol] = res;
        setResults(map);
        setScannedAt(j.scannedAt);
        setTelegramReady(Boolean(j.telegramConfigured));

        if (!opts.silent) {
          const errs = (j.results as ScanResult[]).filter((x) => x.error);
          if (errs.length > 0) {
            push({
              kind: "warn",
              title: `${j.results.length}종목 분석 (${errs.length}건 실패)`,
              message: errs.map((e) => `${e.item.name}: ${e.error}`).join(" / "),
            });
          } else if (opts.notify) {
            push({
              kind: j.notifiedCount > 0 ? "success" : "info",
              title:
                j.notifiedCount > 0
                  ? `신호 ${j.notifiedCount}건 → 텔레그램 발송됨`
                  : "보낼 새 신호가 없습니다 (이미 보냈거나 관망 구간)",
            });
          } else {
            push({ kind: "info", title: `${j.results.length}종목 분석 완료 (알림 미발송)` });
          }
        }
      } catch (e) {
        if (!opts.silent) push({ kind: "error", title: "스캔 실패", message: (e as Error).message });
      } finally {
        scanningRef.current = false;
        setScanning(false);
      }
    },
    [push]
  );

  // 최초 진입 시 목록 로드 → 종목이 있으면 바로 1회 스캔
  useEffect(() => {
    (async () => {
      const list = await loadWatchlist();
      if (list.length > 0) scan({ silent: true });
    })();
  }, [loadWatchlist, scan]);

  // 대시보드를 열어둔 동안의 자동 감시 (탭이 백그라운드면 건너뛴다)
  useEffect(() => {
    if (!autoScan) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") scan({ silent: true });
    }, AUTO_SCAN_MS);
    return () => clearInterval(t);
  }, [autoScan, scan]);

  // 검색어 디바운스
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/stock/search?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        setSearchResults(j.ok ? (j.items as StockRef[]) : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function addStock(ref: StockRef) {
    if (items.some((it) => it.symbol === ref.symbol)) {
      push({ kind: "warn", title: `${ref.name} 은(는) 이미 관심종목입니다` });
      return;
    }
    const r = await fetch("/api/stock/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ref),
    });
    const j = await r.json();
    if (!j.ok) {
      push({ kind: "error", title: "추가 실패", message: j.message });
      return;
    }
    setItems(j.items as WatchItem[]);
    setQuery("");
    setSearchResults([]);
    push({ kind: "success", title: `${ref.name} 추가됨` });
    scan({ silent: true });
  }

  async function removeStock(item: WatchItem) {
    const r = await fetch(`/api/stock/watchlist?symbol=${encodeURIComponent(item.symbol)}`, {
      method: "DELETE",
    });
    const j = await r.json();
    if (j.ok) {
      setItems(j.items as WatchItem[]);
      push({ kind: "info", title: `${item.name} 삭제됨` });
    }
  }

  async function toggleStock(item: WatchItem) {
    const r = await fetch("/api/stock/watchlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: item.symbol, enabled: !item.enabled }),
    });
    const j = await r.json();
    if (j.ok) setItems(j.items as WatchItem[]);
  }

  const enabledCount = items.filter((i) => i.enabled).length;

  const methodByMarket = useMemo(() => {
    const m = new Map<Market, MarketMethod>();
    for (const x of methods?.markets ?? []) m.set(x.market, x);
    return m;
  }, [methods]);

  /**
   * 시장별 신호 분포 — 스트립이 쓴다. 관심종목이 없는 시장은 줄을 만들지 않는다.
   * 일시중지한 종목은 애초에 스캔하지 않으므로 '미분석'이 아니라 따로 센다 —
   * 안 그러면 꺼둔 종목이 "분석 실패"처럼 보인다.
   */
  const perMarket = useMemo(() => {
    const out: Array<{
      market: Market;
      total: number;
      counts: { buy: number; sell: number; hold: number; nodata: number; paused: number };
    }> = [];
    for (const mk of ["KR", "US"] as Market[]) {
      const list = items.filter((i) => i.market === mk);
      if (list.length === 0) continue;
      const counts = { buy: 0, sell: 0, hold: 0, nodata: 0, paused: 0 };
      for (const it of list) {
        if (!it.enabled) {
          counts.paused++;
          continue;
        }
        const a = results[it.symbol]?.analysis;
        if (!a || a.insufficientData) counts.nodata++;
        else counts[verdictBucket(a.verdict)]++;
      }
      out.push({ market: mk, total: list.length, counts });
    }
    return out;
  }, [items, results]);

  /**
   * 화면에 그릴 목록 — 시장으로 거른 뒤 급한 판정 순으로 세운다.
   * 정렬을 안 하면 관심종목이 늘어날수록 매수 신호가 관망 카드 사이에 묻힌다.
   */
  const visible = useMemo(() => {
    const list = items.filter((i) => marketFilter === "ALL" || i.market === marketFilter);
    return [...list].sort((a, b) => {
      const aa = results[a.symbol]?.analysis;
      const ba = results[b.symbol]?.analysis;
      const rank = (x?: Analysis | null) =>
        !x || x.insufficientData ? 5 : VERDICT_RANK[x.verdict];
      const d = rank(aa) - rank(ba);
      if (d !== 0) return d;
      const score = (x?: Analysis | null) => (x ? Math.abs(x.netScore) : 0);
      const s = score(ba) - score(aa);
      if (s !== 0) return s;
      return a.name.localeCompare(b.name, "ko");
    });
  }, [items, results, marketFilter]);

  return (
    <div className="space-y-6">
      <TelegramSetupCard onReadyChange={setTelegramReady} />

      {/* 한눈에 — 시장별 신호 분포 + 그 시장의 규칙 한 줄 */}
      {perMarket.length > 0 && (
        <div className="space-y-2">
          {perMarket.map((p) => (
            <MarketSummaryRow
              key={p.market}
              market={p.market}
              total={p.total}
              counts={p.counts}
              method={methodByMarket.get(p.market)}
              active={marketFilter === p.market}
              onClick={() => onPickMarket(marketFilter === p.market ? "ALL" : p.market)}
              onOpenMethod={onOpenMethod}
            />
          ))}
        </div>
      )}

      {/* 종목 추가 */}
      <div className="bg-panel border border-line rounded-xl p-4">
        <h3 className="text-base font-semibold mb-1">📈 관심종목</h3>
        <p className="text-[11px] text-subtext mb-3">
          종목명이나 티커로 검색해 추가하세요. 한국(코스피·코스닥)과 미국(나스닥·NYSE) 모두 가능합니다.
        </p>

        <div className="relative">
          <input
            className="input-base"
            placeholder="예: 삼성전자, 005930, NVDA, 테슬라"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {(searchResults.length > 0 || searching) && (
            <ul className="absolute z-20 left-0 right-0 mt-1 bg-panel2 border border-line rounded-lg shadow-xl overflow-hidden">
              {searching && searchResults.length === 0 && (
                <li className="px-3 py-2 text-xs text-subtext">검색 중…</li>
              )}
              {searchResults.map((s) => (
                <li key={s.symbol}>
                  <button
                    onClick={() => addStock(s)}
                    className="w-full text-left px-3 py-2 hover:bg-bg/60 flex items-center gap-2"
                  >
                    <span className="text-sm text-text">{s.name}</span>
                    <span className="text-[11px] mono text-subtext">{s.code}</span>
                    <span className="text-[10px] text-subtext border border-line rounded px-1.5 py-0.5 ml-auto">
                      {s.market === "KR" ? "🇰🇷" : "🇺🇸"} {s.exchange}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
          <div className="text-[11px] text-subtext">
            감시 중 {enabledCount}종목
            {scannedAt ? ` · ${relTime(scannedAt)} 분석` : ""}
            {telegramReady ? " · 텔레그램 연결됨" : " · 텔레그램 미설정"}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-subtext flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={autoScan}
                onChange={(e) => setAutoScan(e.target.checked)}
                className="accent-accent"
              />
              10분마다 화면 갱신
            </label>
            <button
              onClick={() => scan()}
              disabled={scanning || items.length === 0}
              className="text-xs border border-line rounded px-3 py-1.5 hover:bg-panel2 disabled:opacity-50"
            >
              {scanning ? "분석 중…" : "↻ 지금 스캔"}
            </button>
            <button
              onClick={() => scan({ notify: true })}
              disabled={scanning || items.length === 0 || !telegramReady}
              title={
                telegramReady
                  ? "지금 잡힌 신호를 텔레그램으로 보냅니다 (평소엔 깃허브가 자동 발송)"
                  : "텔레그램을 먼저 연결하세요"
              }
              className="text-xs border border-line rounded px-3 py-1.5 hover:bg-panel2 disabled:opacity-40"
            >
              🔔 지금 알림 보내기
            </button>
          </div>
        </div>
      </div>

      {/* 종목 카드 — 급한 판정(적극매수 → 매수 → 매도 → 관망) 순 */}
      {items.length === 0 ? (
        <div className="bg-panel border border-line rounded-xl p-8 text-center text-sm text-subtext">
          관심종목이 없습니다. 위에서 종목을 검색해 추가하세요.
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-panel border border-line rounded-xl p-8 text-center text-sm text-subtext">
          {marketFilter === "US" ? "미국" : "국내"} 관심종목이 없습니다.{" "}
          <button onClick={() => onPickMarket("ALL")} className="text-accent hover:underline">
            전체 보기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visible.map((item) => (
            <StockCard
              key={item.symbol}
              item={item}
              result={results[item.symbol]}
              onRemove={() => removeStock(item)}
              onToggle={() => toggleStock(item)}
            />
          ))}
        </div>
      )}

      <p className="text-[11px] text-subtext leading-relaxed">
        판정은 <span className="text-text">확정된 일봉</span>(전 거래일 종가)의 RSI·이동평균·MACD·볼린저밴드·거래량으로
        계산합니다. 장중에 신호가 나타났다 사라지는 현상을 피하려는 설계이며, 표시되는 현재가는 참고용입니다.
        <br />
        <span className="text-text">이 신호 판정은 두 시장이 같습니다.</span> 시장별로 갈리는 것은 그 신호를 받아
        얼마를 걸고 언제 자르느냐이며, 위 [📐 방법론] 에서 국내·미국 규칙을 나란히 볼 수 있습니다.
        <br />
        <span className="text-text">이 화면은 조회만 합니다 — 들어오거나 새로고침해도 텔레그램은 가지 않습니다.</span>{" "}
        알림은 GitHub Actions 가 평일 하루 2번(한국장·미국장 마감 후) 보냅니다. 발송 주체를 하나로 두어야 같은 신호가
        두 번 가지 않기 때문입니다. 당장 받아보고 싶으면 위의 [🔔 지금 알림 보내기] 를 누르세요.
        <br />
        종목을 추가·삭제했다면 <span className="mono text-text">config/stock-watchlist.json</span> 을 커밋·푸시해야
        깃허브 쪽에도 반영됩니다.
        <br />
        <span className="text-warn">기술적 지표 참고용입니다. 투자 판단과 그 결과에 대한 책임은 본인에게 있습니다.</span>
      </p>
    </div>
  );
}

function StockCard({
  item,
  result,
  onRemove,
  onToggle,
}: {
  item: WatchItem;
  result?: ScanResult;
  onRemove: () => void;
  onToggle: () => void;
}) {
  const a = result?.analysis;
  const q = result?.quote;
  const meta = VERDICT_META[a?.verdict ?? "HOLD"];
  const pct = q?.changePct ?? 0;
  const pctCls = pct > 0 ? "text-good" : pct < 0 ? "text-bad" : "text-subtext";
  const band = a ? bandPosition(a.snapshot) : null;

  return (
    <div
      className={
        "bg-panel border rounded-xl p-4 transition " +
        (item.enabled ? "border-line" : "border-line opacity-50")
      }
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold text-text truncate">{item.name}</span>
            <span className="text-[10px] text-subtext border border-line rounded px-1.5 py-0.5 shrink-0">
              {item.market === "KR" ? "🇰🇷" : "🇺🇸"} {item.code}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg mono text-text">
              {q ? fmtPrice(q.price, item.market) : a ? fmtPrice(a.snapshot.close, item.market) : "-"}
            </span>
            {q && (
              <span className={`text-xs mono ${pctCls}`}>
                {pct > 0 ? "▲" : pct < 0 ? "▼" : "―"} {Math.abs(pct).toFixed(2)}%
              </span>
            )}
            {q?.marketStatus === "OPEN" && (
              <span className="text-[10px] text-good border border-good/40 rounded px-1.5">장중</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`text-xs font-semibold border rounded-full px-2.5 py-1 ${meta.cls}`}>
            {meta.emoji} {meta.label}
          </span>
          <div className="flex gap-1">
            <button
              onClick={onToggle}
              className="text-[10px] text-subtext border border-line rounded px-1.5 py-0.5 hover:text-text"
              title={item.enabled ? "감시 일시중지" : "감시 재개"}
            >
              {item.enabled ? "⏸" : "▶"}
            </button>
            <button
              onClick={onRemove}
              className="text-[10px] text-subtext border border-line rounded px-1.5 py-0.5 hover:text-bad"
              title="관심종목에서 삭제"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {result?.error && (
        <div className="text-xs text-bad bg-bad/10 border border-bad/40 rounded px-3 py-2">
          {result.error}
        </div>
      )}

      {a?.insufficientData && !result?.error && (
        <div className="text-xs text-subtext">데이터가 부족해 판정을 보류합니다 (상장 초기 등).</div>
      )}

      {a && !a.insufficientData && (
        <>
          {a.signals.length > 0 ? (
            <ul className="space-y-1.5 mb-3">
              {a.signals.map((s) => {
                // 배경 신호는 회색으로 — 매매 포인트가 아니라 판단 재료라는 뜻
                const tone =
                  s.kind === "context" ? "text-subtext" : s.side === "buy" ? "text-good" : "text-bad";
                return (
                  <li key={s.id} className="text-xs flex items-start gap-2">
                    <span className={tone}>
                      {s.kind === "context" ? "·" : s.side === "buy" ? "▲" : "▼"}
                    </span>
                    <span className="min-w-0">
                      <span className={tone}>{s.label}</span>
                      <span className="text-subtext"> — {s.detail}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-subtext mb-3">잡힌 신호 없음 — 뚜렷한 매매 포인트가 아닙니다.</p>
          )}

          {/* 지표 요약 */}
          <div className="grid grid-cols-4 gap-2 text-center border-t border-line pt-3">
            <Metric
              label="RSI"
              value={a.snapshot.rsi == null ? "-" : a.snapshot.rsi.toFixed(1)}
              tone={
                a.snapshot.rsi == null ? "" : a.snapshot.rsi <= 30 ? "text-good" : a.snapshot.rsi >= 70 ? "text-bad" : ""
              }
            />
            <Metric label="5일선" value={fmtNum(a.snapshot.sma5)} />
            <Metric label="20일선" value={fmtNum(a.snapshot.sma20)} />
            <Metric label="60일선" value={fmtNum(a.snapshot.sma60)} />
          </div>

          {band != null && (
            <div className="mt-3">
              <div className="flex justify-between text-[10px] text-subtext mb-1">
                <span>볼린저 하단</span>
                <span>밴드 내 위치 {band.toFixed(0)}%</span>
                <span>상단</span>
              </div>
              <div className="h-1.5 bg-panel2 rounded-full relative">
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-text"
                  style={{ left: `calc(${band}% - 4px)` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-3 text-[10px] text-subtext">
            <span className="mono">
              {prettyDate(a.snapshot.date)} 종가 기준 · 매수 {a.buyScore} / 매도 {a.sellScore}
            </span>
            {result?.notified && <span className="text-good">✓ 알림 발송됨</span>}
            {!result?.notified && result?.skipReason && <span>{result.skipReason}</span>}
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] text-subtext">{label}</div>
      <div className={`text-sm mono ${tone || "text-text"}`}>{value}</div>
    </div>
  );
}
