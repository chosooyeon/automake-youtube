"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "./Toast";

interface Status {
  configured: boolean;
  hasToken: boolean;
  tokenMasked: string;
  chatId: string;
}

/**
 * 텔레그램 알림 연결 카드.
 * 토큰은 서버(admin/data/stock/telegram.json)에만 남고, 화면에는 마스킹된 값만 돌아온다.
 */
export default function TelegramSetupCard({
  onReadyChange,
}: {
  onReadyChange?: (ready: boolean) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { push } = useToast();

  const refresh = useCallback(async () => {
    const r = await fetch("/api/stock/telegram");
    const j = await r.json();
    if (j.ok) {
      const s: Status = {
        configured: j.configured,
        hasToken: j.hasToken,
        tokenMasked: j.tokenMasked,
        chatId: j.chatId,
      };
      setStatus(s);
      onReadyChange?.(s.configured);
      // 아직 연결 전이면 설정 패널을 펼쳐서 다음 할 일을 보여준다
      if (!s.configured) setOpen(true);
    }
  }, [onReadyChange]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function call(action: string, body: Record<string, unknown> = {}) {
    setBusy(action);
    try {
      const r = await fetch("/api/stock/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const j = await r.json();
      if (!j.ok) {
        push({ kind: "warn", title: "텔레그램 설정", message: j.message || j.error });
        return null;
      }
      await refresh();
      return j;
    } catch (e) {
      push({ kind: "error", title: "요청 실패", message: (e as Error).message });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function saveToken() {
    if (!token.trim()) {
      push({ kind: "warn", title: "봇 토큰을 입력하세요" });
      return;
    }
    const j = await call("save", { botToken: token.trim() });
    if (j) {
      setToken("");
      push({ kind: "success", title: `@${j.botUsername} 봇 연결됨`, message: "이제 chat_id 를 연결하세요." });
    }
  }

  async function detect() {
    const j = await call("detect");
    if (j) push({ kind: "success", title: "chat_id 연결됨", message: `chat_id: ${j.chatId}` });
  }

  async function test() {
    const j = await call("test");
    if (j) push({ kind: "success", title: "테스트 메시지를 보냈습니다", message: "텔레그램을 확인하세요." });
  }

  const ready = status?.configured ?? false;

  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">🔔 텔레그램 알림</h3>
          <span
            className={
              "text-[10px] border rounded-full px-2 py-0.5 " +
              (ready ? "text-good border-good/40 bg-good/10" : "text-warn border-warn/40 bg-warn/10")
            }
          >
            {ready ? "연결됨" : "설정 필요"}
          </span>
        </div>
        <span className="text-xs text-subtext">{open ? "접기 ▲" : "펼치기 ▼"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <ol className="text-xs text-subtext space-y-1.5 list-decimal list-inside">
            <li>
              텔레그램에서 <span className="text-text mono">@BotFather</span> 를 찾아 대화 시작 →{" "}
              <span className="text-text mono">/newbot</span> → 이름 지어주면 토큰이 나옵니다.
            </li>
            <li>아래에 토큰을 붙여넣고 <span className="text-text">저장</span>.</li>
            <li>
              만들어진 <span className="text-text">내 봇과의 대화방에 아무 메시지나 1번</span> 보낸 뒤{" "}
              <span className="text-text">chat_id 자동 연결</span> 버튼을 누릅니다.
            </li>
          </ol>

          <div className="flex gap-2">
            <input
              className="input-base flex-1"
              type="password"
              placeholder={
                status?.hasToken ? `저장됨: ${status.tokenMasked} (바꾸려면 새 토큰 입력)` : "봇 토큰 (123456:ABC-DEF...)"
              }
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button
              onClick={saveToken}
              disabled={busy === "save"}
              className="text-xs border border-line rounded px-3 py-1.5 hover:bg-panel2 disabled:opacity-50 shrink-0"
            >
              {busy === "save" ? "확인 중…" : "저장"}
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={detect}
              disabled={busy === "detect" || !status?.hasToken}
              className="text-xs border border-line rounded px-3 py-1.5 hover:bg-panel2 disabled:opacity-40"
            >
              {busy === "detect" ? "찾는 중…" : "chat_id 자동 연결"}
            </button>
            <button
              onClick={test}
              disabled={busy === "test" || !ready}
              className="text-xs border border-line rounded px-3 py-1.5 hover:bg-panel2 disabled:opacity-40"
            >
              {busy === "test" ? "발송 중…" : "테스트 메시지 보내기"}
            </button>
            {status?.chatId && (
              <span className="text-[11px] text-subtext mono">chat_id: {status.chatId}</span>
            )}
          </div>

          <p className="text-[11px] text-subtext">
            토큰은 <span className="mono text-text">admin/data/stock/telegram.json</span> 에만 저장됩니다
            (git 제외 경로). <span className="mono text-text">.env</span> 의{" "}
            <span className="mono text-text">TELEGRAM_BOT_TOKEN</span> ·{" "}
            <span className="mono text-text">TELEGRAM_CHAT_ID</span> 로도 설정할 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
}
