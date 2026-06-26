// ─────────────────────────────────────────────────────────────
//  GET/POST /api/settings/auto-approve
//  Reads and updates the auto-approve toggle for generated videos.
//  When enabled, cron-generated videos skip manual review.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getAutoApprove, setAutoApprove } from "@/lib/settings";

// GET endpoint: Returns the current auto-approve setting
export async function GET() {
  // Retrieve the current auto-approve setting from persistent storage
  const enabled = await getAutoApprove();
  // Return the setting as JSON
  return NextResponse.json({ enabled });
}

// POST endpoint: Updates the auto-approve setting
export async function POST(request: Request) {
  // Updates the auto-approve setting
  try {
    // Parse the incoming request body
    const body = await request.json();
    // Extract the enabled boolean, defaulting to false if not provided
    const enabled = body.enabled === true;

    // Persist the new auto-approve setting
    await setAutoApprove(enabled);

    // Return the updated setting
    return NextResponse.json({ enabled });
  } catch {
    // Handle invalid or malformed request body
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
