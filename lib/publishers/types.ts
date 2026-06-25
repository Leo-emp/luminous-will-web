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
