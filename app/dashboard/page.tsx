"use client";

// ─────────────────────────────────────────────────────────────
//  Luminous Will — Premium Review Dashboard
//  Rewritten for Task 13: video player, caption tabs,
//  inline edit, script preview, approve/reject actions.
//
//  Brand tokens:
//    Background:  #000000
//    Panel:       #1a1a1a
//    Border:      #333333
//    Accent:      #E8A817  (amber)
//    Success:     #22c55e  (green)
//    Danger:      #ef4444  (red)
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";

// ── Types ────────────────────────────────────────────────────

// Shape of a single caption object for one platform
interface PlatformCaption {
  caption: string;
  hashtags?: string[];
}

// Full queue entry returned by /api/queue
interface QueueEntry {
  id: string;
  topic: string;
  format: "short" | "long";
  status: "pending_review" | "approved" | "rejected" | "posting" | "posted" | "failed";
  created_at: string;
  video_url?: string;
  thumbnail_url?: string;
  // Keyed by platform name e.g. { tiktok: {...}, instagram: {...} }
  captions?: Record<string, PlatformCaption>;
  script_text?: string;
  duration?: number;
  target_platforms?: string[];
  // Per-platform posting results after publish
  post_results?: Record<string, { platform: string; success: boolean; url?: string; error?: string; posted_at?: string }>;
  // Scheduled post time (ISO string) — null means immediate
  scheduled_post_time?: string | null;
  // Summary error message if any platforms failed
  error?: string | null;
}

// ── Mock data ────────────────────────────────────────────────
// Used when the API isn't reachable so the page renders standalone

const MOCK_ENTRIES: QueueEntry[] = [
  {
    id: "mock-001",
    topic: "The Power of Silence",
    format: "short",
    status: "pending_review",
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3h ago
    video_url: undefined, // no real URL in mock
    thumbnail_url: undefined,
    duration: 72,
    target_platforms: ["tiktok", "instagram", "youtube"],
    captions: {
      tiktok: {
        caption:
          "Your silence terrifies them. That's the point.\n\nThe most powerful move you can make is simply to stop explaining yourself.",
        hashtags: ["#darkmotivation", "#silence", "#powerofsilence", "#mindset", "#fyp"],
      },
      instagram: {
        caption:
          "They expect you to defend yourself. Don't.\n\nSilence is the ultimate power move. Let them fill the void with assumptions.",
        hashtags: ["#darkmotivation", "#silentpower", "#mindset", "#growthmindset", "#motivation"],
      },
      youtube: {
        caption:
          "The Power of Silence — Why You Should Stop Explaining Yourself\n\nWhen you stop justifying your actions, you reclaim your power. This video explores the psychology behind strategic silence.",
        hashtags: ["#darkmotivation", "#selfimprovement", "#stoic", "#mindset"],
      },
    },
    script_text:
      "The moment you start explaining yourself, you've already lost.\n\nSilence isn't weakness. It's strategy.\n\nEvery word you speak is a card revealed. Every defence you mount is an admission of doubt.\n\nThe powerful don't justify. They act.\n\nYour silence terrifies them because it offers nothing to argue against.\n\nLet them be confused. Let them wonder. Let them fill the void with their own fears.\n\nYou don't owe anyone an explanation for who you are.\n\nStay silent. Stay powerful.",
  },
  {
    id: "mock-002",
    topic: "Discipline Over Motivation",
    format: "short",
    status: "approved",
    created_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(), // yesterday
    duration: 58,
    target_platforms: ["tiktok", "instagram"],
    captions: {
      tiktok: {
        caption: "Motivation is a visitor. Discipline lives here.",
        hashtags: ["#discipline", "#darkmotivation", "#consistency", "#fyp"],
      },
      instagram: {
        caption: "Stop waiting to feel ready. Start moving before you're ready.",
        hashtags: ["#discipline", "#motivation", "#selfimprovement", "#consistency"],
      },
    },
    script_text: "Motivation will abandon you. Discipline won't.\n\nMotivation depends on how you feel. Discipline doesn't care.",
  },
  {
    id: "mock-003",
    topic: "Why Most People Stay Poor",
    format: "long",
    status: "rejected",
    created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    duration: 420,
    target_platforms: ["youtube", "facebook"],
    captions: {
      youtube: {
        caption: "The uncomfortable truth about money mindset that schools never teach you.",
        hashtags: ["#money", "#wealth", "#financialmindset"],
      },
      facebook: {
        caption: "Share this if you know someone who needs to hear this today.",
        hashtags: ["#motivation", "#money", "#mindset"],
      },
    },
    script_text: "The reason most people stay poor has nothing to do with opportunity...",
  },
];

// ── Helpers ──────────────────────────────────────────────────

// Maps status strings to display labels and Tailwind colour tokens
const STATUS_CONFIG: Record<string, { label: string; textClass: string; bgClass: string }> = {
  pending_review: { label: "Pending Review", textClass: "text-[#E8A817]", bgClass: "bg-[#E8A817]/10" },
  approved: { label: "Approved", textClass: "text-[#22c55e]", bgClass: "bg-[#22c55e]/10" },
  rejected: { label: "Rejected", textClass: "text-[#ef4444]", bgClass: "bg-[#ef4444]/10" },
  posting: { label: "Posting…", textClass: "text-[#3b82f6]", bgClass: "bg-[#3b82f6]/10" },
  posted: { label: "Posted", textClass: "text-[#22c55e]", bgClass: "bg-[#22c55e]/10" },
  failed: { label: "Failed", textClass: "text-[#ef4444]", bgClass: "bg-[#ef4444]/10" },
};

// Formats an ISO date string into e.g. "24 Jun, 3:00 AM"
function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Converts seconds into "1m 12s" human-readable form
function formatDuration(seconds?: number): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Sub-components ───────────────────────────────────────────

// ── VideoPlayer ──────────────────────────────────────────────
// HTML5 video element with poster frame fallback to thumbnail
function VideoPlayer({
  videoUrl,
  thumbnailUrl,
  format,
}: {
  videoUrl?: string;
  thumbnailUrl?: string;
  format: "short" | "long";
}) {
  // Short = 9:16 portrait, Long = 16:9 landscape
  const isPortrait = format === "short";

  // When no video URL provided, show a styled placeholder
  if (!videoUrl) {
    return (
      <div
        className={`relative bg-[#0a0a0a] border border-[#333] rounded-xl flex items-center justify-center overflow-hidden ${
          isPortrait ? "aspect-[9/16] max-w-[200px] mx-auto" : "aspect-video w-full"
        }`}
      >
        {/* Show thumbnail image if available, else placeholder text */}
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt="Thumbnail"
            className="absolute inset-0 w-full h-full object-cover opacity-60"
          />
        ) : null}
        <div className="relative z-10 text-center px-4">
          <div className="text-[#E8A817] text-3xl mb-2">▶</div>
          <p className="text-xs text-[#555] uppercase tracking-wider">
            {isPortrait ? "9:16 Short" : "16:9 Long"}
          </p>
          <p className="text-xs text-[#333] mt-1">No video URL</p>
        </div>
      </div>
    );
  }

  return (
    // Responsive aspect-ratio container
    <div
      className={`relative rounded-xl overflow-hidden bg-black border border-[#333] ${
        isPortrait ? "aspect-[9/16] max-w-[220px] mx-auto" : "aspect-video w-full"
      }`}
    >
      <video
        src={videoUrl}
        poster={thumbnailUrl}
        controls
        preload="metadata"
        className="absolute inset-0 w-full h-full object-contain"
      />
    </div>
  );
}

// ── ThumbnailPreview ─────────────────────────────────────────
// Shows the generated thumbnail at a comfortable viewing size
function ThumbnailPreview({ thumbnailUrl }: { thumbnailUrl?: string }) {
  if (!thumbnailUrl) {
    return (
      <div className="aspect-video w-full bg-[#0a0a0a] border border-[#333] rounded-xl flex items-center justify-center">
        <div className="text-center">
          <div className="text-3xl mb-2">🖼</div>
          <p className="text-xs text-[#555] uppercase tracking-wider">No Thumbnail</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-[#333] bg-black">
      <img
        src={thumbnailUrl}
        alt="Video thumbnail"
        className="w-full h-auto object-cover"
      />
    </div>
  );
}

// ── CaptionTabs ──────────────────────────────────────────────
// Tabbed view — one tab per platform — with inline edit mode
function CaptionTabs({
  captions,
  entryId,
  onSave,
}: {
  captions: Record<string, PlatformCaption>;
  entryId: string;
  onSave: (entryId: string, platform: string, newCaption: PlatformCaption) => void;
}) {
  // List of platform keys in display order
  const platforms = Object.keys(captions);
  const [activeTab, setActiveTab] = useState<string>(platforms[0] || "");
  const [editMode, setEditMode] = useState(false);
  // Local editable state for the current tab's text
  const [editText, setEditText] = useState("");
  const [editHashtags, setEditHashtags] = useState("");

  // When the active tab changes, reset edit fields to that platform's data
  const activePlatform = captions[activeTab];

  // Human-readable platform labels
  const PLATFORM_LABELS: Record<string, string> = {
    tiktok: "TikTok",
    instagram: "Instagram",
    youtube: "YouTube",
    facebook: "Facebook",
  };

  // Enters edit mode and populates the textarea with current values
  function startEdit() {
    if (!activePlatform) return;
    setEditText(activePlatform.caption);
    setEditHashtags((activePlatform.hashtags || []).join(" "));
    setEditMode(true);
  }

  // Cancels without saving
  function cancelEdit() {
    setEditMode(false);
  }

  // Saves the edited values back up to parent state
  function saveEdit() {
    if (!activePlatform) return;
    const hashtags = editHashtags
      .split(/\s+/)
      .map((h) => h.trim())
      .filter((h) => h.length > 0);
    onSave(entryId, activeTab, { caption: editText, hashtags });
    setEditMode(false);
  }

  if (platforms.length === 0) {
    return <p className="text-[#555] text-sm">No captions generated.</p>;
  }

  return (
    <div>
      {/* Tab row */}
      <div className="flex gap-1 mb-4 border-b border-[#333] pb-2">
        {platforms.map((platform) => (
          <button
            key={platform}
            onClick={() => {
              setActiveTab(platform);
              setEditMode(false); // reset edit mode when switching tabs
            }}
            className={`px-3 py-1.5 text-xs uppercase tracking-wider rounded-t transition-all ${
              activeTab === platform
                ? "text-[#E8A817] border border-[#E8A817] bg-[#E8A817]/10"
                : "text-[#555] border border-transparent hover:text-[#888]"
            }`}
          >
            {PLATFORM_LABELS[platform] || platform}
          </button>
        ))}
      </div>

      {/* Caption content for active tab */}
      {activePlatform && (
        <div>
          {editMode ? (
            // ── Edit mode ──
            <div className="space-y-3">
              {/* Caption textarea */}
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={5}
                className="w-full bg-[#0a0a0a] border border-[#E8A817]/50 rounded-lg px-3 py-2 text-sm text-white placeholder-[#555] resize-y focus:outline-none focus:border-[#E8A817]"
                placeholder="Caption text…"
              />
              {/* Hashtags input */}
              <input
                type="text"
                value={editHashtags}
                onChange={(e) => setEditHashtags(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2 text-sm text-[#E8A817] placeholder-[#555] focus:outline-none focus:border-[#E8A817]"
                placeholder="#hashtag1 #hashtag2 …"
              />
              {/* Save / Cancel */}
              <div className="flex gap-2">
                <button
                  onClick={saveEdit}
                  className="px-4 py-1.5 text-xs uppercase tracking-wider rounded-lg bg-[#E8A817] text-black font-semibold hover:bg-[#d49a14] transition-all"
                >
                  Save
                </button>
                <button
                  onClick={cancelEdit}
                  className="px-4 py-1.5 text-xs uppercase tracking-wider rounded-lg border border-[#333] text-[#555] hover:text-[#888] transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            // ── View mode ──
            <div className="space-y-3">
              {/* Caption text */}
              <p className="text-sm text-[#ccc] leading-relaxed whitespace-pre-wrap">
                {activePlatform.caption}
              </p>
              {/* Hashtags displayed as pills */}
              {activePlatform.hashtags && activePlatform.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {activePlatform.hashtags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded bg-[#E8A817]/10 text-[#E8A817]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {/* Edit button */}
              <button
                onClick={startEdit}
                className="text-xs uppercase tracking-wider text-[#555] hover:text-[#E8A817] transition-colors border border-[#333] hover:border-[#E8A817] px-3 py-1 rounded-lg"
              >
                Edit Caption
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ScriptPreview ────────────────────────────────────────────
// Collapsible section revealing the full script text
function ScriptPreview({ scriptText }: { scriptText?: string }) {
  const [open, setOpen] = useState(false);

  if (!scriptText) return null;

  return (
    <div className="border border-[#333] rounded-xl overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#1a1a1a] hover:bg-[#222] transition-colors text-left"
      >
        <span className="text-xs uppercase tracking-wider text-[#888]">
          {open ? "▲ Hide Script" : "▶ View Script"}
        </span>
        <span className="text-xs text-[#555]">
          {scriptText.split(/\s+/).length} words
        </span>
      </button>

      {/* Expandable content */}
      {open && (
        <div className="px-4 py-4 bg-[#0a0a0a]">
          <p className="text-sm text-[#aaa] leading-relaxed whitespace-pre-wrap font-mono">
            {scriptText}
          </p>
        </div>
      )}
    </div>
  );
}

// ── PublishActions ───────────────────────────────────────────
// Approve flow with platform toggles, schedule option, and reject.
// Replaces the old ReviewActions component.
function PublishActions({
  entry,
  onPublish,
  onReject,
  onRetry,
  connectionStatus,
}: {
  entry: QueueEntry;
  onPublish: (id: string, platforms: string[], scheduledTime?: string) => void;
  onReject: (id: string) => void;
  onRetry: (id: string) => void;
  connectionStatus: Record<string, { connected: boolean }>;
}) {
  // Which step of the approve flow we're on
  const [step, setStep] = useState<"idle" | "selecting" | "confirming-reject">("idle");
  // Platform toggles — all on by default
  const [selectedPlatforms, setSelectedPlatforms] = useState<Record<string, boolean>>({
    youtube: true,
    tiktok: true,
    instagram: true,
    facebook: true,
  });
  // Optional scheduled time
  const [scheduledTime, setScheduledTime] = useState("");

  // All four platform names for display
  const allPlatforms = ["youtube", "tiktok", "instagram", "facebook"];

  // Platform display labels
  const labels: Record<string, string> = {
    youtube: "YouTube",
    tiktok: "TikTok",
    instagram: "Instagram",
    facebook: "Facebook",
  };

  // Toggle a platform on/off
  function togglePlatform(platform: string) {
    setSelectedPlatforms((prev) => ({ ...prev, [platform]: !prev[platform] }));
  }

  // Get platforms that are selected AND connected
  function getActivePlatforms(): string[] {
    return allPlatforms.filter(
      (p) => selectedPlatforms[p] && connectionStatus[p === "instagram" || p === "facebook" ? "meta" : p]?.connected
    );
  }

  // -- Show post results for posted/failed entries --
  if (entry.status === "posted" || entry.status === "failed") {
    const results = entry.post_results || {};
    return (
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-wider text-[#555] mb-2">Post Results</p>
        {Object.entries(results).map(([platform, result]) => (
          <div key={platform} className="flex items-center gap-3 px-3 py-2 bg-[#0a0a0a] rounded-lg border border-[#222]">
            {/* Success/fail indicator */}
            <span className={`text-sm ${result.success ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
              {result.success ? "✓" : "✗"}
            </span>
            {/* Platform name */}
            <span className="text-sm text-white flex-1">{labels[platform] || platform}</span>
            {/* Post URL or error */}
            {result.success && result.url ? (
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#E8A817] hover:underline"
              >
                View post →
              </a>
            ) : result.error ? (
              <span className="text-xs text-[#ef4444] max-w-[200px] truncate">{result.error}</span>
            ) : null}
          </div>
        ))}
        {/* Retry button if any failed */}
        {Object.values(results).some((r) => !r.success) && (
          <button
            onClick={() => onRetry(entry.id)}
            className="w-full py-2.5 rounded-xl bg-[#E8A817]/10 border border-[#E8A817]/40 text-[#E8A817] font-semibold text-sm uppercase tracking-wider hover:bg-[#E8A817]/20 transition-all mt-2"
          >
            Retry Failed
          </button>
        )}
      </div>
    );
  }

  // -- Show posting spinner --
  if (entry.status === "posting") {
    return (
      <div className="px-4 py-3 rounded-xl border border-[#3b82f6]/30 bg-[#3b82f6]/5 text-center">
        <span className="text-sm text-[#3b82f6] uppercase tracking-wider animate-pulse">
          Posting to platforms...
        </span>
      </div>
    );
  }

  // -- Show scheduled info --
  if (entry.status === "approved" && entry.scheduled_post_time) {
    return (
      <div className="px-4 py-3 rounded-xl border border-[#22c55e]/30 bg-[#22c55e]/5 text-center space-y-2">
        <span className="text-sm text-[#22c55e] uppercase tracking-wider">
          Scheduled for {new Date(entry.scheduled_post_time).toLocaleString()}
        </span>
        <button
          onClick={() => onReject(entry.id)}
          className="text-xs text-[#555] hover:text-[#ef4444] transition-all"
        >
          Cancel scheduled post
        </button>
      </div>
    );
  }

  // -- Non-pending entries: show status badge --
  if (entry.status !== "pending_review") {
    const cfg = STATUS_CONFIG[entry.status];
    return (
      <div className={`px-4 py-3 rounded-xl border text-center ${cfg?.bgClass} border-[#333]`}>
        <span className={`text-sm font-semibold uppercase tracking-wider ${cfg?.textClass}`}>
          {cfg?.label || entry.status}
        </span>
      </div>
    );
  }

  // -- Reject confirmation --
  if (step === "confirming-reject") {
    return (
      <div className="flex gap-3 items-center">
        <span className="text-sm text-[#888] flex-1">Confirm rejection?</span>
        <button
          onClick={() => { onReject(entry.id); setStep("idle"); }}
          className="flex-1 py-3 rounded-xl bg-[#ef4444] text-white font-bold text-sm uppercase tracking-wider hover:bg-[#dc2626] transition-all"
        >
          ✗ Yes, Reject
        </button>
        <button
          onClick={() => setStep("idle")}
          className="px-4 py-3 rounded-xl border border-[#333] text-[#555] text-sm hover:text-[#888] transition-all"
        >
          Cancel
        </button>
      </div>
    );
  }

  // -- Platform selection step --
  if (step === "selecting") {
    const activePlatforms = getActivePlatforms();
    return (
      <div className="space-y-4">
        {/* Platform toggles */}
        <p className="text-xs uppercase tracking-wider text-[#555]">Select platforms</p>
        <div className="grid grid-cols-2 gap-2">
          {allPlatforms.map((platform) => {
            const provider = platform === "instagram" || platform === "facebook" ? "meta" : platform;
            const connected = connectionStatus[provider]?.connected;
            const selected = selectedPlatforms[platform];
            return (
              <button
                key={platform}
                onClick={() => connected && togglePlatform(platform)}
                disabled={!connected}
                className={`py-2 px-3 rounded-lg border text-xs uppercase tracking-wider transition-all ${
                  !connected
                    ? "border-[#222] text-[#333] cursor-not-allowed"
                    : selected
                    ? "border-[#E8A817] text-[#E8A817] bg-[#E8A817]/10"
                    : "border-[#333] text-[#555] hover:border-[#555]"
                }`}
              >
                {labels[platform]}
                {!connected && <span className="block text-[9px] text-[#333] normal-case mt-0.5">Not connected</span>}
              </button>
            );
          })}
        </div>

        {/* Optional schedule picker */}
        <div>
          <label className="text-xs text-[#555] uppercase tracking-wider block mb-1">
            Schedule (optional)
          </label>
          <input
            type="datetime-local"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#333] rounded-lg text-sm text-white focus:border-[#E8A817] focus:outline-none"
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => {
              onPublish(entry.id, activePlatforms, scheduledTime || undefined);
              setStep("idle");
            }}
            disabled={activePlatforms.length === 0}
            className="flex-1 py-3 rounded-xl bg-[#22c55e] text-black font-bold text-sm uppercase tracking-wider hover:bg-[#16a34a] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {scheduledTime ? "Schedule" : "Post Now"}
          </button>
          <button
            onClick={() => setStep("idle")}
            className="px-4 py-3 rounded-xl border border-[#333] text-[#555] text-sm hover:text-[#888] transition-all"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // -- Default: show Approve & Post + Reject buttons --
  return (
    <div className="flex gap-3">
      <button
        onClick={() => setStep("selecting")}
        className="flex-1 py-3.5 rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/40 text-[#22c55e] font-bold text-sm uppercase tracking-wider hover:bg-[#22c55e]/20 hover:border-[#22c55e] transition-all"
      >
        ✓ Approve & Post
      </button>
      <button
        onClick={() => setStep("confirming-reject")}
        className="flex-1 py-3.5 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/40 text-[#ef4444] font-bold text-sm uppercase tracking-wider hover:bg-[#ef4444]/20 hover:border-[#ef4444] transition-all"
      >
        ✗ Reject
      </button>
    </div>
  );
}

// ── MetaBadge ────────────────────────────────────────────────
// Small info pill used in the metadata row
function MetaBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-[#555]">{label}</span>
      <span className="text-xs text-[#ccc]">{value}</span>
    </div>
  );
}

// ── ReviewCard ───────────────────────────────────────────────
// Full expanded review card for the selected queue entry.
// Shows video, thumbnail, captions, script, and actions.
function ReviewCard({
  entry,
  onPublish,
  onReject,
  onRetry,
  onCaptionSave,
  connectionStatus,
}: {
  entry: QueueEntry;
  onPublish: (id: string, platforms: string[], scheduledTime?: string) => void;
  onReject: (id: string) => void;
  onRetry: (id: string) => void;
  onCaptionSave: (entryId: string, platform: string, newCaption: PlatformCaption) => void;
  connectionStatus: Record<string, { connected: boolean }>;
}) {
  const statusCfg = STATUS_CONFIG[entry.status] || STATUS_CONFIG["pending_review"];
  const platforms = entry.target_platforms || Object.keys(entry.captions || {});

  return (
    <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 space-y-6">

      {/* ── Header row: topic + status badge ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white leading-tight">{entry.topic}</h2>
          <p className="text-xs text-[#555] mt-1">{formatDate(entry.created_at)}</p>
        </div>
        {/* Status badge */}
        <span
          className={`flex-shrink-0 px-3 py-1 rounded-full text-xs uppercase tracking-wider font-semibold ${statusCfg.textClass} ${statusCfg.bgClass} border border-current/20`}
        >
          {statusCfg.label}
        </span>
      </div>

      {/* ── Metadata row: format, duration, platforms ── */}
      <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-[#333] pt-4">
        <MetaBadge label="Format" value={entry.format === "short" ? "9:16 Short" : "16:9 Long"} />
        <MetaBadge label="Duration" value={formatDuration(entry.duration)} />
        <MetaBadge
          label="Platforms"
          value={platforms.length > 0 ? platforms.map((p) => p[0].toUpperCase() + p.slice(1)).join(", ") : "—"}
        />
        <MetaBadge label="ID" value={entry.id.slice(0, 12) + "…"} />
      </div>

      {/* ── Media row: video player + thumbnail side-by-side on desktop ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Video player */}
        <div>
          <p className="text-xs uppercase tracking-wider text-[#555] mb-2">Video Preview</p>
          <VideoPlayer
            videoUrl={entry.video_url}
            thumbnailUrl={entry.thumbnail_url}
            format={entry.format}
          />
        </div>
        {/* Thumbnail preview */}
        <div>
          <p className="text-xs uppercase tracking-wider text-[#555] mb-2">Thumbnail</p>
          <ThumbnailPreview thumbnailUrl={entry.thumbnail_url} />
        </div>
      </div>

      {/* ── Caption tabs ── */}
      {entry.captions && Object.keys(entry.captions).length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider text-[#555] mb-3">Platform Captions</p>
          <div className="bg-[#0f0f0f] border border-[#333] rounded-xl p-4">
            <CaptionTabs
              captions={entry.captions}
              entryId={entry.id}
              onSave={onCaptionSave}
            />
          </div>
        </div>
      )}

      {/* ── Script preview (collapsible) ── */}
      {entry.script_text && (
        <div>
          <p className="text-xs uppercase tracking-wider text-[#555] mb-3">Script</p>
          <ScriptPreview scriptText={entry.script_text} />
        </div>
      )}

      {/* ── Approve & Post / Reject ── */}
      <div className="border-t border-[#333] pt-4">
        <PublishActions
          entry={entry}
          onPublish={onPublish}
          onReject={onReject}
          onRetry={onRetry}
          connectionStatus={connectionStatus}
        />
      </div>
    </div>
  );
}

// ── QueueListItem ────────────────────────────────────────────
// Compact row in the left-side queue list
function QueueListItem({
  entry,
  isSelected,
  onClick,
}: {
  entry: QueueEntry;
  isSelected: boolean;
  onClick: () => void;
}) {
  const statusCfg = STATUS_CONFIG[entry.status] || STATUS_CONFIG["pending_review"];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all ${
        isSelected
          ? "border-[#E8A817] bg-[#E8A817]/5"
          : "border-[#222] hover:border-[#333] bg-[#0a0a0a]"
      }`}
    >
      {/* Topic title */}
      <p className={`text-sm font-medium truncate ${isSelected ? "text-[#E8A817]" : "text-white"}`}>
        {entry.topic}
      </p>
      {/* Sub-row: format + date + status */}
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-[#555]">
          {entry.format === "short" ? "9:16" : "16:9"}
        </span>
        <span className="text-[10px] text-[#444]">{formatDate(entry.created_at)}</span>
        <span className={`text-[10px] uppercase tracking-wider ${statusCfg.textClass}`}>
          {statusCfg.label}
        </span>
      </div>
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function DashboardPage() {
  // All queue entries loaded from API (or mock fallback)
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  // Which entry is currently selected for detailed review
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Status filter for the queue list
  const [filter, setFilter] = useState<string>("all");
  // Loading + error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Connection status for platform toggles (loaded from /api/auth/status)
  const [connectionStatus, setConnectionStatus] = useState<Record<string, { connected: boolean }>>({});

  // ── Data fetching ──
  useEffect(() => {
    loadQueue();
  }, [filter]);

  // Load platform connection status for the approve flow toggles
  useEffect(() => {
    fetch("/api/auth/status")
      .then((res) => res.ok ? res.json() : {})
      .then(setConnectionStatus)
      .catch(() => {});
  }, []);

  async function loadQueue() {
    setLoading(true);
    setError(null);

    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const res = await fetch(`/api/queue${params}`);
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data: QueueEntry[] = await res.json();
      setEntries(data);
      // Auto-select first pending entry if nothing is selected
      if (!selectedId && data.length > 0) {
        const firstPending = data.find((e) => e.status === "pending_review");
        setSelectedId(firstPending?.id || data[0].id);
      }
    } catch (err) {
      // API unavailable — fall back to mock data so UI renders
      console.warn("API unavailable, using mock data:", err);
      setEntries(MOCK_ENTRIES);
      if (!selectedId) {
        setSelectedId(MOCK_ENTRIES[0].id);
      }
      setError("Using mock data — API not reachable");
    } finally {
      setLoading(false);
    }
  }

  // ── Actions ──

  async function handlePublish(id: string, platforms: string[], scheduledTime?: string) {
    try {
      // Optimistically set status to posting (or approved for scheduled)
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: scheduledTime ? "approved" : "posting" } : e))
      );
      await fetch(`/api/queue/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms,
          scheduled_post_time: scheduledTime || null,
        }),
      });
      // Refresh to get updated results
      loadQueue();
    } catch {
      loadQueue();
    }
  }

  async function handleRetry(id: string) {
    try {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: "posting" } : e))
      );
      await fetch(`/api/queue/${id}/retry`, { method: "POST" });
      loadQueue();
    } catch {
      loadQueue();
    }
  }

  async function handleReject(id: string) {
    try {
      await fetch(`/api/queue/${id}/reject`, { method: "POST" });
      loadQueue();
    } catch {
      // Optimistic update for mock mode
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: "rejected" } : e))
      );
    }
  }

  // Saves an edited caption for a specific platform back into local state
  // (Also sends to API if available — best-effort)
  function handleCaptionSave(entryId: string, platform: string, newCaption: PlatformCaption) {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== entryId) return e;
        return {
          ...e,
          captions: {
            ...(e.captions || {}),
            [platform]: newCaption,
          },
        };
      })
    );

    // Best-effort persist — fire and forget
    fetch(`/api/queue/${entryId}/captions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, ...newCaption }),
    }).catch(() => {
      // silently ignore — local state is already updated
    });
  }

  // ── Derived data ──

  // Filtered entries for the sidebar queue list
  const filteredEntries =
    filter === "all" ? entries : entries.filter((e) => e.status === filter);

  // The currently selected full entry object
  const selectedEntry = entries.find((e) => e.id === selectedId) || null;

  // Count how many are pending review (badge on the filter button)
  const pendingCount = entries.filter((e) => e.status === "pending_review").length;

  // ── Render ──

  return (
    // Page uses full dark background to extend beyond the layout's max-width container
    <div className="text-white">

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#E8A817" }}>
            Review Queue
          </h1>
          {pendingCount > 0 && (
            <p className="text-sm text-[#555] mt-0.5">
              {pendingCount} video{pendingCount !== 1 ? "s" : ""} awaiting review
            </p>
          )}
        </div>

        {/* Header actions */}
        <div className="flex gap-2 self-start sm:self-auto">
          <a
            href="/settings"
            className="px-4 py-2 text-xs uppercase tracking-wider border border-[#333] text-[#555] hover:text-[#E8A817] hover:border-[#E8A817] rounded-lg transition-all"
          >
            Settings
          </a>
          <button
            onClick={loadQueue}
            disabled={loading}
            className="px-4 py-2 text-xs uppercase tracking-wider border border-[#333] text-[#555] hover:text-[#E8A817] hover:border-[#E8A817] rounded-lg transition-all disabled:opacity-40"
          >
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* API error notice (non-blocking) */}
      {error && (
        <div className="mb-4 px-4 py-2 border border-[#E8A817]/30 bg-[#E8A817]/5 rounded-lg">
          <p className="text-xs text-[#E8A817]">⚠ {error}</p>
        </div>
      )}

      {/* ── Status filter tabs ── */}
      <div className="flex flex-wrap gap-2 mb-6">
        {["all", "pending_review", "approved", "rejected", "posted"].map((s) => {
          const count = s === "all" ? entries.length : entries.filter((e) => e.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 text-xs uppercase tracking-wider rounded-lg border transition-all ${
                filter === s
                  ? "border-[#E8A817] text-[#E8A817] bg-[#E8A817]/10"
                  : "border-[#222] text-[#444] hover:border-[#333] hover:text-[#888]"
              }`}
            >
              {s.replace(/_/g, " ")}
              {count > 0 && (
                <span
                  className={`ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full ${
                    filter === s ? "bg-[#E8A817]/20 text-[#E8A817]" : "bg-[#222] text-[#555]"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Loading state ── */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="text-[#E8A817] text-3xl mb-3 animate-spin inline-block">⌛</div>
            <p className="text-sm text-[#555] uppercase tracking-wider">Loading queue…</p>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && filteredEntries.length === 0 && (
        <div className="text-center py-20 border border-[#1a1a1a] rounded-2xl">
          <p className="text-4xl mb-4">📭</p>
          <p className="text-[#555] uppercase tracking-wider text-sm">No videos in queue</p>
          <p className="text-xs text-[#333] mt-2">
            {filter === "all"
              ? "Videos appear here after scheduled generation"
              : `No ${filter.replace(/_/g, " ")} entries`}
          </p>
        </div>
      )}

      {/* ── Main layout: queue sidebar + review panel ── */}
      {!loading && filteredEntries.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">

          {/* ── Queue list sidebar ── */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-[#555] mb-3">
              {filteredEntries.length} entr{filteredEntries.length === 1 ? "y" : "ies"}
            </p>
            {filteredEntries.map((entry) => (
              <QueueListItem
                key={entry.id}
                entry={entry}
                isSelected={entry.id === selectedId}
                onClick={() => setSelectedId(entry.id)}
              />
            ))}
          </div>

          {/* ── Full review card ── */}
          <div>
            {selectedEntry ? (
              <ReviewCard
                entry={selectedEntry}
                onPublish={handlePublish}
                onReject={handleReject}
                onRetry={handleRetry}
                onCaptionSave={handleCaptionSave}
                connectionStatus={connectionStatus}
              />
            ) : (
              // Fallback when nothing is selected
              <div className="flex items-center justify-center h-64 border border-[#222] rounded-2xl">
                <p className="text-[#555] text-sm">Select a video from the list</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
