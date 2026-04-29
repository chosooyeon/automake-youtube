import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { getEnv } from "./env";
import { expandHome } from "./paths";

export type ApiHealth =
  | { id: string; label: string; status: "ok"; detail?: string }
  | { id: string; label: string; status: "warn"; detail: string }
  | { id: string; label: string; status: "bad"; detail: string }
  | { id: string; label: string; status: "unknown"; detail: string };

export async function checkYouTubeOAuth(): Promise<ApiHealth> {
  const id = "youtube";
  const label = "YouTube Data API";
  const csPath = expandHome(getEnv("YOUTUBE_CLIENT_SECRET_PATH") || "");
  const tkPath = expandHome(getEnv("YOUTUBE_OAUTH_TOKEN_PATH") || "");
  if (!csPath) return { id, label, status: "bad", detail: ".env 의 YOUTUBE_CLIENT_SECRET_PATH 가 비어 있음" };
  if (!fs.existsSync(csPath)) return { id, label, status: "bad", detail: `client_secret.json 없음: ${csPath}` };
  if (!tkPath || !fs.existsSync(tkPath)) {
    return { id, label, status: "warn", detail: "토큰 파일 없음. 첫 업로드 시 OAuth 진행됨" };
  }
  try {
    const cs = JSON.parse(fs.readFileSync(csPath, "utf8"));
    const c = cs.installed || cs.web;
    const oauth2 = new google.auth.OAuth2(c.client_id, c.client_secret, "http://localhost:43210");
    const tokens = JSON.parse(fs.readFileSync(tkPath, "utf8"));
    oauth2.setCredentials(tokens);
    const yt = google.youtube({ version: "v3", auth: oauth2 });
    const r = await yt.channels.list({ part: ["snippet"], mine: true });
    const ch = r.data.items?.[0]?.snippet?.title;
    let detail = `채널: ${ch ?? "unknown"}`;
    if (tokens.expiry_date) {
      const left = Math.round((tokens.expiry_date - Date.now()) / (1000 * 60));
      if (left > 0 && left < 10) {
        return { id, label, status: "warn", detail: `${detail} · 토큰 만료 ${left}분 남음` };
      }
    }
    return { id, label, status: "ok", detail };
  } catch (e: any) {
    const msg = e?.errors?.[0]?.message || e?.message || String(e);
    if (/invalid_grant|expired|Unauthorized/i.test(msg)) {
      return { id, label, status: "bad", detail: `토큰 만료/취소됨. 재인증 필요: ${msg}` };
    }
    return { id, label, status: "bad", detail: msg };
  }
}

export async function checkGemini(): Promise<ApiHealth> {
  const id = "gemini";
  const label = "Gemini API";
  const key = getEnv("GEMINI_API_KEY");
  if (!key) return { id, label, status: "bad", detail: ".env 의 GEMINI_API_KEY 가 비어 있음" };
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(7000) },
    );
    if (r.status === 200) return { id, label, status: "ok", detail: "키 유효" };
    if (r.status === 429) return { id, label, status: "warn", detail: "429 quota 초과 / 토큰 부족 ⚠️" };
    if (r.status === 401 || r.status === 403) return { id, label, status: "bad", detail: `${r.status} 인증 실패 — 키 무효/만료` };
    return { id, label, status: "warn", detail: `HTTP ${r.status}` };
  } catch (e: any) {
    return { id, label, status: "warn", detail: e?.message || "네트워크 오류" };
  }
}

export async function checkClaudeCli(): Promise<ApiHealth> {
  const id = "claude";
  const label = "Claude Code (CLI)";
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("claude", ["--version"], { encoding: "utf8" });
  if (r.error) return { id, label, status: "bad", detail: "claude CLI 미설치. 설치: curl -fsSL https://claude.ai/install.sh | bash" };
  if (r.status !== 0) return { id, label, status: "warn", detail: r.stderr || "claude --version 실패" };
  return { id, label, status: "ok", detail: (r.stdout || "").trim() };
}

export async function checkAll(): Promise<ApiHealth[]> {
  const [yt, gm, cc] = await Promise.all([checkYouTubeOAuth(), checkGemini(), checkClaudeCli()]);
  return [yt, gm, cc];
}
