import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { REPO_ROOT, PROJECTS_DIR } from "@/lib/paths";
import { generateImage, hasGeminiKey, base64ToBuffer } from "@/lib/geminiImage";
import { CATEGORY_LIST, getCategory, type CategoryId } from "@/lib/instagram/categories";
import { renderCardPng } from "@/lib/instagram/overlay";
import { buildPrompt, type GenerateBody } from "@/lib/instagram/prompt";
import type { CardSpec } from "@/lib/instagram/card-layouts";

export const dynamic = "force-dynamic";
// 뉴스 원문 링크를 WebSearch 로 교차검증하는 it_news 는 실측 285초까지 걸린다 → 여유 확보
export const maxDuration = 600;

interface ClaudeResult {
  category: CategoryId;
  region?: string;
  topic?: string;
  cards: CardSpec[];
  caption: string;
  hashtags: string[];
  verify_summary: string;
  verify_items?: Array<{
    claim: string;
    status: "ok" | "warn" | "unknown" | "bad";
    note?: string;
    sources?: string[];
  }>;
}

function extractJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("응답에서 JSON 블록을 찾지 못했습니다.\n원본:\n" + stdout.slice(0, 2000));
  }
  const candidate = trimmed.slice(first, last + 1);
  try {
    return JSON.parse(candidate);
  } catch (e) {
    throw new Error("JSON 파싱 실패: " + (e as Error).message + "\n후보:\n" + candidate.slice(0, 2000));
  }
}

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function makeSlug(category: CategoryId): string {
  const rand = crypto.randomBytes(3).toString("hex");
  return `insta-${todayStamp()}-${getCategory(category).short}-${rand}`;
}

function runClaude(prompt: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const args = [
      "-p",
      prompt,
      "--model",
      "claude-sonnet-4-6",
      "--allowed-tools",
      "WebSearch",
      "--max-turns",
      "30",
    ];
    const child = spawn("claude", args, {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (c) => out.push(c));
    child.stderr.on("data", (c) => err.push(c));
    child.on("error", (e) => {
      resolve({ stdout: "", stderr: e.message, code: -1 });
    });
    child.on("close", (code) => {
      resolve({
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
        code,
      });
    });
  });
}

async function generateBackground(prompt: string): Promise<Buffer | null> {
  try {
    const result = await generateImage({ prompt });
    return base64ToBuffer(result.data);
  } catch (e) {
    console.warn("[instagram/generate] background image failed:", (e as Error).message);
    return null;
  }
}

export async function POST(req: Request) {
  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json_body" }, { status: 400 });
  }

  const validCats = CATEGORY_LIST.map((c) => c.id) as string[];
  if (!body || !body.category || !validCats.includes(body.category)) {
    return NextResponse.json({ ok: false, error: "invalid_category" }, { status: 400 });
  }
  if (!body.content || body.content.trim().length < 10) {
    return NextResponse.json(
      { ok: false, error: "content_too_short", message: "내용을 10자 이상 입력해주세요." },
      { status: 400 }
    );
  }
  if (!body.cardCount || body.cardCount < 3 || body.cardCount > 12) {
    return NextResponse.json(
      { ok: false, error: "invalid_card_count", message: "카드 수는 3~12장 사이여야 합니다." },
      { status: 400 }
    );
  }
  if (!hasGeminiKey()) {
    return NextResponse.json(
      {
        ok: false,
        error: "no_gemini_key",
        message:
          "GEMINI_API_KEY 가 설정되어 있지 않습니다. admin/.env.local 에 GEMINI_API_KEY=... 추가하세요. (https://aistudio.google.com/apikey)",
      },
      { status: 400 }
    );
  }

  const cat = getCategory(body.category);
  const prompt = buildPrompt(body, cat);

  // 1) Claude 로 카드 메타 + 출처 생성
  const claude = await runClaude(prompt);
  if (claude.code !== 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "claude_exit_nonzero",
        code: claude.code,
        stderr: claude.stderr.slice(0, 4000),
      },
      { status: 500 }
    );
  }
  let parsed: ClaudeResult;
  try {
    parsed = extractJson(claude.stdout) as ClaudeResult;
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "parse_failed",
        message: (e as Error).message,
        raw_stdout: claude.stdout.slice(0, 8000),
      },
      { status: 500 }
    );
  }
  if (!parsed?.cards || !Array.isArray(parsed.cards) || parsed.cards.length === 0) {
    return NextResponse.json(
      { ok: false, error: "no_cards", message: "Claude 가 카드를 생성하지 못했습니다." },
      { status: 500 }
    );
  }

  // 2) Gemini 로 배경 이미지 병렬 생성
  const backgroundPngs = await Promise.all(
    parsed.cards.map((c) =>
      c.layout === "cover" || c.layout === "cta" || (c as any).background_prompt
        ? generateBackground((c as any).background_prompt || cat.backgroundStyle)
        : Promise.resolve<Buffer | null>(null)
    )
  );

  // 3) 카드 1장씩 렌더 + 디스크 저장
  const slug = makeSlug(body.category);
  const outDir = path.join(PROJECTS_DIR, slug, "instagram-cards");
  const cardsDir = path.join(outDir, "cards");
  fs.mkdirSync(cardsDir, { recursive: true });

  const rendered: Array<{
    index: number;
    layout: CardSpec["layout"];
    file: string;
    dataUrl: string;
    sources: string[];
  }> = [];
  for (let i = 0; i < parsed.cards.length; i++) {
    const card = parsed.cards[i];
    let png: Buffer;
    try {
      png = await renderCardPng({
        spec: card,
        category: cat,
        backgroundPng: backgroundPngs[i],
      });
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          error: "render_failed",
          message: `카드 ${i + 1} 렌더 실패: ${(e as Error).message}`,
          slug,
        },
        { status: 500 }
      );
    }
    const filename = `card-${String(i + 1).padStart(2, "0")}.png`;
    const filePath = path.join(cardsDir, filename);
    fs.writeFileSync(filePath, png);
    rendered.push({
      index: i + 1,
      layout: card.layout,
      file: path.relative(REPO_ROOT, filePath),
      dataUrl: `data:image/png;base64,${png.toString("base64")}`,
      sources: card.sources ?? [],
    });
  }

  // 4) output.json + caption.txt 저장
  const outputJson = {
    slug,
    category: body.category,
    region: body.region ?? null,
    topic: parsed.topic ?? null,
    cards: parsed.cards.map((c, i) => ({
      index: i + 1,
      layout: c.layout,
      fields: c.fields,
      sources: c.sources ?? [],
      footer_source_label: c.footer_source_label ?? "",
      file: `cards/card-${String(i + 1).padStart(2, "0")}.png`,
    })),
    caption: parsed.caption,
    hashtags: parsed.hashtags,
    verify_summary: parsed.verify_summary,
    verify_items: parsed.verify_items ?? [],
    generated_at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, "output.json"), JSON.stringify(outputJson, null, 2));
  fs.writeFileSync(
    path.join(outDir, "caption.txt"),
    [parsed.caption, "", (parsed.hashtags ?? []).join(" ")].join("\n")
  );

  return NextResponse.json({
    ok: true,
    slug,
    result: {
      category: body.category,
      region: body.region ?? null,
      topic: parsed.topic ?? null,
      cards: rendered,
      caption: parsed.caption,
      hashtags: parsed.hashtags,
      verify_summary: parsed.verify_summary,
      verify_items: parsed.verify_items ?? [],
    },
  });
}
