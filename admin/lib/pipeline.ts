import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "./paths";

export interface PipelineStage {
  title: string;
  bot_dir: string;
  inputs: string[];
  outputs: string[];
  depends_on: string[];
  requires_human_approval?: boolean;
}

export interface PipelineConfig {
  version: string;
  description: string;
  default_order: string[];
  human_gate_after: string[];
  stages: Record<string, PipelineStage>;
}

let cached: PipelineConfig | null = null;

export function loadPipeline(): PipelineConfig {
  if (cached) return cached;
  const p = path.join(CONFIG_DIR, "pipeline.json");
  const json = JSON.parse(fs.readFileSync(p, "utf8")) as PipelineConfig;
  cached = json;
  return json;
}

export interface GlobalConfig {
  channel: { name: string; handle: string; language: string; country: string; niche: string };
  brand: { tone: string[]; intro_signature: string; outro_signature: string };
  video_defaults: { duration_sec: number };
  apis: any;
}

export function loadGlobal(): GlobalConfig {
  const p = path.join(CONFIG_DIR, "global.json");
  return JSON.parse(fs.readFileSync(p, "utf8")) as GlobalConfig;
}
