/**
 * 아이디어 파킹 저장소 (서버 전용) — config/ideas.json (커밋됨).
 *
 * 최초 실행 시 2026-08-13 대화에서 쏟아낸 아이디어 43개를 그대로 심는다.
 * 목록을 줄이거나 판단해서 거르지 않았다. 파킹판의 첫 번째 효용은
 * "머릿속에 떠다니는 걸 전부 밖으로 꺼내놓는 것" 이기 때문이다.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CONFIG_DIR } from "./paths";
import { CATEGORY_IDS, STATUS_IDS, type CategoryId, type Idea, type StatusId } from "./idea";

const IDEAS_FILE = path.join(CONFIG_DIR, "ideas.json");

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
  return "i_" + crypto.randomBytes(4).toString("hex");
}

type Seed = [CategoryId, string, string?, StatusId?];

const SEEDS: Seed[] = [
  // ── 콘텐츠 소재 ────────────────────────────────────────────
  ["content", "책 추천 콘텐츠", "카드뉴스로 자동화 — 이미 있는 인스타 파이프라인 재활용"],
  ["content", "게임 추천 콘텐츠"],
  ["content", "AI · IT 활용법 콘텐츠", "본편 후보. 파이프라인 궁합이 가장 좋고 기존 전문성이 그대로 권위가 된다"],
  ["content", "음악 플레이리스트 콘텐츠"],
  ["content", "오늘 뭐 샀지", "다이소 하울 · 옷 구매 후기 · 임신/육아용품 언박싱"],
  ["content", "오늘 어디 갔지", "카페 방문 · 산책 · 맛집 기록"],
  ["content", "오늘 뭐 먹었지", "간단 요리 과정 · 배달음식 리뷰 · 임산부 식단 기록"],
  ["content", "다이소에서 발견한 갓성비 템 3가지"],
  ["content", "임신 확인 후 처음 구매한 것들 (솔직후기)"],
  ["content", "집순이의 평범한 주말 브이로그", "오늘 뭐하지?"],
  ["content", "해외 타겟 감성문구 · 동기부여 숏츠"],
  ["content", "명언 · 건강 정보 · 트로트 소식", "중장년 타겟"],
  ["content", "AI 아바타 숏폼"],
  ["content", "저작권 없는 만화 쇼츠"],
  ["content", "Suno AI 노래 플레이리스트", "작사·작곡까지 → 재즈 AI 노래 롱폼으로 확장"],
  ["content", "육아일기 웹툰"],
  ["content", "유아 동화책 읽어주기 롱폼"],
  ["content", "예능짤 · 연예인짤 덧글 모음", "소스와 저작권을 먼저 확인해야 함 → [알아볼 것] 참고"],
  ["content", "주식 뉴스"],
  ["content", "정부 지원금 정보"],
  ["content", "내가 확인할 경제뉴스"],
  ["content", "경제 · 과학 · 심리학 · 역사", "지식 채널 축. 현재 니치가 psychology 라 여기서 이어짐"],
  ["content", "썰 쇼츠 → 육아용품 숏츠로 전환", "쿠팡/네이버 파트너스와 묶으면 수익 연결"],

  // ── 자동화 · 파이프라인 ────────────────────────────────────
  ["automation", "카드뉴스 공장 돌리기", "사람 손 없이 수집→생성→업로드까지"],
  ["automation", "숏츠 제품 하나 캡쳐 → 양산화 숏츠"],
  ["automation", "4×4 이모티콘 제작"],
  ["automation", "사진 찍은 걸로 이미지화해서 이모티콘"],
  ["automation", "레퍼런스 수집 → 자동 전략·기획·검수·제작", "이 저장소가 최종적으로 가려는 방향"],
  ["automation", "이모티콘 제작 + 마켓 업로드 자동화"],

  // ── 앱 · 제품 ──────────────────────────────────────────────
  ["product", "육아 기록 앱"],
  ["product", "내 TODO 기록 웹", "2026-08-13 admin 데일리 퀘스트 탭으로 완성", "done"],
  ["product", "이유식 앱", "본인이 유저인 게 강점. 만들어 파는 것보다 만드는 과정을 콘텐츠로"],
  ["product", "토스 앱 미니게임", "만드는 과정 자체를 AI/IT 콘텐츠 소재로"],

  // ── 수익화 ────────────────────────────────────────────────
  ["money", "타로 수익화"],
  ["money", "전자책 자동화 수익구조"],
  ["money", "이모티콘 자동화 프로그램 판매"],
  ["money", "인스타 카드뉴스 자동 업로드 프로그램 판매"],
  ["money", "쿠팡 파트너스 · 네이버 파트너스 붙이기", "육아용품 숏츠에 연결"],

  // ── 브랜드 원칙 (아이디어가 아니라 지켜야 할 규칙) ──────────
  ["brand", "브랜드를 어떻게 만드는가", "주제가 아니라 사람·서사로 정의해야 주제를 갈아껴도 브랜드가 산다"],
  ["brand", "비주얼 톤앤매너 — 폰트·자막 위치 고정", "이건 아이디어가 아니라 이번 시즌에 바로 지킬 규칙"],
  ["brand", "AI 나레이션 · 썸네일 통일감"],

  // ── 알아볼 것 ──────────────────────────────────────────────
  ["research", "AI 일감 중개 업체 구조", "영업으로 일 따옴 → 블로그 외주 → 수수료? 실제로 그런 업체가 있는지, 마진 구조가 어떤지"],
  ["research", "예능짤 · 연예인짤 덧글 모음 소스", "어디서 가져오는지 + 저작권이 되는지부터"],
];

function seedIdeas(): Idea[] {
  const now = new Date().toISOString();
  return SEEDS.map(([category, title, note, status]) => ({
    id: newId(),
    title,
    note: note ?? "",
    category,
    status: status ?? ("parked" as StatusId),
    createdAt: now,
    updatedAt: now,
  }));
}

function normalize(raw: unknown): Idea[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is Idea => Boolean(i) && typeof (i as Idea).id === "string")
    .map((i) => ({
      id: i.id,
      title: String(i.title ?? ""),
      note: String(i.note ?? ""),
      category: (CATEGORY_IDS.includes(i.category) ? i.category : "content") as CategoryId,
      status: (STATUS_IDS.includes(i.status) ? i.status : "parked") as StatusId,
      createdAt: i.createdAt ?? new Date().toISOString(),
      updatedAt: i.updatedAt ?? new Date().toISOString(),
    }));
}

export function loadIdeas(): Idea[] {
  if (!fs.existsSync(IDEAS_FILE)) {
    const seeded = seedIdeas();
    writeJson(IDEAS_FILE, seeded);
    return seeded;
  }
  return normalize(readJson<unknown>(IDEAS_FILE, []));
}

export function saveIdeas(ideas: Idea[]): void {
  writeJson(IDEAS_FILE, ideas);
}

export function addIdea(input: { title: string; category: CategoryId; note?: string }): Idea[] {
  const ideas = loadIdeas();
  const now = new Date().toISOString();
  // 새 아이디어는 맨 위로 — 방금 적은 걸 바로 확인할 수 있게
  ideas.unshift({
    id: newId(),
    title: input.title,
    note: input.note ?? "",
    category: input.category,
    status: "parked",
    createdAt: now,
    updatedAt: now,
  });
  saveIdeas(ideas);
  return ideas;
}

export function updateIdea(
  id: string,
  patch: Partial<Pick<Idea, "title" | "note" | "category" | "status">>
): Idea[] {
  const ideas = loadIdeas();
  const it = ideas.find((i) => i.id === id);
  if (it) Object.assign(it, patch, { updatedAt: new Date().toISOString() });
  saveIdeas(ideas);
  return ideas;
}

export function deleteIdea(id: string): Idea[] {
  const ideas = loadIdeas().filter((i) => i.id !== id);
  saveIdeas(ideas);
  return ideas;
}
