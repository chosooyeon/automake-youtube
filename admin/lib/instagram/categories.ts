export type CategoryId = "parenting_subsidy" | "youth_subsidy" | "stocks" | "it_news";

export interface CategoryDef {
  id: CategoryId;
  label: string;
  sub: string;
  /** 슬러그·파일명에 쓰이는 짧은 식별자 */
  short: string;
  /** 카드 포인트 컬러 (헤드라인 강조·아이콘) */
  accent: string;
  /** 본문 강조시 보조 컬러 */
  accentSoft: string;
  /** 프롬프트 첫 줄 — 이 봇이 무슨 도메인을 다루는지 */
  domainIntro: string;
  /** WebSearch 사실검증 규칙 (카테고리마다 "공식 출처" 정의가 다름) */
  verifyRule: string;
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
    short: "parent",
    accent: "#F4A261",
    accentSoft: "#FBE3CC",
    domainIntro: "너는 한국 육아 정부지원금·제도 정보를 인스타그램 카드뉴스로 큐레이션하는 어시스턴트야.",
    verifyRule:
      "정부 공식 .go.kr (복지로·정부24·보건복지부·지자체) 문서를 1순위로 확인한다. 언론 기사만으로는 확정하지 말고 반드시 공식 페이지를 교차 확인할 것.",
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
    short: "youth",
    accent: "#14B8A6",
    accentSoft: "#CCF2EC",
    domainIntro: "너는 한국 청년 정부지원금·제도 정보를 인스타그램 카드뉴스로 큐레이션하는 어시스턴트야.",
    verifyRule:
      "정부 공식 .go.kr (복지로·정부24·청년센터·고용노동부·서민금융진흥원) 문서를 1순위로 확인한다. 언론 기사만으로는 확정하지 말고 반드시 공식 페이지를 교차 확인할 것.",
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
    short: "stocks",
    accent: "#E0B14C",
    accentSoft: "#F5E2B8",
    domainIntro:
      "너는 주식·ETF 시장 정보를 인스타그램 카드뉴스로 큐레이션하는 어시스턴트야. 투자 권유가 아닌 정보 전달 목적이다.",
    verifyRule:
      "KRX·금감원·한국은행·통계청·운용사 공식 자료를 1순위로 확인한다. 수치는 반드시 기준일과 함께 표기하고, 확인 안 된 전망·목표주가는 절대 카드에 넣지 말 것.",
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
  {
    id: "it_news",
    label: "해외 IT·AI 뉴스",
    sub: "빅테크 · AI 신모델 · 신제품 · 개발자 소식",
    short: "itnews",
    accent: "#6366F1",
    accentSoft: "#DDDCFB",
    domainIntro:
      "너는 해외 IT·AI 뉴스를 한국 일반 독자용 인스타그램 카드뉴스로 번역·큐레이션하는 어시스턴트야.",
    verifyRule:
      "원문 기사(The Verge·Ars Technica·TechCrunch·Reuters 등)와 기업 공식 발표(공식 블로그·뉴스룸·SEC 공시)를 확인한다. 루머·유출·'~라는 소문' 은 카드에 넣지 말고, 공식 확인된 것만 쓴다. 확정 안 된 내용을 굳이 다뤄야 하면 카드에 '아직 미확정' 을 명시할 것.",
    toneGuide:
      "쉽고 빠른 톤. 영어 기술용어는 반드시 한국어로 풀어쓰고 원어를 괄호로 병기. 매 본문 카드에 '그래서 나한테 뭐가 달라지나' 한 줄을 반드시 포함. 과장·클릭베이트 금지, 회사명·제품명·날짜는 정확하게.",
    preferredSources: [
      "theverge.com",
      "arstechnica.com",
      "techcrunch.com",
      "reuters.com",
      "news.ycombinator.com",
      "openai.com/blog",
      "anthropic.com/news",
      "blog.google",
      "각 기업 공식 뉴스룸",
    ],
    backgroundStyle:
      "deep indigo and violet gradient with subtle glowing grid lines, abstract futuristic tech texture, lots of negative space at center, professional instagram card background, no text, no logos, no devices, clean",
    defaultSourceLabel: "출처: 원문 기사",
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
