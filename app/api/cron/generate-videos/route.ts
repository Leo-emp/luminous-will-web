// ─────────────────────────────────────────────────────────────
//  GET /api/cron/generate-videos
//  Daily cron job that generates 2 videos via the HF Spaces
//  Gradio API. Determines today's 2 content types using the
//  day-of-year rotation, then calls the pipeline for each.
//
//  Runs at 6:00 AM UTC daily (configured in vercel.json).
//  Protected by CRON_SECRET env var.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { addEntry } from "@/lib/queue";
import type { QueueEntry } from "@/lib/queue";
import { getAutoApprove } from "@/lib/settings";
import { CONTENT_TYPES, CONTENT_TYPE_COLORS } from "@/lib/content-types";
import { notifyAdmin } from "@/lib/notify-admin";

// -- Content type rotation schedule --
// Odd days  → dark_motivation + stoic_philosophy
// Even days → wealth_mindset + dark_psychology
function getTodaysTypes(): string[] {
  const now = new Date();
  // Day of year: Jan 1 = 1, Feb 1 = 32, etc.
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (dayOfYear % 2 === 1) {
    return ["dark_motivation", "stoic_philosophy"];
  } else {
    return ["wealth_mindset", "dark_psychology"];
  }
}

export async function GET(request: Request) {
  // -- Verify cron secret to prevent unauthorized calls --
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // FIX 1: Use the same pattern as post-scheduled — block if secret is missing OR header mismatch.
  // The old check (`cronSecret &&`) allowed unauthenticated access when CRON_SECRET was not set.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // -- Ensure HF Space URL is configured --
  const hfSpaceUrl = process.env.NEXT_PUBLIC_HF_SPACE_URL;
  if (!hfSpaceUrl) {
    return NextResponse.json(
      { error: "HF Space URL not configured" },
      { status: 500 }
    );
  }

  // # Top-level try/catch — catches fatal errors from getAutoApprove() or Client.connect()
  // # that previously would crash with an unhandled exception
  try {

  // -- Determine today's content types and global settings --
  const todaysTypes = getTodaysTypes();
  const autoApprove = await getAutoApprove();
  const results: { type: string; success: boolean; error?: string }[] = [];

  // Retry wrapper for HF Space calls — handles cold starts within Vercel's 60s limit
  async function withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 3): Promise<T> {
    const delays = [3000, 6000, 12000];
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt === maxRetries) throw err;
        const delay = delays[attempt] || 12000;
        console.log(`[CRON] ${label} attempt ${attempt + 1} failed, retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw new Error("Unreachable");
  }

  const { Client } = await import("@gradio/client");
  const client = await withRetry(() => Client.connect(hfSpaceUrl), "HF connect");

  // -- Generate one video per content type --
  for (const typeKey of todaysTypes) {
    try {
      // Find the content type info from the CONTENT_TYPES array
      const typeInfo = CONTENT_TYPES.find((ct) => ct.key === typeKey);
      if (!typeInfo) {
        results.push({ type: typeKey, success: false, error: "Unknown content type" });
        continue;
      }

      console.log(`[CRON] Generating ${typeInfo.name} video...`);

      // Call with content type — topic is "(Random)" so the pipeline picks one
      const result = await withRetry(
        () => client.predict("/on_generate", {
          content_type_key: typeKey,
          format_choice: "Vertical Short (9:16)",
          dropdown_topic: "(Random)",
          custom: "",
        }),
        `predict ${typeKey}`
      );

      // -- Parse the Gradio response --
      // data[0] = video file object (has .url), data[1] = status/log string
      const data = result.data as [{ url: string } | null, string];

      if (data && data[0]) {
        const videoUrl = typeof data[0] === "object" && data[0].url ? data[0].url : null;

        if (videoUrl) {
          // Build the new entry with all required fields
          const newEntry: QueueEntry = {
            id: `auto-${Date.now()}-${typeKey}`,
            format: "short" as const,
            content_type: typeKey,
            accent_color: CONTENT_TYPE_COLORS[typeKey] || "#E8A817",
            // Extract topic from the status string if it has a bolded section
            topic: typeof data[1] === "string" ? data[1].split("**")[1] || typeKey : typeKey,
            // Auto-approve if setting is on, otherwise queue for manual review
            status: autoApprove ? ("approved" as const) : ("pending_review" as const),
            created_at: new Date().toISOString(),
            video_url: videoUrl,
            // Default to all 4 platforms — user can adjust before posting
            target_platforms: ["youtube", "tiktok", "instagram", "facebook"],
          };

          // Lock-protected queue write prevents concurrent corruption
          await addEntry(newEntry);

          console.log(`[CRON] ${typeInfo.name} video added to queue (${newEntry.status})`);
          results.push({ type: typeKey, success: true });
        } else {
          // Gradio returned a response but no video URL in the expected field
          results.push({ type: typeKey, success: false, error: "No video URL in response" });
        }
      } else {
        // Gradio returned empty or null data
        results.push({ type: typeKey, success: false, error: "Empty response from Gradio" });
      }
    } catch (error) {
      // Log and record any errors — don't stop processing other types
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[CRON] Failed to generate ${typeKey}: ${msg}`);
      results.push({ type: typeKey, success: false, error: msg });
      // # Alert admin for each failed video generation
      await notifyAdmin("Generate Videos", error, { contentType: typeKey });
    }
  }

  // -- Return summary of what was generated --
  return NextResponse.json({
    generated: results,
    auto_approve: autoApprove,
    types_today: todaysTypes,
  });

  } catch (err) {
    // # Fatal error (e.g. Client.connect() failed, getAutoApprove() crashed)
    console.error("[GenerateVideos] Fatal error:", err);
    await notifyAdmin("Generate Videos", err, { fatal: true });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
