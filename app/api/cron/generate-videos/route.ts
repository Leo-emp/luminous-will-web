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
import { loadQueue, saveQueue } from "@/lib/queue";
import { getAutoApprove } from "@/lib/settings";
import { CONTENT_TYPES, CONTENT_TYPE_COLORS } from "@/lib/content-types";

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

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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

  // -- Determine today's content types and global settings --
  const todaysTypes = getTodaysTypes();
  const autoApprove = await getAutoApprove();
  const results: { type: string; success: boolean; error?: string }[] = [];

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

      // -- Call the Gradio API --
      // Dynamic import to avoid bundling @gradio/client in non-cron routes
      const { Client } = await import("@gradio/client");
      const client = await Client.connect(hfSpaceUrl);

      // Call with content type — topic is "(Random)" so the pipeline picks one
      const result = await client.predict("/on_generate", {
        content_type_key: typeKey,
        format_choice: "Vertical Short (9:16)",
        dropdown_topic: "(Random)",
        custom: "",
      });

      // -- Parse the Gradio response --
      // data[0] = video file object (has .url), data[1] = status/log string
      const data = result.data as [{ url: string } | null, string];

      if (data && data[0]) {
        const videoUrl = typeof data[0] === "object" && data[0].url ? data[0].url : null;

        if (videoUrl) {
          // -- Add to queue --
          const queue = await loadQueue();

          // Build the new entry with all required fields
          const newEntry = {
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

          queue.push(newEntry);
          await saveQueue(queue);

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
    }
  }

  // -- Return summary of what was generated --
  return NextResponse.json({
    generated: results,
    auto_approve: autoApprove,
    types_today: todaysTypes,
  });
}
