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
  const totalSize = videoData.byteLength;
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
