import type {
  Creator,
  ReelVideo,
  Collection,
  CollectionConcept,
  ConceptStatus,
  Submission,
  Difficulty,
  Setting,
  ContentStyle,
} from "../types";

export const creators: Creator[] = [
  { id: "c1", name: "Carolina", handle: "@carolina", avatarColor: "#e0a6ff" },
  { id: "c2", name: "Ava Marlowe", handle: "@avamarlowe", avatarColor: "#8bd1ff" },
  { id: "c3", name: "Riley Quinn", handle: "@rileyquinn", avatarColor: "#ffb787" },
  { id: "c4", name: "Jordan Blake", handle: "@jordanblake", avatarColor: "#9dffb0" },
  { id: "c5", name: "Sasha Reyes", handle: "@sashareyes", avatarColor: "#ff9dc4" },
];

export function creatorByName(name: string): Creator | undefined {
  return creators.find((c) => c.name === name);
}

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
    return {
      id: `v-${seed}-${i}`,
      platform: platforms[(i + seed) % 2],
      username: usernames[(i + seed) % usernames.length],
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

// Builds the CollectionConcept list for a mock collection. `statusPattern` is
// cycled across the concepts so a collection can show a believable mix of
// Unused/Used/Rejected instead of a single uniform state.
function makeConcepts(
  seed: number,
  count: number,
  statusPattern: ConceptStatus[] = ["Unused"],
  producedDate?: string
): CollectionConcept[] {
  return generateMockVideos(seed)
    .slice(0, count)
    .map((v, i) => {
      const status = statusPattern[i % statusPattern.length];
      return {
        video: { ...v, saved: true },
        status,
        producedDate: status === "Used" ? producedDate ?? "18 Aug" : undefined,
        submissionIds: [],
      };
    });
}

// Retroactively marks the first N concepts as belonging to a submission (used when
// seeding a collection that already has submission history).
function attachSubmission(concepts: CollectionConcept[], submissionId: string, count: number): CollectionConcept[] {
  return concepts.map((c, i) => (i < count ? { ...c, submissionIds: [...c.submissionIds, submissionId] } : c));
}

function makeCollection(
  id: string,
  name: string,
  creator: string,
  status: Collection["status"],
  lastUpdated: string,
  notes: string,
  history: Collection["history"],
  concepts: CollectionConcept[],
  submissions: Submission[] = []
): Collection {
  return { id, name, creator, notes, status, lastUpdated, history, concepts, submissions };
}

// Collections are organized per creator — every client's creative folders are
// independent, so the same shape scales cleanly to many creators/collections.
// September Concepts intentionally shows two separate submissions over time —
// a Collection is a long-lived folder, a Submission is one batch sent from it.
const septemberConcepts = attachSubmission(
  attachSubmission(
    makeConcepts(31, 9, ["Used", "Used", "Unused", "Unused", "Used", "Unused", "Unused", "Unused", "Unused"]),
    "sub-1-1",
    5
  ),
  "sub-1-2",
  9
);

export const collections: Collection[] = [
  makeCollection(
    "col-1",
    "September Concepts",
    "Carolina",
    "Sent",
    "2 hours ago",
    "Golden hour outdoor aesthetic, soft color grade. Reference for the September concept batch.",
    [
      { label: "Collection created", date: "Aug 10" },
      { label: "9 concepts added", date: "Aug 12" },
      { label: "Sent 5 concepts to ReelForge", date: "5 Sep 2026" },
      { label: "3 concepts marked Used", date: "10 Sep 2026" },
      { label: "Sent 4 more concepts to ReelForge", date: "15 Sep 2026" },
    ],
    septemberConcepts,
    [
      {
        id: "sub-1-1",
        index: 1,
        conceptIds: septemberConcepts.slice(0, 5).map((c) => c.video.id),
        sentAt: "05 Sep 2026 · 10:20",
        status: "Finished",
        deliveryUrl: "https://drive.google.com/drive/folders/mock-sub-1-1",
      },
      {
        id: "sub-1-2",
        index: 2,
        conceptIds: septemberConcepts.slice(0, 9).map((c) => c.video.id),
        sentAt: "15 Sep 2026 · 09:05",
        status: "Check Inbox",
      },
    ]
  ),
  makeCollection(
    "col-2",
    "Gym",
    "Carolina",
    "Draft",
    "Yesterday",
    "Focus on POV gym mirror shots + confident voiceover hooks. Avoid overly staged transitions.",
    [
      { label: "Collection created", date: "Aug 14" },
      { label: "6 concepts added", date: "Yesterday" },
    ],
    makeConcepts(32, 6, ["Unused"])
  ),
  makeCollection(
    "col-3",
    "Talking Reels",
    "Carolina",
    "Ready",
    "3 days ago",
    "Storytime hooks that open mid-sentence. Keep captions punchy, first 2s is everything.",
    [
      { label: "Collection created", date: "Aug 8" },
      { label: "5 concepts added", date: "3 days ago" },
      { label: "Marked Ready", date: "3 days ago" },
    ],
    makeConcepts(33, 5, ["Unused"])
  ),
  makeCollection(
    "col-4",
    "Cute / GND",
    "Carolina",
    "Sent",
    "5 days ago",
    "Girl-next-door, natural lighting, minimal makeup. Cafe and bedroom settings work best.",
    [
      { label: "Collection created", date: "Aug 9" },
      { label: "6 concepts added", date: "Aug 11" },
      { label: "Sent 6 concepts to ReelForge", date: "5 days ago" },
    ],
    attachSubmission(makeConcepts(34, 6, ["Unused"]), "sub-4-1", 6),
    [
      {
        id: "sub-4-1",
        index: 1,
        conceptIds: makeConcepts(34, 6).map((c) => c.video.id),
        sentAt: "17 Aug 2026 · 16:40",
        status: "Sent",
      },
    ]
  ),
  makeCollection(
    "col-5",
    "Test Next",
    "Carolina",
    "Draft",
    "1 week ago",
    "Rough holding area for concepts to review before committing to a full batch.",
    [{ label: "Collection created", date: "1 week ago" }],
    makeConcepts(35, 3, ["Unused"])
  ),
  makeCollection(
    "col-6",
    "Used Concepts",
    "Carolina",
    "Completed",
    "2 weeks ago",
    "Archive of concepts already delivered — kept for reference, not for re-briefing.",
    [
      { label: "Collection created", date: "2 weeks ago" },
      { label: "7 concepts added", date: "2 weeks ago" },
      { label: "Sent 7 concepts to ReelForge", date: "2 weeks ago" },
      { label: "7 concepts marked Used", date: "1 week ago" },
      { label: "Marked Completed", date: "1 week ago" },
    ],
    attachSubmission(makeConcepts(36, 7, ["Used"], "9 Aug"), "sub-6-1", 7),
    [
      {
        id: "sub-6-1",
        index: 1,
        conceptIds: makeConcepts(36, 7).map((c) => c.video.id),
        sentAt: "05 Aug 2026 · 11:15",
        status: "Finished",
        deliveryUrl: "https://drive.google.com/drive/folders/mock-sub-6-1",
      },
    ]
  ),
  makeCollection(
    "col-7",
    "Storytime Hooks",
    "Ava Marlowe",
    "Draft",
    "Yesterday",
    "Storytime hooks that open mid-sentence. Keep captions punchy, first 2s is everything.",
    [
      { label: "Collection created", date: "Aug 18" },
      { label: "5 concepts added", date: "Yesterday" },
    ],
    makeConcepts(22, 5, ["Unused"])
  ),
  makeCollection(
    "col-8",
    "Aesthetic Reels",
    "Ava Marlowe",
    "Ready",
    "4 days ago",
    "Soft, moody color grade. Reference for the next aesthetic-led batch.",
    [
      { label: "Collection created", date: "Aug 15" },
      { label: "4 concepts added", date: "4 days ago" },
      { label: "Marked Ready", date: "4 days ago" },
    ],
    makeConcepts(23, 4, ["Unused"])
  ),
  makeCollection(
    "col-9",
    "Gym POV",
    "Riley Quinn",
    "Sent",
    "2 hours ago",
    "Focus on POV gym mirror shots + confident voiceover hooks. Avoid overly staged transitions.",
    [
      { label: "Collection created", date: "Aug 14" },
      { label: "8 concepts added", date: "Aug 16" },
      { label: "Sent 8 concepts to ReelForge", date: "Aug 20" },
    ],
    attachSubmission(makeConcepts(11, 8, ["Used", "Used", "Unused", "Unused", "Unused"]), "sub-9-1", 8),
    [
      {
        id: "sub-9-1",
        index: 1,
        conceptIds: makeConcepts(11, 8).map((c) => c.video.id),
        sentAt: "20 Aug 2026 · 14:02",
        status: "In Progress",
      },
    ]
  ),
  makeCollection(
    "col-10",
    "Mirror Talks",
    "Riley Quinn",
    "Draft",
    "6 days ago",
    "Mirror-facing talking segments, casual energy.",
    [{ label: "Collection created", date: "6 days ago" }],
    makeConcepts(12, 4, ["Unused"])
  ),
  makeCollection(
    "col-11",
    "Golf Lifestyle",
    "Jordan Blake",
    "Draft",
    "1 week ago",
    "Outdoor golf lifestyle concepts, light and breezy tone.",
    [{ label: "Collection created", date: "1 week ago" }],
    makeConcepts(41, 5, ["Unused"])
  ),
  makeCollection(
    "col-12",
    "Girl Next Door",
    "Sasha Reyes",
    "Sent",
    "3 days ago",
    "Girl-next-door, natural lighting, minimal makeup. Cafe and bedroom settings work best.",
    [
      { label: "Collection created", date: "Aug 9" },
      { label: "6 concepts added", date: "Aug 11" },
      { label: "Sent 6 concepts to ReelForge", date: "3 days ago" },
    ],
    attachSubmission(makeConcepts(42, 6, ["Unused"]), "sub-12-1", 6),
    [
      {
        id: "sub-12-1",
        index: 1,
        conceptIds: makeConcepts(42, 6).map((c) => c.video.id),
        sentAt: "19 Aug 2026 · 09:48",
        status: "In Progress",
      },
    ]
  ),
  makeCollection(
    "col-13",
    "Cafe Aesthetic",
    "Sasha Reyes",
    "Draft",
    "5 days ago",
    "Cafe and coffee-shop settings, warm tones.",
    [{ label: "Collection created", date: "5 days ago" }],
    makeConcepts(43, 3, ["Unused"])
  ),
];
