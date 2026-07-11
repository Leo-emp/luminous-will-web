// ─────────────────────────────────────────────────────────────
//  ADMIN FAILURE NOTIFICATION — notify-admin.ts
//  ─────────────────────────────────────────────────────────────
//  # Sends structured failure alerts when cron jobs crash.
//  # Two notification channels:
//  #   1. Always: JSON log to console (visible in Vercel logs)
//  #   2. Optional: POST to ALERT_WEBHOOK_URL (Slack/Discord)
//  #
//  # This module NEVER throws — alerting failures are logged
//  # but can never crash the cron route that called us.
//  #
//  # Usage:
//  #   import { notifyAdmin } from "@/lib/notify-admin";
//  #   await notifyAdmin("Post Scheduled", error, { entryId: "abc" });
//  #
//  # Environment variables:
//  #   ALERT_WEBHOOK_URL — Slack/Discord webhook URL (optional)
//  #     Without this, only console logging is active.
// ─────────────────────────────────────────────────────────────

// # Sends a failure alert when a cron job fails.
// # cronName: human-readable name like "Post Scheduled" or "Generate Videos"
// # error: the caught exception (Error or unknown)
// # details: optional context object for debugging (entry IDs, step names, etc.)
export async function notifyAdmin(
  cronName: string,
  error: unknown,
  details?: Record<string, unknown>
): Promise<void> {
  // # Extract error message — handle both Error instances and raw strings
  const errorMessage =
    error instanceof Error ? error.message : String(error);
  const timestamp = new Date().toISOString();

  // # ── Channel 1: Structured console log ──────────────────────
  // # Always fires — these show up in Vercel's runtime logs
  // # and can be filtered by the "CRON_FAILURE" level tag
  console.error(
    JSON.stringify({
      level: "CRON_FAILURE",
      cron: cronName,
      error: errorMessage,
      timestamp,
      ...(details || {}),
    })
  );

  // # ── Channel 2: Webhook (Slack/Discord) ─────────────────────
  // # Only fires if ALERT_WEBHOOK_URL is set in env vars
  // # Payload is Slack-compatible (also works with Discord webhooks)
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // # Slack uses the "text" field for the notification message
        // # Uses markdown formatting for readability
        text: [
          `*Luminous Will Cron Failure*`,
          `*Cron:* ${cronName}`,
          `*Error:* ${errorMessage}`,
          `*Time:* ${timestamp}`,
          details ? `*Details:* ${JSON.stringify(details)}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        // # Raw structured payload for custom webhook handlers
        cron: cronName,
        error: errorMessage,
        timestamp,
        details: details || {},
      }),
    });
  } catch (alertError) {
    // # Never let webhook failures crash the cron route
    // # Just log it — the console log above already captured the original error
    console.error("[ALERT] Webhook send failed:", alertError);
  }
}
