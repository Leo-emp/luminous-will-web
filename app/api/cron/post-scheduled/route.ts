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

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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
