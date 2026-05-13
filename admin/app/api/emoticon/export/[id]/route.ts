import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import archiver from "archiver";
import { PassThrough } from "node:stream";
import { loadProject, projectDir } from "@/lib/emoticonStore";
import { MARKETS } from "@/lib/emoticonMarkets";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/emoticon/export/[id]?fit=contain|cover
 *
 * - 해당 프로젝트의 generated 이미지를 마켓 규격 PNG (투명 배경) 로 리사이즈
 * - zip 으로 묶어 다운로드
 * - 파일명: 01-안녕.png 같이 meta.generated.file 기반
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const meta = loadProject(params.id);
  if (!meta) {
    return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (meta.generated.length === 0) {
    return new Response(
      JSON.stringify({ ok: false, error: "nothing_generated", message: "생성된 이미지가 없습니다." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const url = new URL(req.url);
  const fit = url.searchParams.get("fit") === "cover" ? "cover" : "contain";
  const spec = MARKETS[meta.market];
  const outDir = path.join(projectDir(meta.id), "output");

  const passthrough = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("warning", () => {});
  archive.on("error", () => {});
  archive.pipe(passthrough);

  // 파일 변환은 동기적으로 끝낸 후 archive 에 append 해도 되지만,
  // 큰 세트(40장) 도 메모리 수십 MB 라 일괄 처리 후 finalize.
  (async () => {
    try {
      // index 오름차순
      const items = [...meta.generated].sort((a, b) => a.index - b.index);
      for (const g of items) {
        const src = path.join(outDir, g.file);
        if (!fs.existsSync(src)) continue;
        const resized = await sharp(src, { failOn: "none" })
          .resize({
            width: spec.outputSize.width,
            height: spec.outputSize.height,
            fit: fit === "cover" ? "cover" : "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
            withoutEnlargement: false,
          })
          .png({ compressionLevel: 9 })
          .toBuffer();
        archive.append(resized, { name: g.file });
      }

      // 작은 README 도 같이
      const readme = [
        `# ${MARKETS[meta.market].label} 이모티콘 세트`,
        ``,
        `- 프로젝트 ID: ${meta.id}`,
        `- 생성일: ${meta.createdAt}`,
        `- 마켓 규격: ${spec.outputSize.width}×${spec.outputSize.height} PNG (투명 배경)`,
        `- 필요 매수: ${spec.staticCount}장 / 현재 생성: ${meta.generated.length}장`,
        ``,
        `## 캐릭터 컨셉`,
        meta.concept,
        ``,
        `## 표현 리스트`,
        ...meta.expressions
          .sort((a, b) => a.index - b.index)
          .map((e) => `${String(e.index).padStart(2, "0")}. ${e.label}`),
      ].join("\n");
      archive.append(readme, { name: "README.md" });

      await archive.finalize();
    } catch (e) {
      // 에러 시 stream 닫음
      passthrough.destroy(e instanceof Error ? e : new Error(String(e)));
    }
  })();

  // PassThrough → Web ReadableStream 변환
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      passthrough.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      passthrough.on("end", () => controller.close());
      passthrough.on("error", (e) => controller.error(e));
    },
    cancel() {
      passthrough.destroy();
    },
  });

  const filename = `${meta.id}-${meta.market}.zip`;
  return new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
