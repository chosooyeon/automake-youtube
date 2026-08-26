/**
 * 메인 퀘스트 저장소 (서버 전용) — config/missions.json (커밋됨).
 *
 * 최초 실행 시 두 시즌 플랜을 그대로 심는다:
 *   income — 2026-08-14 에 세운 12주 수익화. 수익이 빨리 나오는 것부터, 조건을 채워야 열리는 건 뒤로.
 *   career — 2026-08-16 에 세운 금융권 이직 12개월 중 블록 1. 실력보다 완주와 언어화가 먼저.
 *
 * 씨앗은 **파일이 없을 때만** 심는다. 이미 있는 파일에 트랙을 덧뿌리지 않는다 —
 * 지운 미션이 되살아나면 사용자가 판을 안 믿게 된다.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CONFIG_DIR } from "./paths";
import { DEFAULT_TRACK, isTrackId, type Mission } from "./mission";

const MISSIONS_FILE = path.join(CONFIG_DIR, "missions.json");

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function newId(): string {
  return "m_" + crypto.randomBytes(4).toString("hex");
}

type Seed = [track: string, chapter: number, title: string, detail: string, reward: string];

const SEEDS: Seed[] = [
  // ══ TRACK income · 12주 수익화 ══
  // ── CHAPTER 1 · 문 열기 (1~2주차)
  ["income", 1, "네이버 클립 크리에이터 지원서 제출",
    "2026년부터 상시 선발로 바뀌었고 최대 2만 명까지 뽑는다. 이미 주 2~3개 올리고 있으니 지원 안 할 이유가 없다. 이번 주 최우선.",
    "활동비 + 월간 어워즈 (월 최대 90만원 규모) 진입"],
  ["income", 1, "체험단 플랫폼 3곳 가입",
    "레뷰 · 아싸뷰 · 모두의체험단. 팔로워가 적어도 되고 육아 카테고리는 모집이 많다.",
    "건당 2~3만원짜리 일감 목록 확보"],
  ["income", 1, "블로그 현재 글 개수 세기",
    "애드포스트 조건이 '개설 90일 + 글 50개'다. 지금 몇 개인지 알아야 언제 신청할지 정할 수 있다.",
    "애드포스트까지 남은 거리 확인"],
  ["income", 1, "육아휴직 중 부수입 기준 확인 (고용센터)",
    "제휴 수익·원고료도 소득이라 육아휴직 급여에 영향이 있을 수 있다. 나중에 알면 곤란해지는 종류라 먼저 확인한다.",
    "마음 놓고 벌 수 있는 상한선 파악"],

  // ── CHAPTER 2 · 첫 수익 (3~4주차)
  ["income", 2, "육아용품 체험단 첫 신청",
    "본인이 실사용자인 카테고리로. 당첨되면 제품이 오고, 그 제품이 곧 소재가 된다.",
    "제품 현물 + 원고료"],
  ["income", 2, "첫 체험단 글 발행 (블로그 + 클립 동시)",
    "제품 하나로 블로그 글 1편과 클립 1개를 같이 만든다. 이 패턴이 시즌 전체의 기본 단위다.",
    "원고료 첫 입금 + 클립 미션 참여"],
  ["income", 2, "블로그 쿠팡 링크·고지문구 점검",
    "'이 포스팅은 쿠팡 파트너스 활동의 일환으로 수수료를 제공받습니다' 누락 시 계정이 정지될 수 있다. 체험단 글은 대가성 표시도 별도로 필요하다(공정위 지침).",
    "제재 위험 제거"],

  // ── CHAPTER 3 · 리듬 만들기 (5~8주차)
  ["income", 3, "체험단 4건 완료 (주 1건)",
    "새로운 걸 시도하지 말고 2챕터에서 만든 패턴을 그대로 네 번 반복한다. 지루한 게 정상이고, 지루한 구간을 넘기는 게 이 시즌의 진짜 과제다.",
    "월 8~12만원 리듬 확보"],
  ["income", 3, "클립 미션 4주 연속 참여",
    "이달의 해시태그 미션 / 활동 미션을 빠뜨리지 않는다. 연속성이 어워즈 후보 조건이 된다.",
    "월간 어워즈 후보권"],
  ["income", 3, "쿠팡 누적 거래액 확인",
    "최종승인 기준이 누적 판매금액 15만원(수수료 아님, 거래액). 육아용품은 단가가 높아 몇 건이면 닿는다.",
    "15만원까지 남은 거리 확인"],

  // ── CHAPTER 4 · 회수 (9~12주차)
  ["income", 4, "애드포스트 신청",
    "90일 + 글 50개를 채웠으면 신청. 심사 1~2주. RPM 300~1,500원이라 액수는 작지만 한 번 붙이면 자동이다. 기대는 낮게.",
    "자동 광고 수익 (소액)"],
  ["income", 4, "쿠팡 최종승인 확인 → API 키 발급",
    "15만원을 넘기면 대시보드에 API 키 발급 버튼이 생긴다. 여기부터 링크 생성을 자동화할 수 있다.",
    "제휴링크 자동화 개방"],
  ["income", 4, "네이버 인플루언서 지원 검토",
    "프리미엄광고·헤드뷰는 애드포스트보다 단가가 높다. 유아 분야는 프리미엄 신청 대상에 명시돼 있다.",
    "광고 단가 상승 + 브랜드 커넥트 매칭"],

  // ══ TRACK career · 금융권 이직 12개월 중 블록 1 (2026-08-16 수립, 08-16 개정) ══
  // 개정 이유: 자격증(정보처리기사)을 마감일 장치로 넣었는데 본인이 암기에 취약하다.
  // 마감일은 실제 채용공고 마감으로도 만들 수 있고, 그쪽이 정보량이 훨씬 크다
  // (합격증 1장 vs "내 서류가 어디서 걸리는지"). 암기는 한 줄도 남기지 않는다.
  // ── CHAPTER 1 · 판 확인하기 (1~2주차) — 지원 안 함. 확인과 읽기만.
  ["career", 1, "복직 부서에 그룹 내 경력공모·사내 전배 제도 문의",
    "현 직장이 금융그룹 계열사라 그룹 내 경력공모·전배가 외부 지원보다 유리한 경로일 수 있다 — 내부 이동은 코테를 안 보거나 약하게 보는 경우가 많다. 받아줄 자리가 그룹 안에 있는지에 따라 나머지 11개월이 통째로 달라지므로 먼저 확인한다. 메일 한 통이면 끝난다.",
    "그룹 안에 자리가 있는지 없는지 판정 — 나머지 계획의 전제"],
  ["career", 1, "복직 예정일 확인 → 거기서 역산한 캘린더",
    "이 12주는 휴직 기간이 아니라 '복직까지 남은 시간'에 걸려 있다. 복직하면 공부 시간이 급감한다. 남은 주 수를 실제로 세어본다.",
    "막연한 1년 → 세어본 주 수"],
  ["career", 1, "채용공고 10개 수집 → 요구사항 표로 (지원 안 함)",
    "전통금융(은행·보험)과 핀테크(토스·카뱅·카카오페이·신생증권)를 5개씩. 읽기만 한다. 뭘 요구하는지 재려는 것이고, 블록 2에서 뭘 공부할지가 추측이 아니라 이 표에서 정해진다.",
    "블록 2 커리큘럼 (내가 추측 안 해도 됨)"],
  ["career", 1, "프로그래머스 계정 + 레벨1 3문제",
    "실력을 재려는 게 아니라 판을 여는 것. 3문제를 다 못 풀어도 연 것 자체가 이 챕터의 목표다.",
    "코테 루틴 0일차"],

  // ── CHAPTER 2 · 물건 만들기 (3~6주차)
  ["career", 2, "이력서 1장 초안 (7년 경력 요약)",
    "완성이 아니라 존재가 목표다. 기회는 준비된 사람에게 오는 게 아니라 이력서가 있는 사람에게 온다. 잘 쓰려고 붙잡고 있다가 영영 못 내는 게 가장 흔한 실패다.",
    "언제든 낼 수 있는 상태"],
  ["career", 2, "코테 주 3문제 × 4주 (레벨1~2)",
    "하루 1~2시간이 현실이다. 육아휴직은 공부 시간이 아니라 아이 보는 시간이니까. 주 3문제면 4주에 12문제. 못 지킨 주가 있어도 다음 주에 그냥 이어서 한다 — 밀린 걸 몰아 하려다 그만두는 게 진짜 실패다.",
    "'나 코테 하는 사람' 정체성"],
  ["career", 2, "주식 자동화 프로젝트 README 채용용으로 정리",
    "백테스트에 워크포워드 검증까지 붙인 건 금융 도메인 이해를 말이 아니라 코드로 증명하는 물건이다. 새로 만들 게 아니라 이미 만든 걸 남이 읽을 수 있게 하는 작업. 수익률이 아니라 '과최적화를 어떻게 걸러냈는가'를 맨 앞에 쓴다.",
    "면접에서 '관심 있습니다' → '돌리고 있습니다'"],

  // ── CHAPTER 3 · 지원 시작 (7~9주차) — 자격증이 있던 자리
  ["career", 3, "9곳 지원 (월 3곳)",
    "붙으려고 내는 게 아니다. 3개월 암기해서 얻는 정보는 합격증 1장이지만, 9곳에 내면 '내 서류가 어디서 걸리는지'가 나온다. 채용공고 마감일이 시험 날짜와 똑같이 외부에서 강제하는 마감이고, 이쪽은 실제 목표와 직결된다. 떨어지는 게 기본값이니 한 곳 한 곳에 마음을 쓰지 않는다.",
    "내 시장 가격 — 추측이 아니라 데이터로"],
  ["career", 3, "지원 결과 기록표 (합·불 + 사유)",
    "9번의 결과를 감정이 아니라 표로 남긴다. 서류에서 걸리는지, 코테에서 걸리는지, 면접에서 걸리는지에 따라 블록 2에 할 일이 완전히 달라진다. 기록이 없으면 '나는 안 되나 봐'만 남는다.",
    "블록 2를 감이 아니라 데이터로 짜기"],
  ["career", 3, "코테 레벨2 유지 (주 3문제)",
    "새 플랫폼이나 새 강의로 갈아타지 않는다. 같은 자리에서 난이도만 올린다. 도구를 바꾸는 건 대개 도망이다.",
    "핀테크 코테 진입선"],

  // ── CHAPTER 4 · 말해보기 (10~12주차)
  ["career", 4, "경력기술서 완성 (회사별 STAR)",
    "'잘해서 이직한 것 같지 않다'는 건 자기 경력을 정리해본 적이 없다는 뜻이다. 회사별로 상황-과제-행동-결과를 적어보면 '어, 나 이만큼 했네'가 나온다. 자신감을 만드는 가장 싼 작업이고, 그대로 면접 대본이 된다.",
    "지원서·면접 대본 원본"],
  ["career", 4, "면접 1회 경험 (붙든 떨어지든)",
    "9곳 중 한 곳이라도 불러주면 그게 이 칸이다. 안 불러주면 모의면접이나 지인 면접으로 대체한다 — 입으로 말해본 적이 있느냐가 다음 면접을 좌우한다. 결과는 이 칸의 조건이 아니다.",
    "'면접 본 적 있는 상태'"],
  ["career", 4, "블록 2 회고 — 9곳 데이터로 다음 3개월 정하기",
    "여기서 블록 2를 짠다. 서류에서 걸렸으면 이력서·포트폴리오, 코테에서 걸렸으면 알고리즘, 면접에서 걸렸으면 언어화. 셋 다면 하나만 고른다. 계획을 고치는 건 실패가 아니라 이 설계의 기본 동작이다.",
    "다음 3개월이 추측이 아니게 됨"],
];

function seedMissions(): Mission[] {
  const perChapter: Record<string, number> = {};
  return SEEDS.map(([track, chapter, title, detail, reward]) => {
    const key = `${track}:${chapter}`;
    perChapter[key] = (perChapter[key] ?? 0) + 1;
    return {
      id: newId(),
      track,
      chapter,
      title,
      detail,
      reward,
      order: perChapter[key] - 1,
      doneDate: null,
    };
  });
}

function normalize(raw: unknown): Mission[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Mission => Boolean(m) && typeof (m as Mission).id === "string")
    .map((m, i) => ({
      id: m.id,
      // track 이 없던 시절의 파일은 전부 수익화 트랙이다
      track: isTrackId(m.track) ? m.track : DEFAULT_TRACK,
      chapter: Number.isFinite(m.chapter) ? m.chapter : 1,
      title: String(m.title ?? ""),
      detail: String(m.detail ?? ""),
      reward: String(m.reward ?? ""),
      order: Number.isFinite(m.order) ? m.order : i,
      doneDate: m.doneDate ?? null,
    }));
}

export function loadMissions(): Mission[] {
  if (!fs.existsSync(MISSIONS_FILE)) {
    const seeded = seedMissions();
    writeJson(MISSIONS_FILE, seeded);
    return seeded;
  }
  return normalize(readJson<unknown>(MISSIONS_FILE, []));
}

export function saveMissions(missions: Mission[]): void {
  writeJson(MISSIONS_FILE, missions);
}

export function addMission(input: {
  track: string;
  chapter: number;
  title: string;
  detail?: string;
  reward?: string;
}): Mission[] {
  const missions = loadMissions();
  const order = missions.filter(
    (m) => m.track === input.track && m.chapter === input.chapter
  ).length;
  missions.push({
    id: newId(),
    track: input.track,
    chapter: input.chapter,
    title: input.title,
    detail: input.detail ?? "",
    reward: input.reward ?? "",
    order,
    doneDate: null,
  });
  saveMissions(missions);
  return missions;
}

export function updateMission(
  id: string,
  patch: Partial<Pick<Mission, "title" | "detail" | "reward" | "track" | "chapter" | "doneDate">>
): Mission[] {
  const missions = loadMissions();
  const m = missions.find((x) => x.id === id);
  if (m) Object.assign(m, patch);
  saveMissions(missions);
  return missions;
}

export function deleteMission(id: string): Mission[] {
  const missions = loadMissions().filter((m) => m.id !== id);
  saveMissions(missions);
  return missions;
}
