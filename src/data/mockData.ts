import type { ReelVideo, Difficulty, Setting, ContentStyle } from "../types";

const gradients = [
  "linear-gradient(160deg,#3a3140,#221d29)",
  "linear-gradient(160deg,#2f3a3a,#1b2222)",
  "linear-gradient(160deg,#3a3128,#241f1a)",
  "linear-gradient(160deg,#2c3140,#1a1d29)",
  "linear-gradient(160deg,#3a2c37,#231b23)",
  "linear-gradient(160deg,#2e3a34,#1a221f)",
  "linear-gradient(160deg,#3a3a2c,#22221a)",
  "linear-gradient(160deg,#2c3a3a,#1a2222)",
];

const usernames = [
  "goldenhour.mia", "wldflwr.kt", "studio.reyna", "b.softlight",
  "sunnydayz.al", "coastline.jules", "afterglow.tay", "prettyblnd.ash",
  "meadow.rae", "quietluxe.nina", "honeytone.eve", "westlnd.rio",
];

const tagPool = [
  ["Cute", "Blonde", "POV"],
  ["Talking", "Storytime"],
  ["Golf", "Outdoor", "Cute"],
  ["Gym", "Fitness", "POV"],
  ["Blonde", "Selfie"],
  ["Beach", "Summer"],
  ["Talking", "GRWM"],
  ["POV", "Aesthetic"],
  ["Cute", "Cafe"],
  ["Golf", "Talking"],
  ["Gym", "Motivation"],
  ["Blonde", "Golden Hour"],
];

const difficulties: Difficulty[] = ["Easy", "Medium", "Hard"];
const settings: Setting[] = ["Indoor", "Outdoor"];

// Small, intentionally mock content-style set — expected to grow. Add new values
// here and to the ContentStyle union in types.ts; every consumer (filters, cards)
// reads from this single source so extending the list needs no other changes.
export const CONTENT_STYLES: ContentStyle[] = [
  "POV",
  "Talking",
  "Lifestyle",
  "Selfie",
  "Mirror",
  "Storytime",
  "Fitness",
  "Golf",
];

function seedShuffle<T>(arr: T[], seed: number): T[] {
  const copy = [...arr];
  let s = seed;
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function generateMockVideos(seed = 1): ReelVideo[] {
  const count = 24;
  const platforms: Array<"instagram" | "tiktok"> = ["instagram", "tiktok"];
  const list: ReelVideo[] = Array.from({ length: count }).map((_, i) => {
    const views = Math.floor(8 + Math.sin(i * 13.37 + seed) * 400 + i * 37 + seed * 5);
    const viewsRaw = Math.max(1200, Math.abs(views) * 100);
    const viewsK = viewsRaw / 1000;
    const durationSec = 2 + ((i * 3 + seed * 5) % 13);
    const tags = tagPool[(i + seed) % tagPool.length];
    const platform = platforms[(i + seed) % 2];
    const id = `v-${seed}-${i}`;
    return {
      id,
      platform,
      username: usernames[(i + seed) % usernames.length],
      sourceUrl:
        platform === "instagram"
          ? `https://www.instagram.com/reel/mock-${id}/`
          : `https://www.tiktok.com/@mock/video/${id}`,
      views: viewsK >= 1000 ? `${(viewsK / 1000).toFixed(1)}M` : `${viewsK.toFixed(1)}K`,
      viewsRaw,
      tags,
      saved: false,
      used: (i + seed) % 5 === 0,
      thumbGradient: gradients[(i + seed) % gradients.length],
      duration: `0:${durationSec.toString().padStart(2, "0")}`,
      durationSec,
      talking: tags.includes("Talking"),
      aiReady: (i + seed * 3) % 3 === 0,
      aiScore: 52 + ((i * 9 + seed * 4) % 47),
      difficulty: difficulties[(i + seed) % difficulties.length],
      setting: settings[(i + seed) % settings.length],
      contentStyle: CONTENT_STYLES[(i + seed * 2) % CONTENT_STYLES.length],
      creatorFit: 58 + ((i * 11 + seed * 7) % 41),
      trending: (i + seed) % 4 === 0,
      postedDaysAgo: 1 + ((i * 2 + seed) % 21),
    };
  });
  return seedShuffle(list, seed * 7 + 3);
}
