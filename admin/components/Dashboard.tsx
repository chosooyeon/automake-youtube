"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import YoutubeWorkspace from "./YoutubeWorkspace";
import BlogGenerator from "./BlogGenerator";
import BlogProgressBar from "./BlogProgressBar";
import EmoticonStudio from "./EmoticonStudio";
import InstagramWorkspace from "./InstagramWorkspace";
import InstagramProgressBar from "./InstagramProgressBar";
import CinemaStudio from "./CinemaStudio";
import ChatPanel from "./ChatPanel";
import StockAlertDashboard from "./StockAlertDashboard";
import QuestBoard from "./QuestBoard";
import ProjectBrief from "./ProjectBrief";

type Tab =
  | "stock"
  | "quest"
  | "brief"
  | "youtube"
  | "instacard"
  | "blog"
  | "emoticon"
  | "cinema"
  | "chat";

// 순서가 곧 우선순위다. 매일 장 마감마다 보는 화면이 맨 앞이라야 클릭이 줄어든다.
// **여기 적힌 순서는 기본값일 뿐**이고, 실제 순서는 드래그로 바꿔 localStorage 에 남는다
// (아래 ORDER_KEY). 화면 순서가 코드와 다르면 저장된 순서를 먼저 의심할 것.
const TABS: { id: Tab; label: string; status: "live" | "planned" }[] = [
  { id: "stock", label: "📈 주식 매매", status: "live" },
  { id: "quest", label: "✅ 데일리 퀘스트", status: "live" },
  { id: "brief", label: "🗂️ 프로젝트 설명", status: "live" },
  { id: "youtube", label: "🎬 유튜브", status: "live" },
  { id: "instacard", label: "🟪 인스타 카드 피드", status: "live" },
  { id: "blog", label: "📝 블로그 글 (네이버)", status: "live" },
  { id: "emoticon", label: "🎨 이모티콘 (마켓 등록)", status: "live" },
  { id: "cinema", label: "🎭 시나리오 (감독 모드)", status: "live" },
  { id: "chat", label: "💬 클로드 대화", status: "live" },
];

/** 탭 순서는 사람마다·시기마다 다르다. 서버에 둘 만한 값이 아니라 브라우저에 남긴다 */
const ORDER_KEY = "dashboard.tabOrder";

const DEFAULT_ORDER: Tab[] = TABS.map((t) => t.id);

function tabMeta(id: Tab) {
  return TABS.find((t) => t.id === id)!;
}

/**
 * 저장된 순서를 코드의 탭 목록과 맞춘다.
 * 없어진 탭은 버리고, 코드에 새로 생긴 탭은 뒤에 붙인다 —
 * 그래야 탭을 추가/삭제해도 저장값 때문에 화면이 깨지지 않는다.
 */
function mergeOrder(saved: unknown): Tab[] {
  if (!Array.isArray(saved)) return DEFAULT_ORDER;
  const known = saved.filter(
    (id, i): id is Tab => DEFAULT_ORDER.includes(id as Tab) && saved.indexOf(id) === i
  );
  if (!known.length) return DEFAULT_ORDER;
  return [...known, ...DEFAULT_ORDER.filter((id) => !known.includes(id))];
}

export default function Dashboard() {
  const [order, setOrder] = useState<Tab[]>(DEFAULT_ORDER);
  const [tab, setTab] = useState<Tab>(DEFAULT_ORDER[0]);
  const [dragging, setDragging] = useState<Tab | null>(null);
  /** 드래그 직후 click 이 따라오는 브라우저가 있어 탭이 튀는 걸 막는다 */
  const moved = useRef(false);

  // 저장된 순서는 마운트 후에 읽는다 — SSR 결과와 달라져 hydration 이 깨지지 않도록
  useEffect(() => {
    try {
      const next = mergeOrder(JSON.parse(localStorage.getItem(ORDER_KEY) ?? "null"));
      setOrder(next);
      setTab(next[0]); // 맨 앞이 기본 탭이라는 규칙은 드래그 후에도 그대로
    } catch {
      /* 저장값이 깨졌으면 기본 순서로 */
    }
  }, []);

  const persist = useCallback((next: Tab[]) => {
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(next));
    } catch {
      /* 사파리 프라이빗 모드 등 — 순서만 못 남을 뿐 화면은 그대로 */
    }
  }, []);

  /** 끌고 있는 탭을 지나가는 탭 자리로 즉시 옮긴다 (드롭 전에 결과가 보이도록) */
  const dragOver = useCallback(
    (overId: Tab) => {
      if (!dragging || dragging === overId) return;
      setOrder((cur) => {
        const from = cur.indexOf(dragging);
        const to = cur.indexOf(overId);
        if (from < 0 || to < 0 || from === to) return cur;
        const next = cur.slice();
        next.splice(to, 0, next.splice(from, 1)[0]);
        return next;
      });
      moved.current = true;
    },
    [dragging]
  );

  const reset = () => {
    setOrder(DEFAULT_ORDER);
    setTab(DEFAULT_ORDER[0]);
    persist(DEFAULT_ORDER);
  };

  const reordered = order.join() !== DEFAULT_ORDER.join();

  return (
    <div className="space-y-6">
      <BlogProgressBar
        currentTabIsBlog={tab === "blog"}
        onJumpToBlog={() => setTab("blog")}
      />
      <InstagramProgressBar
        currentTabIsInsta={tab === "instacard"}
        onJumpToInsta={() => setTab("instacard")}
      />
      <div className="flex items-end gap-1 border-b border-line overflow-x-auto">
        {order.map((id) => {
          const t = tabMeta(id);
          return (
            <button
              key={t.id}
              draggable
              title="드래그해서 순서를 바꿀 수 있습니다"
              onDragStart={() => {
                setDragging(t.id);
                moved.current = false;
              }}
              onDragEnter={() => dragOver(t.id)}
              onDragOver={(e) => e.preventDefault()} // 이게 없으면 드롭이 허용되지 않는다
              onDragEnd={() => {
                setDragging(null);
                persist(order);
              }}
              onClick={() => {
                if (moved.current) {
                  moved.current = false;
                  return;
                }
                setTab(t.id);
              }}
              className={
                "px-4 py-2.5 text-sm rounded-t-lg border border-b-0 transition shrink-0 " +
                "cursor-grab active:cursor-grabbing " +
                (dragging === t.id ? "opacity-40 " : "") +
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
          );
        })}
        {reordered && (
          <button
            onClick={reset}
            title="탭 순서를 코드 기본값으로 되돌립니다"
            className="ml-auto mb-1.5 px-2 py-1 rounded border border-line text-[11px] text-subtext hover:text-text shrink-0"
          >
            순서 초기화
          </button>
        )}
      </div>

      {tab === "stock" && <StockAlertDashboard />}
      {tab === "quest" && <QuestBoard />}
      {tab === "brief" && <ProjectBrief />}
      {tab === "youtube" && <YoutubeWorkspace />}
      <div className={tab === "instacard" ? "" : "hidden"}>
        <InstagramWorkspace />
      </div>
      <div className={tab === "blog" ? "" : "hidden"}>
        <BlogGenerator />
      </div>
      {tab === "emoticon" && <EmoticonStudio />}
      {tab === "cinema" && <CinemaStudio />}
      {/* 스트리밍 중 탭을 옮겨도 대화가 끊기지 않도록 언마운트하지 않는다 */}
      <div className={tab === "chat" ? "" : "hidden"}>
        <ChatPanel />
      </div>
    </div>
  );
}
