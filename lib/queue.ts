// Queue operations — reads/writes queue.json from the Python pipeline directory
import { readFile, writeFile } from "fs/promises";
import path from "path";

// Path to the shared queue.json (Python pipeline writes, web reads)
const QUEUE_PATH = process.env.QUEUE_JSON_PATH || path.join(process.cwd(), "..", "LuminousWill", "queue.json");

export interface QueueEntry {
  id: string;
  format: "short" | "long";
  topic: string;
  video_path: string;
  thumbnail_path: string;
  metadata: {
    youtube?: { title: string; description: string; tags: string[]; category: string };
    tiktok?: { caption: string; hashtags: string[] };
    instagram?: { caption: string; hashtags: string[] };
    facebook?: { description: string; hashtags: string[] };
  };
  target_platforms: string[];
  status: "pending_review" | "approved" | "posting" | "posted" | "rejected" | "failed";
  created_at: string;
  scheduled_post_time: string | null;
  post_results: Record<string, { url: string; video_id?: string }>;
  error: string | null;
}

export async function loadQueue(): Promise<QueueEntry[]> {
  try {
    const data = await readFile(QUEUE_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveQueue(entries: QueueEntry[]): Promise<void> {
  await writeFile(QUEUE_PATH, JSON.stringify(entries, null, 2));
}

export async function getEntry(id: string): Promise<QueueEntry | null> {
  const entries = await loadQueue();
  return entries.find((e) => e.id === id) || null;
}

export async function updateEntry(id: string, updates: Partial<QueueEntry>): Promise<QueueEntry | null> {
  const entries = await loadQueue();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  entries[idx] = { ...entries[idx], ...updates };
  await saveQueue(entries);
  return entries[idx];
}
