"use client";

import { useEffect, useState } from "react";

interface Props {
  slug: string;
  refreshKey: number;
}

interface Thumb {
  name: string;
  url: string;
}

export default function ThumbnailGallery({ slug, refreshKey }: Props) {
  const [files, setFiles] = useState<Thumb[]>([]);
  useEffect(() => {
    fetch(`/api/projects/${encodeURIComponent(slug)}/thumbnails`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setFiles(j.files || []));
  }, [slug, refreshKey]);

  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <h2 className="text-base font-semibold mb-3">썸네일 ({files.length})</h2>
      {files.length === 0 ? (
        <div className="text-xs text-subtext">
          06-edit-upload/thumbnails/ 가 비어있습니다. 06번 봇을 실행하면 5장이 생성돼요.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {files.map((f) => (
            <a
              key={f.name}
              href={f.url}
              target="_blank"
              className="block border border-line rounded-md overflow-hidden hover:border-accent"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.name} className="w-full h-auto block" />
              <div className="text-[11px] mono text-subtext px-2 py-1 truncate">{f.name}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
