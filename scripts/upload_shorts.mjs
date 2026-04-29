#!/usr/bin/env node
/**
 * upload_shorts.mjs — YouTube Shorts 업로드
 *
 * 호출 방식: node scripts/upload_shorts.mjs <slug>
 * runBot.ts 의 runUploadScript(slug, {isShorts:true}) 에서 자동 호출됨
 *
 * Shorts 자동 분류 조건 (YouTube 정책):
 *   - 세로 방향 9:16 (1080x1920)
 *   - 60초 미만
 *   - 제목 or 설명에 #Shorts 포함
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import url from "node:url";
import { execSync } from "node:child_process";
import { google } from "googleapis";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const slug = process.argv[2];

if (!slug) {
  console.error("Usage: node scripts/upload_shorts.mjs <slug>");
  process.exit(1);
}

const UPLOAD_DIR = path.join(REPO_ROOT, "projects", slug, "S4-upload");

// .env 로드
const env = {};
for (const line of fs.readFileSync(path.join(REPO_ROOT, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "").trim();
}

function expandHome(p) {
  return p?.startsWith("~") ? path.join(process.env.HOME, p.slice(1)) : p;
}

// runBot.ts 채널 오버라이드 지원 (process.env 우선)
const CLIENT_SECRET_PATH = expandHome(process.env.YOUTUBE_CLIENT_SECRET_PATH || env.YOUTUBE_CLIENT_SECRET_PATH);
const TOKEN_PATH = expandHome(process.env.YOUTUBE_OAUTH_TOKEN_PATH || env.YOUTUBE_OAUTH_TOKEN_PATH);
const EXPECTED_CHANNEL_ID = process.env.YOUTUBE_EXPECTED_CHANNEL_ID || "";

if (!CLIENT_SECRET_PATH || !TOKEN_PATH) {
  console.error("❌ .env 에 YOUTUBE_CLIENT_SECRET_PATH / YOUTUBE_OAUTH_TOKEN_PATH 가 필요합니다.");
  process.exit(1);
}

// 입력 파일
const META_PATH = path.join(UPLOAD_DIR, "upload_metadata.json");
const VIDEO_PATH = path.join(UPLOAD_DIR, "final_short.mp4");

if (!fs.existsSync(META_PATH)) {
  console.error(`❌ upload_metadata.json 없음: ${META_PATH}`);
  console.error("   S4-upload 봇을 먼저 실행하세요.");
  process.exit(1);
}
if (!fs.existsSync(VIDEO_PATH)) {
  console.error(`❌ final_short.mp4 없음: ${VIDEO_PATH}`);
  console.error("   CapCut에서 9:16(1080×1920) 익스포트 후 해당 경로에 저장하세요.");
  process.exit(1);
}

const META = JSON.parse(fs.readFileSync(META_PATH, "utf8"));

// #Shorts 포함 여부 검증
if (!META.title?.includes("#Shorts") && !META.description?.includes("#Shorts")) {
  console.warn("⚠ 제목 또는 설명에 #Shorts 가 없습니다. YouTube Shorts 자동 분류가 안 될 수 있습니다.");
  console.warn("  title:", META.title);
}

// OAuth
const clientCfg = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, "utf8"));
const c = clientCfg.installed || clientCfg.web;
if (!c) { console.error("❌ client_secret 형식 이상"); process.exit(1); }
const PORT = 43211; // 롱폼(43210)과 다른 포트
const REDIRECT_URI = `http://localhost:${PORT}`;
const oauth2 = new google.auth.OAuth2(c.client_id, c.client_secret, REDIRECT_URI);
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

async function getAuth() {
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      oauth2.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8")));
      console.log("✓ 저장된 토큰 사용");
      return oauth2;
    } catch { console.warn("⚠ 토큰 파일 손상, 재인증 진행"); }
  }
  const authUrl = oauth2.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });
  console.log("\n🔐 OAuth 인증 필요\n");
  console.log(authUrl);
  try { execSync(`open "${authUrl}"`); } catch {}
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = url.parse(req.url, true);
      const code = u.query.code;
      if (!code) { res.writeHead(200); res.end("OK"); return; }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<html><body style="font-family:sans-serif;padding:40px"><h2>✅ 인증 완료</h2><p>이 창을 닫고 터미널로 돌아가세요.</p></body></html>`);
      server.close(); resolve(code);
    });
    server.listen(PORT, () => console.log(`⏳ http://localhost:${PORT} 에서 callback 대기중...`));
    setTimeout(() => reject(new Error("OAuth 5분 timeout")), 5 * 60 * 1000);
  });
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);
  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  fs.chmodSync(TOKEN_PATH, 0o600);
  console.log(`✓ 토큰 저장: ${TOKEN_PATH}`);
  return oauth2;
}

async function verifyChannel(youtube) {
  if (!EXPECTED_CHANNEL_ID) return;
  const resp = await youtube.channels.list({ part: ["snippet"], mine: true, maxResults: 1 });
  const ch = resp.data.items?.[0];
  if (!ch) { console.error("❌ 채널 정보 없음"); process.exit(1); }
  if (ch.id !== EXPECTED_CHANNEL_ID) {
    console.error(`\n❌ 채널 불일치!`);
    console.error(`   예상: ${EXPECTED_CHANNEL_ID}`);
    console.error(`   실제: ${ch.id} (${ch.snippet?.title})`);
    process.exit(1);
  }
  console.log(`✓ 채널 확인: ${ch.snippet?.title} (${ch.id})`);
}

async function uploadVideo(youtube) {
  const total = fs.statSync(VIDEO_PATH).size;
  console.log(`\n📤 Shorts 업로드 시작 (${(total / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`   제목: ${META.title}`);

  const res = await youtube.videos.insert(
    {
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: META.title,
          description: META.description,
          tags: META.tags || [],
          categoryId: META.category_id || "27",
          defaultLanguage: META.default_language || "ko",
          defaultAudioLanguage: META.default_audio_language || "ko",
        },
        status: {
          privacyStatus: META.privacy || "private",
          selfDeclaredMadeForKids: META.made_for_kids ?? false,
          publishAt: META.publish_at || undefined,
        },
      },
      media: { body: fs.createReadStream(VIDEO_PATH) },
    },
    {
      onUploadProgress: (e) => {
        const pct = ((e.bytesRead || 0) / total * 100).toFixed(1);
        process.stdout.write(`\r   진행: ${pct}%   `);
      },
    }
  );

  console.log("\n✓ 업로드 완료");
  return res.data.id;
}

async function setThumbnail(youtube, videoId) {
  const thumbPath = path.join(UPLOAD_DIR, "thumbnail.jpg");
  const thumbPathPng = path.join(UPLOAD_DIR, "thumbnail.png");
  const thumb = fs.existsSync(thumbPath) ? thumbPath : fs.existsSync(thumbPathPng) ? thumbPathPng : null;
  if (!thumb) { console.log("   썸네일 없음 — S4-upload/thumbnail.jpg 를 추가하면 자동 설정됩니다."); return; }

  try {
    await youtube.thumbnails.set({
      videoId,
      media: { body: fs.createReadStream(thumb), mimeType: thumb.endsWith(".png") ? "image/png" : "image/jpeg" },
    });
    console.log("✓ 썸네일 설정됨");
  } catch (e) {
    console.warn("⚠ 썸네일 설정 실패 (Studio 에서 수동 업로드):", e.errors?.[0]?.message || e.message);
  }
}

async function main() {
  console.log("=== YouTube Shorts 업로드 ===");
  console.log(`📁 slug: ${slug}`);
  console.log(`🎬 video: ${VIDEO_PATH}`);
  console.log();

  const auth = await getAuth();
  const youtube = google.youtube({ version: "v3", auth });
  await verifyChannel(youtube);
  const videoId = await uploadVideo(youtube);
  await setThumbnail(youtube, videoId);

  // 메타 파일에 videoId 기록
  META.video_id = videoId;
  META.video_url = `https://youtu.be/${videoId}`;
  META.ready_to_upload = true;
  fs.writeFileSync(META_PATH, JSON.stringify(META, null, 2));

  console.log("\n=== 완료 ===");
  console.log(`📱 Shorts: https://www.youtube.com/shorts/${videoId}`);
  console.log(`🛠 Studio: https://studio.youtube.com/video/${videoId}/edit`);
  console.log(`\n공개 범위: "${META.privacy}" → Studio에서 검토 후 공개로 전환하세요.`);
  console.log(`\n⚠ Shorts 분류 확인 조건:`);
  console.log(`   • 9:16 세로 영상 (1080×1920) ✓ 확인 필요`);
  console.log(`   • 60초 미만 ✓ 확인 필요`);
  console.log(`   • 제목/설명에 #Shorts: ${(META.title + META.description).includes("#Shorts") ? "✓ 포함됨" : "⚠ 없음!"}`);
}

main().catch((e) => {
  console.error("\n❌ 업로드 실패");
  console.error(e?.errors || e?.response?.data || e?.message || e);
  process.exit(1);
});
