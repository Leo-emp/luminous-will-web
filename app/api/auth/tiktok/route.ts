// ─────────────────────────────────────────────────────────────
//  GET /api/auth/tiktok
//  Redirects the user to TikTok's OAuth consent screen.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";

export async function GET() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/tiktok/callback`;

  // -- Build TikTok OAuth URL --
  const params = new URLSearchParams({
    client_key: clientKey || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "video.upload,video.publish",
  });

  return NextResponse.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`);
}
