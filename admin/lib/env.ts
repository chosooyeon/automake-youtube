import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./paths";

let cached: Record<string, string> | null = null;

export function loadEnv(): Record<string, string> {
  if (cached) return cached;
  const envPath = path.join(REPO_ROOT, ".env");
  const out: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "").trim();
    }
  }
  // 시스템 env가 있으면 우선
  for (const k of Object.keys(out)) {
    if (process.env[k]) out[k] = process.env[k] as string;
  }
  cached = out;
  return out;
}

export function getEnv(key: string): string | undefined {
  return loadEnv()[key] ?? process.env[key];
}
