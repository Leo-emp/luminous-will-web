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
