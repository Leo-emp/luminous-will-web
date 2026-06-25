# Auto-Posting System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a video is approved on the dashboard, automatically publish it to YouTube, TikTok, Instagram, and Facebook — all from one button press.

**Architecture:** All posting logic runs in Next.js serverless functions. OAuth tokens stored in Vercel Blob. URL-based uploads for TikTok/Instagram/Facebook; chunked resumable upload for YouTube. Platforms post in parallel via `Promise.allSettled()`.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS 4, `@vercel/blob`, YouTube Data API v3, TikTok Content Posting API, Instagram Graph API, Facebook Pages API.

## Global Constraints

- Next.js 15 + React 19 + Tailwind CSS 4
- Vercel Hobby plan (60s function timeout) — all API calls must complete within this window
- Dark premium styling: `#000` bg, `#1a1a1a` panels, `#333` borders, `#E8A817` amber, `#22c55e` green, `#ef4444` red, `#f59e0b` yellow
- Heavy `//` comments throughout the codebase (learning codebase — every function, block, and non-obvious line gets a comment)
- All code in the `luminous-will-web` repo at `C:\Users\User\luminous-will-web` — no changes to the Python pipeline
- Tokens stored in Vercel Blob as JSON files under `tokens/` prefix — not env vars, not a database
- `@vercel/blob` is already installed (version ^2.4.1)
- Path alias `@/*` maps to project root (e.g. `import { loadQueue } from "@/lib/queue"`)
- The existing `lib/queue.ts` provides `loadQueue()`, `saveQueue()`, `getEntry()`, `updateEntry()` — all Blob-backed
- Queue entries already contain `video_url`, `thumbnail_url`, `captions` (per-platform Record), `script_text`, `duration`, `format`, `topic`, `target_platforms`, `post_results`, `status`
- Environment variables for OAuth credentials: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `META_APP_ID`, `META_APP_SECRET`
- App base URL available via `NEXT_PUBLIC_APP_URL` env var (needed for OAuth callback URLs)

---

### Task 1: Shared Types + Token Management

**Files:**
- Create: `lib/publishers/types.ts`
- Create: `lib/tokens.ts`

**Interfaces:**
- Consumes: `@vercel/blob` (`put`, `list`, `del`)
- Produces:
  - `PostResult` interface: `{ platform: string; success: boolean; url?: string; error?: string; posted_at?: string }`
  - `PublishInput` interface: `{ video_url: string; thumbnail_url?: string; captions: { caption?: string; description?: string; title?: string; hashtags?: string[]; tags?: string[]; category?: string }; format: "short" | "long"; topic: string; duration?: number }`
  - `TokenData` interface: `{ refresh_token: string; access_token: string; expires_at: number; account_name: string }`
  - `PlatformType` type: `"youtube" | "tiktok" | "meta"`
  - `getToken(platform: PlatformType): Promise<TokenData | null>` — reads token from Blob, auto-refreshes if expired
  - `saveToken(platform: PlatformType, data: TokenData): Promise<void>` — writes token to Blob
  - `deleteToken(platform: PlatformType): Promise<void>` — removes token from Blob
  - `isConnected(platform: PlatformType): Promise<boolean>` — checks if token file exists
  - `getConnectionStatus(): Promise<Record<PlatformType, { connected: boolean; account_name?: string; needs_reconnect?: boolean }>>` — returns status for all platforms
  - `refreshAccessToken(platform: PlatformType, tokenData: TokenData): Promise<TokenData | null>` — exchanges refresh token for fresh access token

- [ ] **Step 1: Create `lib/publishers/types.ts` with shared interfaces**

```typescript
// ─────────────────────────────────────────────────────────────
//  Shared types for the auto-posting publisher system.
//  Every publisher imports from here — this is the contract
//  between the orchestrator and the platform-specific uploaders.
// ─────────────────────────────────────────────────────────────

// -- Result returned by each platform publisher after a post attempt --
export interface PostResult {
  // Which platform this result is for
  platform: string;
  // Whether the post succeeded
  success: boolean;
  // URL of the published post (only on success)
  url?: string;
  // Human-readable error message (only on failure)
  error?: string;
  // ISO timestamp of when the post went live
  posted_at?: string;
}

// -- Input data passed to each publisher --
// Built from the queue entry's data — the orchestrator extracts
// the relevant fields and passes this to each publisher
export interface PublishInput {
  // Vercel Blob URL of the video file
  video_url: string;
  // Vercel Blob URL of the thumbnail image
  thumbnail_url?: string;
  // Platform-specific caption/metadata fields
  captions: {
    caption?: string;
    description?: string;
    title?: string;
    hashtags?: string[];
    tags?: string[];
    category?: string;
  };
  // Video format — determines upload strategy
  format: "short" | "long";
  // Video topic — used as fallback title if caption fields are missing
  topic: string;
  // Video duration in seconds
  duration?: number;
}

// -- Token data stored in Vercel Blob for each connected platform --
export interface TokenData {
  // Long-lived token used to get fresh access tokens
  refresh_token: string;
  // Short-lived token used for API calls (expires in ~1 hour)
  access_token: string;
  // Unix timestamp (seconds) when access_token expires
  expires_at: number;
  // Display name of the connected account
  account_name: string;
}

// -- The three OAuth providers we connect to --
// Meta covers both Instagram and Facebook with one token
export type PlatformType = "youtube" | "tiktok" | "meta";

// -- Connection status for a single platform --
export interface ConnectionStatus {
  connected: boolean;
  account_name?: string;
  // True when the refresh token was rejected and user needs to re-auth
  needs_reconnect?: boolean;
}

// -- Publisher function signature --
// Every platform publisher exports a function matching this shape
export type PublisherFn = (input: PublishInput) => Promise<PostResult>;
```

- [ ] **Step 2: Create `lib/tokens.ts` with token CRUD and auto-refresh**

```typescript
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

import { put, list, del } from "@vercel/blob";
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
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
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
  // Reads token JSON from Blob — returns null if not found
  try {
    const { blobs } = await list({ prefix: `${TOKEN_PREFIX}${platform}.json` });
    if (blobs.length === 0) return null;

    const response = await fetch(blobs[0].url);
    if (!response.ok) return null;

    return (await response.json()) as TokenData;
  } catch {
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
    } else {
      // YouTube (Google) and Meta use standard OAuth2 params
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
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd C:\Users\User\luminous-will-web && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors from the new files.

- [ ] **Step 4: Commit**

```bash
cd C:\Users\User\luminous-will-web
git add lib/publishers/types.ts lib/tokens.ts
git commit -m "feat: shared publisher types + token management with auto-refresh"
```

---

### Task 2: YouTube Publisher

**Files:**
- Create: `lib/publishers/youtube.ts`

**Interfaces:**
- Consumes: `getToken("youtube")` from `@/lib/tokens`, `PostResult` and `PublishInput` from `@/lib/publishers/types`
- Produces: `publishToYouTube(input: PublishInput): Promise<PostResult>`

- [ ] **Step 1: Create `lib/publishers/youtube.ts`**

```typescript
// ─────────────────────────────────────────────────────────────
//  YouTube Publisher — uploads videos via YouTube Data API v3
//  Uses resumable (chunked) upload so large files work within
//  Vercel's 60s function timeout.
//
//  Short-form: appends #Shorts to title → YouTube treats as Short
//  Long-form: includes chapters in description if available
//
//  Upload flow:
//    1. Start resumable upload session (gets upload URI)
//    2. Download video from Blob URL
//    3. Send in 5MB chunks via PUT
//    4. Upload thumbnail separately
//    5. Return PostResult with video URL
// ─────────────────────────────────────────────────────────────

import { getToken } from "@/lib/tokens";
import type { PostResult, PublishInput } from "@/lib/publishers/types";

// -- Chunk size for resumable upload: 5MB --
// Must be a multiple of 256KB per YouTube API requirements
const CHUNK_SIZE = 5 * 1024 * 1024;

// -- YouTube API base URLs --
const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
const THUMBNAIL_URL = "https://www.googleapis.com/youtube/v3/thumbnails/set";

export async function publishToYouTube(input: PublishInput): Promise<PostResult> {
  // Get a valid access token — auto-refreshes if expired
  const token = await getToken("youtube");
  if (!token) {
    return {
      platform: "youtube",
      success: false,
      error: "YouTube not connected. Connect in Settings.",
    };
  }

  try {
    // -- Build video metadata --
    const title = buildTitle(input);
    const description = input.captions.description || `${input.topic}\n\nCreated by Luminous Will`;
    const tags = input.captions.tags || input.captions.hashtags || [];
    const category = input.captions.category || "22"; // "22" = People & Blogs

    // -- Step 1: Start resumable upload session --
    const uploadUri = await startResumableUpload(token.access_token, {
      snippet: {
        title,
        description,
        tags,
        categoryId: category,
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    });

    // -- Step 2: Download video from Blob URL --
    const videoResponse = await fetch(input.video_url);
    if (!videoResponse.ok) {
      return {
        platform: "youtube",
        success: false,
        error: `Failed to download video from Blob: ${videoResponse.status}`,
      };
    }
    const videoBuffer = await videoResponse.arrayBuffer();

    // -- Step 3: Upload in chunks --
    const videoId = await uploadChunked(uploadUri, videoBuffer, token.access_token);

    // -- Step 4: Upload thumbnail if available --
    if (input.thumbnail_url) {
      await uploadThumbnail(token.access_token, videoId, input.thumbnail_url);
    }

    // -- Success! --
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    return {
      platform: "youtube",
      success: true,
      url: videoUrl,
      posted_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      platform: "youtube",
      success: false,
      error: `YouTube upload failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function buildTitle(input: PublishInput): string {
  // Build the video title from captions or fall back to topic
  // Short-form: append #Shorts so YouTube classifies it as a Short
  let title = input.captions.title || input.topic;

  // Ensure title is under 100 chars (YouTube limit)
  if (title.length > 95) {
    title = title.slice(0, 92) + "...";
  }

  // Append #Shorts tag for short-form videos
  if (input.format === "short" && !title.includes("#Shorts")) {
    title = `${title} #Shorts`;
  }

  return title;
}

async function startResumableUpload(
  accessToken: string,
  metadata: Record<string, unknown>
): Promise<string> {
  // Initiates a resumable upload session with YouTube
  // Returns the upload URI for sending chunks
  const response = await fetch(
    `${UPLOAD_URL}?uploadType=resumable&part=snippet,status`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to start upload: ${response.status} — ${errorText}`);
  }

  // The upload URI comes back in the Location header
  const uploadUri = response.headers.get("Location");
  if (!uploadUri) {
    throw new Error("YouTube did not return an upload URI");
  }

  return uploadUri;
}

async function uploadChunked(
  uploadUri: string,
  videoData: ArrayBuffer,
  accessToken: string
): Promise<string> {
  // Uploads the video in 5MB chunks to the resumable upload URI
  // Returns the YouTube video ID on completion
  const totalSize = videoData.length;
  let offset = 0;

  while (offset < totalSize) {
    // Calculate this chunk's byte range
    const end = Math.min(offset + CHUNK_SIZE, totalSize);
    const chunk = videoData.slice(offset, end);
    const isLastChunk = end === totalSize;

    // Content-Range header tells YouTube which bytes we're sending
    const contentRange = `bytes ${offset}-${end - 1}/${totalSize}`;

    const response = await fetch(uploadUri, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "video/mp4",
        "Content-Range": contentRange,
      },
      body: chunk,
    });

    if (isLastChunk) {
      // Last chunk — YouTube returns the video resource
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Final chunk upload failed: ${response.status} — ${errorText}`);
      }
      const result = await response.json();
      return result.id;
    }

    // Intermediate chunk — expect 308 Resume Incomplete
    if (response.status !== 308) {
      const errorText = await response.text();
      throw new Error(`Chunk upload failed at offset ${offset}: ${response.status} — ${errorText}`);
    }

    offset = end;
  }

  throw new Error("Upload completed but no video ID received");
}

async function uploadThumbnail(
  accessToken: string,
  videoId: string,
  thumbnailUrl: string
): Promise<void> {
  // Downloads the thumbnail from Blob and uploads it to YouTube
  // This is best-effort — a failed thumbnail doesn't fail the post
  try {
    const thumbResponse = await fetch(thumbnailUrl);
    if (!thumbResponse.ok) return;

    const thumbBuffer = await thumbResponse.arrayBuffer();

    await fetch(`${THUMBNAIL_URL}?videoId=${videoId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "image/jpeg",
      },
      body: thumbBuffer,
    });
  } catch {
    // Thumbnail upload is best-effort — log but don't fail
    console.warn(`[YOUTUBE] Thumbnail upload failed for video ${videoId}`);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:\Users\User\luminous-will-web && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd C:\Users\User\luminous-will-web
git add lib/publishers/youtube.ts
git commit -m "feat: YouTube publisher with chunked resumable upload"
```

---

### Task 3: TikTok Publisher

**Files:**
- Create: `lib/publishers/tiktok.ts`

**Interfaces:**
- Consumes: `getToken("tiktok")` from `@/lib/tokens`, `PostResult` and `PublishInput` from `@/lib/publishers/types`
- Produces: `publishToTikTok(input: PublishInput): Promise<PostResult>`

- [ ] **Step 1: Create `lib/publishers/tiktok.ts`**

```typescript
// ─────────────────────────────────────────────────────────────
//  TikTok Publisher — posts videos via TikTok Content Posting API
//  Uses URL-based upload: we pass the Blob URL and TikTok's servers
//  download the video themselves. Near-instant on our end.
//
//  API docs: https://developers.tiktok.com/doc/content-posting-api
//
//  Upload flow:
//    1. Call publish/video/init/ with the video URL
//    2. TikTok processes the video asynchronously
//    3. Return PostResult (TikTok doesn't give us a direct URL immediately)
// ─────────────────────────────────────────────────────────────

import { getToken } from "@/lib/tokens";
import type { PostResult, PublishInput } from "@/lib/publishers/types";

// -- TikTok Content Posting API base URL --
const TIKTOK_API = "https://open.tiktokapis.com/v2";

export async function publishToTikTok(input: PublishInput): Promise<PostResult> {
  // Get a valid access token — auto-refreshes if expired
  const token = await getToken("tiktok");
  if (!token) {
    return {
      platform: "tiktok",
      success: false,
      error: "TikTok not connected. Connect in Settings.",
    };
  }

  try {
    // -- Build caption: combine caption text + hashtags --
    const caption = buildCaption(input);

    // -- Initialize video upload with URL source --
    // TikTok's servers will download the video from our Blob URL
    const response = await fetch(`${TIKTOK_API}/post/publish/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: caption,
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: input.video_url,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || `HTTP ${response.status}`;
      return {
        platform: "tiktok",
        success: false,
        error: `TikTok API error: ${errorMsg}`,
      };
    }

    const result = await response.json();

    // -- TikTok returns a publish_id for tracking --
    // The video is processing asynchronously on TikTok's servers
    // We can't get the final URL immediately, but the post was accepted
    const publishId = result?.data?.publish_id;

    return {
      platform: "tiktok",
      success: true,
      url: publishId ? `https://www.tiktok.com/@me (publish_id: ${publishId})` : undefined,
      posted_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      platform: "tiktok",
      success: false,
      error: `TikTok upload failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function buildCaption(input: PublishInput): string {
  // Combines caption text with hashtags into one string
  // TikTok captions include hashtags inline (not as separate metadata)
  const text = input.captions.caption || input.topic;
  const hashtags = input.captions.hashtags || [];

  // Format hashtags: ensure each starts with #
  const tagString = hashtags
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .join(" ");

  // Combine caption + hashtags with a line break
  const fullCaption = tagString ? `${text}\n\n${tagString}` : text;

  // TikTok caption limit is 2200 characters
  if (fullCaption.length > 2200) {
    return fullCaption.slice(0, 2197) + "...";
  }

  return fullCaption;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:\Users\User\luminous-will-web && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd C:\Users\User\luminous-will-web
git add lib/publishers/tiktok.ts
git commit -m "feat: TikTok publisher with URL-based upload"
```

---

### Task 4: Instagram Publisher

**Files:**
- Create: `lib/publishers/instagram.ts`

**Interfaces:**
- Consumes: `getToken("meta")` from `@/lib/tokens`, `PostResult` and `PublishInput` from `@/lib/publishers/types`
- Produces: `publishToInstagram(input: PublishInput): Promise<PostResult>`

- [ ] **Step 1: Create `lib/publishers/instagram.ts`**

```typescript
// ─────────────────────────────────────────────────────────────
//  Instagram Publisher — posts Reels via Instagram Graph API
//  Uses URL-based upload: we pass the Blob URL and Meta's servers
//  download + process the video themselves.
//
//  Upload flow (two-step process per Instagram API):
//    1. Create a media container with the video URL
//    2. Poll until the container is ready (Meta processes the video)
//    3. Publish the container
//    4. Return PostResult with the Reel URL
//
//  Note: Uses the same Meta OAuth token as the Facebook publisher
// ─────────────────────────────────────────────────────────────

import { getToken } from "@/lib/tokens";
import type { PostResult, PublishInput } from "@/lib/publishers/types";

// -- Meta Graph API base URL --
const GRAPH_API = "https://graph.facebook.com/v21.0";

// -- Polling settings for container processing --
// Instagram needs time to download + transcode the video
const POLL_INTERVAL_MS = 3000;   // check every 3 seconds
const MAX_POLL_ATTEMPTS = 15;    // give up after ~45 seconds

export async function publishToInstagram(input: PublishInput): Promise<PostResult> {
  // Get a valid Meta access token — auto-refreshes if expired
  const token = await getToken("meta");
  if (!token) {
    return {
      platform: "instagram",
      success: false,
      error: "Instagram not connected. Connect Meta in Settings.",
    };
  }

  try {
    // -- Step 1: Get the Instagram Business account ID --
    const igUserId = await getInstagramUserId(token.access_token);
    if (!igUserId) {
      return {
        platform: "instagram",
        success: false,
        error: "Could not find Instagram Business account. Ensure your Facebook Page is linked to an Instagram Business account.",
      };
    }

    // -- Step 2: Build caption with hashtags --
    const caption = buildCaption(input);

    // -- Step 3: Create media container --
    // This tells Instagram to download the video from our Blob URL
    const containerResponse = await fetch(
      `${GRAPH_API}/${igUserId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_url: input.video_url,
          caption,
          media_type: "REELS",
          access_token: token.access_token,
        }),
      }
    );

    if (!containerResponse.ok) {
      const errorData = await containerResponse.json().catch(() => ({}));
      return {
        platform: "instagram",
        success: false,
        error: `Instagram container error: ${errorData?.error?.message || containerResponse.status}`,
      };
    }

    const container = await containerResponse.json();
    const containerId = container.id;

    // -- Step 4: Poll until container is ready --
    const ready = await pollContainerStatus(containerId, token.access_token);
    if (!ready) {
      return {
        platform: "instagram",
        success: false,
        error: "Instagram took too long to process the video. Try again later.",
      };
    }

    // -- Step 5: Publish the container --
    const publishResponse = await fetch(
      `${GRAPH_API}/${igUserId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: token.access_token,
        }),
      }
    );

    if (!publishResponse.ok) {
      const errorData = await publishResponse.json().catch(() => ({}));
      return {
        platform: "instagram",
        success: false,
        error: `Instagram publish error: ${errorData?.error?.message || publishResponse.status}`,
      };
    }

    const published = await publishResponse.json();
    const postUrl = `https://www.instagram.com/reel/${published.id}/`;

    return {
      platform: "instagram",
      success: true,
      url: postUrl,
      posted_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      platform: "instagram",
      success: false,
      error: `Instagram upload failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function getInstagramUserId(accessToken: string): Promise<string | null> {
  // Finds the Instagram Business account ID linked to the user's Facebook Page
  // The Meta token gives access to Pages, and each Page can have a linked IG account
  try {
    // First get the user's Facebook Pages
    const pagesResponse = await fetch(
      `${GRAPH_API}/me/accounts?fields=instagram_business_account&access_token=${accessToken}`
    );
    if (!pagesResponse.ok) return null;

    const pages = await pagesResponse.json();
    // Find the first page that has a linked Instagram account
    for (const page of pages.data || []) {
      if (page.instagram_business_account?.id) {
        return page.instagram_business_account.id;
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function pollContainerStatus(containerId: string, accessToken: string): Promise<boolean> {
  // Polls Instagram until the media container is finished processing
  // Returns true when ready, false if it times out or fails
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const statusResponse = await fetch(
      `${GRAPH_API}/${containerId}?fields=status_code&access_token=${accessToken}`
    );

    if (statusResponse.ok) {
      const status = await statusResponse.json();

      if (status.status_code === "FINISHED") {
        return true;
      }

      if (status.status_code === "ERROR") {
        return false;
      }
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  // Timed out
  return false;
}

function buildCaption(input: PublishInput): string {
  // Combines caption text with hashtags for Instagram
  // Instagram allows up to 2200 chars and 30 hashtags
  const text = input.captions.caption || input.topic;
  const hashtags = input.captions.hashtags || [];

  // Format hashtags: ensure each starts with #
  const tagString = hashtags
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .join(" ");

  // Combine with double line break (Instagram convention)
  return tagString ? `${text}\n\n${tagString}` : text;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:\Users\User\luminous-will-web && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd C:\Users\User\luminous-will-web
git add lib/publishers/instagram.ts
git commit -m "feat: Instagram Reels publisher with container polling"
```

---

### Task 5: Facebook Publisher

**Files:**
- Create: `lib/publishers/facebook.ts`

**Interfaces:**
- Consumes: `getToken("meta")` from `@/lib/tokens`, `PostResult` and `PublishInput` from `@/lib/publishers/types`
- Produces: `publishToFacebook(input: PublishInput): Promise<PostResult>`

- [ ] **Step 1: Create `lib/publishers/facebook.ts`**

```typescript
// ─────────────────────────────────────────────────────────────
//  Facebook Publisher — posts videos to a Facebook Page
//  Uses URL-based upload: we pass the Blob URL and Meta's servers
//  download the video themselves.
//
//  Upload flow:
//    1. Get the user's Facebook Page ID
//    2. Post video to /{page-id}/videos with file_url
//    3. Return PostResult with the post URL
//
//  Note: Uses the same Meta OAuth token as the Instagram publisher
// ─────────────────────────────────────────────────────────────

import { getToken } from "@/lib/tokens";
import type { PostResult, PublishInput } from "@/lib/publishers/types";

// -- Meta Graph API base URL --
const GRAPH_API = "https://graph.facebook.com/v21.0";

export async function publishToFacebook(input: PublishInput): Promise<PostResult> {
  // Get a valid Meta access token — auto-refreshes if expired
  const token = await getToken("meta");
  if (!token) {
    return {
      platform: "facebook",
      success: false,
      error: "Facebook not connected. Connect Meta in Settings.",
    };
  }

  try {
    // -- Step 1: Get the user's Facebook Page ID and page access token --
    const pageInfo = await getPageInfo(token.access_token);
    if (!pageInfo) {
      return {
        platform: "facebook",
        success: false,
        error: "No Facebook Page found. Create a Facebook Page and link it to the Meta app.",
      };
    }

    // -- Step 2: Build description with inline hashtags --
    const description = buildDescription(input);

    // -- Step 3: Upload video to the Page --
    // Facebook's API accepts a file_url and downloads it server-side
    const uploadResponse = await fetch(
      `${GRAPH_API}/${pageInfo.pageId}/videos`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_url: input.video_url,
          description,
          title: input.captions.title || input.topic,
          access_token: pageInfo.pageAccessToken,
        }),
      }
    );

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json().catch(() => ({}));
      return {
        platform: "facebook",
        success: false,
        error: `Facebook upload error: ${errorData?.error?.message || uploadResponse.status}`,
      };
    }

    const result = await uploadResponse.json();
    // Facebook returns the video ID — construct the URL
    const postUrl = `https://www.facebook.com/${pageInfo.pageId}/videos/${result.id}`;

    return {
      platform: "facebook",
      success: true,
      url: postUrl,
      posted_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      platform: "facebook",
      success: false,
      error: `Facebook upload failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function getPageInfo(
  accessToken: string
): Promise<{ pageId: string; pageAccessToken: string } | null> {
  // Gets the first Facebook Page the user manages and its page-specific access token
  // Page access tokens are needed for posting to Pages (not user tokens)
  try {
    const response = await fetch(
      `${GRAPH_API}/me/accounts?fields=id,name,access_token&access_token=${accessToken}`
    );
    if (!response.ok) return null;

    const data = await response.json();
    const firstPage = data.data?.[0];
    if (!firstPage) return null;

    return {
      pageId: firstPage.id,
      pageAccessToken: firstPage.access_token,
    };
  } catch {
    return null;
  }
}

function buildDescription(input: PublishInput): string {
  // Builds the Facebook post description
  // Facebook convention: hashtags go inline at the end of the description
  const text = input.captions.description || input.captions.caption || input.topic;
  const hashtags = input.captions.hashtags || [];

  // Format hashtags inline (Facebook style: at the end, with # prefix)
  const tagString = hashtags
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .join(" ");

  return tagString ? `${text}\n\n${tagString}` : text;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:\Users\User\luminous-will-web && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd C:\Users\User\luminous-will-web
git add lib/publishers/facebook.ts
git commit -m "feat: Facebook Page video publisher with URL-based upload"
```

---

### Task 6: Post Orchestrator

**Files:**
- Create: `lib/publisher.ts`

**Interfaces:**
- Consumes:
  - `publishToYouTube(input: PublishInput): Promise<PostResult>` from `@/lib/publishers/youtube`
  - `publishToTikTok(input: PublishInput): Promise<PostResult>` from `@/lib/publishers/tiktok`
  - `publishToInstagram(input: PublishInput): Promise<PostResult>` from `@/lib/publishers/instagram`
  - `publishToFacebook(input: PublishInput): Promise<PostResult>` from `@/lib/publishers/facebook`
  - `isConnected(platform)` from `@/lib/tokens`
  - `QueueEntry`, `updateEntry()` from `@/lib/queue`
- Produces:
  - `publishToPlatforms(entry: QueueEntry, platforms: string[]): Promise<Record<string, PostResult>>`
  - `retryFailed(entry: QueueEntry): Promise<Record<string, PostResult>>`

- [ ] **Step 1: Create `lib/publisher.ts`**

```typescript
// ─────────────────────────────────────────────────────────────
//  Post Orchestrator — coordinates publishing to all platforms
//  Called by the publish and retry API routes.
//
//  Runs all selected publishers in parallel via Promise.allSettled.
//  Each platform is independent — one failure never blocks others.
//  One automatic retry on network timeout or rate limit.
//
//  Updates the queue entry with per-platform results after posting.
// ─────────────────────────────────────────────────────────────

import { publishToYouTube } from "@/lib/publishers/youtube";
import { publishToTikTok } from "@/lib/publishers/tiktok";
import { publishToInstagram } from "@/lib/publishers/instagram";
import { publishToFacebook } from "@/lib/publishers/facebook";
import { isConnected } from "@/lib/tokens";
import { updateEntry } from "@/lib/queue";
import type { QueueEntry } from "@/lib/queue";
import type { PostResult, PublishInput, PlatformType } from "@/lib/publishers/types";

// -- Maps platform names to their publisher functions --
const PUBLISHERS: Record<string, (input: PublishInput) => Promise<PostResult>> = {
  youtube: publishToYouTube,
  tiktok: publishToTikTok,
  instagram: publishToInstagram,
  facebook: publishToFacebook,
};

// -- Maps platform names to which OAuth provider they use --
// Instagram and Facebook both use the "meta" token
const PLATFORM_TO_PROVIDER: Record<string, PlatformType> = {
  youtube: "youtube",
  tiktok: "tiktok",
  instagram: "meta",
  facebook: "meta",
};

export async function publishToPlatforms(
  entry: QueueEntry,
  platforms: string[]
): Promise<Record<string, PostResult>> {
  // Main entry point — publishes to all selected platforms in parallel
  // Returns per-platform PostResult objects

  // -- Pre-flight: verify video URL is accessible --
  const videoCheck = await fetch(entry.video_url || "", { method: "HEAD" }).catch(() => null);
  if (!videoCheck || !videoCheck.ok) {
    // Video is not accessible — fail everything
    const errorResult: Record<string, PostResult> = {};
    for (const platform of platforms) {
      errorResult[platform] = {
        platform,
        success: false,
        error: "Video URL is not accessible. The file may have been deleted from Blob storage.",
      };
    }
    await updateEntry(entry.id, { status: "failed", post_results: errorResult, error: "Video URL inaccessible" });
    return errorResult;
  }

  // -- Set status to "posting" so dashboard shows progress --
  await updateEntry(entry.id, { status: "posting" });

  // -- Filter to only connected platforms --
  const validPlatforms: string[] = [];
  const skippedResults: Record<string, PostResult> = {};

  for (const platform of platforms) {
    const provider = PLATFORM_TO_PROVIDER[platform];
    if (!provider || !PUBLISHERS[platform]) {
      skippedResults[platform] = {
        platform,
        success: false,
        error: `Unknown platform: ${platform}`,
      };
      continue;
    }

    const connected = await isConnected(provider);
    if (!connected) {
      skippedResults[platform] = {
        platform,
        success: false,
        error: `${platform} not connected. Connect in Settings.`,
      };
      continue;
    }

    validPlatforms.push(platform);
  }

  // -- Build PublishInput for each platform from the queue entry --
  const results: Record<string, PostResult> = { ...skippedResults };

  // -- Run all publishers in parallel --
  const publishPromises = validPlatforms.map(async (platform) => {
    const input = buildPublishInput(entry, platform);
    const publisher = PUBLISHERS[platform];

    // First attempt
    let result = await publisher(input);

    // -- One retry on network/rate-limit errors --
    if (!result.success && isRetryableError(result.error)) {
      // Wait 2 seconds before retry (helps with rate limits)
      await new Promise((resolve) => setTimeout(resolve, 2000));
      result = await publisher(input);
    }

    return { platform, result };
  });

  const settled = await Promise.allSettled(publishPromises);

  // -- Collect results --
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      results[outcome.value.platform] = outcome.value.result;
    } else {
      // Promise itself rejected — shouldn't happen but handle gracefully
      const platform = "unknown";
      results[platform] = {
        platform,
        success: false,
        error: `Unexpected error: ${outcome.reason}`,
      };
    }
  }

  // -- Determine final status --
  const allResults = Object.values(results);
  const anySuccess = allResults.some((r) => r.success);
  const allFailed = allResults.every((r) => !r.success);

  // -- Build error summary for failed platforms --
  const failedPlatforms = allResults.filter((r) => !r.success).map((r) => r.platform);
  const errorSummary = failedPlatforms.length > 0
    ? `Failed on: ${failedPlatforms.join(", ")}`
    : null;

  // -- Update queue entry with results --
  await updateEntry(entry.id, {
    status: allFailed ? "failed" : "posted",
    post_results: results,
    error: errorSummary,
  });

  return results;
}

export async function retryFailed(entry: QueueEntry): Promise<Record<string, PostResult>> {
  // Retries only the platforms that failed in a previous publish attempt
  // Keeps successful results from the original attempt
  const previousResults = (entry.post_results || {}) as Record<string, PostResult>;

  // Find which platforms failed
  const failedPlatforms = Object.entries(previousResults)
    .filter(([, result]) => !result.success)
    .map(([platform]) => platform);

  if (failedPlatforms.length === 0) {
    return previousResults;
  }

  // Retry only the failed ones
  const retryResults = await publishToPlatforms(entry, failedPlatforms);

  // Merge: keep old successes + new retry results
  const merged: Record<string, PostResult> = { ...previousResults, ...retryResults };

  // Update status based on merged results
  const allMerged = Object.values(merged);
  const anySuccess = allMerged.some((r) => r.success);
  const allFailed = allMerged.every((r) => !r.success);

  await updateEntry(entry.id, {
    status: allFailed ? "failed" : "posted",
    post_results: merged,
    error: allFailed ? "All platforms failed" : null,
  });

  return merged;
}

function buildPublishInput(entry: QueueEntry, platform: string): PublishInput {
  // Extracts the platform-specific captions from the queue entry
  // Falls back to topic as title if captions are missing
  const platformCaptions = entry.captions?.[platform] || {};

  return {
    video_url: entry.video_url || "",
    thumbnail_url: entry.thumbnail_url,
    captions: {
      caption: platformCaptions.caption,
      description: platformCaptions.description,
      title: platformCaptions.title,
      hashtags: platformCaptions.hashtags,
      tags: platformCaptions.tags,
      category: platformCaptions.category,
    },
    format: entry.format,
    topic: entry.topic,
    duration: entry.duration,
  };
}

function isRetryableError(error?: string): boolean {
  // Determines if an error is worth retrying (network issues, rate limits)
  // Auth errors should NOT be retried — they need user action
  if (!error) return false;
  const lower = error.toLowerCase();
  return (
    lower.includes("timeout") ||
    lower.includes("network") ||
    lower.includes("econnreset") ||
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests")
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:\Users\User\luminous-will-web && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd C:\Users\User\luminous-will-web
git add lib/publisher.ts
git commit -m "feat: post orchestrator with parallel execution and retry"
```

---

### Task 7: Publish + Retry API Routes

**Files:**
- Create: `app/api/queue/[id]/publish/route.ts`
- Create: `app/api/queue/[id]/retry/route.ts`

**Interfaces:**
- Consumes: `publishToPlatforms()` and `retryFailed()` from `@/lib/publisher`, `getEntry()` from `@/lib/queue`
- Produces:
  - `POST /api/queue/[id]/publish` — accepts `{ platforms: string[], scheduled_post_time?: string }`, triggers posting or schedules
  - `POST /api/queue/[id]/retry` — retries failed platforms for the given entry

- [ ] **Step 1: Create `app/api/queue/[id]/publish/route.ts`**

```typescript
// ─────────────────────────────────────────────────────────────
//  POST /api/queue/:id/publish
//  Triggers posting a video to selected platforms.
//  If scheduled_post_time is provided, schedules for later instead.
//
//  Request body:
//    { platforms: ["youtube", "tiktok", ...], scheduled_post_time?: "ISO string" }
//
//  Response:
//    { results: Record<string, PostResult> } on immediate post
//    { scheduled: true, entry: QueueEntry } on scheduled post
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getEntry, updateEntry } from "@/lib/queue";
import { publishToPlatforms } from "@/lib/publisher";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // -- Parse request body --
  const body = await request.json().catch(() => ({}));
  const platforms: string[] = body.platforms || ["youtube", "tiktok", "instagram", "facebook"];
  const scheduledTime: string | null = body.scheduled_post_time || null;

  // -- Load the queue entry --
  const entry = await getEntry(id);
  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  // -- Only allow publishing pending_review entries --
  if (entry.status !== "pending_review") {
    return NextResponse.json(
      { error: `Cannot publish entry with status "${entry.status}"` },
      { status: 400 }
    );
  }

  // -- Scheduled post: save for later and return --
  if (scheduledTime) {
    const updated = await updateEntry(id, {
      status: "approved",
      scheduled_post_time: scheduledTime,
      target_platforms: platforms,
    });
    return NextResponse.json({ scheduled: true, entry: updated });
  }

  // -- Immediate post: publish now --
  const results = await publishToPlatforms(entry, platforms);
  return NextResponse.json({ results });
}
```

- [ ] **Step 2: Create `app/api/queue/[id]/retry/route.ts`**

```typescript
// ─────────────────────────────────────────────────────────────
//  POST /api/queue/:id/retry
//  Retries only the platforms that failed in a previous publish.
//  Keeps successful results from the original attempt.
//
//  No request body needed — it reads the failed platforms
//  from the entry's post_results.
//
//  Response:
//    { results: Record<string, PostResult> }
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getEntry } from "@/lib/queue";
import { retryFailed } from "@/lib/publisher";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // -- Load the queue entry --
  const entry = await getEntry(id);
  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  // -- Only allow retrying failed or posted-with-errors entries --
  if (entry.status !== "failed" && entry.status !== "posted") {
    return NextResponse.json(
      { error: `Cannot retry entry with status "${entry.status}"` },
      { status: 400 }
    );
  }

  // -- Retry the failed platforms --
  const results = await retryFailed(entry);
  return NextResponse.json({ results });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd C:\Users\User\luminous-will-web && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd C:\Users\User\luminous-will-web
git add app/api/queue/\[id\]/publish/route.ts app/api/queue/\[id\]/retry/route.ts
git commit -m "feat: publish and retry API routes"
```

---

### Task 8: OAuth Routes (YouTube, TikTok, Meta)

**Files:**
- Create: `app/api/auth/youtube/route.ts`
- Create: `app/api/auth/youtube/callback/route.ts`
- Create: `app/api/auth/tiktok/route.ts`
- Create: `app/api/auth/tiktok/callback/route.ts`
- Create: `app/api/auth/meta/route.ts`
- Create: `app/api/auth/meta/callback/route.ts`
- Create: `app/api/auth/status/route.ts`
- Create: `app/api/auth/disconnect/route.ts`

**Interfaces:**
- Consumes: `saveToken()`, `deleteToken()`, `getConnectionStatus()` from `@/lib/tokens`
- Produces:
  - `GET /api/auth/youtube` — redirects to Google OAuth consent
  - `GET /api/auth/youtube/callback` — exchanges code for tokens, saves, redirects to /settings
  - `GET /api/auth/tiktok` — redirects to TikTok OAuth
  - `GET /api/auth/tiktok/callback` — exchanges code for tokens, saves, redirects to /settings
  - `GET /api/auth/meta` — redirects to Meta OAuth
  - `GET /api/auth/meta/callback` — exchanges code for tokens, saves, redirects to /settings
  - `GET /api/auth/status` — returns connection status for all platforms
  - `POST /api/auth/disconnect` — disconnects a platform by deleting its token

- [ ] **Step 1: Create `app/api/auth/youtube/route.ts`**

```typescript
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
```

- [ ] **Step 2: Create `app/api/auth/youtube/callback/route.ts`**

```typescript
// ─────────────────────────────────────────────────────────────
//  GET /api/auth/youtube/callback
//  Google redirects here after the user approves.
//  Exchanges the auth code for access + refresh tokens,
//  saves them to Blob, and redirects to /settings.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { saveToken } from "@/lib/tokens";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // -- Handle denial or error --
  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/settings?error=youtube_denied`);
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

    return NextResponse.redirect(`${appUrl}/settings?connected=youtube`);
  } catch {
    return NextResponse.redirect(`${appUrl}/settings?error=youtube_failed`);
  }
}
```

- [ ] **Step 3: Create `app/api/auth/tiktok/route.ts`**

```typescript
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
```

- [ ] **Step 4: Create `app/api/auth/tiktok/callback/route.ts`**

```typescript
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

    // -- Save tokens to Blob --
    await saveToken("tiktok", {
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expires_at: Math.floor(Date.now() / 1000) + (tokens.expires_in || 86400),
      account_name: tokens.open_id || "TikTok Account",
    });

    return NextResponse.redirect(`${appUrl}/settings?connected=tiktok`);
  } catch {
    return NextResponse.redirect(`${appUrl}/settings?error=tiktok_failed`);
  }
}
```

- [ ] **Step 5: Create `app/api/auth/meta/route.ts`**

```typescript
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
```

- [ ] **Step 6: Create `app/api/auth/meta/callback/route.ts`**

```typescript
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
```

- [ ] **Step 7: Create `app/api/auth/status/route.ts`**

```typescript
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
```

- [ ] **Step 8: Create `app/api/auth/disconnect/route.ts`**

```typescript
// ─────────────────────────────────────────────────────────────
//  POST /api/auth/disconnect
//  Disconnects a platform by deleting its token from Blob.
//  Request body: { platform: "youtube" | "tiktok" | "meta" }
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { deleteToken } from "@/lib/tokens";
import type { PlatformType } from "@/lib/publishers/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const platform = body.platform as PlatformType;

  // Validate platform name
  if (!platform || !["youtube", "tiktok", "meta"].includes(platform)) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  await deleteToken(platform);
  return NextResponse.json({ disconnected: platform });
}
```

- [ ] **Step 9: Verify TypeScript compiles**

Run: `cd C:\Users\User\luminous-will-web && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 10: Commit**

```bash
cd C:\Users\User\luminous-will-web
git add app/api/auth/
git commit -m "feat: OAuth routes for YouTube, TikTok, Meta + status + disconnect"
```

---

### Task 9: Settings Page

**Files:**
- Create: `app/settings/page.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/auth/status` — returns `Record<PlatformType, ConnectionStatus>`
  - `GET /api/auth/youtube` — redirect to Google OAuth
  - `GET /api/auth/tiktok` — redirect to TikTok OAuth
  - `GET /api/auth/meta` — redirect to Meta OAuth
  - `POST /api/auth/disconnect` — body `{ platform: PlatformType }`
- Produces: `/settings` page with four platform connection cards

- [ ] **Step 1: Create `app/settings/page.tsx`**

```typescript
"use client";

// ─────────────────────────────────────────────────────────────
//  Luminous Will — Platform Connection Settings
//  Four cards for YouTube, TikTok, Instagram, Facebook.
//  Each card shows connection status and allows connect/disconnect.
//
//  Instagram and Facebook share one Meta OAuth connection.
//
//  Brand tokens (same as dashboard):
//    Background:  #000000
//    Panel:       #1a1a1a
//    Border:      #333333
//    Accent:      #E8A817  (amber)
//    Success:     #22c55e  (green)
//    Warning:     #f59e0b  (yellow)
//    Danger:      #ef4444  (red)
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";

// -- Connection status shape returned by /api/auth/status --
interface ConnectionStatus {
  connected: boolean;
  account_name?: string;
  needs_reconnect?: boolean;
}

// -- Platform card configuration --
interface PlatformConfig {
  // Display name shown on the card
  name: string;
  // Which OAuth provider handles this platform
  provider: "youtube" | "tiktok" | "meta";
  // URL path to start the OAuth flow
  authUrl: string;
  // Platform icon (text-based for simplicity)
  icon: string;
  // Short description shown under the platform name
  description: string;
}

// -- All four platforms and their OAuth mappings --
const PLATFORMS: PlatformConfig[] = [
  {
    name: "YouTube",
    provider: "youtube",
    authUrl: "/api/auth/youtube",
    icon: "▶",
    description: "Upload videos and Shorts automatically",
  },
  {
    name: "TikTok",
    provider: "tiktok",
    authUrl: "/api/auth/tiktok",
    icon: "♪",
    description: "Post short-form content to TikTok",
  },
  {
    name: "Instagram",
    provider: "meta",
    authUrl: "/api/auth/meta",
    icon: "◎",
    description: "Publish Reels to Instagram",
  },
  {
    name: "Facebook",
    provider: "meta",
    authUrl: "/api/auth/meta",
    icon: "f",
    description: "Share videos to your Facebook Page",
  },
];

export default function SettingsPage() {
  // Connection status for each OAuth provider
  const [status, setStatus] = useState<Record<string, ConnectionStatus>>({});
  const [loading, setLoading] = useState(true);
  // Tracks which platform is being disconnected (for confirmation dialog)
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  // Success toast message from URL params (after OAuth redirect)
  const [toast, setToast] = useState<string | null>(null);

  // -- Load connection status on mount --
  useEffect(() => {
    loadStatus();

    // Check URL params for success/error messages from OAuth callback
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");

    if (connected) {
      setToast(`${connected} connected successfully!`);
      // Clean URL params
      window.history.replaceState({}, "", "/settings");
    } else if (error) {
      setToast(`Connection failed: ${error}`);
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  // Auto-dismiss toast after 5 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function loadStatus() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/status");
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch {
      // Status API unavailable — show everything as disconnected
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect(provider: string) {
    // Delete the token and refresh status
    await fetch("/api/auth/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: provider }),
    });
    setDisconnecting(null);
    loadStatus();
  }

  function handleConnect(authUrl: string) {
    // Full page redirect to OAuth consent screen
    window.location.href = authUrl;
  }

  // -- Helper: get status for a platform's OAuth provider --
  function getProviderStatus(provider: string): ConnectionStatus {
    return status[provider] || { connected: false };
  }

  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-10 max-w-4xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#E8A817" }}>
            Platform Connections
          </h1>
          <p className="text-sm text-[#555] mt-1">
            Connect your accounts to enable auto-posting
          </p>
        </div>
        {/* Back to dashboard link */}
        <a
          href="/dashboard"
          className="px-4 py-2 text-xs uppercase tracking-wider border border-[#333] text-[#555] hover:text-[#E8A817] hover:border-[#E8A817] rounded-lg transition-all"
        >
          ← Dashboard
        </a>
      </div>

      {/* ── Success/error toast ── */}
      {toast && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg border ${
            toast.includes("failed")
              ? "border-[#ef4444]/30 bg-[#ef4444]/5 text-[#ef4444]"
              : "border-[#22c55e]/30 bg-[#22c55e]/5 text-[#22c55e]"
          }`}
        >
          <p className="text-sm">{toast}</p>
        </div>
      )}

      {/* ── Platform cards grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PLATFORMS.map((platform) => {
          const providerStatus = getProviderStatus(platform.provider);
          const isMetaPlatform = platform.provider === "meta";
          // For Meta platforms, show note that one connection covers both
          const metaNote = isMetaPlatform && providerStatus.connected
            ? "Connected via Meta (covers Instagram + Facebook)"
            : undefined;

          return (
            <div
              key={platform.name}
              className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 flex flex-col gap-4"
            >
              {/* Platform header: icon + name + description */}
              <div className="flex items-start gap-4">
                {/* Icon circle */}
                <div className="w-12 h-12 rounded-xl bg-[#0a0a0a] border border-[#333] flex items-center justify-center text-xl flex-shrink-0">
                  <span style={{ color: "#E8A817" }}>{platform.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-white">{platform.name}</h3>
                  <p className="text-xs text-[#555] mt-0.5">{platform.description}</p>
                </div>
              </div>

              {/* Status + action */}
              {loading ? (
                // Loading state
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#333] animate-pulse" />
                  <span className="text-xs text-[#555]">Checking...</span>
                </div>
              ) : providerStatus.needs_reconnect ? (
                // Needs reconnect state
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#f59e0b]" />
                    <span className="text-xs text-[#f59e0b]">
                      Needs reconnection
                      {providerStatus.account_name && ` — ${providerStatus.account_name}`}
                    </span>
                  </div>
                  <button
                    onClick={() => handleConnect(platform.authUrl)}
                    className="w-full py-2.5 rounded-xl bg-[#f59e0b]/10 border border-[#f59e0b]/40 text-[#f59e0b] font-semibold text-sm uppercase tracking-wider hover:bg-[#f59e0b]/20 transition-all"
                  >
                    Reconnect
                  </button>
                </div>
              ) : providerStatus.connected ? (
                // Connected state
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#22c55e]" />
                    <span className="text-xs text-[#22c55e]">
                      Connected{providerStatus.account_name && ` — ${providerStatus.account_name}`}
                    </span>
                  </div>
                  {metaNote && (
                    <p className="text-[10px] text-[#444]">{metaNote}</p>
                  )}
                  {/* Disconnect flow */}
                  {disconnecting === platform.name ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDisconnect(platform.provider)}
                        className="flex-1 py-2 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/40 text-[#ef4444] text-xs uppercase tracking-wider hover:bg-[#ef4444]/20 transition-all"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDisconnecting(null)}
                        className="px-4 py-2 rounded-xl border border-[#333] text-[#555] text-xs hover:text-[#888] transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDisconnecting(platform.name)}
                      className="w-full py-2 rounded-xl border border-[#333] text-[#444] text-xs uppercase tracking-wider hover:text-[#888] hover:border-[#555] transition-all"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              ) : (
                // Not connected state
                <button
                  onClick={() => handleConnect(platform.authUrl)}
                  className="w-full py-2.5 rounded-xl bg-[#E8A817]/10 border border-[#E8A817]/40 text-[#E8A817] font-semibold text-sm uppercase tracking-wider hover:bg-[#E8A817]/20 hover:border-[#E8A817] transition-all"
                >
                  Connect {platform.name}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Info note ── */}
      <div className="mt-8 px-4 py-3 bg-[#0a0a0a] border border-[#222] rounded-xl">
        <p className="text-xs text-[#444]">
          Instagram and Facebook use the same Meta connection. Connecting one connects both.
          All tokens are stored securely and refresh automatically.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles and dev server renders**

Run: `cd C:\Users\User\luminous-will-web && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors.

Run: `cd C:\Users\User\luminous-will-web && npx next build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd C:\Users\User\luminous-will-web
git add app/settings/page.tsx
git commit -m "feat: settings page with platform connection cards"
```

---

### Task 10: Dashboard Upgrade (Approve Flow + Post Results)

**Files:**
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/auth/status` — connection status for platform toggles
  - `POST /api/queue/[id]/publish` — body `{ platforms: string[], scheduled_post_time?: string }`
  - `POST /api/queue/[id]/retry` — retries failed platforms
- Produces: Updated dashboard with platform toggles on approve, post results display, retry button, settings link

- [ ] **Step 1: Add `post_results` to the `QueueEntry` interface**

In `app/dashboard/page.tsx`, update the `QueueEntry` interface (around line 28) to add the fields needed for post results display:

```typescript
// Full queue entry returned by /api/queue
interface QueueEntry {
  id: string;
  topic: string;
  format: "short" | "long";
  status: "pending_review" | "approved" | "rejected" | "posting" | "posted" | "failed";
  created_at: string;
  video_url?: string;
  thumbnail_url?: string;
  // Keyed by platform name e.g. { tiktok: {...}, instagram: {...} }
  captions?: Record<string, PlatformCaption>;
  script_text?: string;
  duration?: number;
  target_platforms?: string[];
  // Per-platform posting results after publish
  post_results?: Record<string, { platform: string; success: boolean; url?: string; error?: string; posted_at?: string }>;
  // Scheduled post time (ISO string) — null means immediate
  scheduled_post_time?: string | null;
  // Summary error message if any platforms failed
  error?: string | null;
}
```

- [ ] **Step 2: Replace `ReviewActions` component with `PublishActions`**

Replace the existing `ReviewActions` component (around line 423-507) with a new component that includes platform toggles and schedule option:

```typescript
// ── PublishActions ───────────────────────────────────────────
// Approve flow with platform toggles, schedule option, and reject.
// Replaces the old ReviewActions component.
function PublishActions({
  entry,
  onPublish,
  onReject,
  onRetry,
  connectionStatus,
}: {
  entry: QueueEntry;
  onPublish: (id: string, platforms: string[], scheduledTime?: string) => void;
  onReject: (id: string) => void;
  onRetry: (id: string) => void;
  connectionStatus: Record<string, { connected: boolean }>;
}) {
  // Which step of the approve flow we're on
  const [step, setStep] = useState<"idle" | "selecting" | "confirming-reject">("idle");
  // Platform toggles — all on by default
  const [selectedPlatforms, setSelectedPlatforms] = useState<Record<string, boolean>>({
    youtube: true,
    tiktok: true,
    instagram: true,
    facebook: true,
  });
  // Optional scheduled time
  const [scheduledTime, setScheduledTime] = useState("");

  // All four platform names for display
  const allPlatforms = ["youtube", "tiktok", "instagram", "facebook"];

  // Platform display labels
  const labels: Record<string, string> = {
    youtube: "YouTube",
    tiktok: "TikTok",
    instagram: "Instagram",
    facebook: "Facebook",
  };

  // Toggle a platform on/off
  function togglePlatform(platform: string) {
    setSelectedPlatforms((prev) => ({ ...prev, [platform]: !prev[platform] }));
  }

  // Get platforms that are selected AND connected
  function getActivePlatforms(): string[] {
    return allPlatforms.filter(
      (p) => selectedPlatforms[p] && connectionStatus[p === "instagram" || p === "facebook" ? "meta" : p]?.connected
    );
  }

  // -- Show post results for posted/failed entries --
  if (entry.status === "posted" || entry.status === "failed") {
    const results = entry.post_results || {};
    return (
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-wider text-[#555] mb-2">Post Results</p>
        {Object.entries(results).map(([platform, result]) => (
          <div key={platform} className="flex items-center gap-3 px-3 py-2 bg-[#0a0a0a] rounded-lg border border-[#222]">
            {/* Success/fail indicator */}
            <span className={`text-sm ${result.success ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
              {result.success ? "✓" : "✗"}
            </span>
            {/* Platform name */}
            <span className="text-sm text-white flex-1">{labels[platform] || platform}</span>
            {/* Post URL or error */}
            {result.success && result.url ? (
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#E8A817] hover:underline"
              >
                View post →
              </a>
            ) : result.error ? (
              <span className="text-xs text-[#ef4444] max-w-[200px] truncate">{result.error}</span>
            ) : null}
          </div>
        ))}
        {/* Retry button if any failed */}
        {Object.values(results).some((r) => !r.success) && (
          <button
            onClick={() => onRetry(entry.id)}
            className="w-full py-2.5 rounded-xl bg-[#E8A817]/10 border border-[#E8A817]/40 text-[#E8A817] font-semibold text-sm uppercase tracking-wider hover:bg-[#E8A817]/20 transition-all mt-2"
          >
            Retry Failed
          </button>
        )}
      </div>
    );
  }

  // -- Show posting spinner --
  if (entry.status === "posting") {
    return (
      <div className="px-4 py-3 rounded-xl border border-[#3b82f6]/30 bg-[#3b82f6]/5 text-center">
        <span className="text-sm text-[#3b82f6] uppercase tracking-wider animate-pulse">
          Posting to platforms...
        </span>
      </div>
    );
  }

  // -- Show scheduled info --
  if (entry.status === "approved" && entry.scheduled_post_time) {
    return (
      <div className="px-4 py-3 rounded-xl border border-[#22c55e]/30 bg-[#22c55e]/5 text-center space-y-2">
        <span className="text-sm text-[#22c55e] uppercase tracking-wider">
          Scheduled for {new Date(entry.scheduled_post_time).toLocaleString()}
        </span>
        <button
          onClick={() => onReject(entry.id)}
          className="text-xs text-[#555] hover:text-[#ef4444] transition-all"
        >
          Cancel scheduled post
        </button>
      </div>
    );
  }

  // -- Non-pending entries: show status badge --
  if (entry.status !== "pending_review") {
    const cfg = STATUS_CONFIG[entry.status];
    return (
      <div className={`px-4 py-3 rounded-xl border text-center ${cfg?.bgClass} border-[#333]`}>
        <span className={`text-sm font-semibold uppercase tracking-wider ${cfg?.textClass}`}>
          {cfg?.label || entry.status}
        </span>
      </div>
    );
  }

  // -- Reject confirmation --
  if (step === "confirming-reject") {
    return (
      <div className="flex gap-3 items-center">
        <span className="text-sm text-[#888] flex-1">Confirm rejection?</span>
        <button
          onClick={() => { onReject(entry.id); setStep("idle"); }}
          className="flex-1 py-3 rounded-xl bg-[#ef4444] text-white font-bold text-sm uppercase tracking-wider hover:bg-[#dc2626] transition-all"
        >
          ✗ Yes, Reject
        </button>
        <button
          onClick={() => setStep("idle")}
          className="px-4 py-3 rounded-xl border border-[#333] text-[#555] text-sm hover:text-[#888] transition-all"
        >
          Cancel
        </button>
      </div>
    );
  }

  // -- Platform selection step --
  if (step === "selecting") {
    const activePlatforms = getActivePlatforms();
    return (
      <div className="space-y-4">
        {/* Platform toggles */}
        <p className="text-xs uppercase tracking-wider text-[#555]">Select platforms</p>
        <div className="grid grid-cols-2 gap-2">
          {allPlatforms.map((platform) => {
            const provider = platform === "instagram" || platform === "facebook" ? "meta" : platform;
            const connected = connectionStatus[provider]?.connected;
            const selected = selectedPlatforms[platform];
            return (
              <button
                key={platform}
                onClick={() => connected && togglePlatform(platform)}
                disabled={!connected}
                className={`py-2 px-3 rounded-lg border text-xs uppercase tracking-wider transition-all ${
                  !connected
                    ? "border-[#222] text-[#333] cursor-not-allowed"
                    : selected
                    ? "border-[#E8A817] text-[#E8A817] bg-[#E8A817]/10"
                    : "border-[#333] text-[#555] hover:border-[#555]"
                }`}
              >
                {labels[platform]}
                {!connected && <span className="block text-[9px] text-[#333] normal-case mt-0.5">Not connected</span>}
              </button>
            );
          })}
        </div>

        {/* Optional schedule picker */}
        <div>
          <label className="text-xs text-[#555] uppercase tracking-wider block mb-1">
            Schedule (optional)
          </label>
          <input
            type="datetime-local"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#333] rounded-lg text-sm text-white focus:border-[#E8A817] focus:outline-none"
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => {
              onPublish(entry.id, activePlatforms, scheduledTime || undefined);
              setStep("idle");
            }}
            disabled={activePlatforms.length === 0}
            className="flex-1 py-3 rounded-xl bg-[#22c55e] text-black font-bold text-sm uppercase tracking-wider hover:bg-[#16a34a] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {scheduledTime ? "Schedule" : "Post Now"}
          </button>
          <button
            onClick={() => setStep("idle")}
            className="px-4 py-3 rounded-xl border border-[#333] text-[#555] text-sm hover:text-[#888] transition-all"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // -- Default: show Approve + Reject buttons --
  return (
    <div className="flex gap-3">
      <button
        onClick={() => setStep("selecting")}
        className="flex-1 py-3.5 rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/40 text-[#22c55e] font-bold text-sm uppercase tracking-wider hover:bg-[#22c55e]/20 hover:border-[#22c55e] transition-all"
      >
        ✓ Approve & Post
      </button>
      <button
        onClick={() => setStep("confirming-reject")}
        className="flex-1 py-3.5 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/40 text-[#ef4444] font-bold text-sm uppercase tracking-wider hover:bg-[#ef4444]/20 hover:border-[#ef4444] transition-all"
      >
        ✗ Reject
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Update `DashboardPage` to use the new component**

In the `DashboardPage` function component, add connection status state and the new handler functions. Replace the old `handleApprove` with `handlePublish`, add `handleRetry`, load connection status on mount, and pass props to the new `PublishActions` component instead of `ReviewActions`.

Add these state variables inside `DashboardPage()`:
```typescript
  // Connection status for platform toggles (loaded from /api/auth/status)
  const [connectionStatus, setConnectionStatus] = useState<Record<string, { connected: boolean }>>({});
```

Add this effect to load connection status:
```typescript
  // Load platform connection status for the approve flow toggles
  useEffect(() => {
    fetch("/api/auth/status")
      .then((res) => res.ok ? res.json() : {})
      .then(setConnectionStatus)
      .catch(() => {});
  }, []);
```

Replace the `handleApprove` function:
```typescript
  async function handlePublish(id: string, platforms: string[], scheduledTime?: string) {
    try {
      // Optimistically set status to posting
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: scheduledTime ? "approved" : "posting" } : e))
      );
      await fetch(`/api/queue/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms,
          scheduled_post_time: scheduledTime || null,
        }),
      });
      // Refresh to get updated results
      loadQueue();
    } catch {
      loadQueue();
    }
  }
```

Add the retry handler:
```typescript
  async function handleRetry(id: string) {
    try {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: "posting" } : e))
      );
      await fetch(`/api/queue/${id}/retry`, { method: "POST" });
      loadQueue();
    } catch {
      loadQueue();
    }
  }
```

Update the `ReviewCard` usage in the JSX. Replace:
```typescript
<ReviewActions entry={entry} onApprove={onApprove} onReject={onReject} />
```
with:
```typescript
<PublishActions
  entry={entry}
  onPublish={handlePublish}
  onReject={handleReject}
  onRetry={handleRetry}
  connectionStatus={connectionStatus}
/>
```

And update the `ReviewCard` component's props interface to accept the new handlers and pass them through.

Add a "Settings" link in the page header, next to the Refresh button:
```typescript
<a
  href="/settings"
  className="px-4 py-2 text-xs uppercase tracking-wider border border-[#333] text-[#555] hover:text-[#E8A817] hover:border-[#E8A817] rounded-lg transition-all"
>
  ⚙ Settings
</a>
```

- [ ] **Step 4: Verify TypeScript compiles and build succeeds**

Run: `cd C:\Users\User\luminous-will-web && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors.

Run: `cd C:\Users\User\luminous-will-web && npx next build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
cd C:\Users\User\luminous-will-web
git add app/dashboard/page.tsx
git commit -m "feat: dashboard upgrade — platform toggles, post results, retry, settings link"
```

---

### Task 11: Scheduled Posts Cron

**Files:**
- Create: `app/api/cron/post-scheduled/route.ts`
- Create: `vercel.json`

**Interfaces:**
- Consumes: `loadQueue()` from `@/lib/queue`, `publishToPlatforms()` from `@/lib/publisher`
- Produces: `GET /api/cron/post-scheduled` — processes scheduled posts, triggered by Vercel cron every 5 minutes

- [ ] **Step 1: Create `app/api/cron/post-scheduled/route.ts`**

```typescript
// ─────────────────────────────────────────────────────────────
//  GET /api/cron/post-scheduled
//  Vercel cron job that runs every 5 minutes.
//  Finds approved entries with scheduled_post_time in the past
//  and publishes them to their target platforms.
//
//  Vercel injects the CRON_SECRET header automatically —
//  we verify it to prevent unauthorized triggers.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { loadQueue } from "@/lib/queue";
import { publishToPlatforms } from "@/lib/publisher";

export async function GET(request: Request) {
  // -- Verify this is a legitimate Vercel cron request --
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // -- Load all queue entries --
  const entries = await loadQueue();
  const now = new Date();

  // -- Find entries that are scheduled and due --
  const dueEntries = entries.filter((entry) => {
    // Must be in "approved" status (set by the schedule flow)
    if (entry.status !== "approved") return false;
    // Must have a scheduled time
    if (!entry.scheduled_post_time) return false;
    // Scheduled time must be in the past
    return new Date(entry.scheduled_post_time) <= now;
  });

  if (dueEntries.length === 0) {
    return NextResponse.json({ processed: 0, message: "No scheduled posts due" });
  }

  // -- Process each due entry --
  const results: Array<{ id: string; status: string }> = [];

  for (const entry of dueEntries) {
    // Use target_platforms from the entry, or default to all four
    const platforms = entry.target_platforms || ["youtube", "tiktok", "instagram", "facebook"];

    try {
      await publishToPlatforms(entry, platforms);
      results.push({ id: entry.id, status: "published" });
    } catch (error) {
      results.push({ id: entry.id, status: `error: ${error}` });
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
  });
}
```

- [ ] **Step 2: Create `vercel.json` with cron configuration**

```json
{
  "crons": [
    {
      "path": "/api/cron/post-scheduled",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd C:\Users\User\luminous-will-web && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd C:\Users\User\luminous-will-web
git add app/api/cron/post-scheduled/route.ts vercel.json
git commit -m "feat: scheduled posts cron job (every 5 minutes)"
```

---

### Task 12: Update QueueEntry Type + Build Verification

**Files:**
- Modify: `lib/queue.ts` — add new fields to `QueueEntry` interface

**Interfaces:**
- Consumes: existing `lib/queue.ts`
- Produces: Updated `QueueEntry` with `post_results`, `scheduled_post_time`, `error` fields matching the dashboard and publishers

- [ ] **Step 1: Update the `QueueEntry` interface in `lib/queue.ts`**

Add missing fields needed by the publish system. The current interface has `post_results` and `scheduled_post_time` but the types need to match the `PostResult` shape:

```typescript
export interface QueueEntry {
  id: string;
  format: "short" | "long";
  topic: string;
  status: "pending_review" | "approved" | "rejected" | "posting" | "posted" | "failed";
  created_at: string;
  video_url?: string;
  thumbnail_url?: string;
  // Platform-specific captions keyed by platform name
  captions?: Record<string, { caption?: string; description?: string; title?: string; hashtags?: string[]; tags?: string[]; category?: string }>;
  script_text?: string;
  duration?: number;
  target_platforms?: string[];
  scheduled_post_time?: string | null;
  // Per-platform posting results after publish
  post_results?: Record<string, { platform: string; success: boolean; url?: string; error?: string; posted_at?: string }>;
  error?: string | null;
}
```

- [ ] **Step 2: Run full build to verify everything compiles together**

Run: `cd C:\Users\User\luminous-will-web && npx next build 2>&1 | tail -30`
Expected: Build succeeds with all routes compiled.

- [ ] **Step 3: Commit**

```bash
cd C:\Users\User\luminous-will-web
git add lib/queue.ts
git commit -m "feat: expand QueueEntry type for publish results and scheduling"
```

---
