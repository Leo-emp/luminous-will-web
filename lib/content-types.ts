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
