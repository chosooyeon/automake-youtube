import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@/lib/paths";
import { QUEUE_DIR } from "@/lib/topics";
import { getActiveNiche, loadResolvedConfig } from "@/lib/niche";

export const dynamic = "force-dynamic";

/**
 * 0번 봇 실행: 주제 후보 5개 뽑기.
 * Claude Code CLI 에 다음 한 줄을 보내고, 표준출력은 topics/queue/<ts>.log.md 로 append.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const note: string | undefined = body?.note ? String(body.note) : undefined;
  const niche = body?.niche ? String(body.niche) : getActiveNiche();
  const resolved = loadResolvedConfig(niche);
  const channelName: string = resolved?.channel?.name ?? "(unknown)";
  const channelNiche: string = resolved?.channel?.niche ?? "";

  fs.mkdirSync(QUEUE_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "").slice(0, 13); // YYYYMMDDTHHMM
  const logPath = path.join(QUEUE_DIR, `${ts}.log.md`);

  const promptParts = [
    "AGENTS.md, config/global.json, config/pipeline.json 를 먼저 읽어줘.",
    `이번 실행의 활성 니치: \`${niche}\` (채널: ${channelName} / niche: ${channelNiche}).`,
    `\`config/global.json.active_niche\` 값과 무관하게, 위 니치 기준으로 후보를 뽑아.`,
    `니치가 'mom_wallet' 이면 root 의 channel/brand/apis.search 를 그대로 사용.`,
    `그 외 니치(예: psychology) 면 \`niches[${JSON.stringify(niche)}]\` 의 channel/brand/apis.search 를 root 위에 deep-merge 한 값을 사용.`,
    `slug_suggestion 의 niche_short prefix 도 이 니치에 맞게 (예: psychology → \`psy\`).`,
    "그 다음 `bots/00-topic/prompt.md` 와 `bots/00-topic/config.json` 의 룰을 따라 주제 후보 5개를 뽑아.",
    `출력 파일명은 \`topics/queue/${ts}.json\` 형식으로 저장 (해당 niche tag 를 candidates 외 최상위 \`niche\` 필드에 함께 기록).`,
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
      `- niche: \`${niche}\` (${channelName})`,
      note ? `- note: ${note}` : "",
      "",
      "```",
      "",
    ].filter(Boolean).join("\n"),
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
