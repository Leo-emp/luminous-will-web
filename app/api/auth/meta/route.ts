// ─────────────────────────────────────────────────────────────
//  GET /api/auth/meta
//  Redirects the user to Meta's OAuth consent screen.
//  This single flow covers both Instagram and Facebook.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

export async function GET() {
  const appId = process.env.META_APP_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/meta/callback`;

  // -- Generate CSRF state token and store in a cookie --
  const state = randomBytes(32).toString("hex");

  // -- Build Meta OAuth URL with scopes for both IG and FB --
  // pages_show_list is required for /me/accounts to return data
  const scopes = [
    "pages_show_list",
    "pages_manage_posts",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_content_publish",
  ].join(",");

  const params = new URLSearchParams({
    client_id: appId || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    state,
  });

  const response = NextResponse.redirect(`https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`);
  response.cookies.set("oauth_state_meta", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
