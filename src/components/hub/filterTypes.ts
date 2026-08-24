import type { ContentStyle, Platform } from "../../types";

// V1.5 filter set — every filter here genuinely changes real Discovery
// results. Talking, AI-friendly, Difficulty, Setting, Creator Fit, and
// Language were removed: none of them have real data behind a freshly
// searched TikTok/Instagram reel today (see types.ts's own comments on
// ReelVideo), so presenting them as working filters would be dishonest.
// They belong to a future AI-tagging layer, not this pass. Language
// specifically is also already handled upstream in Discovery's own search
// logic — it doesn't need a second, manual filter here.
export interface HubFilters {
  platform: "all" | Platform;
  length: "any" | "0-5" | "6-9" | "10-12";
  // Real, deterministic detection from caption/hashtag text (see
  // lib/contentStyleClassifier.ts) — not an AI score, a keyword match.
  contentStyle: "any" | ContentStyle;
  // Cross-referenced against the creator's real saved Collections data
  // (any concept with a matching sourceUrl / status), not a fake flag.
  used: "any" | "used" | "unused";
  savedState: "any" | "saved" | "unsaved";
  views: "any" | "10k" | "50k" | "100k";
  // "mostViewed" replaces the old "trending" — there is no real trend
  // signal today, only a real view count, so it's labeled for what it is.
  sort: "relevant" | "recent" | "mostViewed";
}

export const DEFAULT_FILTERS: HubFilters = {
  platform: "all",
  length: "any",
  contentStyle: "any",
  used: "any",
  savedState: "any",
  views: "any",
  sort: "relevant",
};

export function countActiveFilters(f: HubFilters): number {
  let n = 0;
  if (f.platform !== "all") n++;
  if (f.length !== "any") n++;
  if (f.contentStyle !== "any") n++;
  if (f.used !== "any") n++;
  if (f.savedState !== "any") n++;
  if (f.views !== "any") n++;
  if (f.sort !== "relevant") n++;
  return n;
}
