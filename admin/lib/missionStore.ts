/**
 * 메인 퀘스트 저장소 (서버 전용) — config/missions.json (커밋됨).
 *
 * 최초 실행 시 2026-08-14 에 세운 12주 수익화 플랜을 그대로 심는다.
 * 순서에 근거가 있다: 수익이 빨리 나오는 것부터, 조건을 채워야 열리는 건 뒤로.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CONFIG_DIR } from "./paths";
import type { Mission } from "./mission";

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

type Seed = [chapter: number, title: string, detail: string, reward: string];

const SEEDS: Seed[] = [
  // ── CHAPTER 1 · 문 열기 (1~2주차)
  [1, "네이버 클립 크리에이터 지원서 제출",
    "2026년부터 상시 선발로 바뀌었고 최대 2만 명까지 뽑는다. 이미 주 2~3개 올리고 있으니 지원 안 할 이유가 없다. 이번 주 최우선.",
    "활동비 + 월간 어워즈 (월 최대 90만원 규모) 진입"],
  [1, "체험단 플랫폼 3곳 가입",
    "레뷰 · 아싸뷰 · 모두의체험단. 팔로워가 적어도 되고 육아 카테고리는 모집이 많다.",
    "건당 2~3만원짜리 일감 목록 확보"],
  [1, "블로그 현재 글 개수 세기",
    "애드포스트 조건이 '개설 90일 + 글 50개'다. 지금 몇 개인지 알아야 언제 신청할지 정할 수 있다.",
    "애드포스트까지 남은 거리 확인"],
  [1, "육아휴직 중 부수입 기준 확인 (고용센터)",
    "제휴 수익·원고료도 소득이라 육아휴직 급여에 영향이 있을 수 있다. 나중에 알면 곤란해지는 종류라 먼저 확인한다.",
    "마음 놓고 벌 수 있는 상한선 파악"],

  // ── CHAPTER 2 · 첫 수익 (3~4주차)
  [2, "육아용품 체험단 첫 신청",
    "본인이 실사용자인 카테고리로. 당첨되면 제품이 오고, 그 제품이 곧 소재가 된다.",
    "제품 현물 + 원고료"],
  [2, "첫 체험단 글 발행 (블로그 + 클립 동시)",
    "제품 하나로 블로그 글 1편과 클립 1개를 같이 만든다. 이 패턴이 시즌 전체의 기본 단위다.",
    "원고료 첫 입금 + 클립 미션 참여"],
  [2, "블로그 쿠팡 링크·고지문구 점검",
    "'이 포스팅은 쿠팡 파트너스 활동의 일환으로 수수료를 제공받습니다' 누락 시 계정이 정지될 수 있다. 체험단 글은 대가성 표시도 별도로 필요하다(공정위 지침).",
    "제재 위험 제거"],

  // ── CHAPTER 3 · 리듬 만들기 (5~8주차)
  [3, "체험단 4건 완료 (주 1건)",
    "새로운 걸 시도하지 말고 2챕터에서 만든 패턴을 그대로 네 번 반복한다. 지루한 게 정상이고, 지루한 구간을 넘기는 게 이 시즌의 진짜 과제다.",
    "월 8~12만원 리듬 확보"],
  [3, "클립 미션 4주 연속 참여",
    "이달의 해시태그 미션 / 활동 미션을 빠뜨리지 않는다. 연속성이 어워즈 후보 조건이 된다.",
    "월간 어워즈 후보권"],
  [3, "쿠팡 누적 거래액 확인",
    "최종승인 기준이 누적 판매금액 15만원(수수료 아님, 거래액). 육아용품은 단가가 높아 몇 건이면 닿는다.",
    "15만원까지 남은 거리 확인"],

  // ── CHAPTER 4 · 회수 (9~12주차)
  [4, "애드포스트 신청",
    "90일 + 글 50개를 채웠으면 신청. 심사 1~2주. RPM 300~1,500원이라 액수는 작지만 한 번 붙이면 자동이다. 기대는 낮게.",
    "자동 광고 수익 (소액)"],
  [4, "쿠팡 최종승인 확인 → API 키 발급",
    "15만원을 넘기면 대시보드에 API 키 발급 버튼이 생긴다. 여기부터 링크 생성을 자동화할 수 있다.",
    "제휴링크 자동화 개방"],
  [4, "네이버 인플루언서 지원 검토",
    "프리미엄광고·헤드뷰는 애드포스트보다 단가가 높다. 유아 분야는 프리미엄 신청 대상에 명시돼 있다.",
    "광고 단가 상승 + 브랜드 커넥트 매칭"],
];

function seedMissions(): Mission[] {
  const perChapter: Record<number, number> = {};
  return SEEDS.map(([chapter, title, detail, reward]) => {
    perChapter[chapter] = (perChapter[chapter] ?? 0) + 1;
    return {
      id: newId(),
      chapter,
      title,
      detail,
      reward,
      order: perChapter[chapter] - 1,
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
  chapter: number;
  title: string;
  detail?: string;
  reward?: string;
}): Mission[] {
  const missions = loadMissions();
  const order = missions.filter((m) => m.chapter === input.chapter).length;
  missions.push({
    id: newId(),
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
  patch: Partial<Pick<Mission, "title" | "detail" | "reward" | "chapter" | "doneDate">>
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
