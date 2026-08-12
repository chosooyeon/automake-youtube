"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "./Toast";
import {
  useInstagramJob,
  useInstaElapsed,
  formatMmSs,
  type CategoryId,
  type VerifyStatus,
} from "./InstagramJobContext";
import InstagramCardPreview from "./InstagramCardPreview";
import NewsFeedPanel from "./NewsFeedPanel";

interface CategoryUi {
  id: CategoryId;
  label: string;
  sub: string;
  accent: string;
  /** 지역 입력이 의미 있는 카테고리인지 */
  hasRegion: boolean;
  /** 출처 검증 안내 문구 */
  verifyNote: string;
  placeholder: string;
}

const CATEGORIES: CategoryUi[] = [
  {
    id: "parenting_subsidy",
    label: "육아 정부지원금",
    sub: "출산축하금 · 부모급여 · 첫만남이용권 · 어린이집 보육료",
    accent: "#F4A261",
    hasRegion: true,
    verifyNote: "카드당 공식 출처 ≥ 2개 (정부24·복지로·.go.kr) 미달 시 해당 카드 자동 제외.",
    placeholder: `예시:
- 2026년 첫만남이용권: 출생 시 200만원 (다자녀 추가 100만원)
- 출생신고 후 자동 신청, 국민행복카드로 지급
- 사용처: 어린이집, 산후조리원, 의료비, 유아용품
- 부모급여랑 중복 수령 가능

(잘 모르는 부분은 안 적어도 OK — WebSearch 가 자동으로 검색해서 보완)`,
  },
  {
    id: "youth_subsidy",
    label: "청년 정부지원금",
    sub: "청년도약계좌 · 청년월세 · 청년취업 · 국민취업지원",
    accent: "#14B8A6",
    hasRegion: true,
    verifyNote: "카드당 공식 출처 ≥ 2개 (정부24·청년센터·.go.kr) 미달 시 해당 카드 자동 제외.",
    placeholder: `예시:
- 청년도약계좌: 월 최대 70만원 납입, 5년 만기
- 가입 자격: 만 19~34세, 개인소득 7,500만원 이하
- 정부기여금 + 비과세 혜택
- 신청: 취급 은행 앱에서 매월 초

(잘 모르는 부분은 안 적어도 OK — WebSearch 가 자동으로 검색해서 보완)`,
  },
  {
    id: "stocks",
    label: "주식 정보",
    sub: "ETF · 배당 · 시장 동향 (정보 제공 / 투자 권유 아님)",
    accent: "#E0B14C",
    hasRegion: false,
    verifyNote: "카드당 출처 ≥ 2개 (KRX·금감원·한국은행·운용사 공식자료) 미달 시 해당 카드 자동 제외.",
    placeholder: `예시:
- 국내 상장 미국배당 ETF 최근 분배율 비교
- 기준일과 수치는 반드시 같이 표기
- 종목 추천이 아니라 '구조 설명' 관점으로

(위 뉴스 수집 패널에서 기사를 담으면 자동으로 채워집니다)`,
  },
  {
    id: "it_news",
    label: "해외 IT·AI 뉴스",
    sub: "빅테크 · AI 신모델 · 신제품 · 개발자 소식",
    accent: "#6366F1",
    hasRegion: false,
    verifyNote:
      "카드당 출처 ≥ 2개 (원문 기사 + 기업 공식 발표) 미달 시 해당 카드 자동 제외. 루머·유출 소식은 자동 제외.",
    placeholder: `위 '뉴스 자동 수집' 에서 기사를 골라 담으면 여기가 자동으로 채워집니다.

직접 쓸 수도 있어요:
- 어떤 회사가 뭘 발표했는지
- 한국 독자가 알아야 할 포인트
- 강조하고 싶은 각도 (예: 개발자 관점 / 일반 사용자 관점)`,
  },
];

const VERIFY_BADGE: Record<VerifyStatus, { label: string; cls: string }> = {
  ok: { label: "✅ 확인됨", cls: "bg-good/15 border-good/40 text-good" },
  warn: { label: "⚠️ 부정확", cls: "bg-warn/15 border-warn/40 text-warn" },
  unknown: { label: "❓ 출처 부족", cls: "bg-subtext/15 border-subtext/40 text-subtext" },
  bad: { label: "❌ 틀림", cls: "bg-bad/15 border-bad/50 text-bad" },
};

export default function InstagramCardGenerator() {
  const [category, setCategory] = useState<CategoryId>("parenting_subsidy");
  const [region, setRegion] = useState("");
  const [content, setContent] = useState("");
  const [extraNote, setExtraNote] = useState("");
  const [cardCount, setCardCount] = useState(5);
  const [sourceLinks, setSourceLinks] = useState<string[]>([]);
  const { push } = useToast();
  const job = useInstagramJob();
  const elapsed = useInstaElapsed(job.generate.startedAt);

  const cat = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];

  const busy = job.generate.status === "running";
  const result = job.generate.result;
  const slug = job.generate.slug;
  const errorRaw = job.generate.errorRaw ?? null;

  const resultRef = useRef<HTMLDivElement | null>(null);
  const [flashResult, setFlashResult] = useState(false);

  useEffect(() => {
    if (job.generate.status !== "done" || !resultRef.current) return;
    job.consumeFocusRequest();
    resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    setFlashResult(true);
    const t = setTimeout(() => setFlashResult(false), 2500);
    return () => clearTimeout(t);
  }, [job.generate.status, job.generate.finishedAt]);

  useEffect(() => {
    if (job.generate.status === "error" && job.generate.error) {
      push({ kind: "error", title: "생성 실패", message: job.generate.error });
    }
  }, [job.generate.status, job.generate.error, push]);

  async function onGenerate() {
    if (busy) return;
    if (content.trim().length < 10) {
      push({ kind: "warn", title: "내용을 10자 이상 입력하세요" });
      return;
    }
    await job.startGenerate({
      category,
      region: cat.hasRegion ? region.trim() : "",
      content,
      cardCount,
      extraNote: extraNote.trim() || undefined,
      sourceLinks: sourceLinks.length > 0 ? sourceLinks : undefined,
    });
  }

  /** 뉴스 패널에서 선택한 기사를 본문에 append + 원문 링크 누적 */
  function insertNews(text: string, links: string[]) {
    setContent((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${text}` : text));
    setSourceLinks((prev) => Array.from(new Set([...prev, ...links])));
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      push({ kind: "success", title: `${label} 복사됨` });
    } catch {
      push({ kind: "error", title: "복사 실패" });
    }
  }

  function downloadAll() {
    if (!result || !slug) return;
    const a = document.createElement("a");
    a.href = `/api/instagram/download-zip?slug=${encodeURIComponent(slug)}`;
    a.download = `${slug}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="space-y-6">
      <div className="bg-panel border border-line rounded-2xl p-6">
        <div className="text-xs text-subtext uppercase tracking-widest mb-1">
          인스타그램 카드피드 생성기
        </div>
        <h2 className="text-xl font-bold">🟪 카드뉴스 자동 생성</h2>
        <p className="text-sm text-subtext mt-2">
          <strong className="text-text">뉴스 자동 수집 → 출처 검증 → 배경 이미지 생성 → 텍스트 오버레이</strong>까지 자동.
          한글 깨짐 없이 1080×1080 카드 5–10장 + 캡션을 만들어 줍니다.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 좌측: 입력 */}
        <div className="lg:col-span-1 space-y-4">
          <Card title="1. 카테고리">
            <div className="space-y-2">
              {CATEGORIES.map((c) => (
                <label
                  key={c.id}
                  className={
                    "block rounded-md border px-3 py-2 cursor-pointer text-sm transition " +
                    (category === c.id
                      ? "bg-accent/10 text-text"
                      : "border-line bg-bg/40 text-subtext hover:text-text")
                  }
                  style={category === c.id ? { borderColor: c.accent } : undefined}
                >
                  <input
                    type="radio"
                    className="mr-2"
                    style={{ accentColor: c.accent }}
                    checked={category === c.id}
                    onChange={() => setCategory(c.id)}
                  />
                  <span className="font-medium">{c.label}</span>
                  <span
                    className="ml-2 inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: c.accent }}
                  />
                  <div className="text-[11px] text-subtext mt-0.5 ml-5">{c.sub}</div>
                </label>
              ))}
            </div>
          </Card>

          {cat.hasRegion && (
            <Card title="2. 지역 (선택)">
              <input
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="예: 서울, 남양주시"
                className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm"
              />
              <p className="text-[11px] text-subtext mt-2">
                비워두면 전국 단위 지원금만. 지역 입력 시 해당 지자체 지원금도 같이 검색.
              </p>
            </Card>
          )}

          <Card title={cat.hasRegion ? "3. 카드 수" : "2. 카드 수"}>
            <input
              type="range"
              min={3}
              max={10}
              value={cardCount}
              onChange={(e) => setCardCount(parseInt(e.target.value, 10))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-[11px] text-subtext mt-1">
              <span>최소 3장</span>
              <span className="mono text-text font-semibold">{cardCount}장</span>
              <span>최대 10장</span>
            </div>
            <p className="text-[11px] text-subtext mt-2">
              5장 권장: 표지 1 + 본문 3 + CTA 1. 정확한 출처를 못 찾은 카드는 자동 제외되어 더 적게 나올 수도 있어요.
            </p>
          </Card>
        </div>

        {/* 우측: 입력 본문 */}
        <div className="lg:col-span-2 space-y-4">
          <NewsFeedPanel category={category} accent={cat.accent} onInsert={insertNews} />

          <Card
            title={`${cat.hasRegion ? "4" : "3"}. 주제 / 내가 알고 있는 내용`}
            right={
              content.trim() ? (
                <button
                  onClick={() => {
                    setContent("");
                    setSourceLinks([]);
                  }}
                  className="text-xs border border-line rounded px-2 py-1 hover:bg-panel2 text-subtext"
                >
                  비우기
                </button>
              ) : undefined
            }
          >
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              placeholder={cat.placeholder}
              className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm mono leading-relaxed"
            />
            <div className="flex justify-between items-center mt-2 gap-3">
              <p className="text-[11px] text-subtext">
                메모/들은 정보/주제 키워드 등. 자동으로 출처 ≥ 2개 검색 후 확인된 사실만 카드에 반영됩니다.
              </p>
              <span className="text-[11px] text-subtext mono shrink-0">
                {sourceLinks.length > 0 && `원문 ${sourceLinks.length}건 · `}
                {content.length}자
              </span>
            </div>
          </Card>

          <Card title={`${cat.hasRegion ? "5" : "4"}. 추가 요청 (선택)`}>
            <input
              type="text"
              value={extraNote}
              onChange={(e) => setExtraNote(e.target.value)}
              placeholder="예: 신청 단계 위주로 / 다자녀 가구 케이스 강조 / 비교표 1장 꼭 넣기"
              className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm"
            />
          </Card>

          <div className="bg-panel border border-line rounded-xl p-3 flex items-center gap-2 text-xs text-subtext">
            <span className="inline-block h-2 w-2 rounded-full bg-good shrink-0" />
            <span>
              <strong className="text-text">출처 검증 항상 ON</strong> — {cat.verifyNote} 모든 카드 푸터에 출처 + 연도 자동 표기.
            </span>
          </div>

          <button
            onClick={onGenerate}
            disabled={busy}
            className="w-full bg-accent text-bg font-semibold rounded-md py-3 disabled:opacity-50 disabled:cursor-wait hover:bg-accent2 transition"
          >
            {busy
              ? `생성 중… ${formatMmSs(elapsed)} 경과 (보통 90~150초)`
              : `🟪 ${cardCount}장 카드 + 출처 검증 + 이미지 생성`}
          </button>
          <p className="text-[11px] text-subtext text-center">
            {busy
              ? "WebSearch → Gemini 배경 → Pretendard 오버레이. 다른 탭 이동 OK."
              : "Claude (sonnet) 가 WebSearch 로 공식 출처 확인 → Gemini Imagen 이 배경 생성 → 코드로 한글 텍스트 합성."}
          </p>
        </div>
      </div>

      {/* 결과 */}
      {result && slug && (
        <div
          ref={resultRef}
          id="instagram-result-anchor"
          className={
            "space-y-4 scroll-mt-20 rounded-2xl transition-shadow " +
            (flashResult ? "ring-2 ring-good shadow-lg shadow-good/20" : "")
          }
        >
          <Card
            title={`✅ ${result.cards.length}장 카드 생성 완료`}
            right={
              <div className="flex gap-2">
                <button
                  onClick={downloadAll}
                  className="text-xs border border-accent text-accent rounded px-2 py-1 hover:bg-accent/10"
                >
                  ⬇ 전체 ZIP 다운로드
                </button>
              </div>
            }
          >
            {result.verify_summary && (
              <p className="text-xs text-subtext mb-3">{result.verify_summary}</p>
            )}
            <p className="text-[11px] text-subtext mb-3 mono">
              슬러그: {slug} · 저장 위치: <span className="text-text">projects/{slug}/instagram-cards/</span>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {result.cards.map((c) => (
                <InstagramCardPreview key={c.index} slug={slug} card={c} />
              ))}
            </div>
          </Card>

          <Card
            title="📝 인스타 캡션"
            right={
              <button
                onClick={() =>
                  copy(
                    `${result.caption}\n\n${(result.hashtags ?? []).join(" ")}`,
                    "캡션 + 해시태그"
                  )
                }
                className="text-xs border border-line rounded px-2 py-1 hover:bg-panel2"
              >
                전체 복사
              </button>
            }
          >
            <pre className="bg-bg border border-line rounded-md p-3 text-sm whitespace-pre-wrap leading-relaxed font-sans">
{result.caption}
            </pre>
            {result.hashtags?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {result.hashtags.map((h, i) => (
                  <span
                    key={i}
                    className="text-xs bg-bg border border-line rounded-full px-3 py-1 text-subtext"
                  >
                    {h}
                  </span>
                ))}
              </div>
            )}
          </Card>

          {result.verify_items && result.verify_items.length > 0 && (
            <Card title={`🔍 출처 검증 (${result.verify_items.length}건)`}>
              <ul className="space-y-2">
                {result.verify_items.map((it, i) => {
                  const badge = VERIFY_BADGE[it.status] ?? VERIFY_BADGE.unknown;
                  return (
                    <li
                      key={i}
                      className={`text-sm rounded-md border px-3 py-2 ${badge.cls}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="text-text text-sm font-medium">{it.claim}</div>
                          {it.note && (
                            <div className="text-[12px] mt-1 opacity-90 text-text/90">
                              {it.note}
                            </div>
                          )}
                          {it.sources && it.sources.length > 0 && (
                            <div className="text-[11px] mt-1 flex flex-wrap gap-2">
                              {it.sources.map((s, j) => (
                                <a
                                  key={j}
                                  href={s}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-subtext underline hover:text-text break-all"
                                >
                                  출처{j + 1}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="text-[11px] uppercase tracking-wider opacity-90 shrink-0">
                          {badge.label}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      )}

      {errorRaw && (
        <Card title="⚠️ 파싱 실패 - 모델 원본 응답">
          <pre className="bg-bg border border-line rounded-md p-3 text-[11px] mono overflow-auto whitespace-pre-wrap">
            {errorRaw}
          </pre>
        </Card>
      )}
    </div>
  );
}

function Card({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}
