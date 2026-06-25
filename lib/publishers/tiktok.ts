// ─────────────────────────────────────────────────────────────
//  TikTok Publisher — posts videos via TikTok Content Posting API
//  Uses URL-based upload: we pass the Blob URL and TikTok's servers
//  download the video themselves. Near-instant on our end.
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

// -- Polling settings for publish status --
const PUBLISH_POLL_INTERVAL_MS = 3000;  // check every 3 seconds
const PUBLISH_MAX_POLLS = 10;           // give up after ~30 seconds

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
    const publishId = result?.data?.publish_id;

    // -- Poll for the real video URL --
    // TikTok processes the video asynchronously, so we poll
    // the status endpoint to get the final video ID + URL
    let videoUrl: string | undefined;
    if (publishId) {
      videoUrl = await pollPublishStatus(token.access_token, publishId);
    }

    return {
      platform: "tiktok",
      success: true,
      url: videoUrl || (publishId ? `publish_id: ${publishId}` : undefined),
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

async function pollPublishStatus(accessToken: string, publishId: string): Promise<string | undefined> {
  // Polls TikTok's publish status endpoint to get the final video URL
  // Returns the video URL when ready, undefined if it times out or fails
  for (let attempt = 0; attempt < PUBLISH_MAX_POLLS; attempt++) {
    try {
      const response = await fetch(`${TIKTOK_API}/post/publish/status/fetch/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({ publish_id: publishId }),
      });

      if (response.ok) {
        const data = await response.json();
        const status = data?.data?.status;

        if (status === "PUBLISH_COMPLETE") {
          // Video is live — build the URL from the video ID
          const videoId = data?.data?.publicaly_available_post_id?.[0];
          if (videoId) {
            return `https://www.tiktok.com/@me/video/${videoId}`;
          }
          return undefined;
        }

        if (status === "FAILED") {
          // Publishing failed on TikTok's side
          return undefined;
        }
      }
    } catch {
      // Network error during poll — continue trying
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, PUBLISH_POLL_INTERVAL_MS));
  }

  // Timed out — video may still be processing
  return undefined;
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
