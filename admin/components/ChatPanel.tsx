"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "./Markdown";
import { useToast } from "./Toast";

/* ────────────────────────── 타입 & 저장소 ────────────────────────── */

type Role = "user" | "assistant";

interface Msg {
  role: Role;
  text: string;
  thinking?: string;
  tools?: string[];
  cost?: number | null;
  error?: string | null;
}

interface Conv {
  id: string; // 로컬 id
  sessionId: string | null; // claude 세션 id (대화 이어가기 키)
  title: string;
  updatedAt: number;
  model: ModelKey;
  web: boolean;
  repo: boolean;
  messages: Msg[];
}

type ModelKey = "opus" | "sonnet" | "haiku";

const MODEL_LABEL: Record<ModelKey, string> = {
  opus: "Opus 4.7 (제일 똑똑, 느림·비쌈)",
  sonnet: "Sonnet 4.6 (기본 추천)",
  haiku: "Haiku 4.5 (빠름·저렴)",
};

const STORE_KEY = "automake_chat_v2";

function loadConvs(): Conv[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Conv[]) : [];
  } catch {
    return [];
  }
}

function saveConvs(convs: Conv[]) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(convs.slice(0, 50)));
  } catch {
    /* 용량 초과 무시 */
  }
}

function newConv(model: ModelKey = "sonnet", web = false, repo = false): Conv {
  return {
    id: `c${Date.now()}${Math.floor(Math.random() * 1000)}`,
    sessionId: null,
    title: "새 대화",
    updatedAt: Date.now(),
    model,
    web,
    repo,
    messages: [],
  };
}

function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 34 ? t.slice(0, 34) + "…" : t || "새 대화";
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return sameDay ? `${hh}:${mm}` : `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

/* ────────────────────────── 메인 ────────────────────────── */

export default function ChatPanel() {
  const { push } = useToast();
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [liveThinking, setLiveThinking] = useState("");
  const [liveTools, setLiveTools] = useState<string[]>([]);
  const [showThinking, setShowThinking] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // 최초 로드
  useEffect(() => {
    const stored = loadConvs();
    if (stored.length) {
      setConvs(stored);
      setActiveId(stored[0].id);
    } else {
      const c = newConv();
      setConvs([c]);
      setActiveId(c.id);
    }
    setHydrated(true);
  }, []);

  // 변경 시 저장
  useEffect(() => {
    if (hydrated) saveConvs(convs);
  }, [convs, hydrated]);

  const active = useMemo(
    () => convs.find((c) => c.id === activeId) ?? null,
    [convs, activeId]
  );

  const patchActive = useCallback(
    (fn: (c: Conv) => Conv) => {
      setConvs((prev) =>
        prev.map((c) => (c.id === activeId ? { ...fn(c), updatedAt: Date.now() } : c))
      );
    },
    [activeId]
  );

  // 자동 스크롤
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(scrollToBottom, [active?.messages.length, liveText, scrollToBottom]);

  /* ── 전송 ── */
  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || busy || !active) return;

      const conv = active;
      setInput("");
      setLiveText("");
      setLiveThinking("");
      setLiveTools([]);
      setBusy(true);

      patchActive((c) => ({
        ...c,
        title: c.messages.length === 0 ? titleFrom(text) : c.title,
        messages: [...c.messages, { role: "user", text }],
      }));

      const ac = new AbortController();
      abortRef.current = ac;

      let acc = "";
      let accThinking = "";
      const toolsSeen: string[] = [];
      let cost: number | null = null;
      let errMsg: string | null = null;
      let newSessionId: string | null = conv.sessionId;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            sessionId: conv.sessionId,
            model: conv.model,
            web: conv.web,
            repo: conv.repo,
          }),
          signal: ac.signal,
        });

        if (!res.ok || !res.body) {
          const t = await res.text().catch(() => "");
          throw new Error(`요청 실패 (${res.status}) ${t.slice(0, 300)}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            let ev: any;
            try {
              ev = JSON.parse(line);
            } catch {
              continue;
            }
            if (ev.t === "session") {
              newSessionId = ev.id;
            } else if (ev.t === "text") {
              acc += ev.d;
              setLiveText(acc);
            } else if (ev.t === "thinking") {
              accThinking += ev.d;
              setLiveThinking(accThinking);
            } else if (ev.t === "tool") {
              if (!toolsSeen.includes(ev.name)) {
                toolsSeen.push(ev.name);
                setLiveTools([...toolsSeen]);
              }
            } else if (ev.t === "done") {
              cost = ev.cost ?? null;
              if (ev.sessionId) newSessionId = ev.sessionId;
            } else if (ev.t === "err") {
              errMsg = ev.message;
            }
          }
        }
      } catch (e) {
        const err = e as Error;
        if (err.name === "AbortError") {
          errMsg = acc ? null : "사용자가 중단했습니다.";
        } else {
          errMsg = err.message;
        }
      }

      patchActive((c) => ({
        ...c,
        sessionId: newSessionId,
        messages: [
          ...c.messages,
          {
            role: "assistant",
            text: acc,
            thinking: accThinking || undefined,
            tools: toolsSeen.length ? toolsSeen : undefined,
            cost,
            error: errMsg,
          },
        ],
      }));

      setLiveText("");
      setLiveThinking("");
      setLiveTools([]);
      setBusy(false);
      abortRef.current = null;
      if (errMsg) push({ kind: "error", title: "응답 오류", message: errMsg.slice(0, 200) });
      taRef.current?.focus();
    },
    [active, busy, input, patchActive, push]
  );

  const stop = () => {
    abortRef.current?.abort();
  };

  const startNew = () => {
    if (busy) return;
    const c = newConv(active?.model ?? "sonnet", active?.web ?? false, active?.repo ?? false);
    setConvs((prev) => [c, ...prev]);
    setActiveId(c.id);
    setInput("");
    taRef.current?.focus();
  };

  const removeConv = (id: string) => {
    setConvs((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (id === activeId) {
        if (next.length) setActiveId(next[0].id);
        else {
          const c = newConv();
          setActiveId(c.id);
          return [c];
        }
      }
      return next;
    });
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      push({ kind: "success", title: "복사했습니다" });
    } catch {
      push({ kind: "warn", title: "복사 실패", message: "브라우저 권한을 확인하세요." });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  if (!active) return null;

  const sorted = [...convs].sort((a, b) => b.updatedAt - a.updatedAt);
  const empty = active.messages.length === 0 && !busy;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
      {/* ── 사이드바: 대화 목록 ── */}
      <aside className="space-y-2">
        <button
          onClick={startNew}
          disabled={busy}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm hover:bg-panel2 disabled:opacity-40"
        >
          ＋ 새 대화
        </button>
        <div className="space-y-1 max-h-[220px] lg:max-h-[560px] overflow-y-auto pr-1">
          {sorted.map((c) => (
            <div
              key={c.id}
              className={
                "group flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs cursor-pointer " +
                (c.id === activeId
                  ? "bg-panel border-line text-text"
                  : "border-transparent text-subtext hover:bg-panel/50 hover:text-text")
              }
              onClick={() => !busy && setActiveId(c.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="truncate">{c.title}</div>
                <div className="text-[10px] text-subtext">
                  {fmtTime(c.updatedAt)} · {c.messages.filter((m) => m.role === "user").length}문답
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeConv(c.id);
                }}
                title="대화 삭제"
                className="opacity-0 group-hover:opacity-100 text-subtext hover:text-bad px-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* ── 본문 ── */}
      <section className="rounded-xl border border-line bg-panel/40 flex flex-col min-h-[560px]">
        {/* 옵션 바 */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 text-xs">
          <select
            value={active.model}
            onChange={(e) => patchActive((c) => ({ ...c, model: e.target.value as ModelKey }))}
            className="bg-bg border border-line rounded px-2 py-1 text-xs"
            title="모델 (대화 도중에도 바꿀 수 있어요)"
          >
            {(Object.keys(MODEL_LABEL) as ModelKey[]).map((k) => (
              <option key={k} value={k}>
                {MODEL_LABEL[k]}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={active.web}
              onChange={(e) => patchActive((c) => ({ ...c, web: e.target.checked }))}
            />
            <span className={active.web ? "text-text" : "text-subtext"}>🔍 웹 검색 허용</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={active.repo}
              onChange={(e) => patchActive((c) => ({ ...c, repo: e.target.checked }))}
            />
            <span className={active.repo ? "text-text" : "text-subtext"}>
              📁 이 저장소 파일 읽기
            </span>
          </label>

          <span className="ml-auto text-subtext">
            {active.sessionId ? "대화 이어짐 ✓" : "새 세션"}
          </span>
        </div>

        {/* 메시지 목록 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 max-h-[560px]">
          {empty && (
            <div className="text-sm text-subtext space-y-3 py-6">
              <p className="text-text">무엇이든 물어보세요. 클로드 웹처럼 대화가 이어집니다.</p>
              <ul className="space-y-1.5">
                {[
                  "이번 주 육아 관련 정부지원금 뭐가 바뀌었어? (웹 검색 켜기)",
                  "심리식탁 채널 다음 편 주제 5개만 뽑아줘",
                  "이 문장 더 자연스럽게 다듬어줘: …",
                ].map((s) => (
                  <li key={s}>
                    <button
                      onClick={() => void send(s)}
                      className="text-left rounded-md border border-line bg-panel px-3 py-2 hover:bg-panel2 w-full"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-xs">
                Enter 전송 · Shift+Enter 줄바꿈 · 대화는 이 브라우저에만 저장됩니다.
              </p>
            </div>
          )}

          {active.messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-panel2 border border-line px-4 py-2.5 text-sm whitespace-pre-wrap">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={i} className="space-y-1.5">
                {m.tools && m.tools.length > 0 && (
                  <div className="text-[11px] text-subtext">🛠 사용한 도구: {m.tools.join(", ")}</div>
                )}
                {m.thinking && (
                  <details className="text-[11px] text-subtext">
                    <summary className="cursor-pointer hover:text-text">생각 과정 보기</summary>
                    <div className="mt-1 whitespace-pre-wrap border-l-2 border-line pl-2 py-1">
                      {m.thinking}
                    </div>
                  </details>
                )}
                {m.text && <Markdown text={m.text} />}
                {m.error && (
                  <div className="text-xs text-bad whitespace-pre-wrap border border-bad/40 bg-bad/10 rounded p-2">
                    {m.error}
                  </div>
                )}
                <div className="flex items-center gap-3 text-[10px] text-subtext">
                  {m.text && (
                    <button onClick={() => void copy(m.text)} className="hover:text-text">
                      복사
                    </button>
                  )}
                  {typeof m.cost === "number" && <span>${m.cost.toFixed(4)}</span>}
                </div>
              </div>
            )
          )}

          {/* 스트리밍 중 */}
          {busy && (
            <div className="space-y-1.5">
              {liveTools.length > 0 && (
                <div className="text-[11px] text-subtext">🛠 {liveTools.join(", ")} 실행 중…</div>
              )}
              {liveThinking && !liveText && (
                <div className="text-[11px] text-subtext">
                  <button
                    onClick={() => setShowThinking((v) => !v)}
                    className="hover:text-text underline underline-offset-2"
                  >
                    생각 중{showThinking ? " (접기)" : "…"}
                  </button>
                  {showThinking && (
                    <div className="mt-1 whitespace-pre-wrap border-l-2 border-line pl-2 py-1 max-h-40 overflow-y-auto">
                      {liveThinking}
                    </div>
                  )}
                </div>
              )}
              {liveText ? (
                <Markdown text={liveText} />
              ) : (
                !liveThinking && <div className="text-sm text-subtext">답변 준비 중…</div>
              )}
            </div>
          )}
        </div>

        {/* 입력 */}
        <div className="border-t border-line p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              placeholder="질문을 입력하세요 (Enter 전송 / Shift+Enter 줄바꿈)"
              className="input-base resize-y min-h-[52px] max-h-[220px]"
            />
            {busy ? (
              <button
                onClick={stop}
                className="shrink-0 rounded-lg border border-bad/50 bg-bad/15 text-bad px-4 py-2.5 text-sm hover:bg-bad/25"
              >
                ■ 중단
              </button>
            ) : (
              <button
                onClick={() => void send()}
                disabled={!input.trim()}
                className="shrink-0 rounded-lg border border-line bg-accent2 text-bg font-medium px-5 py-2.5 text-sm hover:opacity-90 disabled:opacity-30"
              >
                전송
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
