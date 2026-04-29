import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { CONFIG_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

interface ChannelConfig {
  id: number;
  label: string;
  channel_id: string;
  channel_name: string;
  token_env: string;
  channel_id_env: string;
  client_secret_env: string;
  note?: string;
}

function expandHome(p: string | undefined): string {
  if (!p) return "";
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

export async function GET() {
  const channelsPath = path.join(CONFIG_DIR, "channels.json");
  let channels: ChannelConfig[] = [];
  try {
    channels = JSON.parse(fs.readFileSync(channelsPath, "utf8"));
  } catch {
    return NextResponse.json({ channels: [] });
  }

  const result = channels.map((ch) => {
    const tokenPath = expandHome(process.env[ch.token_env]);
    const tokenExists = tokenPath ? fs.existsSync(tokenPath) : false;
    const channelIdFromEnv = process.env[ch.channel_id_env] || ch.channel_id || "";

    return {
      id: ch.id,
      label: ch.label,
      channel_id: channelIdFromEnv,
      channel_name: ch.channel_name || "",
      token_env: ch.token_env,
      token_exists: tokenExists,
      token_path: tokenPath,
      configured: tokenExists && !!channelIdFromEnv,
    };
  });

  return NextResponse.json({ channels: result });
}
