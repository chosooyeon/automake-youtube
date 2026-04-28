#!/usr/bin/env node
// YouTube 자동 업로드 (OAuth 데스크톱 앱)
//   1) ~/.../client_secret.json + token.json 로드 (없으면 브라우저 OAuth)
//   2) final.mp4 업로드 (snippet + status from upload_metadata.json)
//   3) (옵션) _subtitle.srt 캡션 트랙 추가
//   4) (옵션) comment_pinned 댓글 작성 (핀 고정은 Studio 에서 수동)

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import url from 'node:url';
import { execSync } from 'node:child_process';
import { google } from 'googleapis';

const HERE = import.meta.dirname;
const PROJ = path.resolve(HERE, '..');
const ROOT = path.resolve(PROJ, '..', '..');

// ── .env 로드 ───────────────────────────────────────────────
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
}
const CLIENT_SECRET_PATH = env.YOUTUBE_CLIENT_SECRET_PATH;
const TOKEN_PATH = env.YOUTUBE_OAUTH_TOKEN_PATH;
if (!CLIENT_SECRET_PATH || !TOKEN_PATH) {
  console.error('❌ .env 에 YOUTUBE_CLIENT_SECRET_PATH / YOUTUBE_OAUTH_TOKEN_PATH 가 필요합니다.');
  process.exit(1);
}

// ── 입력 파일 ───────────────────────────────────────────────
const META = JSON.parse(fs.readFileSync(path.join(PROJ, '06-edit-upload/upload_metadata.json'), 'utf8'));
const VIDEO = path.join(PROJ, '06-edit-upload/final.mp4');
const CAPTIONS = path.join(PROJ, '06-edit-upload/_subtitle.srt');

if (!fs.existsSync(VIDEO)) {
  console.error('❌ final.mp4 가 없습니다:', VIDEO);
  process.exit(1);
}

// ── OAuth 클라이언트 ───────────────────────────────────────
const clientCfg = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, 'utf8'));
const c = clientCfg.installed || clientCfg.web;
if (!c) { console.error('❌ client_secret 형식 이상'); process.exit(1); }
const PORT = 43210;
const REDIRECT_URI = `http://localhost:${PORT}`;
const oauth2 = new google.auth.OAuth2(c.client_id, c.client_secret, REDIRECT_URI);

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

async function getAuth() {
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      oauth2.setCredentials(tokens);
      console.log('✓ 저장된 토큰 사용');
      return oauth2;
    } catch (e) {
      console.warn('⚠ 토큰 파일 손상, 재인증 진행');
    }
  }
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
  console.log('\n🔐 OAuth 인증 필요\n');
  console.log('브라우저에서 아래 URL을 열고 본인 Google 계정으로 동의해주세요:\n');
  console.log(authUrl);
  console.log('\n(브라우저가 자동으로 열립니다. 안 열리면 위 URL을 복사하세요)\n');
  try { execSync(`open "${authUrl}"`); } catch (e) {}

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
      if (!code) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK'); return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body style="font-family:sans-serif;padding:40px"><h2>✅ 인증 완료</h2><p>이 창을 닫고 터미널로 돌아가세요. 영상 업로드가 자동으로 진행됩니다.</p></body></html>`);
      server.close(); resolve(code);
    });
    server.on('error', reject);
    server.listen(PORT, () => console.log(`⏳ http://localhost:${PORT} 에서 callback 대기중...`));
    setTimeout(() => reject(new Error('OAuth 5분 timeout')), 5 * 60 * 1000);
  });

  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);
  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  fs.chmodSync(TOKEN_PATH, 0o600);
  console.log(`✓ 토큰 저장: ${TOKEN_PATH}`);
  return oauth2;
}

async function uploadVideo(youtube) {
  const total = fs.statSync(VIDEO).size;
  console.log(`\n📤 영상 업로드 시작 (${(total/1024/1024).toFixed(2)} MB)`);
  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: META.title,
        description: META.description,
        tags: META.tags,
        categoryId: META.category_id,
        defaultLanguage: META.default_language,
        defaultAudioLanguage: META.default_audio_language,
      },
      status: {
        privacyStatus: META.privacy,
        selfDeclaredMadeForKids: META.made_for_kids,
        publishAt: META.publish_at || undefined,
      },
    },
    media: { body: fs.createReadStream(VIDEO) },
  }, {
    onUploadProgress: (e) => {
      const pct = ((e.bytesRead || 0) / total * 100).toFixed(1);
      process.stdout.write(`\r   진행: ${pct}%   `);
    },
  });
  console.log('\n✓ 영상 업로드 완료');
  return res.data.id;
}

async function addCaption(youtube, videoId) {
  if (!fs.existsSync(CAPTIONS)) return;
  console.log('\n📝 자막(CC) 트랙 추가 중...');
  try {
    await youtube.captions.insert({
      part: ['snippet'],
      requestBody: {
        snippet: { videoId, language: 'ko', name: '한국어', isDraft: false },
      },
      media: { body: fs.createReadStream(CAPTIONS), mimeType: 'application/octet-stream' },
    });
    console.log('✓ 자막 트랙 추가됨');
  } catch (e) {
    console.warn('⚠ 자막 트랙 실패 (영상에 이미 박혀있어 문제없음):', e.errors?.[0]?.message || e.message);
  }
}

async function postPinnedComment(youtube, videoId) {
  if (!META.comment_pinned) return;
  console.log('\n💬 고정 후보 댓글 작성 중...');
  try {
    await youtube.commentThreads.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          videoId,
          topLevelComment: { snippet: { textOriginal: META.comment_pinned } },
        },
      },
    });
    console.log('✓ 댓글 작성됨 (Studio 에서 ⋮ → "고정" 누르면 핀 됨)');
  } catch (e) {
    console.warn('⚠ 댓글 작성 실패:', e.errors?.[0]?.message || e.message);
  }
}

async function main() {
  console.log('=== YouTube 업로드 ===');
  console.log(`📁 ${VIDEO}`);
  console.log(`📌 제목: ${META.title}`);
  console.log(`👁  공개: ${META.privacy}`);
  console.log();

  const auth = await getAuth();
  const youtube = google.youtube({ version: 'v3', auth });
  const videoId = await uploadVideo(youtube);
  await addCaption(youtube, videoId);
  await postPinnedComment(youtube, videoId);

  console.log('\n=== 완료 ===');
  console.log(`📺 영상:  https://youtu.be/${videoId}`);
  console.log(`🛠 Studio: https://studio.youtube.com/video/${videoId}/edit`);
  console.log(`\n공개 범위가 "${META.privacy}" 입니다. Studio 에서 검토 후 "공개"로 전환하세요.`);
}

main().catch(e => {
  console.error('\n❌ 업로드 실패');
  console.error(e?.errors || e?.response?.data || e?.message || e);
  process.exit(1);
});
