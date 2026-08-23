export type Platform = "instagram" | "tiktok";

export type Difficulty = "Easy" | "Medium" | "Hard";
export type Setting = "Indoor" | "Outdoor";
// Content Style is an evolving product concept — this list is intentionally a small,
// easy-to-extend mock set (see CONTENT_STYLES in data/mockData.ts).
export type ContentStyle = "POV" | "Talking" | "Lifestyle" | "Selfie" | "Mirror" | "Storytime" | "Fitness" | "Golf";

// "Tell ReelForge what fits this Creator" — plain-language creative preferences.
// This is what will later feed AI Score / Creator Fit / semantic search ranking,
// but for now it's just structured mock data the client fills in by hand.
export interface Creator {
  id: string;
  name: string;
  handle: string;
  avatarColor: string;
  profileImage?: string; // placeholder for now — falls back to an initials avatar
  // Free-form keyword tags (from a comma-separated input) describing this Creator's
  // vibe — the same vocabulary Concepts are tagged with, so a future matching engine
  // can compare Creator traits against Concept tags/contentStyle directly.
  traits: string[];
  // A few natural-language sentences describing what works / doesn't for this Creator.
  creativeDirection: string;
  preferredStyles: ContentStyle[];
  avoidedStyles: string[];
  preferredTalking: "Talking" | "Non-Talking" | "Any";
  preferredSetting: Setting | "Any";
}

export interface ReelVideo {
  id: string;
  platform: Platform;
  username: string;
  // Mock source link for prototype/testing — real Instagram/TikTok ingestion
  // is a later phase. Used as the dedup key when saving into a Collection.
  sourceUrl: string;
  views: string;
  viewsRaw: number;
  tags: string[];
  saved: boolean;
  used: boolean;
  thumbGradient: string;
  duration: string;
  durationSec: number;
  talking: boolean;
  aiReady: boolean;
  aiScore: number;
  difficulty: Difficulty;
  setting: Setting;
  contentStyle: ContentStyle;
  creatorFit: number;
  trending: boolean;
  postedDaysAgo: number;
}

// The long-lived creative folder's workflow stage. Production progress lives on
// each Submission instead — a Collection can have several Submissions at once,
// so it has no single "In Production" state of its own.
export type CollectionStatus = "Draft" | "Ready" | "Sent" | "Completed";

// A concept's own lifecycle inside a collection — independent from the collection's
// overall status. Sending a batch to ReelForge does not, by itself, mark a concept Used.
export type ConceptStatus = "Unused" | "Used" | "Rejected";

export interface CollectionHistoryEntry {
  label: string;
  date: string;
}

// One Reel inside a Collection, carrying its own production lifecycle on top of
// the underlying ReelVideo. This is the shape that maps to a real row in
// client_os.concepts. Submission membership is NOT tracked here — it lives
// only in client_os.submission_concepts (see Submission.conceptIds below).
export interface CollectionConcept {
  video: ReelVideo;
  status: ConceptStatus;
  producedDate?: string;
  // Free-text creative direction for this one saved concept — independent
  // from the collection-level notes field (e.g. "black dress", "German talking version").
  notes: string;
  // Optional per-concept creator override. undefined means "use the
  // collection's creator" (the default/primary case, matching the existing
  // research flow where the creator is picked up front).
  creatorId?: string;
}

// Production progress for one real Submission (client_os.submissions). "Check
// Inbox" simulates ReelForge needing feedback/info from the client.
export type SubmissionStatus = "Sent" | "In Progress" | "Check Inbox" | "Finished";

// A specific batch sent to ReelForge. A Collection can have many Submissions over
// its lifetime — sending again later creates a new one rather than overwriting.
// Production status and deliveryUrl are system-controlled: only a future
// ReelForge Internal connection (via service_role, never the browser) can
// write them — the client can create a Submission and read its status, never
// update it. conceptIds is a read projection of client_os.submission_concepts,
// not a duplicated/writable array.
export interface Submission {
  id: string;
  index: number;
  conceptIds: string[];
  sentAt: string;
  note?: string;
  status: SubmissionStatus;
  // Present only once this specific submission is Finished — each batch gets its
  // own delivery folder, never one shared link for the whole Collection.
  deliveryUrl?: string;
}

export interface Collection {
  id: string;
  name: string;
  // Real relationship — a foreign key into client_os.creators.id. Never key
  // this on the creator's display name (that was Phase C's temporary bridge).
  creatorId: string;
  notes: string;
  concepts: CollectionConcept[];
  submissions: Submission[];
  status: CollectionStatus;
  // Real Supabase timestamp — format for display with formatRelativeTime()
  // rather than storing a precomputed string like "2 hours ago".
  updatedAt: string;
  history: CollectionHistoryEntry[];
}
