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
  const allFailed = allMerged.every((r) => !r.success);

  await updateEntry(entry.id, {
    status: allFailed ? "failed" : "posted",
    post_results: merged,
    error: allFailed ? "All platforms failed" : null,
  });

  return merged;
}

function buildPublishInput(entry: QueueEntry, platform: string): PublishInput {
  // Extracts the platform-specific captions from the queue entry.
  // Falls back to topic as title if captions are missing.
  // content_type is available on the entry (e.g. "dark_motivation") and can
  // be used by individual platform publishers to enrich titles or descriptions.
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
    // Include content type name in topic for richer platform titles
    // (individual publishers can read entry.content_type for further context)
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
