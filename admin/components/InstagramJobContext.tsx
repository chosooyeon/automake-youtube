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

export type CategoryId = "parenting_subsidy" | "youth_subsidy" | "stocks";
export type LayoutType = "cover" | "body" | "comparison" | "stat" | "cta";
export type VerifyStatus = "ok" | "warn" | "unknown" | "bad";

export interface CardResult {
  index: number;
  layout: LayoutType;
  file: string;
  dataUrl: string;
  sources: string[];
}

export interface VerifyItem {
  claim: string;
  status: VerifyStatus;
  note?: string;
  sources?: string[];
}

export interface GenerateResult {
  category: CategoryId;
  region: string | null;
  topic: string | null;
  cards: CardResult[];
  caption: string;
  hashtags: string[];
  verify_summary: string;
  verify_items: VerifyItem[];
}

interface JobState<T> {
  status: "idle" | "running" | "done" | "error";
  startedAt: number | null;
  finishedAt: number | null;
  result: T | null;
  slug: string | null;
  error: string | null;
  errorRaw?: string | null;
}

export interface InstagramGeneratePayload {
  category: CategoryId;
  region?: string;
  content: string;
  cardCount: number;
  extraNote?: string;
}

interface InstaJobCtx {
  generate: JobState<GenerateResult>;
  startGenerate: (payload: InstagramGeneratePayload) => Promise<void>;
  clearGenerate: () => void;
  /** 카드 1장 재생성. 성공 시 result.cards 의 해당 인덱스를 갱신 */
  regenerateCard: (slug: string, cardIndex: number) => Promise<void>;
  regeneratingIndex: number | null;
  requestFocusInstaTab: () => void;
  consumeFocusRequest: () => boolean;
}

const Ctx = createContext<InstaJobCtx | null>(null);

const INITIAL: JobState<GenerateResult> = {
  status: "idle",
  startedAt: null,
  finishedAt: null,
  result: null,
  slug: null,
  error: null,
  errorRaw: null,
};

export function InstagramJobProvider({ children }: { children: React.ReactNode }) {
  const [generate, setGenerate] = useState<JobState<GenerateResult>>(INITIAL);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const focusRef = useRef<boolean>(false);

  const startGenerate = useCallback(async (payload: InstagramGeneratePayload) => {
    setGenerate({
      status: "running",
      startedAt: Date.now(),
      finishedAt: null,
      result: null,
      slug: null,
      error: null,
      errorRaw: null,
    });
    try {
      const r = await fetch("/api/instagram/generate", {
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
          slug: j.slug ?? null,
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
        slug: j.slug as string,
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
        slug: null,
        error: e?.message || String(e),
        errorRaw: null,
      });
    }
  }, []);

  const regenerateCard = useCallback(async (slug: string, cardIndex: number) => {
    setRegeneratingIndex(cardIndex);
    try {
      const r = await fetch("/api/instagram/regenerate-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, cardIndex, mode: "background" }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        throw new Error(j.message || j.error || `HTTP ${r.status}`);
      }
      setGenerate((prev) => {
        if (!prev.result) return prev;
        const next = { ...prev.result };
        next.cards = next.cards.map((c) => (c.index === cardIndex ? (j.card as CardResult) : c));
        return { ...prev, result: next };
      });
    } finally {
      setRegeneratingIndex(null);
    }
  }, []);

  const clearGenerate = useCallback(() => setGenerate(INITIAL), []);

  const requestFocusInstaTab = useCallback(() => {
    focusRef.current = true;
  }, []);
  const consumeFocusRequest = useCallback(() => {
    const v = focusRef.current;
    focusRef.current = false;
    return v;
  }, []);

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

  const value = useMemo<InstaJobCtx>(
    () => ({
      generate,
      startGenerate,
      clearGenerate,
      regenerateCard,
      regeneratingIndex,
      requestFocusInstaTab,
      consumeFocusRequest,
    }),
    [
      generate,
      startGenerate,
      clearGenerate,
      regenerateCard,
      regeneratingIndex,
      requestFocusInstaTab,
      consumeFocusRequest,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInstagramJob() {
  const c = useContext(Ctx);
  if (!c) throw new Error("InstagramJobProvider missing");
  return c;
}

export function useInstaElapsed(startedAt: number | null): number {
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
