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
