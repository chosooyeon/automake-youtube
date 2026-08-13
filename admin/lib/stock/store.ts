/**
 * 관심종목 · 알림 상태 · 텔레그램 설정 저장소.
 *
 * admin/data/stock/ 아래 JSON 3개. admin/.gitignore 가 data/ 를 제외하므로
 * 봇 토큰이 커밋될 일은 없다 (이모티콘 스튜디오와 같은 방식 — admin/lib/emoticonStore.ts).
 */

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../paths";
import { getEnv } from "../env";
import type { Market, StockRef } from "./naver";
import type { Verdict } from "./signals";

export const STOCK_DATA_DIR = path.join(REPO_ROOT, "admin", "data", "stock");

const WATCHLIST_FILE = path.join(STOCK_DATA_DIR, "watchlist.json");
const ALERT_STATE_FILE = path.join(STOCK_DATA_DIR, "alert-state.json");
const TELEGRAM_FILE = path.join(STOCK_DATA_DIR, "telegram.json");

export interface WatchItem extends StockRef {
  addedAt: string;
  /** 끄면 스캔·알림에서 제외 (삭제하지 않고 잠시 쉬게 할 때) */
  enabled: boolean;
  memo?: string;
}

export interface AlertRecord {
  lastVerdict: Verdict;
  /** verdict + 신호 id 조합. 같으면 같은 상황이라 재발송하지 않는다 */
  lastFingerprint: string;
  lastSentAt: string;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

function ensureDir(): void {
  fs.mkdirSync(STOCK_DATA_DIR, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown): void {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

// ---------- 관심종목 ----------

export function loadWatchlist(): WatchItem[] {
  const items = readJson<WatchItem[]>(WATCHLIST_FILE, []);
  return Array.isArray(items) ? items : [];
}

export function saveWatchlist(items: WatchItem[]): void {
  writeJson(WATCHLIST_FILE, items);
}

export function addWatchItem(ref: StockRef, memo?: string): WatchItem[] {
  const items = loadWatchlist();
  if (items.some((it) => it.symbol === ref.symbol)) return items; // 중복 추가 무시
  items.push({ ...ref, addedAt: new Date().toISOString(), enabled: true, memo });
  saveWatchlist(items);
  return items;
}

export function removeWatchItem(symbol: string): WatchItem[] {
  const items = loadWatchlist().filter((it) => it.symbol !== symbol);
  saveWatchlist(items);
  return items;
}

export function updateWatchItem(symbol: string, patch: Partial<WatchItem>): WatchItem[] {
  const items = loadWatchlist().map((it) =>
    it.symbol === symbol ? { ...it, ...patch, symbol: it.symbol } : it
  );
  saveWatchlist(items);
  return items;
}

// ---------- 알림 상태 (중복 발송 방지) ----------

export function loadAlertState(): Record<string, AlertRecord> {
  return readJson<Record<string, AlertRecord>>(ALERT_STATE_FILE, {});
}

export function saveAlertState(state: Record<string, AlertRecord>): void {
  writeJson(ALERT_STATE_FILE, state);
}

// ---------- 텔레그램 설정 ----------

/** 파일 설정이 우선, 없으면 .env (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) */
export function loadTelegramConfig(): TelegramConfig {
  const file = readJson<Partial<TelegramConfig>>(TELEGRAM_FILE, {});
  return {
    botToken: file.botToken || getEnv("TELEGRAM_BOT_TOKEN") || "",
    chatId: file.chatId || getEnv("TELEGRAM_CHAT_ID") || "",
  };
}

export function saveTelegramConfig(cfg: TelegramConfig): void {
  writeJson(TELEGRAM_FILE, cfg);
}

/** 통화 표기 — 알림/카드에서 공통으로 쓴다 */
export function formatPrice(value: number, market: Market): string {
  if (!Number.isFinite(value)) return "-";
  return market === "KR"
    ? `${Math.round(value).toLocaleString("ko-KR")}원`
    : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
