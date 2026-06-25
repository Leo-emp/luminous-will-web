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
