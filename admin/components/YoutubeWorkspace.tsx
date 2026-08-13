"use client";

import { useState } from "react";
import TopicQueue from "./TopicQueue";
import LongFormDashboard from "./LongFormDashboard";
import ShortsDashboard from "./ShortsDashboard";

type SubTab = "topics" | "longform" | "shorts";

const SUB_TABS: { id: SubTab; label: string; hint: string }[] = [
  { id: "topics", label: "① 주제 큐", hint: "0번 봇 — 주제 추천 · 승인" },
  { id: "longform", label: "② 롱폼", hint: "8~10분 영상 · 01~06 봇" },
  { id: "shorts", label: "③ 숏폼", hint: "Shorts · S1~S4 봇 (부모 롱폼 필요)" },
];

export default function YoutubeWorkspace() {
  const [sub, setSub] = useState<SubTab>("topics");
  const current = SUB_TABS.find((t) => t.id === sub)!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            title={t.hint}
            className={
              "rounded-lg border px-4 py-2 text-sm transition " +
              (sub === t.id
                ? "bg-accent border-accent text-bg font-medium"
                : "bg-panel border-line text-subtext hover:text-text hover:bg-panel2")
            }
          >
            {t.label}
          </button>
        ))}
        <span className="text-xs text-subtext ml-1">{current.hint}</span>
      </div>

      {/* 서브탭을 옮겨도 선택한 프로젝트·로그가 유지되도록 언마운트하지 않는다 */}
      <div className={sub === "topics" ? "" : "hidden"}>
        <TopicQueue />
      </div>
      <div className={sub === "longform" ? "" : "hidden"}>
        <LongFormDashboard />
      </div>
      <div className={sub === "shorts" ? "" : "hidden"}>
        <ShortsDashboard />
      </div>
    </div>
  );
}
