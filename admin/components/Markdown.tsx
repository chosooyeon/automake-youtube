"use client";

import { Fragment, type ReactNode } from "react";

/**
 * 의존성 없는 경량 마크다운 렌더러.
 * 지원: ```코드블록```, #~### 제목, - / 1. 리스트, > 인용, --- 구분선,
 *       **굵게**, *기울임*, `인라인코드`, [텍스트](url)
 * (표는 코드블록처럼 mono 로만 표시)
 */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  // 인라인 코드 → 링크 → 굵게 → 기울임 순으로 토큰화
  const re = /(`[^`\n]+`)|(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-i${i++}`;
    if (tok.startsWith("`")) {
      out.push(
        <code key={key} className="mono text-[0.85em] bg-bg border border-line rounded px-1 py-0.5">
          {tok.slice(1, -1)}
        </code>
      );
    } else if (tok.startsWith("[")) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      out.push(
        mm ? (
          <a
            key={key}
            href={mm[2]}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline underline-offset-2 hover:text-accent2"
          >
            {mm[1]}
          </a>
        ) : (
          tok
        )
      );
    } else if (tok.startsWith("**")) {
      out.push(
        <strong key={key} className="font-semibold text-text">
          {tok.slice(2, -2)}
        </strong>
      );
    } else {
      out.push(
        <em key={key} className="italic">
          {tok.slice(1, -1)}
        </em>
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

interface Block {
  type: "code" | "text";
  lang?: string;
  lines: string[];
}

function splitBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  let cur: Block = { type: "text", lines: [] };
  for (const line of src.split("\n")) {
    const fence = /^\s*```(.*)$/.exec(line);
    if (fence) {
      if (cur.type === "code") {
        blocks.push(cur);
        cur = { type: "text", lines: [] };
      } else {
        if (cur.lines.length) blocks.push(cur);
        cur = { type: "code", lang: fence[1].trim() || undefined, lines: [] };
      }
      continue;
    }
    cur.lines.push(line);
  }
  if (cur.lines.length || cur.type === "code") blocks.push(cur);
  return blocks;
}

function TextBlock({ lines, keyPrefix }: { lines: string[]; keyPrefix: string }) {
  const nodes: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = (k: string) => {
    if (!list) return;
    const L = list;
    nodes.push(
      L.ordered ? (
        <ol key={k} className="list-decimal pl-5 space-y-1 my-2">
          {L.items.map((it, i) => (
            <li key={i}>{renderInline(it, `${k}-${i}`)}</li>
          ))}
        </ol>
      ) : (
        <ul key={k} className="list-disc pl-5 space-y-1 my-2">
          {L.items.map((it, i) => (
            <li key={i}>{renderInline(it, `${k}-${i}`)}</li>
          ))}
        </ul>
      )
    );
    list = null;
  };

  lines.forEach((raw, idx) => {
    const key = `${keyPrefix}-l${idx}`;
    const line = raw.replace(/\s+$/, "");

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet) {
      if (list && list.ordered) flushList(key + "-fl");
      list = list ?? { ordered: false, items: [] };
      list.items.push(bullet[1]);
      return;
    }
    if (ordered) {
      if (list && !list.ordered) flushList(key + "-fl");
      list = list ?? { ordered: true, items: [] };
      list.items.push(ordered[1]);
      return;
    }
    flushList(key + "-fl");

    if (!line.trim()) return;

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const cls =
        level === 1
          ? "text-lg font-semibold mt-4 mb-1.5"
          : level === 2
          ? "text-base font-semibold mt-4 mb-1.5"
          : "text-sm font-semibold mt-3 mb-1 text-accent2";
      nodes.push(
        <p key={key} className={cls}>
          {renderInline(heading[2], key)}
        </p>
      );
      return;
    }
    if (/^\s*(---+|===+|\*\*\*+)\s*$/.test(line)) {
      nodes.push(<hr key={key} className="my-3 border-line" />);
      return;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      nodes.push(
        <blockquote
          key={key}
          className="border-l-2 border-line pl-3 my-2 text-subtext"
        >
          {renderInline(quote[1], key)}
        </blockquote>
      );
      return;
    }
    if (line.trim().startsWith("|")) {
      nodes.push(
        <div key={key} className="mono text-xs whitespace-pre overflow-x-auto">
          {line}
        </div>
      );
      return;
    }
    nodes.push(
      <p key={key} className="my-1.5 leading-relaxed">
        {renderInline(line, key)}
      </p>
    );
  });

  flushList(`${keyPrefix}-end`);
  return <Fragment>{nodes}</Fragment>;
}

export default function Markdown({ text }: { text: string }) {
  const blocks = splitBlocks(text);
  return (
    <div className="text-sm text-text">
      {blocks.map((b, i) =>
        b.type === "code" ? (
          <pre
            key={i}
            className="mono text-xs bg-bg border border-line rounded-md p-3 my-2 overflow-x-auto"
          >
            {b.lang && <div className="text-[10px] uppercase text-subtext mb-1">{b.lang}</div>}
            <code>{b.lines.join("\n")}</code>
          </pre>
        ) : (
          <TextBlock key={i} lines={b.lines} keyPrefix={`b${i}`} />
        )
      )}
    </div>
  );
}
