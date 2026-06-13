"use client";

import { useState, useEffect } from "react";

interface QueueEntry {
  id: string;
  format: "short" | "long";
  topic: string;
  status: string;
  created_at: string;
  thumbnail_path: string;
  target_platforms: string[];
  post_results: Record<string, { url: string }>;
}

const STATUS_COLORS: Record<string, string> = {
  pending_review: "#E8A817",
  approved: "#22c55e",
  posting: "#3b82f6",
  posted: "#22c55e",
  rejected: "#ef4444",
  failed: "#ef4444",
};

export default function DashboardPage() {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQueue();
  }, [filter]);

  const fetchQueue = async () => {
    setLoading(true);
    const params = filter !== "all" ? `?status=${filter}` : "";
    const res = await fetch(`/api/queue${params}`);
    const data = await res.json();
    setEntries(data);
    setLoading(false);
  };

  const handleApprove = async (id: string) => {
    await fetch(`/api/queue/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    fetchQueue();
  };

  const handleReject = async (id: string) => {
    await fetch(`/api/queue/${id}/reject`, { method: "POST" });
    fetchQueue();
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold" style={{ color: "#E8A817" }}>
          Review Queue
        </h1>
        <div className="flex gap-2">
          {["all", "pending_review", "approved", "posted", "rejected"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 text-xs uppercase tracking-wider rounded-lg border transition-all ${
                filter === s
                  ? "border-[#E8A817] text-[#E8A817] bg-[#E8A817]/10"
                  : "border-[#1a1a1a] text-[#555] hover:border-[#333]"
              }`}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-[#555]">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[#555]">No videos in queue</p>
          <p className="text-xs text-[#333] mt-2">Videos will appear here after scheduled generation</p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="p-4 rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] flex items-center gap-4"
            >
              <div className="w-24 h-14 bg-[#111] rounded-lg flex-shrink-0 flex items-center justify-center">
                <span className="text-xs text-[#333]">
                  {entry.format === "long" ? "16:9" : "9:16"}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-white truncate">{entry.topic}</h3>
                <div className="flex items-center gap-3 mt-1">
                  <span
                    className="text-xs uppercase tracking-wider px-2 py-0.5 rounded"
                    style={{
                      color: STATUS_COLORS[entry.status] || "#555",
                      background: `${STATUS_COLORS[entry.status] || "#555"}15`,
                    }}
                  >
                    {entry.status.replace("_", " ")}
                  </span>
                  <span className="text-xs text-[#444]">{formatDate(entry.created_at)}</span>
                  <span className="text-xs text-[#444]">
                    {entry.target_platforms.join(", ")}
                  </span>
                </div>
              </div>

              {entry.status === "pending_review" && (
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleApprove(entry.id)}
                    className="px-4 py-2 text-xs uppercase tracking-wider rounded-lg bg-[#22c55e]/10 border border-[#22c55e]/30 text-[#22c55e] hover:bg-[#22c55e]/20 transition-all"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(entry.id)}
                    className="px-4 py-2 text-xs uppercase tracking-wider rounded-lg bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] hover:bg-[#ef4444]/20 transition-all"
                  >
                    Reject
                  </button>
                </div>
              )}

              {entry.status === "posted" && entry.post_results && (
                <div className="flex gap-2 flex-shrink-0">
                  {Object.entries(entry.post_results).map(([platform, result]) => (
                    <a
                      key={platform}
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 text-xs uppercase tracking-wider rounded-lg border border-[#1a1a1a] text-[#888] hover:text-[#E8A817] hover:border-[#E8A817] transition-all"
                    >
                      {platform}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
