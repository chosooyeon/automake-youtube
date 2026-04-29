import { NextResponse } from "next/server";
import fs from "node:fs";
import { google } from "googleapis";
import { getEnv } from "@/lib/env";
import { expandHome } from "@/lib/paths";

export const dynamic = "force-dynamic";

/**
 * 채널 KPI: 최근 7일 업로드 수, 총 구독자, 평균 조회수 등.
 * OAuth가 안 풀렸으면 null 반환.
 */
export async function GET() {
  try {
    const csPath = expandHome(getEnv("YOUTUBE_CLIENT_SECRET_PATH") || "");
    const tkPath = expandHome(getEnv("YOUTUBE_OAUTH_TOKEN_PATH") || "");
    if (!csPath || !tkPath || !fs.existsSync(csPath) || !fs.existsSync(tkPath)) {
      return NextResponse.json({ ok: false, reason: "OAuth 미설정" });
    }
    const cs = JSON.parse(fs.readFileSync(csPath, "utf8"));
    const c = cs.installed || cs.web;
    const oauth2 = new google.auth.OAuth2(c.client_id, c.client_secret, "http://localhost:43210");
    const tokens = JSON.parse(fs.readFileSync(tkPath, "utf8"));
    oauth2.setCredentials(tokens);

    const yt = google.youtube({ version: "v3", auth: oauth2 });
    const ch = await yt.channels.list({ part: ["snippet", "statistics", "contentDetails"], mine: true });
    const channel = ch.data.items?.[0];
    if (!channel) return NextResponse.json({ ok: false, reason: "채널 없음" });
    const stats = channel.statistics ?? {};
    const uploadsPlaylist = channel.contentDetails?.relatedPlaylists?.uploads;

    let recent: { id: string; title: string; publishedAt: string; views?: number }[] = [];
    if (uploadsPlaylist) {
      const pl = await yt.playlistItems.list({
        part: ["snippet", "contentDetails"],
        playlistId: uploadsPlaylist,
        maxResults: 10,
      });
      const ids = (pl.data.items ?? []).map((i) => i.contentDetails?.videoId).filter(Boolean) as string[];
      let viewsMap: Record<string, number> = {};
      if (ids.length) {
        const v = await yt.videos.list({ part: ["statistics"], id: ids });
        for (const item of v.data.items ?? []) {
          viewsMap[item.id ?? ""] = parseInt(item.statistics?.viewCount ?? "0", 10);
        }
      }
      recent = (pl.data.items ?? []).map((i) => ({
        id: i.contentDetails?.videoId ?? "",
        title: i.snippet?.title ?? "",
        publishedAt: i.contentDetails?.videoPublishedAt ?? i.snippet?.publishedAt ?? "",
        views: viewsMap[i.contentDetails?.videoId ?? ""],
      }));
    }

    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const last7d = recent.filter((r) => new Date(r.publishedAt).getTime() >= sevenDaysAgo).length;

    return NextResponse.json({
      ok: true,
      channelTitle: channel.snippet?.title,
      subs: parseInt(stats.subscriberCount ?? "0", 10),
      totalViews: parseInt(stats.viewCount ?? "0", 10),
      videosCount: parseInt(stats.videoCount ?? "0", 10),
      last7dUploads: last7d,
      recent,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, reason: e?.message || String(e) });
  }
}
