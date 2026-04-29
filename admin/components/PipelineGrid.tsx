"use client";

import { useToast } from "./Toast";

const STAGES = [
  { id: "01-benchmark", label: "01 벤치마크", desc: "레퍼런스 + 분석" },
  { id: "02-strategy", label: "02 전략", desc: "컨셉·제목·훅·인트로" },
  { id: "03-script", label: "03 대본", desc: "기획·집필·검수" },
  { id: "04-audio", label: "04 음성", desc: "TTS·자막·무음" },
  { id: "05-visual", label: "05 비주얼", desc: "씬·이미지" },
  { id: "06-edit-upload", label: "06 편집/업로드", desc: "CapCut·썸네일·YT", gated: true },
] as const;

const DEPS: Record<string, string | null> = {
  "01-benchmark": null,
  "02-strategy": "01-benchmark",
  "03-script": "02-strategy",
  "04-audio": "03-script",
  "05-visual": "04-audio",
  "06-edit-upload": "05-visual",
};

const STATUS_COLOR = {
  done: "bg-good/20 border-good/40 text-good",
  in_progress: "bg-warn/20 border-warn/40 text-warn",
  pending: "bg-line/40 border-line text-subtext",
  missing_inputs: "bg-bad/20 border-bad/40 text-bad",
} as const;

const STATUS_LABEL = {
  done: "✅ 완료",
  in_progress: "⏳ 진행중",
  pending: "⏸ 대기",
  missing_inputs: "⚠ 입력 부족",
} as const;

interface Props {
  slug: string;
  stages: Record<string, keyof typeof STATUS_LABEL>;
  onRunSingle: (stage: string) => void;
  onUploadClick: () => void;
}

export default function PipelineGrid({ slug, stages, onRunSingle, onUploadClick }: Props) {
  const { push } = useToast();
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold">파이프라인 (한 단계씩 실행)</h2>
          <p className="text-[11px] text-subtext mt-0.5">
            안전을 위해 풀 파이프라인은 비활성. 이전 단계가 완료되면 다음 단계 [실행] 버튼이 활성화됩니다.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {STAGES.map((s) => {
          const status = stages?.[s.id] ?? "pending";
          const dep = DEPS[s.id];
          const depStatus = dep ? stages?.[dep] : "done";
          const depReady = !dep || depStatus === "done";
          const isUpload = s.id === "06-edit-upload";

          return (
            <div
              key={s.id}
              className={
                "border rounded-xl p-4 flex flex-col justify-between min-h-[150px] transition " +
                (depReady ? "bg-panel border-line" : "bg-panel/40 border-line/60 opacity-70")
              }
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{s.label}</div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${STATUS_COLOR[status]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <div className="text-xs text-subtext mt-1">{s.desc}</div>
                {!depReady && (
                  <div className="text-[11px] text-warn mt-2">
                    🔒 이전 단계 ({dep}) 먼저 완료해주세요
                  </div>
                )}
                {depReady && (s as any).gated && (
                  <div className="text-[11px] text-warn mt-2">🔒 사람 검수 후 활성</div>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                {!isUpload ? (
                  <button
                    onClick={() => {
                      onRunSingle(s.id);
                      push({ kind: "info", title: `${s.label} 실행`, message: "Claude Code 백그라운드 실행 중" });
                    }}
                    disabled={!depReady}
                    className="text-xs bg-panel2 border border-line hover:border-accent disabled:opacity-40 disabled:hover:border-line rounded-md px-2.5 py-1.5"
                  >
                    {status === "done" ? "재실행" : status === "in_progress" ? "재실행" : "▶ 실행"}
                  </button>
                ) : (
                  <button
                    onClick={onUploadClick}
                    disabled={!depReady}
                    className="text-xs bg-bad/20 border border-bad/50 text-bad hover:bg-bad/30 disabled:opacity-40 rounded-md px-2.5 py-1.5"
                  >
                    📤 업로드 모달 열기
                  </button>
                )}
                {status === "done" && (
                  <a
                    className="text-[11px] text-subtext hover:text-accent self-center"
                    href={`/api/projects/${encodeURIComponent(slug)}/file?p=${encodeURIComponent(`${s.id}/output.json`)}`}
                    target="_blank"
                  >
                    output.json
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
