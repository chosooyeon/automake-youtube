"use client";

import type { Market, MarketMethod, MethodPayload, RuleRow, WalkForward } from "./stockTypes";

/**
 * 시장별 방법론 비교 — /api/stock/method 가 풀어준 config/stock-trading.json 을 표로 보여준다.
 *
 * 여기서 숫자를 계산하지 않는다. 백테스트가 읽는 것과 **같은 설정 객체**를 그대로 받아 쓴다.
 * 화면이 따로 계산하면 "화면에 적힌 규칙"과 "실제로 돌아간 규칙"이 갈라지고,
 * 그 순간 이 화면은 사람을 안심시키는 장식이 된다.
 *
 * 데이터는 부모(StockAlertDashboard)가 한 번만 받아서 내려준다 — 요약 스트립과
 * 이 화면이 같은 응답을 봐야 "요약엔 20일, 상세엔 40일" 같은 어긋남이 안 생긴다.
 */

const SECTION_LABEL: Record<RuleRow["section"], string> = {
  entry: "언제 사는가",
  exit: "언제 파는가",
  risk: "얼마를 거는가",
  costs: "거래비용",
};

const FLAG: Record<Market, string> = { KR: "🇰🇷", US: "🇺🇸" };

const SECTION_ORDER: RuleRow["section"][] = ["entry", "exit", "risk", "costs"];

/** 워크포워드 결과를 한 줄 판정으로. held 는 3값(유지/무너짐/판정불가)이다 */
function walkForwardVerdict(wf: WalkForward): { tone: string; text: string } {
  if (wf.held === true) {
    return {
      tone: "text-good",
      text: `검증구간에서도 유지됐습니다 (${wf.trades ?? "?"}거래 · 기대값 ${wf.expectancyR?.toFixed(3) ?? "?"}R)`,
    };
  }
  if (wf.held === false) {
    return {
      tone: "text-bad",
      text: `검증구간에서 무너졌습니다 — 학습구간에 맞춰 깎인 설정입니다 (${wf.trades ?? "?"}거래)`,
    };
  }
  return {
    tone: "text-subtext",
    text: `판정 불가 — 검증 표본이 ${wf.trades ?? 0}거래뿐입니다. 좋게 나왔든 나쁘게 나왔든 결론을 못 냅니다`,
  };
}

function MarketCard({ m, focused }: { m: MarketMethod; focused: boolean }) {
  const wf = m.walkForward;
  const verdict = wf ? walkForwardVerdict(wf) : null;

  return (
    <div
      className={
        "rounded-xl border p-4 space-y-3 transition " +
        (focused ? "bg-panel border-accent/50 ring-1 ring-accent/20" : "bg-panel border-line")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">
            {FLAG[m.market]} {m.label}
          </h3>
          <p className="text-[11px] mono text-subtext mt-1">{m.summary}</p>
        </div>
        {/* 검증 여부는 배지로 — 규칙만 보여주면 가설을 확정된 전략으로 읽는다 */}
        <span
          className={
            "shrink-0 text-[10px] rounded-full border px-2 py-1 " +
            (m.verifiedAt
              ? "text-good border-good/40 bg-good/10"
              : "text-warn border-warn/40 bg-warn/10")
          }
          title={
            m.verifiedAt
              ? "워크포워드 검증을 통과한 규칙입니다"
              : "아직 워크포워드를 통과하지 않은 가설입니다. 실계좌에 올리기 전 검증하세요"
          }
        >
          {m.verifiedAt ? `✓ 검증 ${m.verifiedAt}` : "⚠ 검증 전 (가설)"}
        </span>
      </div>

      {m.note && <p className="text-xs text-subtext leading-relaxed">{m.note}</p>}

      <div className="border-t border-line pt-3 space-y-1.5">
        <div className="text-[11px] font-semibold text-subtext">워크포워드 검증</div>
        {verdict && wf ? (
          <>
            <p className={"text-[11px] " + verdict.tone}>{verdict.text}</p>
            <p className="text-[10px] text-subtext">
              분할 {wf.split} · 승자 {wf.winner ?? "-"} · {wf.ranAt?.slice(0, 10) ?? "-"} 실행
            </p>
          </>
        ) : (
          <p className="text-[11px] text-subtext">
            아직 돌린 적이 없습니다. 이 규칙이 과거에 통했는지는 아무도 모릅니다.
          </p>
        )}
        <code className="block mono text-[10px] bg-panel2 border border-line rounded px-2 py-1.5 overflow-x-auto whitespace-nowrap">
          {m.walkForwardCommand}
        </code>
      </div>

      {m.warnings.length > 0 && (
        <ul className="space-y-1 border-t border-line pt-3">
          {m.warnings.map((w, i) => (
            <li key={i} className="text-[10px] text-warn leading-relaxed">
              ⚠ {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MethodBoard({
  data,
  focus,
}: {
  data: MethodPayload | null;
  focus: Market | null;
}) {
  if (!data) return <div className="text-sm text-subtext py-10 text-center">불러오는 중…</div>;

  const diffCount = data.rows.filter((r) => r.differs).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.markets.map((m) => (
          <MarketCard key={m.market} m={m} focused={focus === m.market} />
        ))}
      </div>

      {/* 비교표 — 다른 줄만 강조해서 "무엇이 따로인지"가 한눈에 */}
      <div className="bg-panel border border-line rounded-xl overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-base font-semibold">규칙 비교</h3>
          <p className="text-[11px] text-subtext mt-1">
            {data.rows.length}개 손잡이 중 <span className="text-accent font-semibold">{diffCount}개</span>가
            시장별로 다릅니다. 다른 줄만 색으로 표시했고, 나머지는 두 시장이 같은 값을 씁니다.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-y border-line bg-panel2/60 text-subtext text-[11px]">
                <th className="text-left font-medium px-4 py-2 whitespace-nowrap">항목</th>
                <th
                  className={
                    "text-right font-medium px-3 py-2 whitespace-nowrap " +
                    (focus === "KR" ? "text-text" : "")
                  }
                >
                  🇰🇷 국내
                </th>
                <th
                  className={
                    "text-right font-medium px-3 py-2 whitespace-nowrap " +
                    (focus === "US" ? "text-text" : "")
                  }
                >
                  🇺🇸 미국
                </th>
              </tr>
            </thead>
            <tbody>
              {SECTION_ORDER.map((section) => {
                const rows = data.rows.filter((r) => r.section === section);
                if (rows.length === 0) return null;
                return [
                  <tr key={`h-${section}`} className="bg-panel2/30">
                    <td
                      colSpan={3}
                      className="px-4 py-1.5 text-[10px] font-semibold text-subtext uppercase tracking-wider"
                    >
                      {SECTION_LABEL[section]}
                    </td>
                  </tr>,
                  ...rows.map((r) => (
                    <tr key={r.key} className="border-b border-line/60">
                      <td className="px-4 py-2 align-top" title={r.hint}>
                        <div className="flex items-center gap-1.5">
                          <span className={r.differs ? "text-text" : "text-subtext"}>{r.label}</span>
                          {r.differs && (
                            <span className="text-[9px] text-accent border border-accent/40 rounded px-1">
                              다름
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-subtext mt-0.5 max-w-md">{r.hint}</div>
                      </td>
                      <td
                        className={
                          "px-3 py-2 text-right mono whitespace-nowrap align-top " +
                          (r.differs ? "text-text font-semibold" : "text-subtext")
                        }
                      >
                        {r.values.KR}
                      </td>
                      <td
                        className={
                          "px-3 py-2 text-right mono whitespace-nowrap align-top " +
                          (r.differs ? "text-accent font-semibold" : "text-subtext")
                        }
                      >
                        {r.values.US}
                      </td>
                    </tr>
                  )),
                ];
              })}
              <tr className="bg-panel2/30">
                <td
                  colSpan={3}
                  className="px-4 py-1.5 text-[10px] font-semibold text-subtext uppercase tracking-wider"
                >
                  공통 (시장별로 나눌 수 없는 값)
                </td>
              </tr>
              <tr className="border-b border-line/60">
                <td className="px-4 py-2 text-subtext">
                  원금
                  <div className="text-[10px] text-subtext mt-0.5">
                    백테스트가 굴리는 가상 원금. 통화가 달라 미국 성적의 금액 지표는 참고용입니다
                  </div>
                </td>
                <td colSpan={2} className="px-3 py-2 text-right mono text-subtext">
                  {data.capital.toLocaleString("ko-KR")}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-subtext">
                  지표 워밍업
                  <div className="text-[10px] text-subtext mt-0.5">
                    SMA60 이 채워지기까지 건너뛰는 봉 수. 60 미만이면 진입 필터가 무력화됩니다
                  </div>
                </td>
                <td colSpan={2} className="px-3 py-2 text-right mono text-subtext">
                  {data.warmupBars}봉
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-panel border border-line rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-semibold">무엇이 시장별이고 무엇이 아닌가</h3>
        <ul className="text-[11px] text-subtext space-y-1.5 leading-relaxed">
          <li>
            <span className="text-text">신호 판정은 두 시장이 같습니다.</span> RSI·이동평균·MACD·볼린저밴드로
            매수/매도 점수를 매기는 엔진(<span className="mono">signals.ts</span>)은 하나뿐이고, 위 [🔔 신호
            스캔]과 텔레그램 알림이 그걸 씁니다. 시장별로 갈리는 건 그 신호를 받아{" "}
            <span className="text-text">얼마를 걸고 언제 자르느냐</span>입니다.
          </li>
          <li>
            <span className="text-text">이 값들을 고치는 곳은 한 군데입니다</span> —{" "}
            <span className="mono text-text">config/stock-trading.json</span> 의{" "}
            <span className="mono">markets.KR</span> / <span className="mono">markets.US</span>. 적지 않은 항목은
            위쪽 공통값이 자동으로 채웁니다.
          </li>
          <li>
            <span className="text-warn">스윕 표에서 제일 좋은 줄을 골라 여기 적으면 안 됩니다.</span> 전 구간을
            보고 고르는 순간 그건 검증이 아니라 정답을 보고 답을 맞춘 것입니다. 워크포워드를 통과한 날짜만{" "}
            <span className="mono">verifiedAt</span> 에 적습니다.
          </li>
        </ul>
      </div>
    </div>
  );
}
