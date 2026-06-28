// ─────────────────────────────────────────────────────────────
//  GET /api/auth/tiktok
//  Redirects the user to TikTok's OAuth consent screen.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

export async function GET() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/tiktok/callback`;

  // -- Generate CSRF state token and store in a cookie --
  const state = randomBytes(32).toString("hex");

  // -- Build TikTok OAuth URL --
  const params = new URLSearchParams({
    client_key: clientKey || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "user.info.basic,video.upload,video.publish",
    state,
  });

  const response = NextResponse.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`);
  response.cookies.set("oauth_state_tiktok", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
