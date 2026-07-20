// -----------------------------------------------------------------
//  AUTO-SCHEDULING UTILITY — schedule-time.ts
// -----------------------------------------------------------------
//  # Computes a sensible scheduled_post_time for approved videos.
//  # Used by:
//  #   1. /api/queue/[id]/approve — when a user clicks "Approve"
//  #      without providing an explicit scheduled time
//  #   2. /api/cron/generate-videos — when auto-approve is ON
//  #      and the cron creates entries with status "approved"
//  #
//  # The post-scheduled cron filters on BOTH:
//  #   entry.status === "approved"  AND  entry.scheduled_post_time <= now
//  # So if scheduled_post_time is never set, approved videos
//  # sit in the queue forever and never get posted.
//  #
//  # SCHEDULING RULES:
//  # ─────────────────────────────────────────────────────────────
//  # IF current UTC hour is within posting hours (8 AM – 8 PM):
//  #   → Schedule 30 minutes from now
//  #   → This gives the user a brief window to cancel if needed
//  #
//  # IF current UTC hour is OUTSIDE posting hours (8 PM – 8 AM):
//  #   → Schedule for the next day at 10 AM UTC
//  #   → 10 AM UTC is a strong engagement slot across US/EU/APAC
//  #
//  # Platform-specific optimal times (all UTC):
//  #   YouTube  → 2-4 PM (peak US afternoon)
//  #   TikTok   → 10 AM - 12 PM (global morning scroll)
//  #   Instagram→ 11 AM - 1 PM (lunch hour)
//  #   Facebook → 1 PM - 3 PM (early afternoon)
//  # We pick 10 AM as a compromise that works well across all four.
// -----------------------------------------------------------------

// # Posting hours window (UTC) — posts are only auto-scheduled
// # within this range for immediate delivery
const POSTING_HOUR_START = 8;   // 8 AM UTC
const POSTING_HOUR_END = 20;    // 8 PM UTC

// # How far in the future to schedule if within posting hours
// # 30 minutes gives the user time to review / cancel
const IMMEDIATE_DELAY_MINUTES = 30;

// # Default hour (UTC) for next-day scheduling
// # 10 AM UTC works across US mornings, EU afternoons, APAC evenings
const NEXT_DAY_HOUR_UTC = 10;

/**
 * # Computes a scheduled_post_time ISO string for an approved video.
 * #
 * # If the caller already provided a scheduledTime, we respect it.
 * # Otherwise we auto-compute one based on the rules above.
 * #
 * # @param existingScheduledTime - optional ISO string from the request body
 * # @returns ISO 8601 string to store in scheduled_post_time
 */
export function computeScheduledTime(existingScheduledTime?: string | null): string {
  // # If the caller (dashboard UI, API client) already set a time, use it as-is
  if (existingScheduledTime) {
    return existingScheduledTime;
  }

  const now = new Date();
  const currentHourUTC = now.getUTCHours();

  // # Check if we're inside the posting window (8 AM – 8 PM UTC)
  if (currentHourUTC >= POSTING_HOUR_START && currentHourUTC < POSTING_HOUR_END) {
    // # WITHIN posting hours → schedule 30 minutes from now
    // # This ensures the post-scheduled cron picks it up on its next run
    const scheduled = new Date(now.getTime() + IMMEDIATE_DELAY_MINUTES * 60 * 1000);
    return scheduled.toISOString();
  }

  // # OUTSIDE posting hours → schedule for next day at 10 AM UTC
  // # This avoids posting at 3 AM when nobody is scrolling
  const nextDay = new Date(now);
  // # Move to the next calendar day
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  // # Set to the optimal posting hour
  nextDay.setUTCHours(NEXT_DAY_HOUR_UTC, 0, 0, 0);

  return nextDay.toISOString();
}
