/**
 * 관심종목 · 알림 상태 · 텔레그램 설정 저장소.
 *
 * 파일이 두 군데로 나뉜 이유는 GitHub Actions 때문이다.
 * 맥이 꺼져 있어도 알림이 가려면 깃허브 러너가 관심종목을 읽고 알림 이력을 남겨야 하는데,
 * 러너는 저장소에 커밋된 파일만 볼 수 있다.
 *   config/        (커밋됨)   관심종목 · 알림 이력 — 비밀이 아니고, 러너가 읽고 써야 함
 *   admin/data/    (git 제외) 텔레그램 봇 토큰 — 절대 커밋되면 안 됨. CI 에서는 Secrets 로 주입
 */

import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR, REPO_ROOT } from "../paths";
import { getEnv } from "../env";
import type { Market, StockRef } from "./naver";
import type { Verdict } from "./signals";

export const STOCK_DATA_DIR = path.join(REPO_ROOT, "admin", "data", "stock");

const WATCHLIST_FILE = path.join(CONFIG_DIR, "stock-watchlist.json");
const ALERT_STATE_FILE = path.join(CONFIG_DIR, "stock-alert-state.json");
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

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
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
