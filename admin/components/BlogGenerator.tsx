"use client";

import { useState } from "react";
import { useToast } from "./Toast";

type Category =
  | "gov_support"
  | "baby_review"
  | "newlywed_diary"
  | "food_cafe"
  | "wedding_prep";

const CATEGORIES: { id: Category; label: string; sub: string }[] = [
  { id: "gov_support", label: "정부지원금 & 꿀팁", sub: "출산축하금 · 부모급여 · 임산부 혜택 (정보성 / C-Rank)" },
  { id: "baby_review", label: "내돈내산 육아템 리뷰", sub: "0~24개월 필수템 · 기저귀 가방 · 카시트 (수익화 연결)" },
  { id: "newlywed_diary", label: "신혼/일상 기록", sub: "신혼집 · 결혼 N개월차 (체류시간 · 이웃 소통)" },
  { id: "food_cafe", label: "맛집 & 카페 투어", sub: "[지역명] 키즈존 · 한정식 · 카페 (유입량 확보)" },
  { id: "wedding_prep", label: "결혼 준비", sub: "상견례 장소 · 청첩장 · 신혼가전 견적 (고단가 키워드)" },
];

interface GenerateResult {
  titles: string[];
  category_label: string;
  content_markdown: string;
  photo_spots: { index: number; description: string }[];
  hashtags: string[];
  char_count_excl_space?: number;
}

export default function BlogGenerator() {
  const [category, setCategory] = useState<Category>("gov_support");
  const [region, setRegion] = useState("");
  const [content, setContent] = useState("");
  const [extraNote, setExtraNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [errorRaw, setErrorRaw] = useState<string | null>(null);
  const { push } = useToast();

  async function onGenerate() {
    if (content.trim().length < 10) {
      push({ kind: "warn", title: "내용을 10자 이상 입력하세요" });
      return;
    }
    setBusy(true);
    setResult(null);
    setErrorRaw(null);
    try {
      const r = await fetch("/api/blog/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, region: region.trim(), content, extraNote }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        push({
          kind: "error",
          title: "생성 실패",
          message: j.message || j.error || `HTTP ${r.status}`,
        });
        if (j.raw_stdout) setErrorRaw(j.raw_stdout);
        return;
      }
      setResult(j.result as GenerateResult);
      push({ kind: "success", title: "초안 생성 완료" });
    } catch (e: any) {
      push({ kind: "error", title: "요청 오류", message: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      push({ kind: "success", title: `${label} 복사됨` });
    } catch {
      push({ kind: "error", title: "복사 실패" });
    }
  }

  const charsExclSpace = result
    ? (result.content_markdown || "").replace(/\s/g, "").length
    : 0;

  return (
    <div className="space-y-6">
      <div className="bg-panel border border-line rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-subtext uppercase tracking-widest mb-1">
              네이버 블로그 초안 생성기
            </div>
            <h2 className="text-xl font-bold">📝 1일 1포스팅 초안 만들기</h2>
            <p className="text-sm text-subtext mt-2">
              내용을 입력하면 SEO 제목 후보 3개 + 본문 초안(공백제외 1,000자+) + 사진 4장 자리를 만들어줍니다.
              사진은 직접 업로드, 사실(가격/날짜)은 빈칸으로 두니 본인이 채우세요.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 입력 */}
        <div className="lg:col-span-1 space-y-4">
          <Card title="1. 카테고리">
            <div className="space-y-2">
              {CATEGORIES.map((c) => (
                <label
                  key={c.id}
                  className={
                    "block rounded-md border px-3 py-2 cursor-pointer text-sm transition " +
                    (category === c.id
                      ? "border-accent bg-accent/10 text-text"
                      : "border-line bg-bg/40 text-subtext hover:text-text hover:border-line")
                  }
                >
                  <input
                    type="radio"
                    className="mr-2 accent-accent"
                    checked={category === c.id}
                    onChange={() => setCategory(c.id)}
                  />
                  <span className="font-medium">{c.label}</span>
                  <div className="text-[11px] text-subtext mt-0.5 ml-5">{c.sub}</div>
                </label>
              ))}
            </div>
          </Card>

          <Card title="2. 지역명 (선택)">
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="예: 남양주시, 구리시, 강남역"
              className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-subtext mt-2">
              [지역명+정보] 패턴은 네이버 검색 유입에 가장 효과적입니다. 비워두면 일반 글로 작성.
            </p>
          </Card>
        </div>

        {/* 입력 본문 */}
        <div className="lg:col-span-2 space-y-4">
          <Card title="3. 내가 입력하는 내용">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              placeholder={`예시:
- 오늘 남양주시 출산축하금 신청하고 왔다
- 시청 가족복지과 방문, 대기 15분 정도
- 필요한 서류: 출생신고서, 통장사본, 신분증
- 첫째 50만원, 둘째 100만원 (현금 지급 X, 지역화폐로 지급)
- 신청 후 7~14일 내 입금 예정이라고 안내받음
- 온라인 신청도 가능하다는데 방문이 더 빠르다고 함`}
              className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm mono leading-relaxed"
            />
            <div className="flex justify-between items-center mt-2">
              <p className="text-[11px] text-subtext">
                겪은 일 / 들은 정보 / 메모 그대로. 모르는 부분은 안 적으면 글에서 placeholder 로 비워둡니다.
              </p>
              <span className="text-[11px] text-subtext mono">{content.length}자</span>
            </div>
          </Card>

          <Card title="4. 추가 요청 (선택)">
            <input
              type="text"
              value={extraNote}
              onChange={(e) => setExtraNote(e.target.value)}
              placeholder="예: 표 꼭 넣어줘 / 좀 더 친근한 톤 / 비교 글 형식으로"
              className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm"
            />
          </Card>

          <button
            onClick={onGenerate}
            disabled={busy}
            className="w-full bg-accent text-bg font-semibold rounded-md py-3 disabled:opacity-50 disabled:cursor-wait hover:bg-accent2 transition"
          >
            {busy ? "생성 중… (60~90초 정도 걸립니다)" : "✨ 블로그 초안 생성"}
          </button>
        </div>
      </div>

      {/* 결과 */}
      {result && (
        <div className="space-y-4">
          <Card title="✅ 추천 제목 3개">
            <div className="space-y-2">
              {result.titles.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 bg-bg border border-line rounded-md px-3 py-2"
                >
                  <div className="flex items-start gap-2 flex-1">
                    <span className="text-[10px] uppercase tracking-wider text-subtext shrink-0 mt-1">
                      {i === 0 ? "SEO" : i === 1 ? "클릭" : "롱테일"}
                    </span>
                    <span className="text-sm">{t}</span>
                  </div>
                  <button
                    onClick={() => copy(t, "제목")}
                    className="text-xs border border-line rounded px-2 py-1 hover:bg-panel2 shrink-0"
                  >
                    복사
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title={`📄 본문 초안 (공백제외 ${charsExclSpace}자${
              charsExclSpace < 1000 ? " · ⚠️ 1,000자 미달" : ""
            })`}
            right={
              <div className="flex gap-2">
                <button
                  onClick={() => copy(result.content_markdown, "본문")}
                  className="text-xs border border-line rounded px-2 py-1 hover:bg-panel2"
                >
                  본문 복사
                </button>
                <button
                  onClick={() =>
                    copy(
                      `${result.titles[0]}\n\n${result.content_markdown}\n\n${result.hashtags.join(" ")}`,
                      "전체"
                    )
                  }
                  className="text-xs border border-accent text-accent rounded px-2 py-1 hover:bg-accent/10"
                >
                  제목+본문+태그 한번에
                </button>
              </div>
            }
          >
            <div className="text-xs text-subtext mb-2">
              네이버 블로그 카테고리 추천: <strong className="text-text">{result.category_label}</strong>
            </div>
            <pre className="bg-bg border border-line rounded-md p-3 text-sm whitespace-pre-wrap leading-relaxed font-sans">
{result.content_markdown}
            </pre>
          </Card>

          {result.photo_spots?.length > 0 && (
            <Card title="📷 사진 자리 (직접 업로드)">
              <ul className="space-y-2">
                {result.photo_spots.map((p) => (
                  <li
                    key={p.index}
                    className="text-sm bg-bg border border-line rounded-md px-3 py-2"
                  >
                    <span className="text-[11px] uppercase tracking-wider text-accent mr-2">
                      사진{p.index}
                    </span>
                    {p.description}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {result.hashtags?.length > 0 && (
            <Card
              title={`🏷️ 해시태그 ${result.hashtags.length}개`}
              right={
                <button
                  onClick={() => copy(result.hashtags.join(" "), "해시태그")}
                  className="text-xs border border-line rounded px-2 py-1 hover:bg-panel2"
                >
                  복사
                </button>
              }
            >
              <div className="flex flex-wrap gap-2">
                {result.hashtags.map((h, i) => (
                  <span
                    key={i}
                    className="text-xs bg-bg border border-line rounded-full px-3 py-1 text-subtext"
                  >
                    {h}
                  </span>
                ))}
              </div>
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
