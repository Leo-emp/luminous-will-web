// ─────────────────────────────────────────────────────────────
//  GET /api/auth/youtube
//  Redirects the user to Google's OAuth consent screen.
//  After the user approves, Google redirects to /api/auth/youtube/callback.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/youtube/callback`;

  // -- Build Google OAuth URL with required scopes --
  const params = new URLSearchParams({
    client_id: clientId || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
    access_type: "offline",       // Required to get a refresh token
    prompt: "consent",            // Force consent screen to always get refresh token
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
