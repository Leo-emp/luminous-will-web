// ─────────────────────────────────────────────────────────────
//  GET /api/auth/tiktok/callback
//  TikTok redirects here after the user approves.
//  Exchanges the auth code for tokens and saves to Blob.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { saveToken } from "@/lib/tokens";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/settings?error=tiktok_denied`);
  }

  try {
    // -- Exchange auth code for tokens --
    const tokenResponse = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY || "",
        client_secret: process.env.TIKTOK_CLIENT_SECRET || "",
        code,
        grant_type: "authorization_code",
        redirect_uri: `${appUrl}/api/auth/tiktok/callback`,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      return NextResponse.redirect(`${appUrl}/settings?error=tiktok_token_failed`);
    }

    const tokens = await tokenResponse.json();

    // -- Fetch the user's display name --
    let accountName = "TikTok Account";
    try {
      const userResponse = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=display_name,username",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      if (userResponse.ok) {
        const userData = await userResponse.json();
        const name = userData?.data?.user?.display_name || userData?.data?.user?.username;
        if (name) accountName = name;
      }
    } catch {
      // Fallback to default name — not critical
    }

    // -- Save tokens to Blob --
    await saveToken("tiktok", {
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expires_at: Math.floor(Date.now() / 1000) + (tokens.expires_in || 86400),
      account_name: accountName,
    });

    return NextResponse.redirect(`${appUrl}/settings?connected=tiktok`);
  } catch {
    return NextResponse.redirect(`${appUrl}/settings?error=tiktok_failed`);
  }
}
