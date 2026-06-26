"use client";

// ─────────────────────────────────────────────────────────────
//  Luminous Will — Platform Connection Settings
//  Four cards for YouTube, TikTok, Instagram, Facebook.
//  Each card shows connection status and allows connect/disconnect.
//
//  Instagram and Facebook share one Meta OAuth connection.
//
//  Brand tokens (same as dashboard):
//    Background:  #000000
//    Panel:       #1a1a1a
//    Border:      #333333
//    Accent:      #E8A817  (amber)
//    Success:     #22c55e  (green)
//    Warning:     #f59e0b  (yellow)
//    Danger:      #ef4444  (red)
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";

// -- Connection status shape returned by /api/auth/status --
interface ConnectionStatus {
  connected: boolean;
  account_name?: string;
  needs_reconnect?: boolean;
}

// -- Platform card configuration --
interface PlatformConfig {
  // Display name shown on the card
  name: string;
  // Which OAuth provider handles this platform
  provider: "youtube" | "tiktok" | "meta";
  // URL path to start the OAuth flow
  authUrl: string;
  // Platform icon (text-based for simplicity)
  icon: string;
  // Short description shown under the platform name
  description: string;
}

// -- All four platforms and their OAuth mappings --
const PLATFORMS: PlatformConfig[] = [
  {
    name: "YouTube",
    provider: "youtube",
    authUrl: "/api/auth/youtube",
    icon: "▶",
    description: "Upload videos and Shorts automatically",
  },
  {
    name: "TikTok",
    provider: "tiktok",
    authUrl: "/api/auth/tiktok",
    icon: "♪",
    description: "Post short-form content to TikTok",
  },
  {
    name: "Instagram",
    provider: "meta",
    authUrl: "/api/auth/meta",
    icon: "◎",
    description: "Publish Reels to Instagram",
  },
  {
    name: "Facebook",
    provider: "meta",
    authUrl: "/api/auth/meta",
    icon: "f",
    description: "Share videos to your Facebook Page",
  },
];

export default function SettingsPage() {
  // Connection status for each OAuth provider
  const [status, setStatus] = useState<Record<string, ConnectionStatus>>({});
  const [loading, setLoading] = useState(true);
  // Tracks which platform is being disconnected (for confirmation dialog)
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  // Success toast message from URL params (after OAuth redirect)
  const [toast, setToast] = useState<string | null>(null);

  // Auto-approve toggle for cron-generated videos
  const [autoApprove, setAutoApproveState] = useState(false);
  const [autoApproveLoading, setAutoApproveLoading] = useState(true);

  // -- Load auto-approve setting on mount --
  useEffect(() => {
    loadAutoApprove();
  }, []);

  async function loadAutoApprove() {
    setAutoApproveLoading(true);
    try {
      const res = await fetch("/api/settings/auto-approve");
      if (res.ok) {
        const data = await res.json();
        // Apply the persisted setting from the server
        setAutoApproveState(data.enabled);
      }
    } catch {
      // Default to off if the request fails
    } finally {
      setAutoApproveLoading(false);
    }
  }

  async function toggleAutoApprove() {
    // Optimistically flip the toggle before the request completes
    const newValue = !autoApprove;
    setAutoApproveState(newValue);
    try {
      await fetch("/api/settings/auto-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newValue }),
      });
      // Show confirmation toast
      setToast(`Auto-approve ${newValue ? "enabled" : "disabled"}`);
    } catch {
      // Revert on failure so UI stays in sync with server state
      setAutoApproveState(!newValue);
      setToast("Failed to update auto-approve setting");
    }
  }

  // -- Load connection status on mount --
  useEffect(() => {
    loadStatus();

    // Check URL params for success/error messages from OAuth callback
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");

    if (connected) {
      setToast(`${connected} connected successfully!`);
      // Clean URL params
      window.history.replaceState({}, "", "/settings");
    } else if (error) {
      setToast(`Connection failed: ${error}`);
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  // Auto-dismiss toast after 5 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function loadStatus() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/status");
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch {
      // Status API unavailable — show everything as disconnected
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect(provider: string) {
    // Delete the token and refresh status
    await fetch("/api/auth/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: provider }),
    });
    setDisconnecting(null);
    loadStatus();
  }

  function handleConnect(authUrl: string) {
    // Full page redirect to OAuth consent screen
    window.location.href = authUrl;
  }

  // -- Helper: get status for a platform's OAuth provider --
  function getProviderStatus(provider: string): ConnectionStatus {
    return status[provider] || { connected: false };
  }

  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-10 max-w-4xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#E8A817" }}>
            Platform Connections
          </h1>
          <p className="text-sm text-[#555] mt-1">
            Connect your accounts to enable auto-posting
          </p>
        </div>
        {/* Navigation links */}
        <div className="flex gap-2">
          <a
            href="/"
            className="px-4 py-2 text-xs uppercase tracking-wider border border-[#333] text-[#555] hover:text-[#E8A817] hover:border-[#E8A817] rounded-lg transition-all"
          >
            Generator
          </a>
          <a
            href="/dashboard"
            className="px-4 py-2 text-xs uppercase tracking-wider border border-[#333] text-[#555] hover:text-[#E8A817] hover:border-[#E8A817] rounded-lg transition-all"
          >
            Dashboard
          </a>
        </div>
      </div>

      {/* ── Success/error toast ── */}
      {toast && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg border ${
            toast.includes("failed")
              ? "border-[#ef4444]/30 bg-[#ef4444]/5 text-[#ef4444]"
              : "border-[#22c55e]/30 bg-[#22c55e]/5 text-[#22c55e]"
          }`}
        >
          <p className="text-sm">{toast}</p>
        </div>
      )}

      {/* ── Platform cards grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PLATFORMS.map((platform) => {
          const providerStatus = getProviderStatus(platform.provider);
          const isMetaPlatform = platform.provider === "meta";
          // For Meta platforms, show note that one connection covers both
          const metaNote = isMetaPlatform && providerStatus.connected
            ? "Connected via Meta (covers Instagram + Facebook)"
            : undefined;

          return (
            <div
              key={platform.name}
              className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 flex flex-col gap-4"
            >
              {/* Platform header: icon + name + description */}
              <div className="flex items-start gap-4">
                {/* Icon circle */}
                <div className="w-12 h-12 rounded-xl bg-[#0a0a0a] border border-[#333] flex items-center justify-center text-xl flex-shrink-0">
                  <span style={{ color: "#E8A817" }}>{platform.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-white">{platform.name}</h3>
                  <p className="text-xs text-[#555] mt-0.5">{platform.description}</p>
                </div>
              </div>

              {/* Status + action */}
              {loading ? (
                // Loading state
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#333] animate-pulse" />
                  <span className="text-xs text-[#555]">Checking...</span>
                </div>
              ) : providerStatus.needs_reconnect ? (
                // Needs reconnect state
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#f59e0b]" />
                    <span className="text-xs text-[#f59e0b]">
                      Needs reconnection
                      {providerStatus.account_name && ` — ${providerStatus.account_name}`}
                    </span>
                  </div>
                  <button
                    onClick={() => handleConnect(platform.authUrl)}
                    className="w-full py-2.5 rounded-xl bg-[#f59e0b]/10 border border-[#f59e0b]/40 text-[#f59e0b] font-semibold text-sm uppercase tracking-wider hover:bg-[#f59e0b]/20 transition-all"
                  >
                    Reconnect
                  </button>
                </div>
              ) : providerStatus.connected ? (
                // Connected state
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#22c55e]" />
                    <span className="text-xs text-[#22c55e]">
                      Connected{providerStatus.account_name && ` — ${providerStatus.account_name}`}
                    </span>
                  </div>
                  {metaNote && (
                    <p className="text-[10px] text-[#444]">{metaNote}</p>
                  )}
                  {/* Disconnect flow */}
                  {disconnecting === platform.name ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDisconnect(platform.provider)}
                        className="flex-1 py-2 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/40 text-[#ef4444] text-xs uppercase tracking-wider hover:bg-[#ef4444]/20 transition-all"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDisconnecting(null)}
                        className="px-4 py-2 rounded-xl border border-[#333] text-[#555] text-xs hover:text-[#888] transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDisconnecting(platform.name)}
                      className="w-full py-2 rounded-xl border border-[#333] text-[#444] text-xs uppercase tracking-wider hover:text-[#888] hover:border-[#555] transition-all"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              ) : (
                // Not connected state
                <button
                  onClick={() => handleConnect(platform.authUrl)}
                  className="w-full py-2.5 rounded-xl bg-[#E8A817]/10 border border-[#E8A817]/40 text-[#E8A817] font-semibold text-sm uppercase tracking-wider hover:bg-[#E8A817]/20 hover:border-[#E8A817] transition-all"
                >
                  Connect {platform.name}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Info note ── */}
      <div className="mt-8 px-4 py-3 bg-[#0a0a0a] border border-[#222] rounded-xl">
        <p className="text-xs text-[#444]">
          Instagram and Facebook use the same Meta connection. Connecting one connects both.
          All tokens are stored securely and refresh automatically.
        </p>
      </div>

      {/* ── Auto-Approve Setting ── */}
      <div className="mt-6 bg-[#1a1a1a] border border-[#333] rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Auto-Approve Videos</h3>
            <p className="text-xs text-[#555] mt-1">
              When enabled, cron-generated videos skip manual review and post automatically
            </p>
          </div>
          {/* Show skeleton while the initial fetch is in flight */}
          {autoApproveLoading ? (
            <div className="w-12 h-6 rounded-full bg-[#333] animate-pulse" />
          ) : (
            // Toggle button — amber when on, grey when off
            <button
              onClick={toggleAutoApprove}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                autoApprove ? "bg-[#E8A817]" : "bg-[#333]"
              }`}
            >
              {/* Sliding knob */}
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  autoApprove ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
