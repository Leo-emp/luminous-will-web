// ─────────────────────────────────────────────────────────────
//  Queue operations — reads/writes queue.json from Vercel Blob
//  The Python pipeline uploads videos + thumbnails and writes
//  queue entries to Blob. This module reads and updates them.
//
//  Requires BLOB_READ_WRITE_TOKEN env var (set in Vercel project settings)
// ─────────────────────────────────────────────────────────────

import { put, list } from "@vercel/blob";

// -- Queue entry shape (must match Python pipeline's blob_storage.py) --
export interface QueueEntry {
  id: string;
  format: "short" | "long";
  // Content type key: "dark_motivation" | "stoic_philosophy" | "wealth_mindset" | "dark_psychology"
  content_type?: string;
  // Accent color from content type — used for UI display
  accent_color?: string;
  topic: string;
  status: "pending_review" | "approved" | "rejected" | "posting" | "posted" | "failed";
  created_at: string;
  video_url?: string;
  thumbnail_url?: string;
  // Platform-specific captions keyed by platform name
  captions?: Record<string, { caption?: string; description?: string; title?: string; hashtags?: string[]; tags?: string[]; category?: string }>;
  script_text?: string;
  duration?: number;
  target_platforms?: string[];
  scheduled_post_time?: string | null;
  // Per-platform posting results after publish
  post_results?: Record<string, { platform: string; success: boolean; url?: string; error?: string; posted_at?: string }>;
  error?: string | null;
}

// -- Blob path for the queue manifest --
const QUEUE_BLOB_PATH = "queue.json";

export async function loadQueue(): Promise<QueueEntry[]> {
  // Reads queue.json from Vercel Blob
  // Returns empty array if blob doesn't exist or token not set
  try {
    // -- List blobs to find queue.json --
    const { blobs } = await list({ prefix: QUEUE_BLOB_PATH });

    if (blobs.length === 0) {
      // -- No queue file yet — pipeline hasn't generated anything --
      return [];
    }

    // -- Fetch the queue.json content --
    const response = await fetch(blobs[0].url);
    if (!response.ok) return [];

    const entries: QueueEntry[] = await response.json();
    return entries;
  } catch (error) {
    // -- Blob not configured or network error — return empty --
    console.error("[QUEUE] Failed to load from Blob:", error);
    return [];
  }
}

export async function saveQueue(entries: QueueEntry[]): Promise<void> {
  // Writes the full queue array back to queue.json on Blob
  try {
    await put(QUEUE_BLOB_PATH, JSON.stringify(entries, null, 2), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
    });
  } catch (error) {
    console.error("[QUEUE] Failed to save to Blob:", error);
    throw error;
  }
}

export async function getEntry(id: string): Promise<QueueEntry | null> {
  // Finds a single entry by ID
  const entries = await loadQueue();
  return entries.find((e) => e.id === id) || null;
}

export async function updateEntry(
  id: string,
  updates: Partial<QueueEntry>
): Promise<QueueEntry | null> {
  // Updates a single entry and saves the full queue back
  const entries = await loadQueue();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return null;

  // -- Merge updates into the entry --
  entries[idx] = { ...entries[idx], ...updates };
  await saveQueue(entries);
  return entries[idx];
}
