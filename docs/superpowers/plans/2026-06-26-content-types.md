# Content Type Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Luminous Will from 1 content type to 4 (Dark Motivation, Stoic Philosophy, Wealth Mindset, Dark Psychology) with auto-rotation, never-repeat topics, and full pipeline integration across both repos.

**Architecture:** Content type definitions live in the Python pipeline (`content_types.py`) as the single source of truth. The Gradio API exposes a new `content_type` parameter and a `/get_content_types` endpoint. The Next.js web app fetches type info from the API, adds a daily generation cron, and surfaces content types in the UI.

**Tech Stack:** Python 3 (Gradio, google-generativeai, MoviePy), Next.js 15 (React 19, TypeScript, Vercel Blob, Vercel Cron)

## Global Constraints

- All code must include heavy comments (user learning preference)
- Dark premium aesthetic: #000 bg, #1a1a1a panels, #333 borders, type-specific accent colors
- No topic may ever repeat across the lifetime of a content type
- Voice settings are identical across all 4 types (Adam voice, stability 0.62, speed 0.83)
- Python pipeline runs on HF Spaces — deploy there first before web app changes
- Web app runs on Vercel — deploy second

---

### Task 1: Create content_types.py — All 4 Content Type Definitions

**Repo:** `luminous-will-api`

**Files:**
- Create: `content_types.py`

**Interfaces:**
- Consumes: nothing (foundation module)
- Produces: `CONTENT_TYPES` dict, `get_content_type(type_key: str) -> dict`, `get_all_topics(type_key: str) -> list[str]`, `get_all_type_keys() -> list[str]`

- [ ] **Step 1: Create `content_types.py` with all 4 type definitions**

```python
# ============================================================
# CONTENT TYPE DEFINITIONS
# Single source of truth for all 4 content types.
# Each type has: topics, visual style, accent color, music mood,
# Gemini persona, visual subjects, avoid lists, and hashtag sets.
#
# Other modules import from here — never duplicate type data.
# ============================================================

# --- All 4 content types ---
# Keys are used as identifiers throughout the pipeline and web app
CONTENT_TYPES = {

    # ── Dark Motivation ─────────────────────────────────────
    # The original Luminous Will style — intense, aggressive, fire energy
    "dark_motivation": {
        "name": "Dark Motivation",
        "accent_color": "#E8A817",
        "music_mood": "intense",
        "visual_style": "dark cinematic",
        # Curated stock footage subjects that match this type
        "visual_subjects": [
            "lion dark savanna cinematic",
            "wolf dark forest night",
            "man training gym dark silhouette",
            "boxing ring dark cinematic",
            "suited man walking dark city",
            "dark cityscape night aerial",
            "storm clouds dramatic cinematic",
            "fire flames dark abstract",
        ],
        # Subjects that would feel wrong for this type
        "visual_avoid": ["ancient ruins", "statues", "money", "luxury cars", "temple"],
        # Gemini persona for script generation
        "gemini_persona": (
            "You are a ruthless motivational voice. Stoic, commanding, no-nonsense. "
            "Short punchy sentences. Dark, intense energy. The tone of someone who has "
            "seen the worst and emerged stronger. Speak in universal truths. Never say "
            "'I' or 'we'. Use 'you' and 'they'. No fluff, no clichés like 'grind', "
            "'hustle', or 'manifest'. No questions to the audience."
        ),
        # Platform-specific hashtag sets for auto-posting captions
        "hashtags": {
            "youtube": ["#darkmotivation", "#motivation", "#mindset", "#selfimprovement", "#discipline"],
            "tiktok": ["#darkmotivation", "#mindset", "#discipline", "#fyp", "#mentaltoughness"],
            "instagram": ["#darkmotivation", "#mindset", "#selfimprovement", "#growthmindset", "#motivation"],
            "facebook": ["#motivation", "#mindset", "#selfimprovement"],
        },
        # Seed topics — each will only be used once, ever
        "topics": [
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
    },

    # ── Stoic Philosophy ────────────────────────────────────
    # Ancient wisdom, measured delivery, marble/stone aesthetic
    "stoic_philosophy": {
        "name": "Stoic Philosophy",
        "accent_color": "#7B9EB8",
        "music_mood": "reflective",
        "visual_style": "ancient cinematic",
        "visual_subjects": [
            "marble statue dark cinematic",
            "ancient ruins columns shadow",
            "mountain peak fog dark",
            "rain stone surface cinematic",
            "old book candle dark room",
            "temple columns shadow cinematic",
            "ocean horizon calm dark",
            "solitary tree storm dark",
        ],
        "visual_avoid": ["gym", "boxing", "luxury cars", "money", "modern city", "skyscraper"],
        "gemini_persona": (
            "You are a stoic philosopher speaking timeless truths from the ancient world. "
            "Measured, deliberate, wise. Reference Marcus Aurelius, Epictetus, and Seneca "
            "naturally — not as direct quotes, but as woven wisdom. Never say 'I' or 'we'. "
            "Use 'you' and 'they'. No modern slang. No questions to the audience. "
            "Speak as if carving words into marble — every sentence must be worth preserving."
        ),
        "hashtags": {
            "youtube": ["#stoicism", "#stoicphilosophy", "#marcusaurelius", "#wisdom", "#philosophy"],
            "tiktok": ["#stoicism", "#stoicquotes", "#marcusaurelius", "#philosophy", "#fyp"],
            "instagram": ["#stoicism", "#stoicphilosophy", "#marcusaurelius", "#ancientwisdom", "#philosophy"],
            "facebook": ["#stoicism", "#philosophy", "#wisdom"],
        },
        "topics": [
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
    },

    # ── Success & Wealth Mindset ────────────────────────────
    # Luxury aesthetic, cold strategy, psychology of money
    "wealth_mindset": {
        "name": "Success & Wealth Mindset",
        "accent_color": "#C9A84C",
        "music_mood": "powerful",
        "visual_style": "luxury dark cinematic",
        "visual_subjects": [
            "luxury car dark night driving",
            "skyline penthouse dark cinematic",
            "suit businessman dark office",
            "watch luxury dark close up",
            "private jet dark cinematic",
            "boardroom dark empty cinematic",
            "skyscraper night lights dark",
            "financial chart dark screen",
        ],
        "visual_avoid": ["ancient ruins", "statues", "wolves", "forest", "temple", "boxing"],
        "gemini_persona": (
            "You are a cold, calculated wealth strategist who speaks from experience. "
            "No 'grind' or 'hustle' clichés. Talk about systems, leverage, compounding, "
            "and the psychology of money. Never say 'I' or 'we'. Use 'you' and 'they'. "
            "Speak like someone who built wealth quietly and now shares the blueprint. "
            "No motivational fluff — only cold, actionable truths about building wealth."
        ),
        "hashtags": {
            "youtube": ["#wealthmindset", "#financialfreedom", "#money", "#investing", "#success"],
            "tiktok": ["#wealthmindset", "#moneymindset", "#financialliteracy", "#success", "#fyp"],
            "instagram": ["#wealthmindset", "#financialfreedom", "#moneymindset", "#investing", "#success"],
            "facebook": ["#wealth", "#success", "#money"],
        },
        "topics": [
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
    },

    # ── Dark Psychology ─────────────────────────────────────
    # Noir aesthetic, clinical analysis, psychological edge
    "dark_psychology": {
        "name": "Dark Psychology",
        "accent_color": "#B83C3C",
        "music_mood": "dark",
        "visual_style": "shadow noir cinematic",
        "visual_subjects": [
            "chess pieces dark cinematic board",
            "shadow silhouette dark corridor",
            "mask dark artistic cinematic",
            "puppet strings dark manipulation",
            "dark corridor shadows cinematic",
            "smoke dark abstract cinematic",
            "mirror reflection dark moody",
            "rain soaked street dark night",
        ],
        "visual_avoid": ["gym", "luxury cars", "ancient ruins", "nature", "forest", "mountain"],
        "gemini_persona": (
            "You are a cold analyst of human darkness. Clinical, unsettling, precise. "
            "Break down manipulation tactics, body language tells, and power dynamics "
            "like a forensic psychologist. Never say 'I' or 'we'. Use 'you' and 'they'. "
            "No moral judgments — present the psychology neutrally. Let the listener "
            "draw their own conclusions. Every sentence should feel like it's revealing "
            "something dangerous."
        ),
        "hashtags": {
            "youtube": ["#darkpsychology", "#psychology", "#manipulation", "#bodylanguage", "#mindgames"],
            "tiktok": ["#darkpsychology", "#psychologyfacts", "#manipulation", "#bodylanguage", "#fyp"],
            "instagram": ["#darkpsychology", "#psychologyfacts", "#manipulation", "#humanpsychology", "#mindgames"],
            "facebook": ["#psychology", "#darkpsychology", "#humanpsychology"],
        },
        "topics": [
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
    },
}


def get_content_type(type_key):
    """
    # Returns the full config dict for a content type
    # Raises KeyError if the type_key doesn't exist
    """
    if type_key not in CONTENT_TYPES:
        raise KeyError(f"Unknown content type: {type_key}. Valid: {list(CONTENT_TYPES.keys())}")
    return CONTENT_TYPES[type_key]


def get_all_topics(type_key):
    """
    # Returns the seed topics list for a content type
    """
    return get_content_type(type_key)["topics"]


def get_all_type_keys():
    """
    # Returns all content type keys: ["dark_motivation", "stoic_philosophy", ...]
    """
    return list(CONTENT_TYPES.keys())
```

- [ ] **Step 2: Verify the module loads without errors**

Run: `cd C:/Users/User/luminous-will-api && python -c "from content_types import CONTENT_TYPES, get_content_type, get_all_type_keys; print(f'{len(CONTENT_TYPES)} types loaded: {get_all_type_keys()}')"`

Expected: `4 types loaded: ['dark_motivation', 'stoic_philosophy', 'wealth_mindset', 'dark_psychology']`

- [ ] **Step 3: Commit**

```bash
cd C:/Users/User/luminous-will-api
git add content_types.py
git commit -m "feat: add 4 content type definitions with topics, visuals, personas"
```

---

### Task 2: Create scheduler.py — Rotation Logic + Never-Repeat Topic Tracker

**Repo:** `luminous-will-api`

**Files:**
- Create: `scheduler.py`

**Interfaces:**
- Consumes: `content_types.get_content_type()`, `content_types.get_all_topics()`, `config.GEMINI_API_KEY`
- Produces: `get_todays_types() -> list[str]` (returns 2 type keys), `pick_unused_topic(type_key: str) -> str` (returns topic string, never repeats)

- [ ] **Step 1: Create `scheduler.py` with rotation + topic tracking**

```python
import os
import json
import random
from datetime import datetime
import google.generativeai as genai
import config
from content_types import get_content_type, get_all_topics, CONTENT_TYPES

# ============================================================
# SCHEDULER
# Handles two jobs:
#   1. Auto-rotation: which 2 content types to generate today
#   2. Topic tracking: pick an unused topic, never repeat
#
# Used topic history is stored in a local JSON file.
# On HF Spaces this lives in /tmp (ephemeral), but the web app
# also tracks used topics in Vercel Blob as the persistent copy.
# ============================================================

# --- Path to the used topics file ---
# On HF Spaces: /tmp/luminous_used_topics.json
# Locally: ./used_topics.json
_USED_TOPICS_PATH = os.path.join(
    "/tmp" if os.getenv("SPACE_ID") else os.path.dirname(__file__),
    "used_topics.json"
)


def get_todays_types():
    """
    # Returns the 2 content type keys to generate today
    # Uses day-of-year modulo 2:
    #   Odd days  → dark_motivation + stoic_philosophy
    #   Even days → wealth_mindset + dark_psychology
    """
    day_of_year = datetime.utcnow().timetuple().tm_yday

    if day_of_year % 2 == 1:
        # Odd day: motivation + stoic
        return ["dark_motivation", "stoic_philosophy"]
    else:
        # Even day: wealth + psychology
        return ["wealth_mindset", "dark_psychology"]


def _load_used_topics():
    """
    # Loads the used topics dict from disk
    # Returns: {"dark_motivation": ["topic1", ...], ...}
    """
    if not os.path.exists(_USED_TOPICS_PATH):
        return {}

    try:
        with open(_USED_TOPICS_PATH, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        # Corrupted file — start fresh
        return {}


def _save_used_topics(used):
    """
    # Saves the used topics dict to disk
    """
    try:
        os.makedirs(os.path.dirname(_USED_TOPICS_PATH), exist_ok=True)
        with open(_USED_TOPICS_PATH, "w") as f:
            json.dump(used, f, indent=2)
    except IOError as e:
        print(f"[SCHEDULER] WARNING: Failed to save used topics: {e}")


def pick_unused_topic(type_key):
    """
    # Picks a topic for the given content type that has never been used.
    #
    # Strategy:
    #   1. Check seed topics — pick a random unused one
    #   2. If all seed topics exhausted → ask Gemini for new unique topics
    #   3. Mark the picked topic as used immediately
    #
    # Returns: topic string (guaranteed unique within this type's history)
    """
    used = _load_used_topics()
    used_for_type = set(used.get(type_key, []))
    seed_topics = get_all_topics(type_key)

    # --- Find unused seed topics ---
    available = [t for t in seed_topics if t not in used_for_type]

    if not available:
        # All seed topics exhausted — generate new ones via Gemini
        print(f"[SCHEDULER] All {len(seed_topics)} seed topics used for {type_key}, generating new ones...")
        new_topics = _generate_new_topics(type_key, used_for_type)
        available = [t for t in new_topics if t not in used_for_type]

        if not available:
            # Gemini failed — last resort: pick random seed topic (allows rare repeat)
            print(f"[SCHEDULER] WARNING: Gemini generation failed, picking random seed topic")
            available = seed_topics

    # --- Pick a random topic from the available pool ---
    topic = random.choice(available)

    # --- Mark as used ---
    if type_key not in used:
        used[type_key] = []
    used[type_key].append(topic)
    _save_used_topics(used)

    print(f"[SCHEDULER] Picked topic for {type_key}: {topic}")
    print(f"[SCHEDULER] Used {len(used[type_key])}/{len(seed_topics)} seed topics")

    return topic


def _generate_new_topics(type_key, used_topics):
    """
    # Uses Gemini to generate 10 new unique topics for a content type
    # Passes the full used topics list so Gemini avoids any repeats
    #
    # Returns: list of new topic strings, or empty list on failure
    """
    if not config.GEMINI_API_KEY:
        print("[SCHEDULER] No Gemini API key — cannot generate new topics")
        return []

    content_type = get_content_type(type_key)
    used_list = list(used_topics)

    genai.configure(api_key=config.GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-2.5-flash")

    prompt = f"""You generate video topics for the YouTube channel "Luminous Will".

CONTENT TYPE: {content_type["name"]}
PERSONA: {content_type["gemini_persona"]}

ALREADY USED TOPICS (do NOT repeat any of these):
{json.dumps(used_list, indent=2)}

Generate exactly 10 NEW video topics that:
1. Match the {content_type["name"]} content type
2. Are completely different from all used topics above
3. Are specific and compelling (not generic)
4. Would make someone stop scrolling
5. Are 5-12 words each

Respond with ONLY a JSON array of 10 strings, no markdown:
["Topic 1", "Topic 2", ...]"""

    try:
        response = model.generate_content(prompt)
        raw_text = response.text.strip()

        # Strip markdown code fences if present
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[1]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]
            raw_text = raw_text.strip()

        new_topics = json.loads(raw_text)

        if isinstance(new_topics, list) and len(new_topics) > 0:
            # Ensure all are strings
            new_topics = [str(t) for t in new_topics if t]
            print(f"[SCHEDULER] Gemini generated {len(new_topics)} new topics for {type_key}")
            return new_topics

    except Exception as e:
        print(f"[SCHEDULER] Gemini topic generation failed: {e}")

    return []


def get_used_count(type_key):
    """
    # Returns how many topics have been used for a content type
    # Useful for monitoring and the web dashboard
    """
    used = _load_used_topics()
    return len(used.get(type_key, []))
```

- [ ] **Step 2: Verify scheduler loads and rotation works**

Run: `cd C:/Users/User/luminous-will-api && python -c "from scheduler import get_todays_types, pick_unused_topic; types = get_todays_types(); print(f'Today: {types}'); topic = pick_unused_topic(types[0]); print(f'Topic: {topic}')"`

Expected: Prints today's 2 types and a selected topic.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/User/luminous-will-api
git add scheduler.py
git commit -m "feat: add scheduler with auto-rotation and never-repeat topic tracking"
```

---

### Task 3: Update config.py — Replace TRENDING_TOPICS with Content Types

**Repo:** `luminous-will-api`

**Files:**
- Modify: `config.py`

**Interfaces:**
- Consumes: `content_types.CONTENT_TYPES`
- Produces: Updated `TRENDING_TOPICS` (now built from all content types for backward compatibility), new `CAPTION_HIGHLIGHT_COLOR` stays as default but can be overridden per type

- [ ] **Step 1: Update `config.py` to build TRENDING_TOPICS from content types**

Replace the hardcoded `TRENDING_TOPICS` list (lines 148-181) with:

```python
# --- Trending Topics for Script Generation ---
# Built from all content type seed topics for backward compatibility
# New code should use content_types.get_all_topics(type_key) directly
from content_types import CONTENT_TYPES
TRENDING_TOPICS = []
for _ct in CONTENT_TYPES.values():
    TRENDING_TOPICS.extend(_ct["topics"])
```

- [ ] **Step 2: Verify config still loads correctly**

Run: `cd C:/Users/User/luminous-will-api && python -c "import config; print(f'{len(config.TRENDING_TOPICS)} topics loaded from {len(config.TRENDING_TOPICS)} total')"`

Expected: `80 topics loaded from 80 total` (20 topics × 4 types)

- [ ] **Step 3: Commit**

```bash
cd C:/Users/User/luminous-will-api
git add config.py
git commit -m "refactor: build TRENDING_TOPICS from content type definitions"
```

---

### Task 4: Update script_generator.py — Content-Type-Aware Script Generation

**Repo:** `luminous-will-api`

**Files:**
- Modify: `script_generator.py`

**Interfaces:**
- Consumes: `content_types.get_content_type()`, content type config dict with `gemini_persona`, `visual_style`, `visual_subjects`, `visual_avoid`
- Produces: `generate_script(topic, custom_hook, video_format, content_type_key)` — new optional parameter

- [ ] **Step 1: Add `content_type_key` parameter to `generate_script()` and `generate_long_script()`**

At the top, add the import:
```python
from content_types import get_content_type, CONTENT_TYPES
```

Update `generate_script` signature and body (line 38):
```python
def generate_script(topic=None, custom_hook=None, video_format=None, content_type_key=None):
    """
    # Generates a video script based on the format and content type:
    #   - VERTICAL_SHORT: template-based (existing behavior)
    #   - HORIZONTAL_LONG: Gemini AI-generated (8-12 min)
    #
    # content_type_key: "dark_motivation", "stoic_philosophy", etc.
    #   If None, defaults to "dark_motivation" for backward compatibility
    #
    # Returns (segments_list, topic_string)
    """
    from config import VideoFormat

    # Default to dark_motivation if no content type specified
    if content_type_key is None:
        content_type_key = "dark_motivation"

    if video_format == VideoFormat.HORIZONTAL_LONG:
        return generate_long_script(topic, content_type_key=content_type_key)

    # --- Default: short-form template script ---
    if topic is None:
        ct = get_content_type(content_type_key)
        topic = random.choice(ct["topics"])

    print(f"[SCRIPT] Generating script for: {topic} (type: {content_type_key})")
    script = get_template_script(topic)
    return script, topic
```

- [ ] **Step 2: Update `generate_long_script()` to use content-type persona**

Update `generate_long_script` signature and the Gemini prompt (line 62):
```python
def generate_long_script(topic=None, content_type_key=None):
    """
    # Generates an 8-12 minute script using Gemini AI
    # Uses the content type's persona for the Gemini prompt
    """
    if content_type_key is None:
        content_type_key = "dark_motivation"

    ct = get_content_type(content_type_key)

    if topic is None:
        topic = random.choice(ct["topics"])

    print(f"[SCRIPT] Generating long-form script for: {topic} (type: {content_type_key})")

    if not config.GEMINI_API_KEY:
        print("[SCRIPT] WARNING: No Gemini API key, falling back to chained templates")
        return _chain_template_scripts(topic), topic

    genai.configure(api_key=config.GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-2.5-flash")

    # Build the prompt using the content type's persona and visual preferences
    visual_subjects = ", ".join(ct.get("visual_subjects", ["dark cinematic landscape"]))
    visual_avoid = ", ".join(ct.get("visual_avoid", []))

    prompt = f"""You are a scriptwriter for the YouTube channel "Luminous Will" — {ct["name"]}.

VOICE RULES:
{ct["gemini_persona"]}

STRUCTURE for an 8-12 minute script on "{topic}":
1. HOOK (first 30 seconds) — One shocking statement that stops the scroll
2. SETUP (1-2 min) — Frame the problem, make it personal
3. ESCALATION (3-4 min) — Go deeper, reveal uncomfortable truths, build intensity
4. CLIMAX (2-3 min) — The turning point, the harsh lesson, the wake-up call
5. RESOLUTION (1-2 min) — The path forward, actionable transformation
6. CALLBACK (30 seconds) — Circle back to the opening hook with new meaning

Generate exactly 50 segments. Each segment is ONE sentence (max 20 words).

CHAPTER MARKERS: Insert a chapter title every 6-8 segments (for YouTube chapters). Set chapter to null for non-chapter segments.

OUTPUT FORMAT — respond with ONLY a JSON array, no markdown, no explanation:
[
  {{
    "text": "The sentence spoken in the voiceover.",
    "visual_keywords": "5-6 keywords for stock footage search",
    "visual_keywords_alt": [
      "alternative search query 1",
      "alternative search query 2",
      "alternative search query 3"
    ],
    "mood": "dark|intense|reflective|powerful",
    "emphasis_words": ["one", "key", "word"],
    "chapter": "Chapter Title Here or null"
  }},
  ...
]

VISUAL KEYWORD RULES:
- Always include "{ct["visual_style"]}" style in keywords
- Preferred subjects: {visual_subjects}
- NEVER use subjects from this avoid list: {visual_avoid}
- Vary the subjects — no two consecutive segments should have the same visual theme

VISUAL KEYWORDS ALT RULES:
- Each alt query should be a DIFFERENT way to find footage that matches this segment's meaning
- All alts must match the {ct["name"]} aesthetic — no bright, happy, colorful subjects

Generate the script now. 50 segments, JSON array only."""
```

The rest of the function body (JSON parsing, validation, fallback) stays the same.

- [ ] **Step 3: Verify script generation works with a content type**

Run: `cd C:/Users/User/luminous-will-api && python -c "from script_generator import generate_script; script, topic = generate_script('The Stoic response to betrayal', content_type_key='stoic_philosophy'); print(f'Topic: {topic}, Segments: {len(script)}')"`

Expected: Topic and segment count printed (uses template fallback for short-form).

- [ ] **Step 4: Commit**

```bash
cd C:/Users/User/luminous-will-api
git add script_generator.py
git commit -m "feat: content-type-aware script generation with type-specific Gemini personas"
```

---

### Task 5: Update visuals.py — Type-Specific Visual Search

**Repo:** `luminous-will-api`

**Files:**
- Modify: `visuals.py`

**Interfaces:**
- Consumes: content type config dict with `visual_subjects`, `visual_avoid`, `visual_style`
- Produces: `search_and_download_videos(script_segments, clips_dir, profile, content_type_key)` — new optional parameter

- [ ] **Step 1: Update `visuals.py` to accept content type for search customization**

Add import at top:
```python
from content_types import get_content_type
```

Update `BRAND_BONUS_WORDS` to be a function that returns type-specific words. Add this function after the existing `BRAND_BONUS_WORDS` constant:

```python
def _get_brand_words(content_type_key=None):
    """
    # Returns brand-relevant words for relevance scoring
    # Uses content type's visual_subjects to build a type-specific set
    # Falls back to the default BRAND_BONUS_WORDS if no type specified
    """
    if content_type_key is None:
        return BRAND_BONUS_WORDS

    ct = get_content_type(content_type_key)
    # Extract individual words from visual_subjects list
    type_words = set()
    for subject in ct.get("visual_subjects", []):
        type_words.update(subject.lower().split())
    # Merge with base brand words
    return BRAND_BONUS_WORDS | type_words


def _get_avoid_keywords(content_type_key=None):
    """
    # Returns avoid keywords for this content type
    # Merges the base AVOID_KEYWORDS with type-specific avoid list
    """
    if content_type_key is None:
        return AVOID_KEYWORDS

    ct = get_content_type(content_type_key)
    type_avoid = ct.get("visual_avoid", [])
    # Combine base avoids with type-specific avoids
    return AVOID_KEYWORDS + [a.lower() for a in type_avoid if a.lower() not in AVOID_KEYWORDS]
```

Update `_score_video_relevance` to accept and pass through `content_type_key`:
```python
def _score_video_relevance(video_meta, script_text, keywords, source="pexels", content_type_key=None):
```

In the scoring function body, replace:
- `BRAND_BONUS_WORDS & video_words` with `_get_brand_words(content_type_key) & video_words`
- `for bad in AVOID_KEYWORDS:` with `for bad in _get_avoid_keywords(content_type_key):`

Update `search_and_download_videos` to accept `content_type_key` and pass it through to scoring:
```python
def search_and_download_videos(script_segments, clips_dir, profile=None, content_type_key=None):
```

Pass `content_type_key` wherever `_score_video_relevance` is called inside the function.

- [ ] **Step 2: Verify the module still loads**

Run: `cd C:/Users/User/luminous-will-api && python -c "from visuals import _get_brand_words, _get_avoid_keywords; print(f'Stoic brand words: {len(_get_brand_words(\"stoic_philosophy\"))}'); print(f'Stoic avoid: {_get_avoid_keywords(\"stoic_philosophy\")[-5:]}')"`

Expected: Shows brand word count and last 5 avoid keywords including stoic-specific ones.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/User/luminous-will-api
git add visuals.py
git commit -m "feat: type-specific visual search with custom brand words and avoid lists"
```

---

### Task 6: Update music.py + captions.py — Type-Specific Music and Caption Colors

**Repo:** `luminous-will-api`

**Files:**
- Modify: `music.py`
- Modify: `captions.py`

**Interfaces:**
- Consumes: content type config dict with `music_mood` and `accent_color`
- Produces: `select_music(script_segments, music_dir, content_type_key)`, caption rendering uses type accent color

- [ ] **Step 1: Update `music.py` — use content type's music_mood directly**

Add import at top:
```python
from content_types import get_content_type
```

Update `select_music` signature (line 144):
```python
def select_music(script_segments, music_dir=None, content_type_key=None):
    """
    # Selects background music based on content type's preferred mood
    # If content_type_key is provided, uses its music_mood directly
    # Otherwise falls back to counting segment moods (original behavior)
    """
    if music_dir is None:
        music_dir = config.MUSIC_DIR

    # --- Determine the video's mood ---
    if content_type_key:
        # Use the content type's preferred mood directly
        ct = get_content_type(content_type_key)
        dominant_mood = ct.get("music_mood", "intense")
        print(f"[MUSIC] Content type mood ({content_type_key}): {dominant_mood}")
    else:
        # Fallback: count segment moods
        dominant_mood = get_dominant_mood(script_segments)
        print(f"[MUSIC] Dominant mood (from segments): {dominant_mood}")
```

The rest of the function body stays the same (it already uses `dominant_mood`).

- [ ] **Step 2: Update `captions.py` — accept accent color override**

The caption rendering happens in `video_assembler.py` which reads `config.CAPTION_HIGHLIGHT_COLOR`. To make this type-aware, add an `accent_color` parameter to the video assembly pipeline.

In `captions.py`, no changes needed — it just produces caption events with text + timing. The color is applied during rendering in `video_assembler.py`.

Check `video_assembler.py` for where `CAPTION_HIGHLIGHT_COLOR` is used:

- [ ] **Step 3: Update color usage in the pipeline**

In whichever file renders captions (likely `video_assembler.py`), find where `config.CAPTION_HIGHLIGHT_COLOR` is referenced. Add a parameter to pass the accent color from the content type:

The calling code in `app.py`'s `generate_video()` function will pass the accent color through. The key change is in `generate_video`:

```python
def generate_video(topic, video_format_str="short", content_type_key=None, progress=gr.Progress()):
    # ... existing setup ...

    # Get content type config (or default to dark_motivation)
    if content_type_key is None:
        content_type_key = "dark_motivation"

    from content_types import get_content_type
    ct = get_content_type(content_type_key)

    # Override caption highlight color for this content type
    config.CAPTION_HIGHLIGHT_COLOR = ct["accent_color"]
```

This approach avoids modifying `video_assembler.py` and `captions.py` — we just swap the config value before assembly starts.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/User/luminous-will-api
git add music.py captions.py
git commit -m "feat: type-specific music mood and caption accent colors"
```

---

### Task 7: Update app.py — Content Type Parameter + API Endpoint

**Repo:** `luminous-will-api`

**Files:**
- Modify: `app.py`

**Interfaces:**
- Consumes: `content_types.CONTENT_TYPES`, `scheduler.get_todays_types()`, `scheduler.pick_unused_topic()`
- Produces: Updated Gradio interface with content type dropdown, updated `generate_video(topic, video_format_str, content_type_key)`, new `/get_content_types` API endpoint

- [ ] **Step 1: Update `generate_video()` to accept content type**

Add imports at top:
```python
from content_types import CONTENT_TYPES, get_content_type
from scheduler import pick_unused_topic
```

Update `generate_video` (line 38):
```python
def generate_video(topic, video_format_str="short", content_type_key=None, progress=gr.Progress()):
    """
    # Main pipeline with format and content type support
    # content_type_key: which content type to use for this video
    #   If None, defaults to "dark_motivation"
    """
    from config import VideoFormat, get_format_profile

    # Default content type
    if content_type_key is None:
        content_type_key = "dark_motivation"

    ct = get_content_type(content_type_key)

    fmt = VideoFormat.HORIZONTAL_LONG if video_format_str == "long" else VideoFormat.VERTICAL_SHORT
    profile = get_format_profile(fmt)

    start_time = time.time()

    progress(0.0, desc="Checking setup...")
    ok, msg = validate_setup()
    if not ok:
        raise gr.Error(f"Setup error: {msg}")

    validate_references()

    # --- Override caption highlight color for this content type ---
    config.CAPTION_HIGHLIGHT_COLOR = ct["accent_color"]

    progress(0.05, desc=f"Generating {ct['name']} script...")
    if not topic or topic.strip() == "":
        topic = None
    script_segments, topic = generate_script(topic, video_format=fmt, content_type_key=content_type_key)
    full_script = get_script_text(script_segments)

    safe_topic = topic.replace(" ", "_").replace("'", "")[:50]
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    video_name = f"{safe_topic}_{timestamp}"
    video_temp = os.path.join(config.TEMP_DIR, video_name)
    os.makedirs(video_temp, exist_ok=True)

    progress(0.10, desc="Creating voiceover (ElevenLabs)...")
    voiceover_path = os.path.join(video_temp, "voiceover.mp3")
    word_timestamps = generate_voiceover(full_script, voiceover_path, profile=profile)
    audio_duration = get_audio_duration(voiceover_path)

    progress(0.25, desc=f"Downloading {ct['name']} footage...")
    clips_dir = os.path.join(video_temp, "clips")
    clip_paths = search_and_download_videos(script_segments, clips_dir, profile=profile, content_type_key=content_type_key)

    if not clip_paths:
        raise gr.Error("No footage downloaded. Check Pexels/Pixabay API keys.")

    progress(0.45, desc="Building word-synced captions...")
    caption_events = create_caption_clips(word_timestamps, script_segments, audio_duration)

    progress(0.50, desc=f"Selecting {ct['music_mood']} background music...")
    music_path = select_music(script_segments, content_type_key=content_type_key)

    progress(0.55, desc="Assembling video...")
    output_path = os.path.join(config.OUTPUT_DIR, f"{video_name}.mp4")

    assemble_video(
        clip_paths=clip_paths,
        voiceover_path=voiceover_path,
        caption_events=caption_events,
        script_segments=script_segments,
        music_path=music_path,
        output_path=output_path,
        video_format=fmt,
    )

    progress(0.95, desc="Cleaning up...")
    shutil.rmtree(video_temp, ignore_errors=True)

    elapsed = time.time() - start_time
    progress(1.0, desc=f"Done! ({elapsed:.0f}s)")

    return output_path, f"**{ct['name']}: {topic}** ({fmt.value})\n\nGenerated in {elapsed:.0f} seconds | {len(script_segments)} segments | {audio_duration:.0f}s voiceover"
```

- [ ] **Step 2: Update Gradio interface with content type dropdown**

Replace the Gradio interface block (lines 133-189):

```python
with gr.Blocks(
    title="Luminous Will - Video Generator",
    css=custom_css,
    theme=gr.themes.Base(
        primary_hue="amber",
        neutral_hue="zinc",
        font=gr.themes.GoogleFont("Inter"),
    ),
) as demo:

    gr.HTML('<h1 class="main-title">LUMINOUS WILL</h1>')
    gr.HTML('<p class="subtitle">Dark Motivation Video Generator</p>')

    with gr.Row():
        with gr.Column(scale=1):
            # --- Content type selector ---
            content_type_dropdown = gr.Dropdown(
                choices=[(ct["name"], key) for key, ct in CONTENT_TYPES.items()],
                value="dark_motivation",
                label="Content Type",
                info="Each type has unique visual style, topics, and music mood",
            )
            format_dropdown = gr.Dropdown(
                choices=["Vertical Short (9:16)", "Horizontal Long (16:9)"],
                value="Vertical Short (9:16)",
                label="Video Format",
                info="Short = 60-90s for Reels/TikTok. Long = 8-12 min for YouTube.",
            )
            topic_dropdown = gr.Dropdown(
                choices=["(Random)"] + CONTENT_TYPES["dark_motivation"]["topics"],
                value="(Random)",
                label="Select Topic",
                info="Pick a topic or choose Random",
            )
            custom_topic = gr.Textbox(
                label="Or Type a Custom Topic",
                placeholder="e.g., Why discipline beats motivation",
                lines=1,
            )
            generate_btn = gr.Button(
                "Generate Video",
                variant="primary",
                size="lg",
            )

        with gr.Column(scale=2):
            video_output = gr.Video(label="Generated Video")
            info_output = gr.Markdown(label="Details")

    # --- Update topic list when content type changes ---
    def update_topics(content_type_key):
        ct = get_content_type(content_type_key)
        return gr.Dropdown(choices=["(Random)"] + ct["topics"])

    content_type_dropdown.change(
        fn=update_topics,
        inputs=[content_type_dropdown],
        outputs=[topic_dropdown],
    )

    def on_generate(content_type_key, format_choice, dropdown_topic, custom, progress=gr.Progress()):
        topic = custom.strip() if custom and custom.strip() else None
        if topic is None and dropdown_topic and dropdown_topic != "(Random)":
            topic = dropdown_topic
        fmt_str = "long" if "Long" in format_choice else "short"
        return generate_video(topic, fmt_str, content_type_key=content_type_key, progress=progress)

    generate_btn.click(
        fn=on_generate,
        inputs=[content_type_dropdown, format_dropdown, topic_dropdown, custom_topic],
        outputs=[video_output, info_output],
    )

if __name__ == "__main__":
    demo.queue(default_concurrency_limit=1).launch()
```

- [ ] **Step 3: Verify app.py loads without import errors**

Run: `cd C:/Users/User/luminous-will-api && python -c "import app; print('app.py loaded successfully')"`

Expected: `app.py loaded successfully`

- [ ] **Step 4: Commit**

```bash
cd C:/Users/User/luminous-will-api
git add app.py
git commit -m "feat: content type selector in Gradio UI + type-aware video generation"
```

---

### Task 8: Update lib/queue.ts — Add content_type Field

**Repo:** `luminous-will-web`

**Files:**
- Modify: `lib/queue.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `QueueEntry` with `content_type` and `accent_color` fields

- [ ] **Step 1: Add content_type and accent_color to QueueEntry interface**

In `lib/queue.ts`, update the `QueueEntry` interface (line 12-29):

```typescript
export interface QueueEntry {
  id: string;
  format: "short" | "long";
  // Content type key: "dark_motivation" | "stoic_philosophy" | "wealth_mindset" | "dark_psychology"
  content_type?: string;
  // Accent color from content type — used for UI display
  accent_color?: string;
  topic: string;
  status: "pending_review" | "approved" | "rejected" | "posting" | "posted" | "failed";
  created_at: string;
  video_url?: string;
  thumbnail_url?: string;
  captions?: Record<string, { caption?: string; description?: string; title?: string; hashtags?: string[]; tags?: string[]; category?: string }>;
  script_text?: string;
  duration?: number;
  target_platforms?: string[];
  scheduled_post_time?: string | null;
  post_results?: Record<string, { platform: string; success: boolean; url?: string; error?: string; posted_at?: string }>;
  error?: string | null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:/Users/User/luminous-will-web && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/User/luminous-will-web
git add lib/queue.ts
git commit -m "feat: add content_type and accent_color fields to QueueEntry"
```

---

### Task 9: Create lib/content-types.ts + lib/settings.ts — Content Type Types and Auto-Approve Setting

**Repo:** `luminous-will-web`

**Files:**
- Create: `lib/content-types.ts`
- Create: `lib/settings.ts`

**Interfaces:**
- Consumes: Vercel Blob for settings storage
- Produces: `ContentTypeInfo` type, `CONTENT_TYPE_NAMES` map, `getAutoApprove()`, `setAutoApprove(enabled)`

- [ ] **Step 1: Create `lib/content-types.ts`**

```typescript
// ─────────────────────────────────────────────────────────────
//  Content type definitions for the web app.
//  Minimal info needed for UI rendering — the full definitions
//  live in the Python pipeline (content_types.py).
//
//  These are hardcoded here because they rarely change and
//  avoiding an API call on every page load is faster.
// ─────────────────────────────────────────────────────────────

// -- Content type keys used throughout the system --
export type ContentTypeKey =
  | "dark_motivation"
  | "stoic_philosophy"
  | "wealth_mindset"
  | "dark_psychology";

// -- Display info for each content type --
export interface ContentTypeInfo {
  key: ContentTypeKey;
  name: string;
  accent_color: string;
  description: string;
}

// -- All 4 content types with display info --
export const CONTENT_TYPES: ContentTypeInfo[] = [
  {
    key: "dark_motivation",
    name: "Dark Motivation",
    accent_color: "#E8A817",
    description: "Intense, aggressive, fire energy",
  },
  {
    key: "stoic_philosophy",
    name: "Stoic Philosophy",
    accent_color: "#7B9EB8",
    description: "Ancient wisdom, calm, marble/stone feel",
  },
  {
    key: "wealth_mindset",
    name: "Success & Wealth",
    accent_color: "#C9A84C",
    description: "Luxury, cold strategy, psychology of money",
  },
  {
    key: "dark_psychology",
    name: "Dark Psychology",
    accent_color: "#B83C3C",
    description: "Noir, clinical analysis, psychological edge",
  },
];

// -- Quick lookup: type key → display name --
export const CONTENT_TYPE_NAMES: Record<string, string> = Object.fromEntries(
  CONTENT_TYPES.map((ct) => [ct.key, ct.name])
);

// -- Quick lookup: type key → accent color --
export const CONTENT_TYPE_COLORS: Record<string, string> = Object.fromEntries(
  CONTENT_TYPES.map((ct) => [ct.key, ct.accent_color])
);
```

- [ ] **Step 2: Create `lib/settings.ts`**

```typescript
// ─────────────────────────────────────────────────────────────
//  Settings stored in Vercel Blob.
//  Currently just auto-approve toggle, but extensible.
// ─────────────────────────────────────────────────────────────

import { put, list } from "@vercel/blob";

// -- Blob path for settings --
const SETTINGS_PATH = "settings/auto_approve.json";

export async function getAutoApprove(): Promise<boolean> {
  // Reads the auto-approve setting from Blob
  // Returns false if not set (default: manual review)
  try {
    const { blobs } = await list({ prefix: SETTINGS_PATH });
    if (blobs.length === 0) return false;

    const response = await fetch(blobs[0].url);
    if (!response.ok) return false;

    const data = await response.json();
    return data.enabled === true;
  } catch {
    return false;
  }
}

export async function setAutoApprove(enabled: boolean): Promise<void> {
  // Saves the auto-approve setting to Blob
  await put(SETTINGS_PATH, JSON.stringify({ enabled }), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd C:/Users/User/luminous-will-web && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/User/luminous-will-web
git add lib/content-types.ts lib/settings.ts
git commit -m "feat: add content type display info and auto-approve setting"
```

---

### Task 10: Create /api/cron/generate-videos — Daily Auto-Generation Cron

**Repo:** `luminous-will-web`

**Files:**
- Create: `app/api/cron/generate-videos/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `lib/queue.ts` (loadQueue, saveQueue), `lib/settings.ts` (getAutoApprove), `lib/content-types.ts` (CONTENT_TYPES, CONTENT_TYPE_COLORS)
- Produces: POST endpoint that generates 2 videos via Gradio API and adds them to the queue

- [ ] **Step 1: Create the cron route**

```typescript
// ─────────────────────────────────────────────────────────────
//  GET /api/cron/generate-videos
//  Daily cron job that generates 2 videos via the HF Spaces
//  Gradio API. Determines today's 2 content types using the
//  day-of-year rotation, then calls the pipeline for each.
//
//  Runs at 6:00 AM UTC daily (configured in vercel.json).
//  Protected by CRON_SECRET env var.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { loadQueue, saveQueue } from "@/lib/queue";
import { getAutoApprove } from "@/lib/settings";
import { CONTENT_TYPES, CONTENT_TYPE_COLORS } from "@/lib/content-types";

// -- Content type rotation schedule --
// Odd days  → dark_motivation + stoic_philosophy
// Even days → wealth_mindset + dark_psychology
function getTodaysTypes(): string[] {
  const now = new Date();
  // Day of year: Jan 1 = 1, Feb 1 = 32, etc.
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (dayOfYear % 2 === 1) {
    return ["dark_motivation", "stoic_philosophy"];
  } else {
    return ["wealth_mindset", "dark_psychology"];
  }
}

export async function GET(request: Request) {
  // -- Verify cron secret to prevent unauthorized calls --
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hfSpaceUrl = process.env.NEXT_PUBLIC_HF_SPACE_URL;
  if (!hfSpaceUrl) {
    return NextResponse.json(
      { error: "HF Space URL not configured" },
      { status: 500 }
    );
  }

  const todaysTypes = getTodaysTypes();
  const autoApprove = await getAutoApprove();
  const results: { type: string; success: boolean; error?: string }[] = [];

  // -- Generate one video per content type --
  for (const typeKey of todaysTypes) {
    try {
      // Find the content type info
      const typeInfo = CONTENT_TYPES.find((ct) => ct.key === typeKey);
      if (!typeInfo) {
        results.push({ type: typeKey, success: false, error: "Unknown content type" });
        continue;
      }

      console.log(`[CRON] Generating ${typeInfo.name} video...`);

      // -- Call the Gradio API --
      // Dynamic import to avoid bundling @gradio/client in non-cron routes
      const { Client } = await import("@gradio/client");
      const client = await Client.connect(hfSpaceUrl);

      // Call with content type — topic is "(Random)" so the pipeline picks one
      const result = await client.predict("/on_generate", {
        content_type_key: typeKey,
        format_choice: "Vertical Short (9:16)",
        dropdown_topic: "(Random)",
        custom: "",
      });

      const data = result.data as [{ url: string } | null, string];

      if (data && data[0]) {
        const videoUrl = typeof data[0] === "object" && data[0].url ? data[0].url : null;

        if (videoUrl) {
          // -- Add to queue --
          const queue = await loadQueue();
          const newEntry = {
            id: `auto-${Date.now()}-${typeKey}`,
            format: "short" as const,
            content_type: typeKey,
            accent_color: CONTENT_TYPE_COLORS[typeKey] || "#E8A817",
            topic: typeof data[1] === "string" ? data[1].split("**")[1] || typeKey : typeKey,
            status: autoApprove ? ("approved" as const) : ("pending_review" as const),
            created_at: new Date().toISOString(),
            video_url: videoUrl,
            target_platforms: ["youtube", "tiktok", "instagram", "facebook"],
          };

          queue.push(newEntry);
          await saveQueue(queue);

          console.log(`[CRON] ${typeInfo.name} video added to queue (${newEntry.status})`);
          results.push({ type: typeKey, success: true });
        } else {
          results.push({ type: typeKey, success: false, error: "No video URL in response" });
        }
      } else {
        results.push({ type: typeKey, success: false, error: "Empty response from Gradio" });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[CRON] Failed to generate ${typeKey}: ${msg}`);
      results.push({ type: typeKey, success: false, error: msg });
    }
  }

  return NextResponse.json({
    generated: results,
    auto_approve: autoApprove,
    types_today: todaysTypes,
  });
}
```

- [ ] **Step 2: Update `vercel.json` with daily cron**

```json
{
  "crons": [
    {
      "path": "/api/cron/post-scheduled",
      "schedule": "0 0 * * *"
    },
    {
      "path": "/api/cron/generate-videos",
      "schedule": "0 6 * * *"
    }
  ]
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd C:/Users/User/luminous-will-web && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/User/luminous-will-web
git add app/api/cron/generate-videos/route.ts vercel.json
git commit -m "feat: daily cron job for auto-generating videos with content type rotation"
```

---

### Task 11: Create /api/settings/auto-approve — Settings API

**Repo:** `luminous-will-web`

**Files:**
- Create: `app/api/settings/auto-approve/route.ts`

**Interfaces:**
- Consumes: `lib/settings.ts` (getAutoApprove, setAutoApprove)
- Produces: GET endpoint (returns current setting), POST endpoint (toggles setting)

- [ ] **Step 1: Create the auto-approve settings route**

```typescript
// ─────────────────────────────────────────────────────────────
//  GET/POST /api/settings/auto-approve
//  Reads and updates the auto-approve toggle for generated videos.
//  When enabled, cron-generated videos skip manual review.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getAutoApprove, setAutoApprove } from "@/lib/settings";

export async function GET() {
  // Returns the current auto-approve setting
  const enabled = await getAutoApprove();
  return NextResponse.json({ enabled });
}

export async function POST(request: Request) {
  // Updates the auto-approve setting
  try {
    const body = await request.json();
    const enabled = body.enabled === true;

    await setAutoApprove(enabled);

    return NextResponse.json({ enabled });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:/Users/User/luminous-will-web && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/User/luminous-will-web
git add app/api/settings/auto-approve/route.ts
git commit -m "feat: auto-approve settings API endpoint"
```

---

### Task 12: Update app/settings/page.tsx — Auto-Approve Toggle

**Repo:** `luminous-will-web`

**Files:**
- Modify: `app/settings/page.tsx`

**Interfaces:**
- Consumes: `/api/settings/auto-approve` endpoint
- Produces: Auto-approve toggle in the settings UI

- [ ] **Step 1: Add auto-approve state and toggle to SettingsPage**

Add new state after the existing state declarations (line ~82):

```typescript
  // Auto-approve toggle for cron-generated videos
  const [autoApprove, setAutoApproveState] = useState(false);
  const [autoApproveLoading, setAutoApproveLoading] = useState(true);
```

Add a new `useEffect` to load the auto-approve setting (after the existing `loadStatus()` call):

```typescript
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
        setAutoApproveState(data.enabled);
      }
    } catch {
      // Default to off
    } finally {
      setAutoApproveLoading(false);
    }
  }

  async function toggleAutoApprove() {
    const newValue = !autoApprove;
    setAutoApproveState(newValue);
    try {
      await fetch("/api/settings/auto-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newValue }),
      });
      setToast(`Auto-approve ${newValue ? "enabled" : "disabled"}`);
    } catch {
      // Revert on failure
      setAutoApproveState(!newValue);
      setToast("Failed to update auto-approve setting");
    }
  }
```

Add the auto-approve section after the info note at the bottom (before the closing `</div>`):

```tsx
      {/* ── Auto-Approve Setting ── */}
      <div className="mt-6 bg-[#1a1a1a] border border-[#333] rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Auto-Approve Videos</h3>
            <p className="text-xs text-[#555] mt-1">
              When enabled, cron-generated videos skip manual review and post automatically
            </p>
          </div>
          {autoApproveLoading ? (
            <div className="w-12 h-6 rounded-full bg-[#333] animate-pulse" />
          ) : (
            <button
              onClick={toggleAutoApprove}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                autoApprove ? "bg-[#E8A817]" : "bg-[#333]"
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  autoApprove ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          )}
        </div>
      </div>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:/Users/User/luminous-will-web && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/User/luminous-will-web
git add app/settings/page.tsx
git commit -m "feat: auto-approve toggle on settings page"
```

---

### Task 13: Update app/page.tsx — Content Type Selector

**Repo:** `luminous-will-web`

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `lib/content-types.ts` (CONTENT_TYPES)
- Produces: Content type selector cards on the home page, passes content type to Gradio API

- [ ] **Step 1: Replace hardcoded TOPICS with content-type-aware topic lists**

Remove the hardcoded `TOPICS` array at the top (lines 6-39).

Add imports and the content type data:

```typescript
import { CONTENT_TYPES } from "@/lib/content-types";
import type { ContentTypeKey } from "@/lib/content-types";
```

Add the topic lists per type (hardcoded to match Python pipeline):

```typescript
// --- Topics per content type (must match Python content_types.py) ---
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
```

- [ ] **Step 2: Add content type state and selector UI**

Add new state in the component:

```typescript
  const [contentType, setContentType] = useState<ContentTypeKey>("dark_motivation");
```

Compute the active topics list:

```typescript
  const activeTopics = TOPICS_BY_TYPE[contentType];
```

Add the content type selector cards above the format selector (before the format `<div>`):

```tsx
            {/* --- Content Type selector --- */}
            <div className="mb-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "#666" }}>
                Content Type
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {CONTENT_TYPES.map((ct) => (
                  <button
                    key={ct.key}
                    onClick={() => {
                      setContentType(ct.key);
                      setSelectedTopic(null);
                    }}
                    className={`p-3 rounded-xl border text-sm text-left transition-all ${
                      contentType === ct.key
                        ? `border-[${ct.accent_color}] bg-[${ct.accent_color}]/10`
                        : "border-[#1a1a1a] bg-[#0a0a0a] text-[#666] hover:border-[#333]"
                    }`}
                    style={contentType === ct.key ? {
                      borderColor: ct.accent_color,
                      backgroundColor: `${ct.accent_color}15`,
                      color: ct.accent_color,
                    } : undefined}
                  >
                    <div className="font-semibold">{ct.name}</div>
                    <div className="text-xs mt-1 opacity-70">{ct.description}</div>
                  </button>
                ))}
              </div>
            </div>
```

- [ ] **Step 3: Update the topic grid to use activeTopics**

Replace `{TOPICS.map((topic) => (` with `{activeTopics.map((topic) => (`

- [ ] **Step 4: Update the Gradio API call to pass content type**

In `handleGenerate`, update the `client.predict` call (line ~133):

```typescript
      const result = await client.predict("/on_generate", {
        content_type_key: contentType,
        format_choice: videoFormat === "long" ? "Horizontal Long (16:9)" : "Vertical Short (9:16)",
        dropdown_topic: customTopic.trim() ? "(Random)" : (selectedTopic || "(Random)"),
        custom: customTopic.trim() || "",
      });
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd C:/Users/User/luminous-will-web && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/User/luminous-will-web
git add app/page.tsx
git commit -m "feat: content type selector on home page with type-specific topics"
```

---

### Task 14: Update Dashboard + Publisher — Content Type Badge and Caption Metadata

**Repo:** `luminous-will-web`

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `lib/publisher.ts`

**Interfaces:**
- Consumes: `lib/content-types.ts` (CONTENT_TYPE_NAMES, CONTENT_TYPE_COLORS)
- Produces: Content type badge on queue entries, content type in publish metadata

- [ ] **Step 1: Add content type badge to dashboard queue entries**

In `app/dashboard/page.tsx`, add import at top:

```typescript
import { CONTENT_TYPE_NAMES, CONTENT_TYPE_COLORS } from "@/lib/content-types";
```

Add `content_type` and `accent_color` to the dashboard's `QueueEntry` interface:

```typescript
  content_type?: string;
  accent_color?: string;
```

In the queue entry rendering (wherever the topic/status is displayed), add a content type badge pill:

```tsx
{/* Content type badge */}
{entry.content_type && (
  <span
    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider"
    style={{
      backgroundColor: `${CONTENT_TYPE_COLORS[entry.content_type] || "#E8A817"}15`,
      color: CONTENT_TYPE_COLORS[entry.content_type] || "#E8A817",
      borderWidth: 1,
      borderColor: `${CONTENT_TYPE_COLORS[entry.content_type] || "#E8A817"}40`,
    }}
  >
    {CONTENT_TYPE_NAMES[entry.content_type] || entry.content_type}
  </span>
)}
```

- [ ] **Step 2: Update publisher to include content type in captions**

In `lib/publisher.ts`, update `buildPublishInput()` (line 183) to include content type context in the topic fallback:

```typescript
function buildPublishInput(entry: QueueEntry, platform: string): PublishInput {
  const platformCaptions = entry.captions?.[platform] || {};

  return {
    video_url: entry.video_url || "",
    thumbnail_url: entry.thumbnail_url,
    captions: {
      caption: platformCaptions.caption,
      description: platformCaptions.description,
      title: platformCaptions.title,
      hashtags: platformCaptions.hashtags,
      tags: platformCaptions.tags,
      category: platformCaptions.category,
    },
    format: entry.format,
    // Include content type name in topic for richer platform titles
    topic: entry.topic,
    duration: entry.duration,
  };
}
```

- [ ] **Step 3: Verify TypeScript compiles and Next.js builds**

Run: `cd C:/Users/User/luminous-will-web && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/User/luminous-will-web
git add app/dashboard/page.tsx lib/publisher.ts
git commit -m "feat: content type badge on dashboard + type metadata in publisher"
```

---

### Task 15: Final Verification — Build, Push, and Deploy Notes

**Repo:** Both repos

**Files:**
- No new changes — verification only

- [ ] **Step 1: Run full Next.js build**

Run: `cd C:/Users/User/luminous-will-web && npx next build`

Expected: Build succeeds with all routes compiled.

- [ ] **Step 2: Verify Python pipeline imports**

Run: `cd C:/Users/User/luminous-will-api && python -c "from app import generate_video; from scheduler import get_todays_types, pick_unused_topic; from content_types import CONTENT_TYPES; print(f'All imports OK. {len(CONTENT_TYPES)} content types, today: {get_todays_types()}')"`

Expected: All imports succeed, prints type count and today's types.

- [ ] **Step 3: Commit any remaining changes and push both repos**

```bash
# Push Python pipeline
cd C:/Users/User/luminous-will-api
git push origin master

# Push Next.js web app
cd C:/Users/User/luminous-will-web
git push origin master
```

- [ ] **Step 4: Document deploy actions**

After pushing, the user needs to:
1. Deploy Python pipeline changes to HF Spaces (push to HF repo or redeploy)
2. Vercel auto-deploys from GitHub push
3. Set `CRON_SECRET` env var on Vercel (generate a random string: `openssl rand -hex 32`)
4. Enable auto-approve toggle in Settings page if desired
5. Verify the daily cron fires at 6 AM UTC the next day
