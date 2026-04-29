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

export function runUploadScript(slug: string, opts: { dryRun?: boolean; channel?: number; isShorts?: boolean } = {}) {
  const channel = opts.channel ?? 1;
  const isShorts = opts.isShorts ?? false;
  const uploadDir = isShorts ? "S4-upload" : "06-edit-upload";
  const videoFile = isShorts ? "final_short.mp4" : "final.mp4";

  const scriptPath = path.join(REPO_ROOT, "projects", slug, uploadDir, "upload_to_youtube.mjs");
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`업로드 스크립트가 없습니다: ${scriptPath}`);
  }
  const finalMp4 = path.join(REPO_ROOT, "projects", slug, uploadDir, videoFile);
  if (!fs.existsSync(finalMp4)) {
    throw new Error(`${videoFile} 가 없습니다. CapCut 익스포트 후 ${uploadDir}/${videoFile} 로 복사하세요.`);
  }
  const logPath = path.join(REPO_ROOT, "projects", slug, uploadDir, "upload.log.md");
  fs.appendFileSync(logPath, `\n## ▶ Upload @ ${new Date().toISOString()} (ch${channel}${isShorts ? " Shorts" : ""})\n${opts.dryRun ? "(DRY-RUN)\n" : ""}\n\`\`\`\n`);

  if (opts.dryRun) {
    fs.appendFileSync(logPath, "DRY-RUN: 실제 업로드는 호출하지 않았습니다.\n```\n");
    return { dryRun: true, logPath };
  }

  // 채널별 env var 오버라이드
  // client_secret.json 은 두 채널이 공유 (같은 Google 계정)
  const spawnEnv: NodeJS.ProcessEnv = { ...process.env };
  if (channel === 2) {
    // 채널 2의 OAuth 토큰 경로로 교체
    if (process.env.YOUTUBE_OAUTH_TOKEN_PATH_2) {
      spawnEnv.YOUTUBE_OAUTH_TOKEN_PATH = process.env.YOUTUBE_OAUTH_TOKEN_PATH_2;
    }
    // 업로드 스크립트가 채널 ID를 검증할 수 있도록 전달
    if (process.env.YOUTUBE_CHANNEL_ID_2) {
      spawnEnv.YOUTUBE_EXPECTED_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID_2;
    }
  } else {
    if (process.env.YOUTUBE_CHANNEL_ID_1) {
      spawnEnv.YOUTUBE_EXPECTED_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID_1;
    }
  }

  const child = spawn(process.execPath, [scriptPath], {
    cwd: REPO_ROOT,
    env: spawnEnv,
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

export interface RunShortsOptions {
  slug: string;
  stage: import("./paths").ShortsStageId;
  parentSlug: string;
}

export function runShortsBot({ slug, stage, parentSlug }: RunShortsOptions) {
  const dir = path.join(REPO_ROOT, "projects", slug, stage);
  fs.mkdirSync(dir, { recursive: true });
  const logPath = path.join(dir, "run.log.md");

  const header = [
    "",
    `## ▶ Run @ ${new Date().toISOString()}`,
    `- slug: \`${slug}\``,
    `- stage: \`${stage}\``,
    `- parent_slug: \`${parentSlug}\``,
    "",
    "```",
  ].join("\n");
  fs.appendFileSync(logPath, header + "\n");

  const promptParts = [
    "AGENTS.md, config/global.json 를 먼저 읽어줘.",
    `그다음 숏폼 프로젝트 \`projects/${slug}/\` 의 ${stage} 봇을 실행해줘.`,
    `봇 정의는 \`bots/${stage}/prompt.md\` 와 \`bots/${stage}/config.json\` 을 따른다.`,
    `부모 롱폼 프로젝트는 \`projects/${parentSlug}/\` 이다.`,
    `결과 산출물은 반드시 \`projects/${slug}/${stage}/\` 안에 저장하고,`,
    `검수 로그는 \`projects/${slug}/${stage}/run.log.md\` 에 append.`,
  ].join("\n");

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

  return { child, logPath };
}
