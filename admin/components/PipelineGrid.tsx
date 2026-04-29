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

type Status = "done" | "in_progress" | "failed" | "pending" | "missing_inputs";

const STATUS_COLOR: Record<Status, string> = {
  done: "bg-good/20 border-good/40 text-good",
  in_progress: "bg-warn/20 border-warn/40 text-warn",
  failed: "bg-bad/20 border-bad/40 text-bad",
  pending: "bg-line/40 border-line text-subtext",
  missing_inputs: "bg-bad/20 border-bad/40 text-bad",
};

const STATUS_LABEL: Record<Status, string> = {
  done: "✅ 완료",
  in_progress: "⏳ 실행중",
  failed: "❌ 실패",
  pending: "⏸ 대기",
  missing_inputs: "⚠ 입력 부족",
};

interface Props {
  slug: string;
  stages: Record<string, Status>;
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
            이전 단계가 완료되면 다음 단계 버튼이 활성화됩니다. 실행 중에는 버튼이 잠깁니다.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {STAGES.map((s) => {
          const status: Status = (stages?.[s.id] as Status) ?? "pending";
          const dep = DEPS[s.id];
          const depStatus = dep ? stages?.[dep] : "done";
          const depReady = !dep || depStatus === "done";
          const isRunning = status === "in_progress";
          const isFailed = status === "failed";
          const isUpload = s.id === "06-edit-upload";
          const canRun = depReady && !isRunning;

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
                {depReady && (s as any).gated && !isRunning && (
                  <div className="text-[11px] text-warn mt-2">🔒 사람 검수 후 활성</div>
                )}
                {isRunning && (
                  <div className="text-[11px] text-warn mt-2 flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-warn animate-pulse" />
                    Claude 실행 중… (로그 확인)
                  </div>
                )}
                {isFailed && (
                  <div className="text-[11px] text-bad mt-2">
                    ❌ 오류 또는 권한 거부. 로그 확인 후 재실행하세요.
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                {!isUpload ? (
                  <button
                    onClick={() => {
                      onRunSingle(s.id);
                      push({ kind: "info", title: `${s.label} 실행`, message: "Claude Code 백그라운드 실행 중" });
                    }}
                    disabled={!canRun}
                    className={
                      "text-xs rounded-md px-2.5 py-1.5 border transition disabled:opacity-40 disabled:cursor-not-allowed " +
                      (isRunning
                        ? "bg-warn/10 border-warn/40 text-warn cursor-not-allowed"
                        : isFailed
                        ? "bg-bad/10 border-bad/40 text-bad hover:bg-bad/20"
                        : "bg-panel2 border-line hover:border-accent")
                    }
                  >
                    {isRunning ? "⏳ 실행중…" : status === "done" ? "↺ 재실행" : isFailed ? "↺ 재시도" : "▶ 실행"}
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
                    output.json ↗
                  </a>
                )}
                {isFailed && (
                  <a
                    className="text-[11px] text-bad/70 hover:text-bad self-center"
                    href={`/api/projects/${encodeURIComponent(slug)}/file?p=${encodeURIComponent(`${s.id}/run.log.md`)}`}
                    target="_blank"
                  >
                    로그 ↗
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
