"use client";

import { useEffect, useState } from "react";
import { useToast } from "./Toast";

interface Props {
  open: boolean;
  onClose: () => void;
  slug: string;
}

interface UploadInfo {
  metaExists: boolean;
  meta: any | null;
  videoExists: boolean;
  videoSizeMB: number | null;
}

export default function UploadModal({ open, onClose, slug }: Props) {
  const [info, setInfo] = useState<UploadInfo | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    if (!open) return;
    setConfirmText("");
    fetch(`/api/projects/${encodeURIComponent(slug)}/upload`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setInfo);
  }, [open, slug]);

  if (!open) return null;

  const ready = info?.metaExists && info?.videoExists;
  const wantedConfirm = "업로드";

  async function start(dryRun: boolean) {
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(slug)}/upload`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true, dryRun }),
      });
      const j = await r.json();
      if (!j.ok) {
        push({ kind: "error", title: "업로드 실패", message: j.error });
      } else {
        push({
          kind: "success",
          title: dryRun ? "DRY-RUN 완료" : "업로드 시작됨",
          message: "로그 카드에서 진행상황 확인하세요.",
        });
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-panel border border-line rounded-2xl w-full max-w-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">📤 YouTube 업로드</h2>
          <button onClick={onClose} className="text-subtext hover:text-text">✕</button>
        </div>

        {info == null ? (
          <div className="text-sm text-subtext">정보 확인중…</div>
        ) : (
          <>
            <ul className="text-sm space-y-1 mb-3">
              <Row ok={info.videoExists} label={`final.mp4 ${info.videoSizeMB ? `(${info.videoSizeMB} MB)` : ""}`} />
              <Row ok={info.metaExists} label="upload_metadata.json" />
            </ul>
            {info.meta && (
              <div className="bg-bg border border-line rounded-md p-3 mb-3 text-xs">
                <div><span className="text-subtext">제목:</span> {info.meta.title}</div>
                <div><span className="text-subtext">공개:</span> {info.meta.privacy}</div>
                <div><span className="text-subtext">카테고리:</span> {info.meta.category_id}</div>
                <div><span className="text-subtext">태그:</span> {(info.meta.tags || []).slice(0,4).join(", ")} …</div>
              </div>
            )}

            {!ready && (
              <div className="text-xs text-warn bg-warn/10 border border-warn/40 rounded-md px-3 py-2 mb-3">
                {!info.videoExists && "❗ final.mp4 가 없습니다. CapCut에서 익스포트 후 06-edit-upload/final.mp4 로 복사하세요. "}
                {!info.metaExists && "❗ upload_metadata.json 이 없습니다. 06번 봇을 먼저 돌리세요."}
              </div>
            )}

            <div className="text-xs text-subtext mb-2">
              실수 방지를 위해 <span className="text-text font-semibold">&quot;{wantedConfirm}&quot;</span> 라고 입력하세요.
            </div>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={wantedConfirm}
              className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm mb-3"
              disabled={busy || !ready}
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => start(true)}
                disabled={busy || !ready}
                className="text-sm rounded-md border border-line bg-panel2 px-3 py-2 disabled:opacity-50"
              >
                DRY-RUN (호출 안 함)
              </button>
              <button
                onClick={() => start(false)}
                disabled={busy || !ready || confirmText !== wantedConfirm}
                className="text-sm rounded-md border border-bad/60 bg-bad/20 text-bad font-semibold px-3 py-2 disabled:opacity-40"
              >
                {busy ? "업로드중…" : "📤 업로드 실행"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={ok ? "text-good" : "text-bad"}>{ok ? "✅" : "❌"}</span>
      <span>{label}</span>
    </li>
  );
}
