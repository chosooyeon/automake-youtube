"use client";

import { useState } from "react";
import LongFormDashboard from "./LongFormDashboard";
import ComingSoonLine from "./ComingSoonLine";
import TopicQueue from "./TopicQueue";
import ShortsDashboard from "./ShortsDashboard";
import NicheSelector from "./NicheSelector";
import BlogGenerator from "./BlogGenerator";

type Tab = "topics" | "longform" | "shorts" | "instacard" | "blog";

const TABS: { id: Tab; label: string; status: "live" | "planned" }[] = [
  { id: "topics", label: "💡 주제 큐 (0번)", status: "live" },
  { id: "longform", label: "🎬 롱폼 (YouTube 8~10분)", status: "live" },
  { id: "shorts", label: "📱 숏폼 (YouTube Shorts)", status: "live" },
  { id: "instacard", label: "🟪 인스타 카드 피드", status: "planned" },
  { id: "blog", label: "📝 블로그 글 (네이버)", status: "live" },
];

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("topics");
  const [nicheKey, setNicheKey] = useState(0);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <NicheSelector onChange={() => setNicheKey((k) => k + 1)} />
      </div>
      <div className="flex gap-1 border-b border-line overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              "px-4 py-2.5 text-sm rounded-t-lg border border-b-0 transition shrink-0 " +
              (tab === t.id
                ? "bg-panel border-line text-text"
                : "bg-transparent border-transparent text-subtext hover:text-text hover:bg-panel/40")
            }
          >
            {t.label}
            {t.status === "planned" && (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-warn border border-warn/40 rounded px-1.5 py-0.5">
                준비중
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "topics" && <TopicQueue />}
      {tab === "longform" && <LongFormDashboard />}
      {tab === "shorts" && <ShortsDashboard />}
      {tab === "instacard" && (
        <ComingSoonLine
          line="instacard"
          title="인스타 카드 피드 (10장 슬라이드 형식)"
          basedOn="03-script 의 body 씬 핵심 5~10개를 카드 1장씩으로 자동 디자인."
          autoSteps={[
            "03-script.output.json 의 body 씬에서 headline + 1줄 본문 추출 (10개 이내)",
            "카드 템플릿 PNG 생성 (Sharp/Canvas 또는 Gemini 이미지 API)",
            "1장째: 표지(제목+숫자) / 2~9장째: 항목 1개씩 / 10장째: CTA + 채널 시그니처",
            "Instagram Graph API media create + carousel publish (이미지 10장 한 묶음)",
            "캡션은 description_template 의 한 줄 요약 + #해시태그 30개",
          ]}
          required={[
            { name: "Sharp / @napi-rs/canvas (이미지 합성)", status: "todo" },
            { name: "Pretendard 폰트 파일 (현재 brand.font_pair 만 지정)", status: "todo" },
            { name: "Instagram Graph API (Meta 비즈니스 검수)", status: "todo", note: "Meta 검수 필요. 개인 계정은 수동 업로드만 가능." },
            { name: "Threads API (선택)", status: "todo", note: "Meta가 2024년 말 공개. 한국에서 작동 확인 필요." },
          ]}
          difficulty="중간"
          difficultyNote="이미지 합성 자체는 쉬운데 Meta API 검수가 시간 듦. 검수 전엔 PNG 파일만 자동 생성하고 사람이 수동 업로드."
        />
      )}
      {tab === "blog" && <BlogGenerator />}
    </div>
  );
}
