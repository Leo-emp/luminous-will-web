"use client";

import { useState, useRef } from "react";

// --- Import content type definitions from shared lib ---
// CONTENT_TYPES is the array of { key, name, accent_color, description }
// ContentTypeKey is the union type of all valid keys
import { CONTENT_TYPES } from "@/lib/content-types";
import type { ContentTypeKey } from "@/lib/content-types";

// ─────────────────────────────────────────────────────────────
//  Topics per content type
//  These must match the topic lists in the Python pipeline
//  (content_types.py). If you add/remove topics there,
//  update this object to stay in sync.
// ─────────────────────────────────────────────────────────────
const TOPICS_BY_TYPE: Record<ContentTypeKey, string[]> = {
  dark_motivation: [
    "The psychology of silence and power",
    "Why high-value people walk alone",
    "The art of not reacting",
    "The hidden envy around you",
    "Comfort is killing your potential",
    "The quiet leader vs the loud victim",
    "Why loneliness is a superpower",
    "The psychology behind fake friends",
    "Signs of a mentally strong person",
    "Why successful people are quiet",
    "Psychology of self-discipline",
    "Why people disrespect you (and how to stop it)",
    "The dark truth about comfort zones",
    "How emotional control changes everything",
    "The psychology of revenge vs moving on",
    "Why nice people finish last (the truth)",
    "Signs you are becoming dangerous (in a good way)",
    "The wolf mentality - psychology of lone wolves",
    "Why you should never explain yourself",
    "The 48 laws of power - key lessons",
  ],
  stoic_philosophy: [
    "Marcus Aurelius on controlling your emotions",
    "Why the Stoics chose discomfort on purpose",
    "Epictetus on what you can and cannot control",
    "The Stoic response to betrayal",
    "Why Seneca said wealth is a test",
    "How to think like a Roman emperor",
    "The Stoic art of letting go",
    "Why Marcus Aurelius journaled every night",
    "Amor fati - how to love your fate",
    "The dichotomy of control explained",
    "Why Stoics trained for the worst day",
    "Memento mori - the power of remembering death",
    "How Epictetus turned slavery into philosophy",
    "The Stoic way to handle insults",
    "Why ancient Rome valued silence over speech",
    "Seneca's letters on the shortness of life",
    "The Stoic practice of voluntary hardship",
    "How to be unshakeable like Marcus Aurelius",
    "Why the Stoics said anger is weakness",
    "The four Stoic virtues that build an unbreakable mind",
  ],
  wealth_mindset: [
    "Why the rich think differently than the poor",
    "The psychology of financial discipline",
    "How compound habits build empires",
    "Why your network determines your net worth",
    "The wealth trap of looking rich vs being rich",
    "How the wealthy use time as their greatest asset",
    "Why 95% of people will never build real wealth",
    "The psychology behind delayed gratification",
    "How to build systems that make money while you sleep",
    "Why the rich read and the poor watch TV",
    "The invisible tax of bad financial decisions",
    "How leverage separates the rich from the middle class",
    "Why most lottery winners go broke",
    "The psychology of scarcity vs abundance thinking",
    "How the wealthy protect their energy",
    "Why financial education is more valuable than a degree",
    "The compounding effect of daily 1% improvements",
    "How to think in assets not liabilities",
    "Why the rich embrace risk and the poor avoid it",
    "The silent habits of self-made millionaires",
  ],
  dark_psychology: [
    "How narcissists trap you without you knowing",
    "The 7 signs someone is manipulating you",
    "Dark psychology of first impressions",
    "Why psychopaths are more successful than you think",
    "The manipulation tactic called gaslighting explained",
    "How to read someone in 5 seconds",
    "The dark triad personality and why it attracts people",
    "Body language signals that reveal hidden intentions",
    "How social media is designed to manipulate you",
    "The psychology of love bombing",
    "Why toxic people target empaths",
    "How cults use psychology to control members",
    "The Machiavellian tactics used in everyday life",
    "Psychological tricks used in advertising and sales",
    "How to detect a liar using micro-expressions",
    "The psychology of power and who really has it",
    "Why people stay in toxic relationships",
    "How fear is weaponized to control behavior",
    "The psychology behind passive-aggressive behavior",
    "Dark persuasion techniques used by politicians",
  ],
};

// --- HF Space URL (set via Vercel env var) ---
const HF_SPACE_URL = process.env.NEXT_PUBLIC_HF_SPACE_URL || "";

// --- Generation state type ---
type GenerationState = "idle" | "connecting" | "generating" | "done" | "error";

// --- Progress step structure ---
interface StepInfo {
  label: string;
  progress: number;
}

// --- Pipeline progress steps (matches typical backend timing) ---
const STEPS: StepInfo[] = [
  { label: "Connecting to server...", progress: 0 },
  { label: "Generating script...", progress: 5 },
  { label: "Creating voiceover...", progress: 15 },
  { label: "Downloading stock footage...", progress: 30 },
  { label: "Building captions...", progress: 50 },
  { label: "Getting background music...", progress: 55 },
  { label: "Assembling video...", progress: 60 },
  { label: "Finalizing...", progress: 90 },
];

export default function Home() {
  // --- UI state ---
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [customTopic, setCustomTopic] = useState("");
  const [videoFormat, setVideoFormat] = useState<"short" | "long">("short");

  // --- Content type state: which type of video to generate ---
  // Defaults to dark_motivation (the original style)
  const [contentType, setContentType] = useState<ContentTypeKey>("dark_motivation");

  // --- Generation state ---
  const [state, setState] = useState<GenerationState>("idle");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Active topics: derived from selected content type ---
  // Switching content type resets selectedTopic (handled in the button onClick)
  const activeTopics = TOPICS_BY_TYPE[contentType];

  // --- Which topic is effectively active (custom overrides selected) ---
  const activeTopic = customTopic.trim() || selectedTopic;

  // --- Timer helpers for tracking elapsed generation time ---
  const startTimer = () => {
    setElapsedTime(0);
    timerRef.current = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // ─────────────────────────────────────────────────────────────
  //  handleGenerate
  //  Connects to the Gradio space and triggers video generation.
  //  Passes the content_type_key so the backend knows which
  //  pipeline style to apply.
  // ─────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    // Guard: HF Space URL must be configured
    if (!HF_SPACE_URL) {
      setErrorMsg(
        "HF Space URL not configured. Set NEXT_PUBLIC_HF_SPACE_URL in your Vercel environment variables."
      );
      setState("error");
      return;
    }

    setState("connecting");
    setProgress(0);
    setStatusText("Connecting to Luminous Will server...");
    setVideoUrl(null);
    setVideoInfo("");
    setErrorMsg("");
    startTimer();

    try {
      // --- Dynamic import of Gradio client (keeps bundle smaller) ---
      const { Client } = await import("@gradio/client");

      setState("generating");
      setStatusText("Starting video generation...");

      const client = await Client.connect(HF_SPACE_URL);

      // --- Simulate progress steps while the pipeline runs ---
      // The Gradio JS client doesn't expose granular backend progress,
      // so we advance through STEPS on a ~15s interval as a visual indicator.
      let stepIndex = 0;
      const progressInterval = setInterval(() => {
        if (stepIndex < STEPS.length - 1) {
          stepIndex++;
          setProgress(STEPS[stepIndex].progress);
          setStatusText(STEPS[stepIndex].label);
        }
      }, 15000); // advance every ~15 seconds

      setProgress(5);
      setStatusText("Generating script & voiceover...");

      // --- Call the Gradio endpoint ---
      // content_type_key tells the backend which content type pipeline to use
      // dropdown_topic is "(Random)" when a custom topic is typed
      // custom is the user-entered custom topic string
      const result = await client.predict("/on_generate", {
        content_type_key: contentType,
        format_choice: videoFormat === "long" ? "Horizontal Long (16:9)" : "Vertical Short (9:16)",
        dropdown_topic: customTopic.trim() ? "(Random)" : (selectedTopic || "(Random)"),
        custom: customTopic.trim() || "",
      });

      clearInterval(progressInterval);
      stopTimer();

      // --- Parse and display the result ---
      const data = result.data as [{ url: string } | null, string];
      if (data && data[0]) {
        const videoData = data[0];
        // The URL may come back as an object { url } or a raw string
        const videoSrc =
          typeof videoData === "object" && videoData.url
            ? videoData.url
            : typeof videoData === "string"
            ? videoData
            : null;

        if (videoSrc) {
          setVideoUrl(videoSrc);
          setVideoInfo(typeof data[1] === "string" ? data[1] : "");
          setProgress(100);
          setStatusText("Video ready!");
          setState("done");
        } else {
          throw new Error("No video URL in response");
        }
      } else {
        throw new Error("Empty response from server");
      }
    } catch (err) {
      stopTimer();
      const message = err instanceof Error ? err.message : "Unknown error";
      setErrorMsg(message);
      setState("error");
      setStatusText("");
    }
  };

  // --- Format elapsed seconds as m:ss ---
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <main className="min-h-screen flex flex-col">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="py-12 text-center relative">
        {/* Nav links — top right corner */}
        <div className="absolute top-6 right-6 flex gap-2">
          <a
            href="/dashboard"
            className="px-4 py-2 text-xs uppercase tracking-wider border border-[#222] text-[#555] hover:text-[#E8A817] hover:border-[#E8A817] rounded-lg transition-all"
          >
            Dashboard
          </a>
          <a
            href="/settings"
            className="px-4 py-2 text-xs uppercase tracking-wider border border-[#222] text-[#555] hover:text-[#E8A817] hover:border-[#E8A817] rounded-lg transition-all"
          >
            Settings
          </a>
        </div>

        <h1
          className="text-4xl md:text-5xl font-bold tracking-[6px]"
          style={{ color: "#E8A817" }}
        >
          LUMINOUS WILL
        </h1>
        <p className="mt-3 text-sm tracking-[3px] uppercase" style={{ color: "#555" }}>
          Dark Motivation Video Generator
        </p>
      </header>

      <div className="flex-1 max-w-6xl mx-auto w-full px-4 pb-16">
        {/* ── Two column layout ───────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* ── Left: Controls ────────────────────────────── */}
          <div>

            {/* ── Content Type selector ─────────────────────
                2×2 grid of cards, one per content type.
                Selected card gets a border + faint bg tint
                in the type's accent color. Selecting a new
                type resets the topic selection.
            ──────────────────────────────────────────────── */}
            <div className="mb-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "#666" }}>
                Content Type
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {CONTENT_TYPES.map((ct) => (
                  <button
                    key={ct.key}
                    onClick={() => {
                      // Switch type and clear topic so the new list starts fresh
                      setContentType(ct.key);
                      setSelectedTopic(null);
                    }}
                    // Base classes shared by all cards
                    // Selected state is handled via inline style below to support
                    // dynamic accent colors (Tailwind can't use arbitrary runtime values)
                    className={`p-3 rounded-xl border text-sm text-left transition-all ${
                      contentType === ct.key
                        ? "border-[#444]" // border overridden by inline style
                        : "border-[#1a1a1a] bg-[#0a0a0a] text-[#666] hover:border-[#333]"
                    }`}
                    style={
                      contentType === ct.key
                        ? {
                            // Selected: accent-colored border and a 15-opacity tint background
                            borderColor: ct.accent_color,
                            backgroundColor: `${ct.accent_color}15`,
                            color: ct.accent_color,
                          }
                        : undefined
                    }
                  >
                    {/* Card title */}
                    <div className="font-semibold">{ct.name}</div>
                    {/* Card subtitle / description */}
                    <div className="text-xs mt-1 opacity-70">{ct.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Format selector ─────────────────────────── */}
            <div className="mb-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "#666" }}>
                Format
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {/* Short format card */}
                <button
                  onClick={() => setVideoFormat("short")}
                  className={`p-3 rounded-xl border text-sm transition-all ${
                    videoFormat === "short"
                      ? "border-[#E8A817] bg-[#E8A817]/10 text-[#E8A817]"
                      : "border-[#1a1a1a] bg-[#0a0a0a] text-[#666] hover:border-[#333]"
                  }`}
                >
                  <div className="font-semibold">9:16 Short</div>
                  <div className="text-xs mt-1 opacity-70">60-90s · Reels/TikTok</div>
                </button>

                {/* Long format card */}
                <button
                  onClick={() => setVideoFormat("long")}
                  className={`p-3 rounded-xl border text-sm transition-all ${
                    videoFormat === "long"
                      ? "border-[#E8A817] bg-[#E8A817]/10 text-[#E8A817]"
                      : "border-[#1a1a1a] bg-[#0a0a0a] text-[#666] hover:border-[#333]"
                  }`}
                >
                  <div className="font-semibold">16:9 Long</div>
                  <div className="text-xs mt-1 opacity-70">8-12 min · YouTube</div>
                </button>
              </div>
            </div>

            {/* ── Topic section header ─────────────────────── */}
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "#666" }}>
              Select Topic
            </h2>

            {/* ── Custom topic input ───────────────────────── */}
            <div className="mb-6">
              <input
                type="text"
                placeholder="Type a custom topic..."
                value={customTopic}
                onChange={(e) => {
                  setCustomTopic(e.target.value);
                  // Clear grid selection when user types a custom topic
                  if (e.target.value.trim()) setSelectedTopic(null);
                }}
                className="w-full px-4 py-3 rounded-xl bg-[#0a0a0a] border border-[#1a1a1a] text-white placeholder-[#444] focus:outline-none focus:border-[#E8A817] transition-colors"
              />
            </div>

            {/* ── Topic grid ──────────────────────────────────
                Renders activeTopics — the list for the currently
                selected content type. Switching content type
                replaces this list and resets the selection.
            ──────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-2 max-h-[50vh] overflow-y-auto pr-2">
              {activeTopics.map((topic) => (
                <button
                  key={topic}
                  onClick={() => {
                    setSelectedTopic(topic);
                    setCustomTopic(""); // clear custom topic when grid item selected
                  }}
                  className={`topic-card text-left ${
                    selectedTopic === topic && !customTopic ? "selected" : ""
                  }`}
                >
                  {topic}
                </button>
              ))}
            </div>

            {/* ── Generate button + status ──────────────────── */}
            <div className="mt-8">
              <button
                onClick={handleGenerate}
                disabled={state === "connecting" || state === "generating"}
                className="btn-generate w-full"
              >
                {state === "connecting" || state === "generating" ? (
                  // Spinner while generating
                  <span className="flex items-center justify-center gap-3">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="15" />
                    </svg>
                    Generating...
                  </span>
                ) : (
                  "Generate Video"
                )}
              </button>

              {/* Progress bar + status text (shown during generation) */}
              {(state === "connecting" || state === "generating") && (
                <div className="mt-4">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="flex justify-between mt-2 text-xs" style={{ color: "#666" }}>
                    <span className="animate-pulse-amber">{statusText}</span>
                    <span>{formatTime(elapsedTime)}</span>
                  </div>
                </div>
              )}

              {/* Error message block */}
              {state === "error" && (
                <div className="mt-4 p-4 rounded-xl bg-red-950/30 border border-red-900/50">
                  <p className="text-red-400 text-sm">{errorMsg}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Video Output ───────────────────────── */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "#666" }}>
              Output
            </h2>

            {videoUrl ? (
              // ── Video is ready ────────────────────────────
              <div>
                <div
                  className="video-container mx-auto"
                  style={{ maxWidth: videoFormat === "long" ? "640px" : "360px" }}
                >
                  <video src={videoUrl} controls playsInline />
                </div>

                {/* Video metadata / info block */}
                {videoInfo && (
                  <div className="mt-4 p-4 rounded-xl bg-[#0a0a0a] border border-[#1a1a1a]">
                    <p className="text-sm text-[#888]">
                      {videoInfo.split("\n").map((line, i) => (
                        <span key={i}>
                          {i > 0 && <br />}
                          {/* Render **bold** markdown from the backend */}
                          {line.split(/\*\*(.*?)\*\*/g).map((part, j) =>
                            j % 2 === 1 ? (
                              <strong key={j} style={{ color: "#E8A817" }}>{part}</strong>
                            ) : (
                              part
                            )
                          )}
                        </span>
                      ))}
                    </p>
                  </div>
                )}

                {/* Download link */}
                <a
                  href={videoUrl}
                  download
                  className="btn-generate mt-4 inline-block text-center w-full"
                  style={{ fontSize: "0.9rem", padding: "12px 24px" }}
                >
                  Download Video
                </a>
              </div>
            ) : (
              // ── Placeholder / generating spinner ─────────
              <div
                className="video-container mx-auto flex flex-col items-center justify-center"
                style={{
                  maxWidth: videoFormat === "long" ? "640px" : "360px",
                  minHeight: videoFormat === "long" ? "360px" : "400px",
                }}
              >
                {state === "connecting" || state === "generating" ? (
                  // Animated spinner while pipeline runs
                  <div className="text-center px-8">
                    <div className="w-16 h-16 rounded-full border-2 border-t-[#E8A817] border-r-[#E8A817] border-b-transparent border-l-transparent animate-spin mx-auto" />
                    <p className="mt-6 text-sm" style={{ color: "#555" }}>
                      {statusText}
                    </p>
                    <p className="mt-2 text-xs" style={{ color: "#333" }}>
                      This usually takes 3-8 minutes
                    </p>
                  </div>
                ) : (
                  // Idle placeholder with play icon
                  <div className="text-center px-8">
                    <svg
                      className="w-12 h-12 mx-auto mb-4"
                      style={{ color: "#222" }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1}
                        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1}
                        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p className="text-sm" style={{ color: "#333" }}>
                      Select a topic and hit Generate
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="py-6 text-center border-t border-[#111]">
        <p className="text-xs" style={{ color: "#333" }}>
          LUMINOUS WILL &mdash; Powered by ElevenLabs, Pexels &amp; Pixabay
        </p>
      </footer>
    </main>
  );
}
