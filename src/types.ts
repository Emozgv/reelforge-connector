export type Platform = "instagram" | "tiktok";

export interface Creator {
  id: string;
  name: string;
  handle: string;
  avatarColor: string;
}

export type Difficulty = "Easy" | "Medium" | "Hard";
export type Setting = "Indoor" | "Outdoor";
// Content Style is an evolving product concept — this list is intentionally a small,
// easy-to-extend mock set (see CONTENT_STYLES in data/mockData.ts).
export type ContentStyle = "POV" | "Talking" | "Lifestyle" | "Selfie" | "Mirror" | "Storytime" | "Fitness" | "Golf";

export interface ReelVideo {
  id: string;
  platform: Platform;
  username: string;
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
// the underlying ReelVideo. This is the shape that will eventually map to a
// "Concept" entity in ReelForge Internal.
export interface CollectionConcept {
  video: ReelVideo;
  status: ConceptStatus;
  producedDate?: string;
  submissionIds: string[];
}

// Mock production progress for one Submission. "Check Inbox" simulates ReelForge
// needing feedback/info from the client — no real inbox exists yet.
export type SubmissionStatus = "Sent" | "In Progress" | "Check Inbox" | "Finished";

// A specific batch sent to ReelForge. A Collection can have many Submissions over
// its lifetime — sending again later creates a new one rather than overwriting.
// Production status (and eventually deliveryUrl) belongs here, per-batch, and is
// system-controlled: ReelForge Internal will own writes to both once connected.
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
  creator: string;
  notes: string;
  concepts: CollectionConcept[];
  submissions: Submission[];
  status: CollectionStatus;
  lastUpdated: string;
  history: CollectionHistoryEntry[];
}
