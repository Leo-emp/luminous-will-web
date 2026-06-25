// ─────────────────────────────────────────────────────────────
//  GET /api/auth/meta/callback
//  Meta redirects here after the user approves.
//  Exchanges the short-lived token for a long-lived token,
//  saves to Blob, and redirects to /settings.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { saveToken } from "@/lib/tokens";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/settings?error=meta_denied`);
  }

  try {
    // -- Step 1: Exchange code for short-lived token --
    const redirectUri = `${appUrl}/api/auth/meta/callback`;
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${process.env.META_APP_SECRET}&code=${code}`;

    const tokenResponse = await fetch(tokenUrl);
    if (!tokenResponse.ok) {
      return NextResponse.redirect(`${appUrl}/settings?error=meta_token_failed`);
    }
    const shortLived = await tokenResponse.json();

    // -- Step 2: Exchange short-lived token for long-lived token --
    // Long-lived tokens last ~60 days and can be refreshed
    const longLivedUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&fb_exchange_token=${shortLived.access_token}`;

    const longLivedResponse = await fetch(longLivedUrl);
    if (!longLivedResponse.ok) {
      return NextResponse.redirect(`${appUrl}/settings?error=meta_longlived_failed`);
    }
    const longLived = await longLivedResponse.json();

    // -- Step 3: Get the user's name for display --
    let accountName = "Meta Account";
    try {
      const meResponse = await fetch(
        `https://graph.facebook.com/v21.0/me?fields=name&access_token=${longLived.access_token}`
      );
      if (meResponse.ok) {
        const meData = await meResponse.json();
        accountName = meData.name || accountName;
      }
    } catch {
      // Fallback name — not critical
    }

    // -- Step 4: Save tokens to Blob --
    // Meta long-lived tokens don't have a separate refresh_token —
    // the access_token itself is refreshable before it expires
    await saveToken("meta", {
      refresh_token: longLived.access_token, // Meta uses the access token to refresh
      access_token: longLived.access_token,
      expires_at: Math.floor(Date.now() / 1000) + (longLived.expires_in || 5184000), // ~60 days
      account_name: accountName,
    });

    return NextResponse.redirect(`${appUrl}/settings?connected=meta`);
  } catch {
    return NextResponse.redirect(`${appUrl}/settings?error=meta_failed`);
  }
}
