"use client";

import { useState } from "react";
import LongFormDashboard from "./LongFormDashboard";
import ComingSoonLine from "./ComingSoonLine";
import TopicQueue from "./TopicQueue";

type Tab = "topics" | "longform" | "shorts" | "instacard" | "blog";

const TABS: { id: Tab; label: string; status: "live" | "planned" }[] = [
  { id: "topics", label: "💡 주제 큐 (0번)", status: "live" },
  { id: "longform", label: "🎬 롱폼 (YouTube 8~10분)", status: "live" },
  { id: "shorts", label: "📱 숏폼 (Shorts/Reels)", status: "planned" },
  { id: "instacard", label: "🟪 인스타 카드 피드", status: "planned" },
  { id: "blog", label: "📝 블로그 글", status: "planned" },
];

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("topics");

  return (
    <div className="space-y-6">
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
      {tab === "shorts" && (
        <ComingSoonLine
          line="shorts"
          title="숏폼 (YouTube Shorts / Instagram Reels / TikTok)"
          basedOn="롱폼 영상이 5번까지 끝나면, 같은 대본·자료를 30~60초 숏폼으로 자동 컷."
          autoSteps={[
            "롱폼 03-script.output.json 의 best_hook + key_moment 3개 추출",
            "04-audio voice 의 해당 구간만 잘라 새 SRT 생성 (ffmpeg trim)",
            "9:16 비율로 캔버스 회전 + 자막 가운데 배치 (CapCut JSON 9:16 템플릿)",
            "CapCut export → final_short.mp4",
            "YouTube Shorts API 업로드 (Data API v3 같은 엔드포인트, 세로 영상 자동 인식)",
          ]}
          required={[
            { name: "YouTube Data API (이미 있음)", status: "ok" },
            { name: "Instagram Graph API (Meta 비즈니스 + 페이스북 페이지 연결)", status: "todo", note: "리뷰 통과 시간 1~2주" },
            { name: "TikTok Content Posting API", status: "todo", note: "공식 파트너 신청 필요. 개인 계정은 수동 업로드가 현실적." },
            { name: "ffmpeg (이미 tools/ffmpeg)", status: "ok" },
          ]}
          difficulty="쉬움"
          difficultyNote="기존 자산을 자르는 거라 새로 만드는 게 거의 없음. 메타(API) 통과만 시간 들 뿐."
        />
      )}
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
      {tab === "blog" && (
        <ComingSoonLine
          line="blog"
          title="블로그 글 (네이버 블로그 / 티스토리 / Medium)"
          basedOn="03-script 본문을 검색엔진용 긴 글로 재구성."
          autoSteps={[
            "03-script.output.json + 01-benchmark 의 출처 URL 들을 모아 재구성 프롬프트로 Claude 호출",
            "글 구조: H1 제목 / 요약 / 3~5개 H2 섹션 / 표 1~2개 / FAQ 5개 / 출처 링크",
            "이미지: 06-edit 의 thumbnails/ 5장 + 카드 1~2장 삽입",
            "마크다운 + 이미지 zip → 플랫폼별 어댑터로 업로드",
            "내부 링크: '같은 채널의 유튜브 영상 보기' 임베드",
          ]}
          required={[
            { name: "네이버 블로그 글쓰기 API", status: "blocked", note: "현재 공식 글쓰기 OpenAPI는 사실상 닫혀있음 (조회만). 자동 게시는 Selenium 같은 헤드리스 브라우저가 필요. 비추." },
            { name: "Tistory Open API", status: "blocked", note: "2024년 신규 발급 중단. 신규 자동화 비현실." },
            { name: "Medium API", status: "ok", note: "공식 'Integration tokens' 발급 가능. medium.com/me/settings → Integration tokens." },
            { name: "WordPress / Ghost API", status: "ok", note: "본인 도메인이 있다면 가장 자동화 친화적." },
          ]}
          difficulty="조건부 어려움"
          difficultyNote="본인 도메인(WordPress/Ghost) 또는 Medium 이면 쉬움. 네이버 블로그 자동 발행은 비추 (정책 위반 위험). 차선: 마크다운만 자동 생성 → 사람이 복붙."
        />
      )}
    </div>
  );
}
