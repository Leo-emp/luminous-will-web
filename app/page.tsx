"use client";

import { useState, useRef } from "react";

// --- All available topics (matches backend) ---
const TOPICS = [
  "The psychology of silence and power",
  "Why high-value people walk alone",
  "The art of not reacting",
  "The hidden envy around you",
  "Comfort is killing your potential",
  "Dark psychology of manipulation tactics",
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
  "Dark truths about human nature",
  "Why being feared is better than being loved",
  "The stoic mindset that changes your life",
  "Psychology of body language and dominance",
  "Why your silence terrifies them",
  "The power of walking away",
  "How narcissists manipulate you",
  "The mindset of a high-value man",
  "Why you attract toxic people",
  "The psychology of winning alone",
  "Why most people will never succeed",
];

// --- HF Space URL (update after deployment) ---
const HF_SPACE_URL = process.env.NEXT_PUBLIC_HF_SPACE_URL || "";

type GenerationState = "idle" | "connecting" | "generating" | "done" | "error";

interface StepInfo {
  label: string;
  progress: number;
}

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
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [customTopic, setCustomTopic] = useState("");
  const [videoFormat, setVideoFormat] = useState<"short" | "long">("short");
  const [state, setState] = useState<GenerationState>("idle");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeTopic = customTopic.trim() || selectedTopic;

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

  const handleGenerate = async () => {
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
      // --- Dynamic import of Gradio client ---
      const { Client } = await import("@gradio/client");

      setState("generating");
      setStatusText("Starting video generation...");

      const client = await Client.connect(HF_SPACE_URL);

      // --- Simulate progress while waiting ---
      // The Gradio queue doesn't give granular progress to JS client,
      // so we simulate based on typical pipeline timing
      let stepIndex = 0;
      const progressInterval = setInterval(() => {
        if (stepIndex < STEPS.length - 1) {
          stepIndex++;
          setProgress(STEPS[stepIndex].progress);
          setStatusText(STEPS[stepIndex].label);
        }
      }, 15000); // advance step every ~15 seconds

      setProgress(5);
      setStatusText("Generating script & voiceover...");

      const topicToSend = activeTopic || "(Random)";
      const result = await client.predict("/on_generate", {
        format_choice: videoFormat === "long" ? "Horizontal Long (16:9)" : "Vertical Short (9:16)",
        dropdown_topic: customTopic.trim() ? "(Random)" : (selectedTopic || "(Random)"),
        custom: customTopic.trim() || "",
      });

      clearInterval(progressInterval);
      stopTimer();

      // --- Handle result ---
      const data = result.data as [{ url: string } | null, string];
      if (data && data[0]) {
        const videoData = data[0];
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

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <main className="min-h-screen flex flex-col">
      {/* --- Header --- */}
      <header className="py-12 text-center">
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
        {/* --- Two column layout --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* --- Left: Topic Selection --- */}
          <div>
            {/* --- Format selector --- */}
            <div className="mb-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "#666" }}>
                Format
              </h2>
              <div className="grid grid-cols-2 gap-3">
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

            <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "#666" }}>
              Select Topic
            </h2>

            {/* --- Custom topic input --- */}
            <div className="mb-6">
              <input
                type="text"
                placeholder="Type a custom topic..."
                value={customTopic}
                onChange={(e) => {
                  setCustomTopic(e.target.value);
                  if (e.target.value.trim()) setSelectedTopic(null);
                }}
                className="w-full px-4 py-3 rounded-xl bg-[#0a0a0a] border border-[#1a1a1a] text-white placeholder-[#444] focus:outline-none focus:border-[#E8A817] transition-colors"
              />
            </div>

            {/* --- Topic grid --- */}
            <div className="grid grid-cols-1 gap-2 max-h-[50vh] overflow-y-auto pr-2">
              {TOPICS.map((topic) => (
                <button
                  key={topic}
                  onClick={() => {
                    setSelectedTopic(topic);
                    setCustomTopic("");
                  }}
                  className={`topic-card text-left ${
                    selectedTopic === topic && !customTopic ? "selected" : ""
                  }`}
                >
                  {topic}
                </button>
              ))}
            </div>

            {/* --- Generate button --- */}
            <div className="mt-8">
              <button
                onClick={handleGenerate}
                disabled={state === "connecting" || state === "generating"}
                className="btn-generate w-full"
              >
                {state === "connecting" || state === "generating" ? (
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

              {/* --- Status & progress --- */}
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

              {/* --- Error --- */}
              {state === "error" && (
                <div className="mt-4 p-4 rounded-xl bg-red-950/30 border border-red-900/50">
                  <p className="text-red-400 text-sm">{errorMsg}</p>
                </div>
              )}
            </div>
          </div>

          {/* --- Right: Video Output --- */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "#666" }}>
              Output
            </h2>

            {videoUrl ? (
              <div>
                <div className="video-container mx-auto" style={{ maxWidth: videoFormat === "long" ? "640px" : "360px" }}>
                  <video src={videoUrl} controls playsInline />
                </div>

                {videoInfo && (
                  <div className="mt-4 p-4 rounded-xl bg-[#0a0a0a] border border-[#1a1a1a]">
                    <p className="text-sm text-[#888]">
                      {videoInfo.split("\n").map((line, i) => (
                        <span key={i}>
                          {i > 0 && <br />}
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
              <div
                className="video-container mx-auto flex flex-col items-center justify-center"
                style={{ maxWidth: videoFormat === "long" ? "640px" : "360px", minHeight: videoFormat === "long" ? "360px" : "400px" }}
              >
                {state === "connecting" || state === "generating" ? (
                  <div className="text-center px-8">
                    <div
                      className="w-16 h-16 rounded-full border-2 border-t-[#E8A817] border-r-[#E8A817] border-b-transparent border-l-transparent animate-spin mx-auto"
                    />
                    <p className="mt-6 text-sm" style={{ color: "#555" }}>
                      {statusText}
                    </p>
                    <p className="mt-2 text-xs" style={{ color: "#333" }}>
                      This usually takes 3-8 minutes
                    </p>
                  </div>
                ) : (
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

      {/* --- Footer --- */}
      <footer className="py-6 text-center border-t border-[#111]">
        <p className="text-xs" style={{ color: "#333" }}>
          LUMINOUS WILL &mdash; Powered by ElevenLabs, Pexels & Pixabay
        </p>
      </footer>
    </main>
  );
}
