"use client";

import { useState } from "react";
import LongFormDashboard from "./LongFormDashboard";
import TopicQueue from "./TopicQueue";
import ShortsDashboard from "./ShortsDashboard";
import NicheSelector from "./NicheSelector";
import BlogGenerator from "./BlogGenerator";
import BlogProgressBar from "./BlogProgressBar";
import EmoticonStudio from "./EmoticonStudio";
import InstagramCardGenerator from "./InstagramCardGenerator";
import InstagramProgressBar from "./InstagramProgressBar";
import CinemaStudio from "./CinemaStudio";

type Tab = "topics" | "longform" | "shorts" | "instacard" | "blog" | "emoticon" | "cinema";

const TABS: { id: Tab; label: string; status: "live" | "planned" }[] = [
  { id: "topics", label: "💡 주제 큐 (0번)", status: "live" },
  { id: "longform", label: "🎬 롱폼 (YouTube 8~10분)", status: "live" },
  { id: "shorts", label: "📱 숏폼 (YouTube Shorts)", status: "live" },
  { id: "instacard", label: "🟪 인스타 카드 피드", status: "live" },
  { id: "blog", label: "📝 블로그 글 (네이버)", status: "live" },
  { id: "emoticon", label: "🎨 이모티콘 (마켓 등록)", status: "live" },
  { id: "cinema", label: "🎭 시나리오 (감독 모드)", status: "live" },
];

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("topics");
  const [nicheKey, setNicheKey] = useState(0);

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
      <div className={tab === "instacard" ? "" : "hidden"}>
        <InstagramCardGenerator />
      </div>
      <div className={tab === "blog" ? "" : "hidden"}>
        <BlogGenerator />
      </div>
      {tab === "emoticon" && <EmoticonStudio />}
      {tab === "cinema" && <CinemaStudio />}
    </div>
  );
}
