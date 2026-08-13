import { NextResponse } from "next/server";
import { loadTelegramConfig, saveTelegramConfig } from "@/lib/stock/store";
import { detectChatId, getBotInfo, sendTelegram } from "@/lib/stock/telegram";

export const dynamic = "force-dynamic";

/** 토큰 원문은 절대 클라이언트로 돌려주지 않는다 */
function mask(token: string): string {
  if (!token) return "";
  return token.length <= 12 ? "•".repeat(token.length) : `${token.slice(0, 6)}••••${token.slice(-4)}`;
}

/** GET — 현재 설정 상태 */
export async function GET() {
  const cfg = loadTelegramConfig();
  return NextResponse.json({
    ok: true,
    configured: Boolean(cfg.botToken && cfg.chatId),
    hasToken: Boolean(cfg.botToken),
    tokenMasked: mask(cfg.botToken),
    chatId: cfg.chatId,
  });
}

/**
 * POST — action 별 동작
 *   save   { botToken?, chatId? }  설정 저장 (빈 값이면 기존 값 유지)
 *   detect {}                      봇에 온 최근 메시지에서 chat_id 자동 추출 후 저장
 *   test   {}                      테스트 메시지 발송
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "");
  const current = loadTelegramConfig();

  try {
    if (action === "save") {
      const botToken = String(body?.botToken ?? "").trim() || current.botToken;
      const chatId = String(body?.chatId ?? "").trim() || current.chatId;
      if (!botToken) {
        return NextResponse.json(
          { ok: false, error: "token_required", message: "봇 토큰을 입력하세요." },
          { status: 400 }
        );
      }
      // 토큰이 실제로 유효한지 확인하고 저장한다 (오타를 나중에 알림 실패로 알게 되면 늦다)
      const info = await getBotInfo(botToken);
      saveTelegramConfig({ botToken, chatId });
      return NextResponse.json({ ok: true, botUsername: info.username, chatId });
    }

    if (action === "detect") {
      const botToken = String(body?.botToken ?? "").trim() || current.botToken;
      if (!botToken) {
        return NextResponse.json(
          { ok: false, error: "token_required", message: "봇 토큰을 먼저 저장하세요." },
          { status: 400 }
        );
      }
      const chatId = await detectChatId(botToken);
      if (!chatId) {
        return NextResponse.json({
          ok: false,
          error: "no_updates",
          message:
            "봇에게 온 메시지가 없습니다. 텔레그램에서 봇을 찾아 아무 메시지나 1번 보낸 뒤 다시 눌러주세요.",
        });
      }
      saveTelegramConfig({ botToken, chatId });
      return NextResponse.json({ ok: true, chatId });
    }

    if (action === "test") {
      const sent = await sendTelegram(
        [
          "✅ <b>주식 알림 연결 완료</b>",
          "",
          "이제 매수·매도 신호가 잡히면 이 방으로 알림이 옵니다.",
          "<i>기술적 지표 참고용 · 투자 판단과 책임은 본인에게 있습니다</i>",
        ].join("\n")
      );
      if (!sent.ok) {
        return NextResponse.json({ ok: false, error: "send_failed", message: sent.error }, { status: 502 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "telegram_error", message: (e as Error).message },
      { status: 502 }
    );
  }
}
