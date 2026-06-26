// ─────────────────────────────────────────────────────────────
//  Settings stored in Vercel Blob.
//  Currently just auto-approve toggle, but extensible.
// ─────────────────────────────────────────────────────────────

import { put, list } from "@vercel/blob";

// -- Blob path for settings --
const SETTINGS_PATH = "settings/auto_approve.json";

export async function getAutoApprove(): Promise<boolean> {
  // Reads the auto-approve setting from Blob
  // Returns false if not set (default: manual review)
  try {
    const { blobs } = await list({ prefix: SETTINGS_PATH });
    if (blobs.length === 0) return false;

    const response = await fetch(blobs[0].url);
    if (!response.ok) return false;

    const data = await response.json();
    return data.enabled === true;
  } catch {
    return false;
  }
}

export async function setAutoApprove(enabled: boolean): Promise<void> {
  // Saves the auto-approve setting to Blob
  await put(SETTINGS_PATH, JSON.stringify({ enabled }), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });
}
