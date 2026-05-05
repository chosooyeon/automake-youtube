import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR, projectDir } from "./paths";

const GLOBAL_PATH = path.join(CONFIG_DIR, "global.json");
const DEFAULT_NICHE = "mom_wallet";

export interface NicheInfo {
  id: string;
  channelName: string;
  niche: string;
}

function readGlobalRaw(): any {
  return JSON.parse(fs.readFileSync(GLOBAL_PATH, "utf8"));
}

function writeGlobalRaw(obj: any): void {
  fs.writeFileSync(GLOBAL_PATH, JSON.stringify(obj, null, 2) + "\n");
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge<T>(base: T, override: Partial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(override)) return (override ?? base) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override)) {
    const baseVal = (base as Record<string, unknown>)[k];
    if (isPlainObject(baseVal) && isPlainObject(v)) {
      out[k] = deepMerge(baseVal, v);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

export function getActiveNiche(): string {
  try {
    const raw = readGlobalRaw();
    return typeof raw.active_niche === "string" && raw.active_niche.trim()
      ? raw.active_niche.trim()
      : DEFAULT_NICHE;
  } catch {
    return DEFAULT_NICHE;
  }
}

export function setActiveNiche(name: string): { ok: boolean; reason?: string } {
  const raw = readGlobalRaw();
  const valid = listNiches(raw).map((n) => n.id);
  if (!valid.includes(name)) {
    return { ok: false, reason: `unknown niche: ${name} (allowed: ${valid.join(", ")})` };
  }
  raw.active_niche = name;
  writeGlobalRaw(raw);
  return { ok: true };
}

export function listNiches(rawIn?: any): NicheInfo[] {
  const raw = rawIn ?? readGlobalRaw();
  const out: NicheInfo[] = [];
  // root = mom_wallet (implicit)
  out.push({
    id: DEFAULT_NICHE,
    channelName: raw?.channel?.name ?? "엄마지갑",
    niche: raw?.channel?.niche ?? "",
  });
  const niches = raw?.niches ?? {};
  for (const [id, val] of Object.entries(niches)) {
    if (id.startsWith("_")) continue;
    if (!isPlainObject(val)) continue;
    const ch: any = (val as any).channel ?? {};
    out.push({
      id,
      channelName: ch.name ?? id,
      niche: ch.niche ?? "",
    });
  }
  return out;
}

/**
 * 활성 niche(또는 명시한 niche)의 resolved config 를 반환.
 * mom_wallet 은 root 그대로. 그 외는 niches[name] 을 root 위에 deep-merge.
 * 결과에서 niches/active_niche 같은 메타 필드는 제거.
 */
export function loadResolvedConfig(nicheOverride?: string): any {
  const raw = readGlobalRaw();
  const niche = (nicheOverride ?? raw.active_niche ?? DEFAULT_NICHE) as string;

  // root 에서 메타 필드 제거한 base
  const { active_niche, niches, _comment_active_niche, ...base } = raw;

  if (niche === DEFAULT_NICHE) {
    return { ...base, _resolved_niche: niche };
  }
  const override = (niches && niches[niche]) || {};
  const merged = deepMerge(base, override);
  return { ...merged, _resolved_niche: niche };
}

/**
 * projects/<slug>/00-input/channel_config.json 에 resolved config 스냅샷 저장.
 * 모든 봇은 이 파일을 'config/global.json' 대신 우선 읽도록 runBot.ts 가 지시.
 */
export function writeChannelConfigSnapshot(slug: string, niche?: string): {
  path: string;
  niche: string;
} {
  const resolved = loadResolvedConfig(niche);
  const targetDir = path.join(projectDir(slug), "00-input");
  fs.mkdirSync(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, "channel_config.json");
  fs.writeFileSync(targetPath, JSON.stringify(resolved, null, 2) + "\n");
  return { path: targetPath, niche: resolved._resolved_niche };
}

/**
 * 프로젝트의 niche 식별. channel_config.json._resolved_niche 우선, 없으면 mom_wallet.
 */
export function getProjectNiche(slug: string): string {
  try {
    const p = path.join(projectDir(slug), "00-input", "channel_config.json");
    if (!fs.existsSync(p)) return DEFAULT_NICHE;
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return typeof j._resolved_niche === "string" ? j._resolved_niche : DEFAULT_NICHE;
  } catch {
    return DEFAULT_NICHE;
  }
}
