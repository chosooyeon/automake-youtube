import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, stageDir, stageRunLog, type StageId } from "./paths";

export function isClaudeInstalled(): { installed: boolean; version?: string; reason?: string } {
  const r = spawnSync("claude", ["--version"], { encoding: "utf8" });
  if (r.error) return { installed: false, reason: "claude CLI not found in PATH" };
  if (r.status !== 0) return { installed: false, reason: r.stderr || "claude --version failed" };
  return { installed: true, version: (r.stdout || "").trim() };
}

export interface RunOptions {
  slug: string;
  stage: StageId;
  extraNote?: string;
}

/**
 * 봇 1개를 실행한다. Claude Code(headless)에 다음 한 줄을 보냄:
 *   "AGENTS.md 를 따라 ${slug} 프로젝트의 ${stage} 봇을 실행해줘. 추가 요청: ${extraNote}"
 * 표준출력/에러를 stageDir/run.log.md 에 append 한다.
 * 반환은 자식 프로세스 객체.
 */
export function runBot({ slug, stage, extraNote }: RunOptions) {
  const dir = stageDir(slug, stage);
  fs.mkdirSync(dir, { recursive: true });
  const logPath = stageRunLog(slug, stage);

  const header = [
    "",
    `## ▶ Run @ ${new Date().toISOString()}`,
    `- slug: \`${slug}\``,
    `- stage: \`${stage}\``,
    extraNote ? `- note: ${extraNote}` : null,
    "",
    "```",
  ]
    .filter(Boolean)
    .join("\n");
  fs.appendFileSync(logPath, header + "\n");

  const promptParts = [
    "AGENTS.md, config/global.json, config/pipeline.json 를 먼저 읽어줘.",
    `그다음 \`projects/${slug}/\` 의 ${stage} 봇을 실행해줘.`,
    `봇 정의는 \`bots/${stage}/prompt.md\` 와 \`bots/${stage}/config.json\` 을 따른다.`,
    `결과 산출물은 반드시 \`projects/${slug}/${stage}/\` 안에 저장하고,`,
    `검수 로그는 \`projects/${slug}/${stage}/run.log.md\` 에 append.`,
    extraNote ? `추가 요구사항: ${extraNote}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const child = spawn("claude", ["-p", promptParts], {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const append = (chunk: Buffer) => {
    fs.appendFileSync(logPath, chunk.toString());
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.on("close", (code) => {
    fs.appendFileSync(logPath, `\n\`\`\`\n- exit_code: ${code}\n- finished: ${new Date().toISOString()}\n`);
  });

  return { child, logPath };
}

export function runUploadScript(slug: string, opts: { dryRun?: boolean } = {}) {
  const scriptPath = path.join(REPO_ROOT, "projects", slug, "06-edit-upload", "upload_to_youtube.mjs");
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`업로드 스크립트가 없습니다: ${scriptPath}`);
  }
  const finalMp4 = path.join(REPO_ROOT, "projects", slug, "06-edit-upload", "final.mp4");
  if (!fs.existsSync(finalMp4)) {
    throw new Error(`final.mp4 가 없습니다. CapCut 익스포트 후 06-edit-upload/final.mp4 로 복사하세요.`);
  }
  const logPath = path.join(REPO_ROOT, "projects", slug, "06-edit-upload", "upload.log.md");
  fs.appendFileSync(logPath, `\n## ▶ Upload @ ${new Date().toISOString()}\n${opts.dryRun ? "(DRY-RUN)\n" : ""}\n\`\`\`\n`);

  if (opts.dryRun) {
    fs.appendFileSync(logPath, "DRY-RUN: 실제 업로드는 호출하지 않았습니다.\n```\n");
    return { dryRun: true, logPath };
  }
  const child = spawn(process.execPath, [scriptPath], {
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
  return { child, logPath };
}
