#!/usr/bin/env node
/**
 * YouTube 채널별 OAuth 토큰 발급 스크립트
 *
 * 사용법:
 *   node scripts/init-youtube-auth.mjs --channel 1
 *   node scripts/init-youtube-auth.mjs --channel 2
 *
 * 같은 Google 계정에 채널이 여러 개인 경우:
 *   채널 2의 토큰을 발급하려면,
 *   1) https://studio.youtube.com 접속
 *   2) 우측 상단 계정 아이콘 → "채널 전환" → 두 번째 채널 선택
 *   3) 이 스크립트 실행 → 브라우저에서 동일 계정으로 로그인
 *   YouTube는 현재 활성 채널 기준으로 토큰을 발급합니다.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import url from 'node:url';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');

// ── .env 로드 ──────────────────────────────────────────────
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
}

// ── 채널 번호 파싱 ─────────────────────────────────────────
const args = process.argv.slice(2);
const chIdx = args.indexOf('--channel');
const channelNum = chIdx !== -1 ? parseInt(args[chIdx + 1], 10) : 1;
if (![1, 2].includes(channelNum)) {
  console.error('❌ --channel 1 또는 --channel 2 만 지원합니다.');
  process.exit(1);
}

// ── channels.json 로드 ─────────────────────────────────────
const channelsPath = path.join(ROOT, 'config', 'channels.json');
const channels = JSON.parse(fs.readFileSync(channelsPath, 'utf8'));
const ch = channels.find((c) => c.id === channelNum);
if (!ch) {
  console.error(`❌ channels.json 에 id=${channelNum} 채널이 없습니다.`);
  process.exit(1);
}

function expandHome(p) {
  return p?.startsWith('~') ? path.join(process.env.HOME, p.slice(1)) : p;
}

const CLIENT_SECRET_PATH = expandHome(env[ch.client_secret_env]);
const TOKEN_PATH = expandHome(env[ch.token_env]);

if (!CLIENT_SECRET_PATH || !fs.existsSync(CLIENT_SECRET_PATH)) {
  console.error(`❌ client_secret 파일이 없습니다: ${CLIENT_SECRET_PATH}`);
  console.error(`   .env 의 ${ch.client_secret_env} 경로를 확인하세요.`);
  process.exit(1);
}
if (!TOKEN_PATH) {
  console.error(`❌ .env 에 ${ch.token_env} 가 설정되어 있지 않습니다.`);
  process.exit(1);
}

// ── 안내 메시지 ────────────────────────────────────────────
console.log(`\n====================================================`);
console.log(`  📺 YouTube 채널 ${channelNum} OAuth 토큰 발급`);
console.log(`====================================================`);

if (channelNum === 2) {
  console.log(`
⚠️  중요: 같은 Google 계정에 채널이 여러 개라면,
   지금 YouTube Studio에서 채널 ${channelNum}로 전환되어 있어야 합니다.

   전환 방법:
   1) https://studio.youtube.com 접속
   2) 우측 상단 내 아이콘 → "채널 전환" 클릭
   3) 두 번째 채널 선택
   4) 그 상태에서 이 스크립트가 여는 브라우저 창에서 Google 로그인

   아직 안 하셨다면 지금 해주세요. 준비됐으면 Enter...`);
  await waitEnter();
}

// ── OAuth 클라이언트 ───────────────────────────────────────
const clientCfg = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, 'utf8'));
const c = clientCfg.installed || clientCfg.web;
if (!c) { console.error('❌ client_secret 형식 이상'); process.exit(1); }

const PORT = 43211; // init 스크립트는 43211 사용 (업로드와 포트 충돌 방지)
const REDIRECT_URI = `http://localhost:${PORT}`;
const oauth2 = new google.auth.OAuth2(c.client_id, c.client_secret, REDIRECT_URI);

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtube.readonly',
];

// 기존 토큰 삭제 (채널 재선택 강제)
if (fs.existsSync(TOKEN_PATH)) {
  const old = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  console.log(`\n♻️  기존 토큰 파일 발견: ${TOKEN_PATH}`);
  console.log('   덮어씁니다 (채널 ID 재검증을 위해 강제 재인증).\n');
}

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // 항상 채널 선택 화면 표시
  scope: SCOPES,
});

console.log('\n🔐 브라우저를 열어 Google 계정으로 로그인합니다...\n');
console.log('URL:', authUrl, '\n');
try { execSync(`open "${authUrl}"`); } catch {}

// ── Callback 서버 ──────────────────────────────────────────
const code = await new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    const u = url.parse(req.url, true);
    const code = u.query.code;
    const err = u.query.error;
    if (err) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`OAuth 거부됨: ${err}`);
      server.close(); reject(new Error(err)); return;
    }
    if (!code) { res.writeHead(200); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<html><body style="font-family:sans-serif;padding:40px;background:#0B0F1A;color:#E5E7EB">
      <h2 style="color:#4ADE80">✅ 인증 완료</h2>
      <p>이 창을 닫고 터미널로 돌아가세요.</p>
    </body></html>`);
    server.close(); resolve(code);
  });
  server.on('error', reject);
  server.listen(PORT, () => console.log(`⏳ http://localhost:${PORT} 에서 callback 대기 중...`));
  setTimeout(() => reject(new Error('OAuth 5분 timeout')), 5 * 60 * 1000);
});

const { tokens } = await oauth2.getToken(code);
oauth2.setCredentials(tokens);
fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
fs.chmodSync(TOKEN_PATH, 0o600);
console.log(`\n✓ 토큰 저장: ${TOKEN_PATH}`);

// ── 채널 ID 조회 및 검증 ──────────────────────────────────
console.log('\n🔍 인증된 채널 정보 확인 중...');
const youtube = google.youtube({ version: 'v3', auth: oauth2 });

let verifiedChannelId = '';
let verifiedChannelName = '';
try {
  const resp = await youtube.channels.list({ part: ['snippet'], mine: true });
  const items = resp.data.items || [];
  if (items.length === 0) {
    console.error('❌ 이 계정에 YouTube 채널이 없습니다.');
    process.exit(1);
  }
  const chInfo = items[0];
  verifiedChannelId = chInfo.id;
  verifiedChannelName = chInfo.snippet.title;

  console.log(`\n✅ 인증된 채널:`);
  console.log(`   이름:       ${verifiedChannelName}`);
  console.log(`   Channel ID: ${verifiedChannelId}`);
  console.log(`   URL:        https://www.youtube.com/channel/${verifiedChannelId}`);
} catch (e) {
  console.warn('⚠ 채널 정보 조회 실패 (토큰은 저장됨):', e.message);
}

// ── channels.json 업데이트 ─────────────────────────────────
if (verifiedChannelId) {
  ch.channel_id = verifiedChannelId;
  ch.channel_name = verifiedChannelName;
  fs.writeFileSync(channelsPath, JSON.stringify(channels, null, 2));
  console.log(`\n✓ config/channels.json 업데이트 완료`);
}

// ── .env 업데이트 (CHANNEL_ID 필드) ──────────────────────────
if (verifiedChannelId) {
  const envKey = ch.channel_id_env; // e.g. YOUTUBE_CHANNEL_ID_1
  let envContent = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const regex = new RegExp(`^(${envKey}=).*$`, 'm');
  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `$1${verifiedChannelId}`);
  } else {
    envContent += `\n${envKey}=${verifiedChannelId}\n`;
  }
  fs.writeFileSync(path.join(ROOT, '.env'), envContent);
  console.log(`✓ .env 의 ${envKey} 업데이트: ${verifiedChannelId}`);
}

console.log(`\n====================================================`);
console.log(`  🎉 채널 ${channelNum} 설정 완료!`);
if (verifiedChannelName) console.log(`  채널명: ${verifiedChannelName}`);
console.log(`  토큰:   ${TOKEN_PATH}`);
console.log(`====================================================\n`);

function waitEnter() {
  return new Promise((resolve) => {
    process.stdin.setRawMode?.(false);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}
