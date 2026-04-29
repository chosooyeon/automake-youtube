"use client";

interface Req {
  name: string;
  status: "ok" | "todo" | "blocked";
  note?: string;
}

interface Props {
  line: "shorts" | "instacard" | "blog";
  title: string;
  basedOn: string;
  autoSteps: string[];
  required: Req[];
  difficulty: string;
  difficultyNote: string;
}

const STATUS_BADGE = {
  ok: "bg-good/15 border-good/40 text-good",
  todo: "bg-warn/15 border-warn/40 text-warn",
  blocked: "bg-bad/15 border-bad/50 text-bad",
} as const;

const STATUS_LABEL = { ok: "✅ 준비됨", todo: "🟡 추가 셋업", blocked: "🔴 자동화 불가/위험" };

export default function ComingSoonLine({ line, title, basedOn, autoSteps, required, difficulty, difficultyNote }: Props) {
  return (
    <div className="space-y-6">
      <div className="bg-panel border border-line rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-subtext uppercase tracking-widest mb-1">자동화 라인</div>
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="text-sm text-subtext mt-2">{basedOn}</p>
          </div>
          <span className="text-[11px] uppercase tracking-wider text-warn border border-warn/40 rounded px-2 py-1">
            준비중
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="자동화 스텝 (예정)">
            <ol className="text-sm space-y-2 list-decimal pl-5">
              {autoSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </Card>

          <Card title="필요한 API · 외부 의존">
            <ul className="space-y-2">
              {required.map((r, i) => (
                <li key={i} className={`text-sm rounded-md border px-3 py-2 ${STATUS_BADGE[r.status]}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-[11px] uppercase tracking-wider opacity-90">{STATUS_LABEL[r.status]}</span>
                  </div>
                  {r.note ? <div className="text-[12px] mt-1 opacity-80">{r.note}</div> : null}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="다음에 할 일 (지금은 stub)">
            <div className="text-sm text-subtext space-y-2">
              <p>이 탭은 현재 골격만 만들어둔 상태입니다. 실제 자동화는 다음 명령으로 추가됩니다.</p>
              <pre className="mono bg-bg border border-line rounded-md p-3 text-[11px] overflow-auto">
{`> ${line === "shorts" ? "07-shorts" : line === "instacard" ? "08-instacard" : "09-blog"} 봇 추가해줘.
> 입력은 projects/<slug>/03-script + 04-audio + 05-visual.
> 출력은 projects/<slug>/${line === "shorts" ? "07-shorts/short.mp4" : line === "instacard" ? "08-instacard/cards/" : "09-blog/post.md"}`}
              </pre>
              <p className="text-xs">
                AGENTS.md 와 pipeline.json 을 수정하지 않아도, 봇 추가 시 어드민이 자동으로 인식하도록
                만들어둘 예정입니다.
              </p>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="난이도 평가">
            <div className="text-sm">
              <div className="text-2xl font-bold mb-1">{difficulty}</div>
              <div className="text-xs text-subtext">{difficultyNote}</div>
            </div>
          </Card>

          <Card title="현실적 권장 시작 순서">
            <ol className="text-xs text-subtext list-decimal pl-4 space-y-1">
              <li>롱폼 라인을 먼저 안정화 (주 1편 8주)</li>
              <li>숏폼: 같은 자산 자르기만이라 가장 ROI 큼</li>
              <li>인스타 카드: 카드 PNG 자동 생성 → 수동 업로드부터</li>
              <li>블로그: Medium / 본인 WordPress 가 있을 때만 자동화</li>
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <h3 className="text-base font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}
