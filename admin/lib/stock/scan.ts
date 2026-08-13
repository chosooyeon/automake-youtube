/**
 * 관심종목 전체 스캔 → 신호 판정 → (선택) 텔레그램 알림.
 *
 * admin UI 의 "지금 스캔" 버튼과 scripts/stock-watch.mjs(주기 실행) 가 같은 경로를 탄다.
 * 알림은 "상황이 바뀐 순간"에만 나간다 — 같은 신호를 매 스캔마다 다시 보내면 알림을 끄게 되니까.
 */

import { confirmedCandles, fetchCandles, fetchQuote, stockUrl, type Quote } from "./naver";
import { analyze, VERDICT_EMOJI, VERDICT_LABEL, type Analysis } from "./signals";
import {
  formatPrice,
  loadAlertState,
  loadTelegramConfig,
  loadWatchlist,
  saveAlertState,
  type WatchItem,
} from "./store";
import { esc, sendTelegram } from "./telegram";

export interface ScanResult {
  item: WatchItem;
  quote: Quote | null;
  analysis: Analysis | null;
  /** 알림이 실제로 발송됐는지 */
  notified: boolean;
  /** 발송하지 않은 이유 (관망 / 이미 알림 보냄 등) */
  skipReason?: string;
  error?: string;
}

export interface ScanSummary {
  scannedAt: string;
  results: ScanResult[];
  notifiedCount: number;
  errorCount: number;
  telegramConfigured: boolean;
}

/** 네이버 쪽에 동시 요청을 몰아치지 않도록 3개씩만 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export function fingerprintOf(a: Analysis): string {
  const ids = a.signals.map((s) => s.id).sort().join(",");
  return `${a.verdict}|${ids}|${a.snapshot.date}`;
}

/** 같은 상황인지 판정 — 신호 구성이 같으면 날짜만 달라도 재발송하지 않는다 */
export function sameSituation(prevFingerprint: string, next: string): boolean {
  const strip = (s: string) => s.split("|").slice(0, 2).join("|");
  return strip(prevFingerprint) === strip(next);
}

/** "20260812" → "2026-08-12" */
function prettyDate(yyyymmdd: string): string {
  return /^\d{8}$/.test(yyyymmdd)
    ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6)}`
    : yyyymmdd;
}

export function buildMessage(item: WatchItem, analysis: Analysis, quote: Quote | null): string {
  const s = analysis.snapshot;
  const price = quote?.price ?? s.close;
  const pctRaw = quote?.changePct ?? 0;
  const pct = `${pctRaw >= 0 ? "+" : ""}${pctRaw.toFixed(2)}%`;

  const lines: string[] = [];
  lines.push(`${VERDICT_EMOJI[analysis.verdict]} <b>${esc(VERDICT_LABEL[analysis.verdict])}</b>`);
  lines.push(`<b>${esc(item.name)}</b> (${esc(item.code)} · ${esc(item.exchange)})`);
  lines.push(`현재가 ${esc(formatPrice(price, item.market))} (${pct})`);
  lines.push("");

  for (const sig of analysis.signals) {
    // 배경 신호는 판단 재료일 뿐이라 매매 신호와 시각적으로 구분한다
    const bullet = sig.kind === "context" ? "▫️" : sig.side === "buy" ? "🟢" : "🔴";
    lines.push(`${bullet} <b>${esc(sig.label)}</b> — ${esc(sig.detail)}`);
  }

  lines.push("");
  const ma = [
    s.rsi != null ? `RSI ${s.rsi.toFixed(1)}` : null,
    s.sma5 != null ? `5일 ${Math.round(s.sma5).toLocaleString("ko-KR")}` : null,
    s.sma20 != null ? `20일 ${Math.round(s.sma20).toLocaleString("ko-KR")}` : null,
    s.sma60 != null ? `60일 ${Math.round(s.sma60).toLocaleString("ko-KR")}` : null,
  ].filter(Boolean);
  lines.push(`📊 ${esc(ma.join(" · "))}`);
  lines.push(
    `🗓 ${esc(prettyDate(s.date))} 종가 기준 · 매수 ${analysis.buyScore} / 매도 ${analysis.sellScore}`
  );
  lines.push(stockUrl(item));
  lines.push("");
  lines.push("<i>기술적 지표 참고용 · 투자 판단과 책임은 본인에게 있습니다</i>");

  return lines.join("\n");
}

export interface ScanOptions {
  /** 텔레그램 발송 여부 */
  notify: boolean;
  /** 중복 방지를 무시하고 무조건 발송 (테스트용) */
  force?: boolean;
  /** 특정 종목만 스캔 */
  symbols?: string[];
}

export async function scanWatchlist(opts: ScanOptions): Promise<ScanSummary> {
  const all = loadWatchlist();
  const targets = all.filter(
    (it) => it.enabled && (!opts.symbols?.length || opts.symbols.includes(it.symbol))
  );

  const cfg = loadTelegramConfig();
  const telegramConfigured = Boolean(cfg.botToken && cfg.chatId);
  const state = loadAlertState();

  const results = await mapLimit<WatchItem, ScanResult>(targets, 3, async (item) => {
    try {
      const [raw, quote] = await Promise.all([fetchCandles(item), fetchQuote(item)]);
      const candles = confirmedCandles(raw, quote, item.market);
      if (candles.length === 0) {
        return { item, quote, analysis: null, notified: false, error: "일봉 데이터 없음" };
      }
      const analysis = analyze(candles);
      return { item, quote, analysis, notified: false };
    } catch (e) {
      return { item, quote: null, analysis: null, notified: false, error: (e as Error).message };
    }
  });

  // 발송은 순차 — 텔레그램 rate limit(초당 ~30건)과 무관하게 순서를 지키는 편이 읽기 좋다
  if (opts.notify) {
    for (const r of results) {
      if (!r.analysis || r.error) continue;
      const a = r.analysis;

      if (a.insufficientData) {
        r.skipReason = "데이터 부족";
        continue;
      }
      if (a.verdict === "HOLD" && !opts.force) {
        r.skipReason = "관망 구간";
        continue;
      }
      if (!telegramConfigured) {
        r.skipReason = "텔레그램 미설정";
        continue;
      }

      const fp = fingerprintOf(a);
      const prev = state[r.item.symbol];
      if (!opts.force && prev && sameSituation(prev.lastFingerprint, fp)) {
        r.skipReason = "이미 알림 보낸 상황";
        continue;
      }

      const sent = await sendTelegram(buildMessage(r.item, a, r.quote), cfg);
      if (sent.ok) {
        r.notified = true;
        state[r.item.symbol] = {
          lastVerdict: a.verdict,
          lastFingerprint: fp,
          lastSentAt: new Date().toISOString(),
        };
      } else {
        r.error = `텔레그램 발송 실패: ${sent.error}`;
      }
    }
    saveAlertState(state);
  }

  return {
    scannedAt: new Date().toISOString(),
    results,
    notifiedCount: results.filter((r) => r.notified).length,
    errorCount: results.filter((r) => r.error).length,
    telegramConfigured,
  };
}
