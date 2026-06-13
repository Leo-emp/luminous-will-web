import { NextResponse } from "next/server";
import { loadQueue } from "@/lib/queue";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  let entries = await loadQueue();

  if (status) {
    entries = entries.filter((e) => e.status === status);
  }

  // Sort by created_at descending (newest first)
  entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return NextResponse.json(entries);
}
