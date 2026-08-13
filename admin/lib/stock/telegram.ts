/**
 * 텔레그램 봇 발송.
 *
 * 봇 토큰 발급: 텔레그램에서 @BotFather → /newbot → 이름 지정 → 토큰 복사.
 * chat_id 는 그 봇에게 아무 메시지나 1번 보낸 뒤 detectChatId() 로 자동 조회한다.
 */

import { loadTelegramConfig, type TelegramConfig } from "./store";

const API = "https://api.telegram.org";

export interface SendResult {
  ok: boolean;
  error?: string;
}

async function callApi(token: string, method: string, body?: unknown, timeoutMs = 10000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: body ? "POST" : "GET",
      signal: ctrl.signal,
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await res.json().catch(() => null);
    if (!j?.ok) {
      throw new Error(j?.description || `HTTP ${res.status}`);
    }
    return j.result;
  } catch (e) {
    const err = e as Error;
    throw new Error(err?.name === "AbortError" ? "timeout" : err?.message || "telegram 요청 실패");
  } finally {
    clearTimeout(timer);
  }
}

/** HTML parse_mode 를 쓰므로 사용자 문자열은 반드시 이스케이프한다 */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendTelegram(text: string, cfg?: TelegramConfig): Promise<SendResult> {
  const { botToken, chatId } = cfg ?? loadTelegramConfig();
  if (!botToken || !chatId) {
    return { ok: false, error: "텔레그램 봇 토큰 또는 chat_id 가 설정되지 않았습니다" };
  }
  try {
    await callApi(botToken, "sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** 봇 정보 조회 — 토큰이 유효한지 확인용 */
export async function getBotInfo(botToken: string): Promise<{ username: string }> {
  const r = await callApi(botToken, "getMe");
  return { username: String(r?.username || "") };
}

/**
 * 봇에게 온 최근 메시지에서 chat_id 를 뽑는다.
 * 사용자가 봇과 대화를 시작하지 않았으면 getUpdates 가 비어 있다 → 안내가 필요하다.
 */
export async function detectChatId(botToken: string): Promise<string | null> {
  const updates = await callApi(botToken, "getUpdates");
  if (!Array.isArray(updates) || updates.length === 0) return null;
  for (let i = updates.length - 1; i >= 0; i--) {
    const id = updates[i]?.message?.chat?.id ?? updates[i]?.channel_post?.chat?.id;
    if (id != null) return String(id);
  }
  return null;
}
