import { NextResponse } from "next/server";
import { updateEntry } from "@/lib/queue";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const scheduledTime = body.scheduled_post_time || null;

  const entry = await updateEntry(id, {
    status: "approved",
    scheduled_post_time: scheduledTime,
  });

  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  return NextResponse.json(entry);
}
