"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type JobStatus = "idle" | "running" | "done" | "error";

export type VerifyStatus = "ok" | "warn" | "unknown" | "bad";

export interface VerifyItem {
  claim: string;
  status: VerifyStatus;
  note: string;
  correction: string;
  sources: string[];
}

export interface GenerateResult {
  titles: string[];
  category_label: string;
  content_markdown: string;
  photo_spots: { index: number; description: string }[];
  hashtags: string[];
  char_count_excl_space?: number;
  verify_summary?: string;
  verify_items?: VerifyItem[];
}

/** 더 이상 사용 안 함 — 검증은 generate 안에서 같이 수행됨. 타입은 호환성 위해 유지. */
export interface VerifyResult {
  items: VerifyItem[];
  summary: string;
}

interface JobState<T> {
  status: JobStatus;
  startedAt: number | null;
  finishedAt: number | null;
  result: T | null;
  error: string | null;
  errorRaw?: string | null;
}

interface BlogJobCtx {
  generate: JobState<GenerateResult>;
  startGenerate: (payload: any) => Promise<void>;
  clearGenerate: () => void;
  /** 진행바 → 결과 영역으로 점프 요청. Dashboard 가 구독해서 탭 전환 */
  requestFocusBlogTab: () => void;
  /** Dashboard 가 점프 요청을 소비할 때 사용 */
  consumeFocusRequest: () => boolean;
}

const Ctx = createContext<BlogJobCtx | null>(null);

const INITIAL_GEN: JobState<GenerateResult> = {
  status: "idle",
  startedAt: null,
  finishedAt: null,
  result: null,
  error: null,
  errorRaw: null,
};

export function BlogJobProvider({ children }: { children: React.ReactNode }) {
  const [generate, setGenerate] = useState<JobState<GenerateResult>>(INITIAL_GEN);
  const focusRef = useRef<boolean>(false);

  const startGenerate = useCallback(async (payload: any) => {
    setGenerate({
      status: "running",
      startedAt: Date.now(),
      finishedAt: null,
      result: null,
      error: null,
      errorRaw: null,
    });
    try {
      const r = await fetch("/api/blog/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setGenerate({
          status: "error",
          startedAt: null,
          finishedAt: Date.now(),
          result: null,
          error: j.message || j.error || `HTTP ${r.status}`,
          errorRaw: j.raw_stdout ?? null,
        });
        return;
      }
      setGenerate({
        status: "done",
        startedAt: null,
        finishedAt: Date.now(),
        result: j.result as GenerateResult,
        error: null,
        errorRaw: null,
      });
      focusRef.current = true;
    } catch (e: any) {
      setGenerate({
        status: "error",
        startedAt: null,
        finishedAt: Date.now(),
        result: null,
        error: e?.message || String(e),
        errorRaw: null,
      });
    }
  }, []);

  const clearGenerate = useCallback(() => setGenerate(INITIAL_GEN), []);

  const requestFocusBlogTab = useCallback(() => {
    focusRef.current = true;
  }, []);
  const consumeFocusRequest = useCallback(() => {
    const v = focusRef.current;
    focusRef.current = false;
    return v;
  }, []);

  // 탭 닫기/새로고침 시 진행 중이면 경고
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (generate.status === "running") {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [generate.status]);

  const value = useMemo<BlogJobCtx>(
    () => ({
      generate,
      startGenerate,
      clearGenerate,
      requestFocusBlogTab,
      consumeFocusRequest,
    }),
    [generate, startGenerate, clearGenerate, requestFocusBlogTab, consumeFocusRequest]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBlogJob() {
  const c = useContext(Ctx);
  if (!c) throw new Error("BlogJobProvider missing");
  return c;
}

/** 진행 시간 카운터를 1초마다 업데이트하는 훅 */
export function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function formatMmSs(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
