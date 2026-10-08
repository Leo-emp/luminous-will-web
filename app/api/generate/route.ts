import { NextRequest, NextResponse } from "next/server";
import { Client } from "@gradio/client";

// # Server-side proxy for Gradio HF Space video generation
// # Avoids browser CORS issues with direct client-to-HF-Space calls

export const maxDuration = 300; // 5 min timeout for video generation

export async function POST(req: NextRequest) {
  const HF_SPACE_URL = process.env.NEXT_PUBLIC_HF_SPACE_URL;
  if (!HF_SPACE_URL) {
    return NextResponse.json(
      { error: "HF Space URL not configured" },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const { content_type_key, format_choice, dropdown_topic, custom } = body;

    // # Connect to HF Space from the server (no CORS restrictions)
    const client = await Client.connect(HF_SPACE_URL);

    // # Call the Gradio endpoint
    const result = await client.predict("/on_generate", {
      content_type_key: content_type_key || "dark_motivation",
      format_choice: format_choice || "Vertical Short (9:16)",
      dropdown_topic: dropdown_topic || "(Random)",
      custom: custom || "",
    });

    // # Parse result — Gradio returns [video_file, summary_string]
    const data = result.data as [{ url: string } | null, string];

    if (data && data[0]) {
      const videoData = data[0];
      const videoUrl =
        typeof videoData === "object" && videoData.url
          ? videoData.url
          : typeof videoData === "string"
          ? videoData
          : null;

      return NextResponse.json({
        videoUrl,
        info: typeof data[1] === "string" ? data[1] : "",
      });
    }

    return NextResponse.json({ error: "Empty response from server" }, { status: 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate] Error:", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
