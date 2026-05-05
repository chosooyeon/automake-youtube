"use client";

import { useEffect, useState } from "react";

interface Project {
  slug: string;
  hasBrief: boolean;
  stages: Record<string, "done" | "in_progress" | "pending" | "missing_inputs">;
  lastModified: number;
  niche?: string;
}

interface Props {
  value: string | null;
  onChange: (slug: string) => void;
  onCreate: () => void;
  refreshKey: number;
}

export default function ProjectSelector({ value, onChange, onCreate, refreshKey }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setProjects(j.projects || []);
        if (!value && j.projects?.[0]) onChange(j.projects[0].slug);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onCreate}
        className="bg-accent text-bg font-semibold rounded-lg px-3 py-2 text-sm hover:opacity-90"
      >
        + 새 프로젝트
      </button>
      <div className="flex items-center gap-2 bg-panel border border-line rounded-lg px-3 py-2">
        <span className="text-xs text-subtext">프로젝트</span>
        <select
          className="bg-transparent text-text outline-none text-sm pr-2"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={loading || projects.length === 0}
        >
          {projects.length === 0 && <option value="">— 없음 —</option>}
          {projects.map((p) => {
            const done = Object.values(p.stages).filter((v) => v === "done").length;
            const nicheTag = p.niche && p.niche !== "mom_wallet" ? ` · ${p.niche}` : "";
            return (
              <option key={p.slug} value={p.slug}>
                {p.slug} · {done}/6 완료{nicheTag}
              </option>
            );
          })}
        </select>
      </div>
    </div>
  );
}
