"use client";

import { useState } from "react";
import { useToast } from "./Toast";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (slug: string) => void;
}

export default function ManualTopicModal({ open, onClose, onCreated }: Props) {
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [promise, setPromise] = useState("");
  const [whyNow, setWhyNow] = useState("");
  const [mustCoverRaw, setMustCoverRaw] = useState("");
  const [sourcesRaw, setSourcesRaw] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  if (!open) return null;

  function toSlug(str: string) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[가-힣]/g, "")
      .replace(/-+/g, "-")
      .slice(0, 50) || "my-topic";
  }

  function handleTopicChange(v: string) {
    setTopic(v);
    if (!slug || slug === toSlug(topic)) {
      setSlug(toSlug(v));
    }
  }

  async function submit() {
    if (!topic.trim()) {
      push({ kind: "error", title: "주제를 입력해주세요" });
      return;
    }
    const finalSlug = slug.trim() || toSlug(topic);
    if (!/^[a-z0-9][a-z0-9-_]{1,60}$/i.test(finalSlug)) {
      push({ kind: "error", title: "슬러그 형식 오류", message: "영문/숫자/-/_ 만, 2~61자" });
      return;
    }
    setBusy(true);
    try {
      const mustCover = mustCoverRaw.split("\n").map((s) => s.trim()).filter(Boolean);
      const primarySources = sourcesRaw.split("\n").map((s) => s.trim()).filter(Boolean);

      const r = await fetch("/api/topics/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: finalSlug,
          topic: topic.trim(),
          audience: audience.trim(),
          promise: promise.trim(),
          why_now: whyNow.trim(),
          must_cover: mustCover,
          primary_sources: primarySources,
          deadline_date: deadlineDate.trim(),
        }),
      });
      const j = await r.json();
      if (!j.ok) {
        push({ kind: "error", title: "프로젝트 생성 실패", message: j.error });
      } else {
        push({ kind: "success", title: "프로젝트 생성됨", message: `슬러그: ${j.slug}` });
        onCreated(j.slug);
        onClose();
        resetForm();
      }
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setTopic(""); setAudience(""); setPromise(""); setWhyNow("");
    setMustCoverRaw(""); setSourcesRaw(""); setDeadlineDate(""); setSlug("");
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-panel border border-line rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">✏️ 주제 직접 입력</h2>
          <button onClick={onClose} className="text-subtext hover:text-text">✕</button>
        </div>

        <div className="space-y-3">
          <Field label="주제 *" hint="영상 한 줄 설명">
            <input
              autoFocus
              value={topic}
              onChange={(e) => handleTopicChange(e.target.value)}
              placeholder="예) 2026년 하반기 부모급여 변경 사항"
              className="input-base"
            />
          </Field>

          <Field label="타깃" hint="누가 보는 영상인지">
            <input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="예) 0~12개월 영아를 둔 부모"
              className="input-base"
            />
          </Field>

          <Field label="시청자 약속" hint="끝까지 보면 가져갈 가치">
            <input
              value={promise}
              onChange={(e) => setPromise(e.target.value)}
              placeholder="예) 얼마 오르는지, 언제까지 신청하는지 정확히 알게 됨"
              className="input-base"
            />
          </Field>

          <Field label="왜 지금?" hint="긴급성/시즌성">
            <input
              value={whyNow}
              onChange={(e) => setWhyNow(e.target.value)}
              placeholder="예) 7월부터 적용, 6월 말까지 신청 필요"
              className="input-base"
            />
          </Field>

          <Field label="꼭 다룰 포인트" hint="한 줄씩 입력">
            <textarea
              value={mustCoverRaw}
              onChange={(e) => setMustCoverRaw(e.target.value)}
              placeholder={"신청 자격\n지급 금액\n신청 방법\n주의사항"}
              rows={4}
              className="input-base resize-none"
            />
          </Field>

          <Field label="자료 소스" hint="URL, 한 줄씩">
            <textarea
              value={sourcesRaw}
              onChange={(e) => setSourcesRaw(e.target.value)}
              placeholder={"https://www.bokjiro.go.kr\nhttps://www.mohw.go.kr"}
              rows={3}
              className="input-base resize-none"
            />
          </Field>

          <Field label="데드라인" hint="예) 2026-06-30">
            <input
              type="date"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
              className="input-base"
            />
          </Field>

          <Field label="슬러그" hint="폴더명 (영문/숫자/-/_)">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="my-topic-2026-06"
              className="input-base mono"
            />
            <div className="text-[10px] text-subtext mt-1">→ projects/{slug || "my-topic"}/</div>
          </Field>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="text-sm rounded-md border border-line bg-panel2 px-3 py-2">취소</button>
          <button
            onClick={submit}
            disabled={busy || !topic.trim()}
            className="text-sm rounded-md bg-accent text-bg font-semibold px-4 py-2 disabled:opacity-50"
          >
            {busy ? "만드는중…" : "📁 프로젝트 만들기"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-subtext block mb-0.5">
        {label}{hint && <span className="ml-1 text-[10px] opacity-60">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}
