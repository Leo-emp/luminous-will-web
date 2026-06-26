# Content Type Expansion — Design Spec

**Date:** 2026-06-26
**Status:** Approved
**Scope:** Both repos — `luminous-will-api` (Python pipeline) and `luminous-will-web` (Next.js dashboard)

## Overview

Expand Luminous Will from a single "dark motivation" content type to 4 distinct content types, each with unique topics, visual aesthetics, music moods, and accent colors. Videos are auto-generated on a schedule (2/day) with auto-rotation across types. No topic ever repeats.

## Content Types

### 1. Dark Motivation (`dark_motivation`)
- **Accent Color:** `#E8A817` (amber) — warm, intense, fire energy
- **Music Mood:** `intense` — aggressive, powerful, battle-ready
- **Visual Style Prefix:** `dark cinematic`
- **Visual Subjects:** lions, wolves, gym training, boxing, suited men, dark cityscapes, storms, fire
- **Visual Avoid:** ancient ruins, statues, money, luxury cars
- **Gemini Persona:** Ruthless motivational voice. Stoic, commanding, no-nonsense. Short punchy sentences. Dark, intense energy. Speaks in universal truths.
- **Caption Style:** Standard (current behavior)

### 2. Stoic Philosophy (`stoic_philosophy`)
- **Accent Color:** `#7B9EB8` (steel blue) — calm, ancient, marble/stone feel
- **Music Mood:** `reflective` — thoughtful, stoic, contemplative
- **Visual Style Prefix:** `ancient cinematic`
- **Visual Subjects:** marble statues, ancient ruins, mountain peaks, rain on stone, old books with candlelight, temple columns, ocean horizons, solitary trees
- **Visual Avoid:** gym, boxing, luxury cars, money, modern city
- **Gemini Persona:** A stoic philosopher speaking timeless truths from the ancient world. Measured, deliberate, wise. References Marcus Aurelius, Epictetus, Seneca naturally — not as quotes, but as woven wisdom.
- **Caption Style:** Standard

### 3. Success & Wealth Mindset (`wealth_mindset`)
- **Accent Color:** `#C9A84C` (rich gold) — luxury, premium, wealth signals
- **Music Mood:** `powerful` — triumphant, epic, commanding
- **Visual Style Prefix:** `luxury dark cinematic`
- **Visual Subjects:** luxury cars, skyline penthouses, suits, watches, private jets, boardrooms, skyscrapers at night, financial charts, dark office
- **Visual Avoid:** ancient ruins, statues, wolves, forest
- **Gemini Persona:** A cold, calculated wealth strategist who speaks from experience. No "grind" or "hustle" clichés. Talks about systems, leverage, compounding, and the psychology of money.
- **Caption Style:** Standard

### 4. Dark Psychology (`dark_psychology`)
- **Accent Color:** `#B83C3C` (deep crimson) — danger, power, psychological edge
- **Music Mood:** `dark` — brooding, noir, suspenseful
- **Visual Style Prefix:** `shadow noir cinematic`
- **Visual Subjects:** chess pieces, shadows, masks, puppet strings, dark corridors, smoke, mirrors, surveillance, silhouettes, rain-soaked streets
- **Visual Avoid:** gym, luxury cars, ancient ruins, nature
- **Gemini Persona:** A cold analyst of human darkness. Clinical, unsettling, precise. Breaks down manipulation tactics, body language tells, and power dynamics like a forensic psychologist.
- **Caption Style:** Standard

## Voice Settings

All 4 content types use the same ElevenLabs voice (Adam, `pNInz6obpgDQGcFmaJgB`) with identical settings:
- Stability: 0.62
- Similarity Boost: 0.80
- Style: 0.0
- Speaker Boost: enabled
- Speed: 0.83

Voice differentiation per type is deferred to a future iteration.

## Auto-Rotation Schedule

2 videos per day, rotating on a fixed 2-day cycle:

| Day | Video 1 | Video 2 |
|-----|---------|---------|
| Odd days (1, 3, 5...) | `dark_motivation` | `stoic_philosophy` |
| Even days (2, 4, 6...) | `wealth_mindset` | `dark_psychology` |

Determined by day-of-year modulo 2:
- `day_of_year % 2 == 1` → motivation + stoic
- `day_of_year % 2 == 0` → wealth + psychology

## Topic Management — Never Repeat

### Seed Topics
Each content type ships with 15-20 hardcoded seed topics in `content_types.py`.

### Used Topic Tracking
A `used_topics.json` file on Vercel Blob tracks every topic ever used, keyed by content type:
```json
{
  "dark_motivation": ["The psychology of silence and power", ...],
  "stoic_philosophy": ["Marcus Aurelius on controlling your emotions", ...],
  ...
}
```

### Infinite Topic Generation
When all seed topics for a content type are exhausted, the scheduler calls Gemini to generate new unique topics:
- Prompt includes the content type's persona and the full used topics list
- Gemini generates 10 new topics that avoid anything already used
- New topics are immediately added to the used list after generation

This guarantees no topic ever repeats across the lifetime of the channel.

## Architecture

### Source of Truth
All content type definitions live in the Python pipeline (`content_types.py`). The Next.js web app fetches type info from the Gradio API — no duplication.

### Data Flow
```
Daily Cron (Next.js, 6AM UTC)
  → Determines today's 2 content types (rotation logic)
  → Calls HF Spaces Gradio API twice (once per type)
  → Each call: scheduler picks unused topic, generates video
  → Video + metadata uploaded to Vercel Blob
  → Queue entry created with content_type field
  → If auto-approve enabled: status = "approved"
  → Existing 5-min post cron picks up approved entries
  → Auto-posts to YouTube, TikTok, Instagram, Facebook
```

## Python Pipeline Changes (`luminous-will-api`)

### New Files
| File | Purpose |
|------|---------|
| `content_types.py` | All 4 content type definitions: topics, visual subjects/avoid lists, Gemini personas, accent colors, music moods |
| `scheduler.py` | Rotation logic (which types today), topic tracker (used topics on Blob), Gemini topic generation |

### Modified Files
| File | Changes |
|------|---------|
| `config.py` | Replace `TRENDING_TOPICS` with import from `content_types.py`. Add content type to format profiles. |
| `script_generator.py` | `generate_script()` accepts content type config. Gemini prompt uses type-specific persona instead of hardcoded one. Hook templates become type-specific. |
| `visuals.py` | `BRAND_BONUS_WORDS` and `AVOID_KEYWORDS` become type-specific via content type config. `visual_subjects` injected as bonus search terms. |
| `music.py` | `select_music()` receives content type's `music_mood` directly instead of counting segment moods. |
| `captions.py` | Caption highlight color uses content type's `accent_color` instead of hardcoded `#E8A817`. |
| `app.py` | Gradio interface adds content type parameter. New `/get_content_types` endpoint returns type definitions to web app. |

### Unchanged Files
`voiceover.py`, `video_assembler.py`, `color_grading.py`, `brand_reference.py` — these are format-aware but content-type-agnostic.

## Next.js Web App Changes (`luminous-will-web`)

### New Files
| File | Purpose |
|------|---------|
| `lib/content-types.ts` | TypeScript types for content type data. Fetch + cache from Gradio API. |
| `app/api/cron/generate-videos/route.ts` | Daily cron: determines today's types, calls Gradio API, creates queue entries |

### Modified Files
| File | Changes |
|------|---------|
| `app/page.tsx` | Content type selector (4 cards with accent color borders) above format selector. Selecting a type filters topic list. Passes content type to Gradio API. |
| `app/dashboard/page.tsx` | Content type badge (colored pill) on queue entries. Filter by content type. |
| `lib/queue.ts` | `QueueEntry` gets `content_type` field |
| `lib/publisher.ts` | `buildPublishInput()` includes content type in captions metadata |
| `app/settings/page.tsx` | New "Auto-approve generated videos" toggle |
| `vercel.json` | Add daily cron: `0 6 * * *` for `/api/cron/generate-videos` |

## Auto-Approve Flow

A boolean setting stored in Vercel Blob (`settings/auto_approve.json`):
- **Off (default):** Generated videos land as `pending_review` — manual approval needed
- **On:** Generated videos land as `approved` — the existing 5-minute post cron picks them up automatically

Toggle lives on the Settings page alongside platform connections.

## Queue Entry Shape (Updated)

```typescript
interface QueueEntry {
  id: string;
  format: "short" | "long";
  content_type: string;          // NEW — "dark_motivation" | "stoic_philosophy" | etc.
  topic: string;
  status: "pending_review" | "approved" | "rejected" | "posting" | "posted" | "failed";
  created_at: string;
  video_url?: string;
  thumbnail_url?: string;
  captions?: Record<string, {...}>;
  script_text?: string;
  duration?: number;
  target_platforms?: string[];
  scheduled_post_time?: string | null;
  post_results?: Record<string, {...}>;
  error?: string | null;
  accent_color?: string;         // NEW — passed from content type for UI display
}
```

## Platform Caption Strategy

Each platform gets content-type-aware captions:

- **YouTube:** Title includes content type context (e.g., "Stoic Philosophy: Why Marcus Aurelius..."). Description includes type-relevant hashtags.
- **TikTok:** Caption uses type-relevant hashtags (#stoicphilosophy, #darkpsychology, etc.)
- **Instagram:** Caption styled for the type. Type-specific hashtag sets.
- **Facebook:** Description includes type context for the Facebook Page audience.

Caption generation happens in the Python pipeline's `script_generator.py` — the web app just passes them through.

## Cron Timeout Strategy

Vercel functions have a 300s (5 min) timeout. Video generation takes 3-8 minutes per video. The daily cron generates 2 videos.

**Solution:** The cron endpoint fires two independent Gradio API calls sequentially. Each call is a separate `client.predict()` invocation. If the first completes within ~4 minutes, the second starts. If a call times out, it fails independently — the Gradio pipeline on HF Spaces still completes the video (it runs server-side), but we won't receive the result in that cron cycle.

**Mitigation:** Add a "recovery" check to the cron: before generating, check if there are any videos on HF Spaces output that weren't yet added to the queue (comparing timestamps). This recovers from timeout scenarios.

**Alternative if timeouts are frequent:** Split into two separate cron jobs (6:00 AM and 6:10 AM) so each only generates one video.

## Error Handling

- If Gradio API is down during daily cron: log error, retry on next cron cycle (next day)
- If Gemini fails to generate new topics: fall back to a random topic from the full seed list (accepting a potential repeat in this edge case)
- If Vercel Blob fails to load/save used topics: generate video anyway, log warning — topic tracking recovers on next successful write
- If one video in the daily pair fails: the other still proceeds (independent calls)

## Deployment Order

1. Deploy Python pipeline changes to HF Spaces first (adds content type support + API endpoint)
2. Deploy Next.js web app changes to Vercel (content type UI + daily cron)
3. Set `CRON_SECRET` env var on Vercel for cron authentication
4. Enable auto-approve in Settings if desired
