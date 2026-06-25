// ─────────────────────────────────────────────────────────────
//  PATCH /api/queue/:id/captions
//  Updates the captions for a specific platform on a queue entry
//  Called by the dashboard's inline caption editor
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { updateEntry, getEntry } from "@/lib/queue";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // -- Parse the update body --
  const body = await request.json().catch(() => null);
  if (!body || !body.platform) {
    return NextResponse.json(
      { error: "Missing platform field" },
      { status: 400 }
    );
  }

  // -- Load current entry --
  const entry = await getEntry(id);
  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  // -- Update the specific platform's caption --
  const captions = { ...(entry.captions || {}) };
  captions[body.platform] = {
    caption: body.caption || captions[body.platform]?.caption || "",
    hashtags: body.hashtags || captions[body.platform]?.hashtags || [],
  };

  // -- Save back --
  const updated = await updateEntry(id, { captions });
  return NextResponse.json(updated);
}
