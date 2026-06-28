// ─────────────────────────────────────────────────────────────
//  GET /api/auth/youtube/callback
//  Google redirects here after the user approves.
//  Exchanges the auth code for access + refresh tokens,
//  saves them to Blob, and redirects to /settings.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { saveToken } from "@/lib/tokens";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // -- Handle denial or error --
  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/settings?error=youtube_denied`);
  }

  // -- Verify CSRF state token --
  const cookieStore = await cookies();
  const savedState = cookieStore.get("oauth_state_youtube")?.value;
  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${appUrl}/settings?error=youtube_csrf`);
  }

  try {
    // -- Exchange auth code for tokens --
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.YOUTUBE_CLIENT_ID || "",
        client_secret: process.env.YOUTUBE_CLIENT_SECRET || "",
        redirect_uri: `${appUrl}/api/auth/youtube/callback`,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenResponse.ok) {
      return NextResponse.redirect(`${appUrl}/settings?error=youtube_token_failed`);
    }

    const tokens = await tokenResponse.json();

    // -- Get the channel name for display --
    let accountName = "YouTube Channel";
    try {
      const channelResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      if (channelResponse.ok) {
        const channelData = await channelResponse.json();
        accountName = channelData.items?.[0]?.snippet?.title || accountName;
      }
    } catch {
      // Fallback to default name — not critical
    }

    // -- Save tokens to Blob --
    await saveToken("youtube", {
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expires_at: Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600),
      account_name: accountName,
    });

    const successResponse = NextResponse.redirect(`${appUrl}/settings?connected=youtube`);
    successResponse.cookies.delete("oauth_state_youtube");
    return successResponse;
  } catch {
    return NextResponse.redirect(`${appUrl}/settings?error=youtube_failed`);
  }
}
