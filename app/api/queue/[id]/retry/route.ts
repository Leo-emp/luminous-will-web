// ─────────────────────────────────────────────────────────────
//  POST /api/queue/:id/retry
//  Retries only the platforms that failed in a previous publish.
//  Keeps successful results from the original attempt.
//
//  No request body needed — it reads the failed platforms
//  from the entry's post_results.
//
//  Response:
//    { results: Record<string, PostResult> }
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getEntry } from "@/lib/queue";
import { retryFailed } from "@/lib/publisher";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // -- Load the queue entry --
  const entry = await getEntry(id);
  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  // -- Only allow retrying failed or posted-with-errors entries --
  if (entry.status !== "failed" && entry.status !== "posted") {
    return NextResponse.json(
      { error: `Cannot retry entry with status "${entry.status}"` },
      { status: 400 }
    );
  }

  // -- Retry the failed platforms --
  const results = await retryFailed(entry);
  return NextResponse.json({ results });
}
