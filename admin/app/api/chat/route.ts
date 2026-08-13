import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@/lib/paths";

/**
 * 대화 전용 작업 디렉터리.
 * 저장소 루트에서 실행하면 프로젝트 CLAUDE.md(봇 하네스 지시문)가 자동으로 주입돼
 * 일반 대화 답변이 오염된다. 그래서 빈 디렉터리에서 실행하고,
 * '저장소 파일 읽기' 를 켰을 때만 --add-dir 로 저장소를 붙인다.
 * (claude 세션 기록도 이 디렉터리 기준으로 저장 → --resume 이 항상 같은 곳을 본다)
 */
const CHAT_CWD = path.join(REPO_ROOT, "admin", "data", "chat");

export const dynamic = "force-dynamic";
export const maxDuration = 900;

const MODELS: Record<string, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
};

const BASE_SYSTEM = [
  "너는 사용자의 개인 대화 어시스턴트다. 클로드 웹(claude.ai)에서처럼 자유로운 질문·상담·글쓰기·아이디어 정리를 돕는다.",
  "특정 코드베이스 작업 에이전트가 아니다. 사용자가 요청하지 않으면 파일을 고치거나 명령을 실행하려 하지 말고 대화로 답한다.",
  "한국어로 질문하면 한국어로 답한다. 마크다운(제목·리스트·표·코드블록)을 적극 활용해 읽기 쉽게 정리한다.",
  "모르면 모른다고 말한다. 사실을 지어내지 않는다.",
].join("\n");

const REPO_SYSTEM = [
  "",
  `참고: 필요하면 로컬 저장소 \`${REPO_ROOT}\` 의 파일을 읽어서(Read/Glob/Grep) 답변에 활용할 수 있다.`,
  "단, 파일을 수정하거나 삭제하지는 않는다 (읽기 전용).",
].join("\n");

interface ChatBody {
  message: string;
  sessionId?: string | null;
  model?: keyof typeof MODELS | string;
  web?: boolean;
  repo?: boolean;
}

function buildArgs(body: ChatBody, sessionId: string, isNew: boolean): string[] {
  const model = MODELS[String(body.model ?? "sonnet")] ?? MODELS.sonnet;

  const tools: string[] = [];
  if (body.web) tools.push("WebSearch", "WebFetch");
  if (body.repo) tools.push("Read", "Glob", "Grep");

  const args = [
    "-p",
    body.message,
    "--model",
    model,
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--system-prompt",
    BASE_SYSTEM + (body.repo ? REPO_SYSTEM : ""),
    // 대화 이어가기: 첫 턴은 세션 생성, 이후는 resume
    ...(isNew ? ["--session-id", sessionId] : ["--resume", sessionId]),
  ];

  if (tools.length === 0) {
    // 도구 없이 순수 대화
    args.push("--tools", "");
  } else {
    args.push("--tools", tools.join(","));
    args.push("--allowed-tools", tools.join(","));
    args.push("--max-turns", "30");
  }

  if (body.repo) args.push("--add-dir", REPO_ROOT);

  return args;
}

export async function POST(req: Request) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return Response.json({ ok: false, error: "invalid_json_body" }, { status: 400 });
  }

  if (!body?.message || !body.message.trim()) {
    return Response.json({ ok: false, error: "empty_message" }, { status: 400 });
  }

  const isNew = !body.sessionId;
  const sessionId = body.sessionId || randomUUID();
  const args = buildArgs(body, sessionId, isNew);

  fs.mkdirSync(CHAT_CWD, { recursive: true });
  const child = spawn("claude", args, {
    cwd: CHAT_CWD,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true;
        }
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // 클라이언트가 중단(stop 버튼/탭 닫기)하면 자식 프로세스도 종료
      const onAbort = () => {
        child.kill("SIGTERM");
        finish();
      };
      req.signal.addEventListener("abort", onAbort);

      let buf = "";
      let sawText = false;
      let sawInit = false;
      const stderrChunks: string[] = [];

      const handleEvent = (obj: any) => {
        // 세션 id 는 CLI 가 실제로 세션을 열었을 때(init)만 클라이언트에 알린다.
        // (실행 실패한 uuid 를 저장해두면 다음 턴의 --resume 이 깨진다)
        if (obj?.type === "system" && obj.subtype === "init") {
          sawInit = true;
          send({ t: "session", id: obj.session_id || sessionId });
          return;
        }
        if (obj?.type === "stream_event") {
          const ev = obj.event;
          if (ev?.type === "content_block_delta") {
            if (ev.delta?.type === "text_delta" && ev.delta.text) {
              sawText = true;
              send({ t: "text", d: ev.delta.text });
            } else if (ev.delta?.type === "thinking_delta" && ev.delta.thinking) {
              send({ t: "thinking", d: ev.delta.thinking });
            }
          } else if (ev?.type === "content_block_start" && ev.content_block?.type === "tool_use") {
            send({ t: "tool", name: ev.content_block.name ?? "tool" });
          }
          return;
        }
        if (obj?.type === "result") {
          // 스트리밍 델타를 못 받은 경우(도구 턴 등) 최종 텍스트로 보정
          if (!sawText && typeof obj.result === "string" && obj.result.trim()) {
            send({ t: "text", d: obj.result });
          }
          send({
            t: "done",
            cost: obj.total_cost_usd ?? null,
            durationMs: obj.duration_ms ?? null,
            isError: Boolean(obj.is_error),
            sessionId: obj.session_id ?? sessionId,
          });
        }
      };

      child.stdout.on("data", (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try {
            handleEvent(JSON.parse(line));
          } catch {
            /* 부분 JSON / 비-JSON 로그 라인 무시 */
          }
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk.toString("utf8"));
      });

      child.on("error", (e) => {
        send({ t: "err", message: `claude 실행 실패: ${e.message}` });
        req.signal.removeEventListener("abort", onAbort);
        finish();
      });

      child.on("close", (code) => {
        if (code !== 0 && !isNew && !sawInit) {
          // --resume 대상 세션이 사라진 경우: 세션을 버리고 다시 보내도록 안내
          send({ t: "session", id: null });
          send({
            t: "err",
            message:
              "이전 대화 세션을 찾지 못했습니다(세션 기록 만료/삭제). " +
              "세션을 초기화했으니 같은 질문을 한 번만 다시 보내주세요.",
          });
        } else if (code !== 0) {
          send({
            t: "err",
            message:
              `claude 종료 코드 ${code}\n` + stderrChunks.join("").slice(-2000),
          });
        }
        send({ t: "end" });
        req.signal.removeEventListener("abort", onAbort);
        finish();
      });
    },
    cancel() {
      child.kill("SIGTERM");
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
