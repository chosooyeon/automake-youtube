"use client";

import { useState } from "react";
import InstagramCardGenerator from "./InstagramCardGenerator";
import ToonBoard from "./ToonBoard";

type SubTab = "cards" | "toon";

const SUB_TABS: { id: SubTab; label: string; hint: string }[] = [
  { id: "cards", label: "🗞️ 카드뉴스", hint: "뉴스 RSS → 카드 이미지" },
  { id: "toon", label: "✏️ 인스타툰", hint: "내 캐릭터로 컷툰" },
];

export default function InstagramWorkspace() {
  const [sub, setSub] = useState<SubTab>("cards");
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

      {/* 생성 진행 중인 작업이 끊기지 않도록 서브탭을 옮겨도 언마운트하지 않는다 */}
      <div className={sub === "cards" ? "" : "hidden"}>
        <InstagramCardGenerator />
      </div>
      <div className={sub === "toon" ? "" : "hidden"}>
        <ToonBoard />
      </div>
    </div>
  );
}
