"use client";

import { useState } from "react";
import YoutubeWorkspace from "./YoutubeWorkspace";
import BlogGenerator from "./BlogGenerator";
import BlogProgressBar from "./BlogProgressBar";
import EmoticonStudio from "./EmoticonStudio";
import InstagramCardGenerator from "./InstagramCardGenerator";
import InstagramProgressBar from "./InstagramProgressBar";
import CinemaStudio from "./CinemaStudio";
import ChatPanel from "./ChatPanel";
import StockAlertDashboard from "./StockAlertDashboard";
import QuestBoard from "./QuestBoard";

type Tab =
  | "quest"
  | "youtube"
  | "instacard"
  | "blog"
  | "emoticon"
  | "cinema"
  | "stock"
  | "chat";

const TABS: { id: Tab; label: string; status: "live" | "planned" }[] = [
  { id: "quest", label: "✅ 데일리 퀘스트", status: "live" },
  { id: "youtube", label: "🎬 유튜브", status: "live" },
  { id: "instacard", label: "🟪 인스타 카드 피드", status: "live" },
  { id: "blog", label: "📝 블로그 글 (네이버)", status: "live" },
  { id: "emoticon", label: "🎨 이모티콘 (마켓 등록)", status: "live" },
  { id: "cinema", label: "🎭 시나리오 (감독 모드)", status: "live" },
  { id: "stock", label: "📈 주식 매매 알림", status: "live" },
  { id: "chat", label: "💬 클로드 대화", status: "live" },
];

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("quest");

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

      {tab === "quest" && <QuestBoard />}
      {tab === "youtube" && <YoutubeWorkspace />}
      <div className={tab === "instacard" ? "" : "hidden"}>
        <InstagramCardGenerator />
      </div>
      <div className={tab === "blog" ? "" : "hidden"}>
        <BlogGenerator />
      </div>
      {tab === "emoticon" && <EmoticonStudio />}
      {tab === "cinema" && <CinemaStudio />}
      {tab === "stock" && <StockAlertDashboard />}
      {/* 스트리밍 중 탭을 옮겨도 대화가 끊기지 않도록 언마운트하지 않는다 */}
      <div className={tab === "chat" ? "" : "hidden"}>
        <ChatPanel />
      </div>
    </div>
  );
}
