// ─────────────────────────────────────────────────────────────
//  GET /api/auth/status
//  Returns the connection status for all platforms.
//  Used by the settings page and dashboard to show which
//  platforms are connected, disconnected, or need reconnection.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getConnectionStatus } from "@/lib/tokens";

export async function GET() {
  const status = await getConnectionStatus();
  return NextResponse.json(status);
}
