import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@/lib/paths";
import { QUEUE_DIR } from "@/lib/topics";

export const dynamic = "force-dynamic";

/**
 * 0번 봇 실행: 주제 후보 5개 뽑기.
 * Claude Code CLI 에 다음 한 줄을 보내고, 표준출력은 topics/queue/<ts>.log.md 로 append.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const note: string | undefined = body?.note ? String(body.note) : undefined;

  fs.mkdirSync(QUEUE_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "").slice(0, 13); // YYYYMMDDTHHMM
  const logPath = path.join(QUEUE_DIR, `${ts}.log.md`);

  const promptParts = [
    "AGENTS.md, config/global.json, config/pipeline.json 를 먼저 읽어줘.",
    "그 다음 `bots/00-topic/prompt.md` 와 `bots/00-topic/config.json` 의 룰을 따라 주제 후보 5개를 뽑아.",
    "출력 파일명은 `topics/queue/<YYYY-MM-DD>-<HHMM>.json` 형식으로 저장.",
    "사람용 요약은 같은 이름의 .md 로 저장.",
    "반드시 archive 와 진행 중인 프로젝트와 중복 회피.",
    note ? `추가 요구사항: ${note}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  fs.writeFileSync(
    logPath,
    [
      `## ▶ Topic Run @ ${new Date().toISOString()}`,
      note ? `- note: ${note}` : "",
      "",
      "```",
      "",
    ].join("\n"),
  );

  const child = spawn("claude", ["-p", promptParts], {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const append = (chunk: Buffer) => fs.appendFileSync(logPath, chunk.toString());
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.on("close", (code) => {
    fs.appendFileSync(logPath, `\n\`\`\`\n- exit_code: ${code}\n- finished: ${new Date().toISOString()}\n`);
  });

  return NextResponse.json({ ok: true, logPath, started: ts });
}
