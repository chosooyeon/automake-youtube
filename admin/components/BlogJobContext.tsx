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

export interface GenerateResult {
  titles: string[];
  category_label: string;
  content_markdown: string;
  photo_spots: { index: number; description: string }[];
  hashtags: string[];
  char_count_excl_space?: number;
}

export type VerifyStatus = "ok" | "warn" | "unknown" | "bad";

export interface VerifyItem {
  claim: string;
  status: VerifyStatus;
  note: string;
  correction: string;
  sources: string[];
}

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
  verify: JobState<VerifyResult>;
  startGenerate: (payload: any) => Promise<void>;
  startVerify: (payload: { title?: string; content: string }) => Promise<void>;
  clearGenerate: () => void;
  clearVerify: () => void;
  /** 진행바 → 결과 영역으로 점프 요청. Dashboard 가 구독해서 탭 전환 */
  requestFocusBlogTab: (target?: "result" | "verify") => void;
  /** Dashboard 가 점프 요청을 소비할 때 사용 */
  consumeFocusRequest: () => { target: "result" | "verify" } | null;
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
const INITIAL_VER: JobState<VerifyResult> = {
  status: "idle",
  startedAt: null,
  finishedAt: null,
  result: null,
  error: null,
};

export function BlogJobProvider({ children }: { children: React.ReactNode }) {
  const [generate, setGenerate] = useState<JobState<GenerateResult>>(INITIAL_GEN);
  const [verify, setVerify] = useState<JobState<VerifyResult>>(INITIAL_VER);
  const focusRef = useRef<{ target: "result" | "verify" } | null>(null);

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
      focusRef.current = { target: "result" };
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

  const startVerify = useCallback(
    async (payload: { title?: string; content: string }) => {
      setVerify({
        status: "running",
        startedAt: Date.now(),
        finishedAt: null,
        result: null,
        error: null,
      });
      try {
        const r = await fetch("/api/blog/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await r.json();
        if (!r.ok || !j.ok) {
          setVerify({
            status: "error",
            startedAt: null,
            finishedAt: Date.now(),
            result: null,
            error: j.message || j.error || `HTTP ${r.status}`,
          });
          return;
        }
        setVerify({
          status: "done",
          startedAt: null,
          finishedAt: Date.now(),
          result: j.result as VerifyResult,
          error: null,
        });
        focusRef.current = { target: "verify" };
      } catch (e: any) {
        setVerify({
          status: "error",
          startedAt: null,
          finishedAt: Date.now(),
          result: null,
          error: e?.message || String(e),
        });
      }
    },
    []
  );

  const clearGenerate = useCallback(() => setGenerate(INITIAL_GEN), []);
  const clearVerify = useCallback(() => setVerify(INITIAL_VER), []);

  const requestFocusBlogTab = useCallback(
    (target: "result" | "verify" = "result") => {
      focusRef.current = { target };
    },
    []
  );
  const consumeFocusRequest = useCallback(() => {
    const v = focusRef.current;
    focusRef.current = null;
    return v;
  }, []);

  // 탭 닫기/새로고침 시 진행 중이면 경고
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (generate.status === "running" || verify.status === "running") {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [generate.status, verify.status]);

  const value = useMemo<BlogJobCtx>(
    () => ({
      generate,
      verify,
      startGenerate,
      startVerify,
      clearGenerate,
      clearVerify,
      requestFocusBlogTab,
      consumeFocusRequest,
    }),
    [
      generate,
      verify,
      startGenerate,
      startVerify,
      clearGenerate,
      clearVerify,
      requestFocusBlogTab,
      consumeFocusRequest,
    ]
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
