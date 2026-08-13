"use client";

import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

type Theme = "light" | "dark";

/**
 * html 에 .dark 클래스를 켜고 끈다. 기본값은 라이트.
 * 첫 페인트 전 적용은 layout.tsx 의 인라인 스크립트가 담당(FOUC 방지),
 * 여기서는 저장된 값을 읽어 버튼 상태만 맞춘다.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* 사파리 프라이빗 모드 등에서 실패해도 토글 자체는 동작 */
    }
  }

  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "라이트 모드로" : "다크 모드로"}
      aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className="border border-line bg-panel2 text-subtext hover:text-text hover:border-accent/50 rounded-md px-2.5 py-1.5 text-sm transition"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
