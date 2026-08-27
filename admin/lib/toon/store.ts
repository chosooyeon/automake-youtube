import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { REPO_ROOT } from "../paths";

/**
 * 인스타툰 캐릭터 에셋 저장소.
 *
 * admin/data/toon/
 *   assets.json          # 에셋 메타 목록
 *   assets/<id>.png      # 캐릭터 이미지 (표정별 1장)
 *
 * admin/data/ 는 .gitignore 됨 → 원본은 별도로 보관할 것.
 *
 * 설계 의도: 컷마다 이미지를 새로 생성하지 않는다. 표정 에셋을 한 번 만들어 두고
 * 재사용하면 (1) 생성 비용이 0원이고 (2) 컷 사이 그림체가 절대 안 흔들린다.
 */

export const TOON_ROOT = path.join(REPO_ROOT, "admin", "data", "toon");
export const ASSET_DIR = path.join(TOON_ROOT, "assets");
export const META_FILE = path.join(TOON_ROOT, "assets.json");

export type ToonKind = "char" | "prop";

export interface ToonAsset {
  id: string;
  file: string;
  /** 인물(표정) 인지 소품인지 */
  kind: ToonKind;
  /** kind 에 따라 toon-expressions.json / toon-props.json 의 key. "" = 미지정 */
  expression: string;
  /** 기준 캐릭터 (그림체 참조용 대표 1장) */
  base: boolean;
  note: string;
  createdAt: string;
}

function ensureDirs() {
  fs.mkdirSync(ASSET_DIR, { recursive: true });
}

/** kind 가 없던 초기 에셋은 인물로 간주한다 */
export function listAssets(): ToonAsset[] {
  if (!fs.existsSync(META_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(META_FILE, "utf8"));
    if (!Array.isArray(raw?.assets)) return [];
    return (raw.assets as ToonAsset[]).map((a) => ({ ...a, kind: a.kind ?? "char" }));
  } catch {
    return [];
  }
}

function writeAssets(assets: ToonAsset[]) {
  ensureDirs();
  fs.writeFileSync(META_FILE, JSON.stringify({ assets }, null, 2), "utf8");
}

export function addAsset(buf: Buffer, opts: { expression?: string; note?: string; kind?: ToonKind }): ToonAsset {
  ensureDirs();
  const id = "toon_" + crypto.randomBytes(4).toString("hex");
  const file = `${id}.png`;
  fs.writeFileSync(path.join(ASSET_DIR, file), buf);
  const assets = listAssets();
  const kind: ToonKind = opts.kind ?? "char";
  const asset: ToonAsset = {
    id,
    file,
    kind,
    expression: opts.expression ?? "",
    // 첫 인물 에셋은 자동으로 기준 캐릭터가 된다 (기준이 없으면 프롬프트를 못 만든다). 소품은 기준이 될 수 없다
    base: kind === "char" && assets.every((a) => !a.base),
    note: opts.note ?? "",
    createdAt: new Date().toISOString(),
  };
  writeAssets([...assets, asset]);
  return asset;
}

export function updateAsset(id: string, patch: Partial<Pick<ToonAsset, "expression" | "note" | "base" | "kind">>): ToonAsset | null {
  const assets = listAssets();
  const idx = assets.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  // 기준 캐릭터는 항상 1장뿐
  if (patch.base === true) assets.forEach((a) => (a.base = false));
  assets[idx] = { ...assets[idx], ...patch };
  writeAssets(assets);
  return assets[idx];
}

export function deleteAsset(id: string): boolean {
  const assets = listAssets();
  const target = assets.find((a) => a.id === id);
  if (!target) return false;
  try {
    fs.unlinkSync(path.join(ASSET_DIR, target.file));
  } catch {
    /* 파일이 이미 없어도 메타는 지운다 */
  }
  const rest = assets.filter((a) => a.id !== id);
  // 기준 캐릭터를 지웠으면 남은 첫 인물 에셋이 승계한다
  if (target.base) {
    const heir = rest.find((a) => a.kind !== "prop");
    if (heir) heir.base = true;
  }
  writeAssets(rest);
  return true;
}

export function assetFilePath(file: string): string | null {
  // 경로 조작 차단: 파일명만 허용
  if (!/^toon_[0-9a-f]{8}\.png$/.test(file)) return null;
  const p = path.join(ASSET_DIR, file);
  return fs.existsSync(p) ? p : null;
}
