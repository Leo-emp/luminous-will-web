// -----------------------------------------------------------------
//  POST /api/queue/:id/approve
//  Marks a video as approved and auto-schedules it for posting.
//
//  # THE BUG THIS FIXES:
//  # Previously, approving a video just set status to "approved"
//  # but never set scheduled_post_time. The post-scheduled cron
//  # filters on BOTH fields, so approved videos sat in limbo
//  # forever and never got posted.
//  #
//  # NOW: If the caller doesn't provide a scheduled_post_time,
//  # we auto-compute one using the scheduling utility:
//  #   - 30 min from now if within posting hours (8AM-8PM UTC)
//  #   - Next day at 10 AM UTC if outside posting hours
// -----------------------------------------------------------------

import { NextResponse } from "next/server";
import { updateEntry } from "@/lib/queue";
import { computeScheduledTime } from "@/lib/schedule-time";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  // # If the caller provided a scheduled_post_time, use it.
  // # Otherwise, auto-compute one so the cron can pick it up.
  const scheduledTime = computeScheduledTime(body.scheduled_post_time || null);

  const entry = await updateEntry(id, {
    status: "approved",
    // # This is the critical field — without it, the post-scheduled
    // # cron will never find this entry (it filters on both status
    // # AND scheduled_post_time being set and in the past)
    scheduled_post_time: scheduledTime,
  });

  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  return NextResponse.json(entry);
}
