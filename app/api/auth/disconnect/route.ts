// ─────────────────────────────────────────────────────────────
//  POST /api/auth/disconnect
//  Disconnects a platform by deleting its token from Blob.
//  Request body: { platform: "youtube" | "tiktok" | "meta" }
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { deleteToken } from "@/lib/tokens";
import type { PlatformType } from "@/lib/publishers/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const platform = body.platform as PlatformType;

  // Validate platform name
  if (!platform || !["youtube", "tiktok", "meta"].includes(platform)) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  await deleteToken(platform);
  return NextResponse.json({ disconnected: platform });
}
