"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Kind = "char" | "prop";

interface ToonAsset {
  id: string;
  file: string;
  kind: Kind;
  expression: string;
  base: boolean;
  note: string;
  createdAt: string;
}

interface DictItem {
  key: string;
  label: string;
  prompt: string;
  fullPrompt: string;
}

const KINDS: { id: Kind; label: string; hint: string }[] = [
  { id: "char", label: "🧍 인물", hint: "같은 캐릭터의 표정·자세" },
  { id: "prop", label: "📦 소품", hint: "같은 그림체의 물건" },
];

export default function ToonBoard() {
  const [kind, setKind] = useState<Kind>("char");
  const [assets, setAssets] = useState<ToonAsset[]>([]);
  const [dict, setDict] = useState<Record<Kind, DictItem[]>>({ char: [], prop: [] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const [a, e, p] = await Promise.all([
      fetch("/api/toon/assets").then((r) => r.json()),
      fetch("/api/toon/expressions").then((r) => r.json()),
      fetch("/api/toon/props").then((r) => r.json()),
    ]);
    if (a.ok) setAssets(a.assets);
    setDict({ char: e.ok ? e.expressions : [], prop: p.ok ? p.props : [] });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      setBusy(true);
      setMsg("");
      try {
        for (const f of Array.from(files)) {
          const dataUrl: string = await new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result));
            fr.onerror = () => rej(new Error("read fail"));
            fr.readAsDataURL(f);
          });
          // 업로드는 지금 보고 있는 탭(kind)으로 들어간다
          const r = await fetch("/api/toon/assets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataUrl, note: f.name, kind }),
          }).then((x) => x.json());
          if (!r.ok) setMsg(r.message ?? "업로드 실패");
        }
        await reload();
      } finally {
        setBusy(false);
      }
    },
    [reload, kind]
  );

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch("/api/toon/assets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    await reload();
  }

  async function remove(id: string) {
    if (!confirm("이 에셋을 지울까요? 되돌릴 수 없어요.")) return;
    await fetch(`/api/toon/assets?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await reload();
  }

  async function copyPrompt(d: DictItem) {
    await navigator.clipboard.writeText(d.fullPrompt);
    setCopied(d.key);
    setTimeout(() => setCopied(""), 1500);
  }

  const shown = assets.filter((a) => a.kind === kind);
  const items = dict[kind];
  const filled = new Set(shown.map((a) => a.expression).filter(Boolean));
  const base = assets.find((a) => a.base);
  const isChar = kind === "char";

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-line bg-panel p-4 text-sm text-subtext leading-relaxed">
        <p className="text-text font-medium mb-1">에셋을 한 번 만들어두고 재사용합니다</p>
        컷마다 이미지를 새로 생성하지 않습니다. Gemini 이미지 API 는 무료 티어 한도가 <span className="text-text">0</span> 이라
        매 컷 생성은 유료인데, 인스타툰은 같은 캐릭터가 표정만 바뀌므로 에셋을 재사용하면{" "}
        <span className="text-text">비용 0원</span>이고 컷 사이 그림체도 안 흔들립니다.
        생성은 Gemini <span className="text-text">앱</span>(무료)에서 하고 여기엔 올리기만 하세요.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            title={k.hint}
            className={
              "rounded-lg border px-4 py-2 text-sm transition " +
              (kind === k.id
                ? "bg-accent border-accent text-bg font-medium"
                : "bg-panel border-line text-subtext hover:text-text hover:bg-panel2")
            }
          >
            {k.label}
            <span className="ml-1.5 opacity-70">{assets.filter((a) => a.kind === k.id).length}</span>
          </button>
        ))}
        <span className="text-xs text-subtext ml-1">{KINDS.find((k) => k.id === kind)!.hint}</span>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-text font-medium">
            {isChar ? "인물 에셋" : "소품 에셋"}{" "}
            <span className="text-subtext text-sm">({shown.length}장)</span>
          </h3>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(ev) => ev.target.files && upload(ev.target.files)}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="rounded-lg border border-accent bg-accent px-3 py-1.5 text-sm text-bg font-medium disabled:opacity-50"
            >
              {busy ? "올리는 중…" : "이미지 추가"}
            </button>
          </div>
        </div>

        <div
          onDragOver={(ev) => {
            ev.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(ev) => {
            ev.preventDefault();
            setDragOver(false);
            if (ev.dataTransfer.files.length) void upload(ev.dataTransfer.files);
          }}
          className={
            "rounded-xl border border-dashed p-4 transition " +
            (dragOver ? "border-accent bg-panel2" : "border-line bg-panel")
          }
        >
          {shown.length === 0 ? (
            <p className="text-sm text-subtext py-6 text-center">
              여기로 끌어다 놓으면 <span className="text-text">{isChar ? "인물" : "소품"}</span> 로 등록됩니다.
              {isChar && (
                <>
                  <br />첫 장이 자동으로 <span className="text-text">기준 캐릭터</span>가 됩니다.
                </>
              )}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {shown.map((a) => (
                <div key={a.id} className="rounded-lg border border-line bg-panel2 p-2 space-y-2">
                  <div className="relative">
                    {/* 에셋은 흰 배경으로 뽑히므로 미리보기 바탕도 흰색으로 고정 */}
                    <img
                      src={`/api/toon/image?f=${encodeURIComponent(a.file)}`}
                      alt={a.note || a.id}
                      className="w-full aspect-square object-contain rounded bg-white"
                    />
                    {a.base && (
                      <span className="absolute top-1 left-1 rounded bg-accent px-1.5 py-0.5 text-[10px] text-bg font-medium">
                        기준
                      </span>
                    )}
                  </div>
                  <select
                    value={a.expression}
                    onChange={(ev) => patch(a.id, { expression: ev.target.value })}
                    className="w-full rounded border border-line bg-panel px-2 py-1 text-xs text-text"
                  >
                    <option value="">{isChar ? "표정 미지정" : "소품 미지정"}</option>
                    {items.map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center justify-between text-[11px]">
                    {isChar ? (
                      <button
                        onClick={() => patch(a.id, { base: true })}
                        disabled={a.base}
                        className="text-subtext hover:text-text disabled:opacity-40"
                      >
                        기준으로
                      </button>
                    ) : (
                      <button
                        onClick={() => patch(a.id, { kind: "char" })}
                        className="text-subtext hover:text-text"
                        title="인물로 옮기기"
                      >
                        인물로
                      </button>
                    )}
                    <button onClick={() => remove(a.id)} className="text-subtext hover:text-text">
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {msg && <p className="text-sm text-subtext">{msg}</p>}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-text font-medium">
            {isChar ? "표현 사전" : "소품 사전"}{" "}
            <span className="text-subtext text-sm">
              ({filled.size}/{items.length} 확보)
            </span>
          </h3>
          <span className="text-xs text-subtext">
            {base
              ? "프롬프트 복사 → Gemini 앱에 기준 캐릭터와 함께 붙여넣기"
              : "먼저 인물 탭에서 기준 캐릭터를 올려주세요"}
          </span>
        </div>
        <div className="rounded-xl border border-line bg-panel divide-y divide-line">
          {items.map((d) => (
            <div key={d.key} className="flex items-center gap-3 px-4 py-2.5">
              <span
                className={"w-2 h-2 rounded-full shrink-0 " + (filled.has(d.key) ? "bg-accent" : "bg-line")}
                title={filled.has(d.key) ? "에셋 있음" : "아직 없음"}
              />
              <span className="text-text text-sm w-20 shrink-0">{d.label}</span>
              <span className="text-subtext text-xs flex-1 truncate">{d.prompt}</span>
              <button
                onClick={() => copyPrompt(d)}
                className="shrink-0 rounded border border-line bg-panel2 px-2.5 py-1 text-xs text-subtext hover:text-text"
              >
                {copied === d.key ? "복사됨" : "프롬프트 복사"}
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-subtext">
          문구를 바꾸려면{" "}
          <code className="text-text">
            config/{isChar ? "toon-expressions.json" : "toon-props.json"}
          </code>{" "}
          을 고치세요. 컷마다 새로 쓰지 않고 고정 문구를 재사용하는 것이 그림체가 안 흔들리는 이유입니다.
        </p>
      </section>
    </div>
  );
}
