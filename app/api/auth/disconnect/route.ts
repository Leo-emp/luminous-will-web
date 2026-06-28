// ─────────────────────────────────────────────────────────────
//  POST /api/auth/disconnect
//  Disconnects a platform by deleting its token from Blob.
//  Request body: { platform: "youtube" | "tiktok" | "meta" }
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { deleteToken } from "@/lib/tokens";
import type { PlatformType } from "@/lib/publishers/types";

export async function POST(request: Request) {
  // -- Verify the request comes from our own app (CSRF protection) --
  const origin = request.headers.get("origin");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  let expectedOrigin: string;
  try { expectedOrigin = new URL(appUrl).origin; } catch { return NextResponse.json({ error: "Server misconfigured" }, { status: 500 }); }
  if (!origin || origin !== expectedOrigin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const platform = body.platform as PlatformType;

  // Validate platform name
  if (!platform || !["youtube", "tiktok", "meta"].includes(platform)) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  await deleteToken(platform);
  return NextResponse.json({ disconnected: platform });
}
