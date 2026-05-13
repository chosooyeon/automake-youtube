import { hasGeminiKey } from "@/lib/geminiImage";
import { loadProject } from "@/lib/emoticonStore";
import { backoffDelayMs, generateOneExpression } from "@/lib/emoticonGenerate";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * SSE 스트림으로 일괄 생성 진행률을 흘려보낸다.
 *
 * Query:
 *   - mode=missing (기본): 아직 generated 에 없는 표현만 생성
 *   - mode=all:            전부 (재생성 포함)
 *   - gapMs=3000 (기본):   요청 사이 sleep
 *
 * Event types (data: 뒤 JSON):
 *   { type: "start", total, planned }
 *   { type: "item",  index, label, status: "ok"|"failed"|"skipped", file?, message? }
 *   { type: "wait",  ms, reason }
 *   { type: "end",   ok: N, failed: N }
 *   { type: "error", message }
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "all" ? "all" : "missing";
  const gapMs = Math.max(0, Math.min(60_000, Number(url.searchParams.get("gapMs") ?? 3000) || 3000));

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, ev: object) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
  };
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (!hasGeminiKey()) {
          send(controller, { type: "error", message: "GEMINI_API_KEY 가 없습니다." });
          controller.close();
          return;
        }
        let meta = loadProject(params.id);
        if (!meta) {
          send(controller, { type: "error", message: "프로젝트를 찾을 수 없음" });
          controller.close();
          return;
        }
        if (meta.references.length === 0) {
          send(controller, {
            type: "error",
            message: "참조 이미지가 없음. 시안 채택 또는 업로드 후 다시 시도.",
          });
          controller.close();
          return;
        }
        const todo =
          mode === "all"
            ? meta.expressions
            : meta.expressions.filter((e) => !meta!.generated.some((g) => g.index === e.index));

        send(controller, {
          type: "start",
          total: meta.expressions.length,
          planned: todo.length,
          mode,
        });

        let ok = 0;
        let failed = 0;
        let rateLimitAttempt = 0;

        for (let i = 0; i < todo.length; i++) {
          const expr = todo[i];
          // 매번 최신 meta 로드 (다른 요청이 동시에 reference 추가했을 수도)
          meta = loadProject(params.id);
          if (!meta) break;

          const res = await generateOneExpression(meta, expr);
          if (res.ok) {
            ok++;
            rateLimitAttempt = 0;
            send(controller, {
              type: "item",
              index: expr.index,
              label: expr.label,
              status: "ok",
              file: res.filename,
            });
          } else if (res.rateLimited) {
            const wait = backoffDelayMs(rateLimitAttempt);
            rateLimitAttempt++;
            send(controller, {
              type: "wait",
              ms: wait,
              reason: `429 rate limit, ${wait / 1000}s 대기 후 같은 항목 재시도 (시도 ${rateLimitAttempt})`,
            });
            if (rateLimitAttempt > 4) {
              // 5회 연속 429 면 실패 처리하고 다음으로
              failed++;
              rateLimitAttempt = 0;
              send(controller, {
                type: "item",
                index: expr.index,
                label: expr.label,
                status: "failed",
                message: "429 rate limit 5회 초과. 잠시 후 다시 시도하세요.",
              });
              continue;
            }
            await sleep(wait);
            i--; // 같은 항목 재시도
            continue;
          } else {
            failed++;
            send(controller, {
              type: "item",
              index: expr.index,
              label: expr.label,
              status: "failed",
              message: res.message,
            });
          }

          if (i < todo.length - 1 && gapMs > 0) {
            await sleep(gapMs);
          }
        }

        send(controller, { type: "end", ok, failed });
        controller.close();
      } catch (e: any) {
        send(controller, { type: "error", message: e?.message || String(e) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
