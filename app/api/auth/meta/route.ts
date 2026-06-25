// ─────────────────────────────────────────────────────────────
//  GET /api/auth/meta
//  Redirects the user to Meta's OAuth consent screen.
//  This single flow covers both Instagram and Facebook.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";

export async function GET() {
  const appId = process.env.META_APP_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/meta/callback`;

  // -- Build Meta OAuth URL with scopes for both IG and FB --
  const scopes = [
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
  });

  return NextResponse.redirect(`https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`);
}
