import type { ContentStyle } from "../types";

// Real, deterministic Content Style detection from a video's actual caption
// and hashtags — the same approach search-reels already uses server-side for
// language and promotional-content detection: match real text, never guess.
// A caption with no confident match returns undefined ("not classified"),
// consistent with the rest of the app's "undefined means not analyzed yet"
// convention — there is no fake catch-all bucket.
//
// This describes the content MECHANIC (the hook/format an agency could
// recreate), never the niche — "golf" or "mirror" are subjects, not styles.
// Checked in order, first match wins; roughly most-distinctive signal first.
const CAPTION_PATTERNS: Array<[ContentStyle, RegExp]> = [
  ["Correction", /\b(well[,]?\s*actually|that'?s a myth|myth[- ]?busting|actually (wrong|incorrect)|correcting (you|this))\b/i],
  ["Hot Take", /\b(hot take|unpopular opinion|controvers\w*|agree or disagree)\b/i],
  ["Engagement Bait", /\bcomment\s+["'“]?[a-z0-9]+["'”]?\s+(below|if|for)\b|\btag someone\b|\bdouble tap if\b|\btype\b.*\bin the comments\b|\bwho relates\b/i],
  ["Challenge", /\bchallenge\b|\btry this trend\b|\bdo this trend\b/i],
  ["Plot Twist", /\bplot twist\b|\bwait for it\b|\bnot what you think\b|\bwtf\b|\bdidn'?t expect\b/i],
  ["Compliment", /\byou'?re (beautiful|amazing|enough|worthy|doing great)\b|\bthis is your sign\b|\breminder that you\b/i],
  ["Educational", /\bhere'?s how\b|\blife ?hack\b|\bdid you know\b|\bpro tip\b|\bhow to\b/i],
  ["Storytelling", /\bstory\s?time\b|\bconfession\b|\btrue story\b/i],
  ["Relatable", /\brelatable\b|\bso real\b|\btoo real\b|\bwe'?ve all been there\b|\bliterally me\b/i],
  ["Scenario", /^\s*pov[:\s]/i],
  ["Comedy", /\bfunny\b|\bcomedy\b|\bskit\b|\bhilarious\b/i],
];

// Hashtag-only fallback for captions with no free-text hook — checked after
// the caption patterns above, only when none of them matched.
const TAG_HINTS: Record<string, ContentStyle> = {
  storytime: "Storytelling",
  storytimetiktok: "Storytelling",
  confession: "Storytelling",
  relatable: "Relatable",
  sotrue: "Relatable",
  funny: "Comedy",
  comedy: "Comedy",
  skit: "Comedy",
  challenge: "Challenge",
  trend: "Challenge",
  pov: "Scenario",
  plottwist: "Plot Twist",
  wtf: "Plot Twist",
  hottake: "Hot Take",
  unpopularopinion: "Hot Take",
  controversial: "Hot Take",
  lifehack: "Educational",
  howto: "Educational",
  selflove: "Compliment",
  affirmation: "Compliment",
  mythbusting: "Correction",
};

export function classifyContentStyle(
  caption: string | undefined,
  tags: string[] | undefined
): ContentStyle | undefined {
  if (caption) {
    for (const [style, pattern] of CAPTION_PATTERNS) {
      if (pattern.test(caption)) return style;
    }
  }
  if (tags) {
    for (const tag of tags) {
      const hit = TAG_HINTS[tag.toLowerCase()];
      if (hit) return hit;
    }
  }
  return undefined;
}
