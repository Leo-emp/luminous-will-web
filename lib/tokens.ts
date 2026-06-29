// ─────────────────────────────────────────────────────────────
//  Token management for OAuth platform connections.
//  Stores refresh + access tokens in Vercel Blob as JSON files.
//  Auto-refreshes expired access tokens before each API call.
//
//  Token files live at:
//    tokens/youtube.json
//    tokens/tiktok.json
//    tokens/meta.json       (covers both Instagram and Facebook)
// ─────────────────────────────────────────────────────────────

import { put, list, del, get } from "@vercel/blob";
import type { TokenData, PlatformType, ConnectionStatus } from "@/lib/publishers/types";

// -- Blob path prefix for all token files --
const TOKEN_PREFIX = "tokens/";

// -- Buffer time: refresh 5 minutes before actual expiry --
// Prevents edge cases where token expires mid-upload
const REFRESH_BUFFER_SECONDS = 300;

// -- Token endpoint URLs for each platform --
const TOKEN_ENDPOINTS: Record<PlatformType, string> = {
  youtube: "https://oauth2.googleapis.com/token",
  tiktok: "https://open.tiktokapis.com/v2/oauth/token/",
  meta: "https://graph.facebook.com/v21.0/oauth/access_token",
};

// -- Reads the client credentials from environment variables --
function getClientCredentials(platform: PlatformType): { clientId: string; clientSecret: string } {
  // Each platform stores its OAuth app credentials in env vars
  switch (platform) {
    case "youtube":
      return {
        clientId: process.env.YOUTUBE_CLIENT_ID || "",
        clientSecret: process.env.YOUTUBE_CLIENT_SECRET || "",
      };
    case "tiktok":
      return {
        clientId: process.env.TIKTOK_CLIENT_KEY || "",
        clientSecret: process.env.TIKTOK_CLIENT_SECRET || "",
      };
    case "meta":
      return {
        clientId: process.env.META_APP_ID || "",
        clientSecret: process.env.META_APP_SECRET || "",
      };
  }
}

export async function saveToken(platform: PlatformType, data: TokenData): Promise<void> {
  // Writes token data to Blob as a JSON file
  const path = `${TOKEN_PREFIX}${platform}.json`;
  await put(path, JSON.stringify(data), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function deleteToken(platform: PlatformType): Promise<void> {
  // Removes the token file from Blob — disconnects the platform
  try {
    const { blobs } = await list({ prefix: `${TOKEN_PREFIX}${platform}.json` });
    if (blobs.length > 0) {
      await del(blobs[0].url);
    }
  } catch {
    // Ignore errors — token may already be gone
  }
}

async function loadTokenData(platform: PlatformType): Promise<TokenData | null> {
  try {
    const { blobs } = await list({ prefix: `${TOKEN_PREFIX}${platform}.json` });
    if (blobs.length === 0) return null;

    const result = await get(blobs[0].url, { access: "private" });
    if (!result) return null;
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    let done = false;
    while (!done) {
      const { value, done: d } = await reader.read();
      if (value) chunks.push(value);
      done = d;
    }
    const text = new TextDecoder().decode(Buffer.concat(chunks));
    return JSON.parse(text) as TokenData;
  } catch (err) {
    console.error(`[TOKENS] loadTokenData error for ${platform}:`, err);
    return null;
  }
}

export async function refreshAccessToken(
  platform: PlatformType,
  tokenData: TokenData
): Promise<TokenData | null> {
  // Exchanges the refresh token for a fresh access token
  // Returns updated TokenData on success, null if refresh token was rejected
  const { clientId, clientSecret } = getClientCredentials(platform);
  const endpoint = TOKEN_ENDPOINTS[platform];

  try {
    // -- Build the token refresh request body --
    // Each platform uses slightly different parameter names
    let body: Record<string, string>;

    if (platform === "tiktok") {
      // TikTok uses client_key instead of client_id
      body = {
        client_key: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: tokenData.refresh_token,
      };
    } else if (platform === "meta") {
      // Meta doesn't support grant_type=refresh_token —
      // uses fb_exchange_token with the current access token
      body = {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "fb_exchange_token",
        fb_exchange_token: tokenData.refresh_token,
      };
    } else {
      // YouTube (Google) uses standard OAuth2 params
      body = {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: tokenData.refresh_token,
      };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });

    if (!response.ok) {
      // Refresh token was rejected — user needs to reconnect
      console.error(`[TOKENS] Refresh failed for ${platform}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // -- Build updated token data --
    // Some platforms return a new refresh token, some don't
    const updated: TokenData = {
      refresh_token: data.refresh_token || tokenData.refresh_token,
      access_token: data.access_token,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      account_name: tokenData.account_name,
    };

    // -- Persist the refreshed tokens back to Blob --
    await saveToken(platform, updated);

    return updated;
  } catch (error) {
    console.error(`[TOKENS] Refresh error for ${platform}:`, error);
    return null;
  }
}

export async function getToken(platform: PlatformType): Promise<TokenData | null> {
  // Reads the token for a platform, auto-refreshing if expired.
  // Returns null if not connected or if refresh fails (needs reconnect).
  const tokenData = await loadTokenData(platform);
  if (!tokenData) return null;

  // -- Check if access token is still valid (with buffer) --
  const now = Math.floor(Date.now() / 1000);
  if (tokenData.expires_at > now + REFRESH_BUFFER_SECONDS) {
    // Token is still fresh — use it
    return tokenData;
  }

  // -- Access token expired or expiring soon — refresh it --
  const refreshed = await refreshAccessToken(platform, tokenData);

  if (!refreshed) {
    // Refresh token was rejected — mark as needs reconnect
    // Don't delete the token — keep it so settings page can show "needs reconnect"
    return null;
  }

  return refreshed;
}

export async function isConnected(platform: PlatformType): Promise<boolean> {
  // Quick check — does a token file exist for this platform?
  const tokenData = await loadTokenData(platform);
  return tokenData !== null;
}

export async function getConnectionStatus(): Promise<Record<PlatformType, ConnectionStatus>> {
  // Returns the connection status for all three OAuth providers
  // Used by the settings page to show which platforms are connected
  const platforms: PlatformType[] = ["youtube", "tiktok", "meta"];
  const result: Record<string, ConnectionStatus> = {};

  for (const platform of platforms) {
    const tokenData = await loadTokenData(platform);

    if (!tokenData) {
      // No token file — not connected
      result[platform] = { connected: false };
      continue;
    }

    // -- Check if access token can be refreshed --
    const now = Math.floor(Date.now() / 1000);
    if (tokenData.expires_at <= now + REFRESH_BUFFER_SECONDS) {
      // Token is expired — try a refresh to see if it still works
      const refreshed = await refreshAccessToken(platform, tokenData);
      if (!refreshed) {
        // Refresh failed — needs reconnect
        result[platform] = {
          connected: false,
          account_name: tokenData.account_name,
          needs_reconnect: true,
        };
        continue;
      }
    }

    // Token is valid
    result[platform] = {
      connected: true,
      account_name: tokenData.account_name,
    };
  }

  return result as Record<PlatformType, ConnectionStatus>;
}
