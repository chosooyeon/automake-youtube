/**
 * 시장 국면 찾기 — 백테스트를 "어느 장에서 검증할지" 고르기 위한 도구.
 *
 * 왜 필요한가: 매매 규칙의 존재 이유는 상승장에서 더 버는 게 아니라 **하락장에서 덜 잃는 것**이다.
 * 그런데 2023~2026 국내장은 크게 오른 구간이라, 전 구간 백테스트는
 * "그냥 사서 묻어두는 게 나았다"는 결론밖에 안 나온다 (-144%p). 규칙이 나쁜 건지
 * 무대가 규칙에 불리했던 건지 구분하려면 하락 구간을 따로 잘라 봐야 한다.
 *
 * 지수를 쓰지 않고 **동일가중 지수를 직접 만든다**: 백테스트가 실제로 매매하는 대상이
 * 시총가중 코스피가 아니라 유니버스 100종목이므로, 그 100종목의 평균 움직임이
 * 진짜 기준선이다. 코스피는 삼성전자 비중에 끌려다녀서 다른 그림을 보여준다.
 *
 *   cd admin && npx tsx ../scripts/market-regime.ts
 *   cd admin && npx tsx ../scripts/market-regime.ts --top 100 --days 1000
 */

import { fetchCandles, type StockRef } from "../admin/lib/stock/naver";
import { fetchUniverse } from "../admin/lib/stock/universe";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** 하락 구간으로 볼 최소 낙폭 (%) — 이보다 얕으면 그냥 흔들림이다 */
const DIP_PCT = -8;

async function main() {
  const top = Number(arg("top") || 100);
  const days = Number(arg("days") || 1000);

  const refs: StockRef[] = await fetchUniverse("marketCap", top);
  console.log(`\n일봉 수집 중 (${refs.length}종목 × ${days}일)...`);

  const series = new Map<string, Map<string, number>>();
  let done = 0;
  for (const r of refs) {
    try {
      const cs = await fetchCandles(r, days);
      series.set(r.symbol, new Map(cs.map((c) => [c.date, c.close])));
    } catch {
      /* 비공식 API — 한 종목 실패로 전체를 멈추지 않는다 */
    }
    process.stdout.write(`\r  ${++done}/${refs.length}`);
    await new Promise((s) => setTimeout(s, 200));
  }

  const dates = [...new Set([...series.values()].flatMap((m) => [...m.keys()]))].sort();

  // 동일가중 지수: 종목별 전일대비 수익률의 평균을 누적한다.
  // 종가 자체를 평균내면 주가 높은 종목이 지수를 지배한다.
  let idx = 100;
  const curve: Array<[string, number]> = [];
  for (let i = 1; i < dates.length; i++) {
    const rs: number[] = [];
    for (const m of series.values()) {
      const a = m.get(dates[i - 1]);
      const b = m.get(dates[i]);
      if (a && b && a > 0) rs.push(b / a - 1);
    }
    if (rs.length < 30) continue; // 표본이 얇은 날은 지수가 튄다
    idx *= 1 + rs.reduce((s, v) => s + v, 0) / rs.length;
    curve.push([dates[i], idx]);
  }
  if (curve.length === 0) {
    console.error("\n✗ 지수를 만들 데이터가 부족합니다.");
    process.exit(1);
  }

  const first = curve[0];
  const last = curve[curve.length - 1];
  console.log(
    `\n\n동일가중 지수 ${first[0]} ~ ${last[0]}  ` +
      `${first[1].toFixed(1)} → ${last[1].toFixed(1)} ` +
      `(${((last[1] / first[1] - 1) * 100).toFixed(1)}%)`
  );

  console.log("\n[분기별]");
  const byQ = new Map<string, [number, number]>();
  for (const [d, v] of curve) {
    const q = `${d.slice(0, 4)}Q${Math.ceil(Number(d.slice(4, 6)) / 3)}`;
    const e = byQ.get(q);
    if (!e) byQ.set(q, [v, v]);
    else e[1] = v;
  }
  for (const [q, [a, b]] of byQ) {
    const r = (b / a - 1) * 100;
    const bar = "█".repeat(Math.min(24, Math.round(Math.abs(r) / 2)));
    console.log(`  ${q}  ${(r >= 0 ? "+" : "") + r.toFixed(1)}%`.padEnd(18) + bar + (r <= DIP_PCT ? "  ◀ 하락장" : ""));
  }

  // peak → trough 를 훑어 낙폭 구간을 모은다. 새 고점이 나오면 한 구간이 끝난 것.
  console.log(`\n[낙폭 ${DIP_PCT}% 이상 구간] — 백테스트 --from/--to 에 그대로 쓴다`);
  let peak = curve[0][1];
  let peakDate = curve[0][0];
  let troughDate = curve[0][0];
  let troughDd = 0;
  const dips: Array<{ from: string; to: string; dd: number }> = [];
  const flush = () => {
    if (troughDd <= DIP_PCT) dips.push({ from: peakDate, to: troughDate, dd: troughDd });
    troughDd = 0;
  };
  for (const [d, v] of curve) {
    if (v > peak) {
      flush();
      peak = v;
      peakDate = d;
      continue;
    }
    const dd = (v / peak - 1) * 100;
    if (dd < troughDd) {
      troughDd = dd;
      troughDate = d;
    }
  }
  flush();

  if (dips.length === 0) {
    console.log(`  (없음 — 이 기간에는 ${DIP_PCT}% 이상 빠진 적이 없습니다)`);
  }
  for (const d of dips.sort((a, b) => a.dd - b.dd)) {
    console.log(`  ${d.from} → ${d.to}   ${d.dd.toFixed(1)}%`);
  }
  console.log(
    "\n※ 하락 구간만 잘라 백테스트할 땐 --from 을 지표 워밍업(60봉 ≈ 90일)만큼 앞당겨야\n" +
      "  실제 매매 구간이 그 하락장이 된다. 안 그러면 워밍업이 구간을 통째로 먹는다.\n"
  );
}

main();
