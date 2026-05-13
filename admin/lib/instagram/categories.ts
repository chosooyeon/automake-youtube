export type CategoryId = "parenting_subsidy" | "youth_subsidy" | "stocks";

export interface CategoryDef {
  id: CategoryId;
  label: string;
  sub: string;
  /** 카드 포인트 컬러 (헤드라인 강조·아이콘) */
  accent: string;
  /** 본문 강조시 보조 컬러 */
  accentSoft: string;
  /** 본문 카피 톤 가이드 (Claude 프롬프트용) */
  toneGuide: string;
  /** 출처 우선순위 도메인 (Claude 프롬프트용) */
  preferredSources: string[];
  /** Gemini 배경 이미지 스타일 (텍스트 없는 배경 전용) */
  backgroundStyle: string;
  /** 푸터에 표시되는 공식 출처 라벨 prefix. 예: '출처: 정부24' */
  defaultSourceLabel: string;
}

export const CATEGORY_LIST: CategoryDef[] = [
  {
    id: "parenting_subsidy",
    label: "육아 정부지원금",
    sub: "출산축하금 · 부모급여 · 첫만남이용권 · 어린이집 보육료",
    accent: "#F4A261",
    accentSoft: "#FBE3CC",
    toneGuide:
      "따뜻하고 안심되는 톤. 육아맘 입장에서 '놓치면 안되는 정보'라는 안전감 강조. 신청자격·금액·기한을 명확히 정리. 전문 용어는 풀어쓰기.",
    preferredSources: [
      "bokjiro.go.kr",
      "gov.kr",
      "mohw.go.kr",
      "childcare.go.kr",
      "moel.go.kr",
      "seoul.go.kr",
      "각 지자체 .go.kr",
    ],
    backgroundStyle:
      "soft warm coral and cream gradient, gentle abstract organic shapes, lots of negative space at center, professional instagram card background, no text, no people, no logos, minimalist",
    defaultSourceLabel: "출처: 정부24·복지로",
  },
  {
    id: "youth_subsidy",
    label: "청년 정부지원금",
    sub: "청년도약계좌 · 청년월세 · 청년취업 · 국민취업지원",
    accent: "#14B8A6",
    accentSoft: "#CCF2EC",
    toneGuide:
      "활기차고 명확한 톤. 청년 입장에서 '내가 받을 수 있나' 가장 빨리 확인되도록. 자격(나이·소득)·지원금액·신청기한 3축으로 압축.",
    preferredSources: [
      "bokjiro.go.kr",
      "gov.kr",
      "youthcenter.go.kr",
      "kinfa.or.kr",
      "moel.go.kr",
      "work.go.kr",
      "각 지자체 .go.kr",
    ],
    backgroundStyle:
      "fresh mint and cream gradient, modern minimal geometric shapes, lots of negative space at center, professional instagram card background, no text, no people, no logos, clean",
    defaultSourceLabel: "출처: 정부24·청년센터",
  },
  {
    id: "stocks",
    label: "주식 정보",
    sub: "ETF · 배당 · 시장 동향 (정보 제공만, 투자 권유 아님)",
    accent: "#E0B14C",
    accentSoft: "#F5E2B8",
    toneGuide:
      "신중하고 데이터 중심 톤. '투자 판단은 본인 책임' 명시. 숫자·기간·출처를 항상 같이. 종목 추천·매수 권유 금지. 일반 정보·교육 차원으로만.",
    preferredSources: [
      "krx.co.kr",
      "fss.or.kr",
      "bok.or.kr",
      "kostat.go.kr",
      "각 운용사 공식 보고서",
    ],
    backgroundStyle:
      "elegant deep navy and muted gold gradient, subtle abstract pattern, lots of negative space at center, professional instagram card background, no text, no charts, no people, no logos, sophisticated",
    defaultSourceLabel: "출처: KRX·금감원",
  },
];

export function getCategory(id: CategoryId): CategoryDef {
  const c = CATEGORY_LIST.find((x) => x.id === id);
  if (!c) throw new Error(`unknown category: ${id}`);
  return c;
}

export const CARD_COLORS = {
  background: "#FAF7F2",
  headline: "#0F1F3A",
  body: "#3F4756",
  subtext: "#6B7280",
  white: "#FFFFFF",
  /** 카드 위 부드러운 반투명 오버레이 (텍스트 가독성용) */
  overlayWhite: "rgba(250, 247, 242, 0.78)",
} as const;
