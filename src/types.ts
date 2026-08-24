export type Platform = "instagram" | "tiktok";

export type Difficulty = "Easy" | "Medium" | "Hard";
export type Setting = "Indoor" | "Outdoor";
// Content Style describes the content MECHANIC/hook an agency could recreate
// — never the niche or subject ("golf", "mirror" are not styles). Real
// values are detected deterministically from a video's own caption/hashtags
// (see lib/contentStyleClassifier.ts) — undefined means "no confident match",
// not "not applicable". See CONTENT_STYLES in data/mockData.ts for the
// canonical list every consumer (filters, Creator preferences) reads from.
export type ContentStyle =
  | "Storytelling"
  | "Relatable"
  | "Comedy"
  | "Challenge"
  | "Scenario"
  | "Plot Twist"
  | "Hot Take"
  | "Engagement Bait"
  | "Compliment"
  | "Educational"
  | "Correction";
// Spoken language of the clip — mock only, real detection is a later ingestion-phase concern.
export type Language = "English" | "Spanish" | "German" | "Non-verbal";

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
  // Character-set reference photos (up to 5) — the visual anchor Production works from.
  referencePhotos: string[];
  bodyNotes: string;
  tattooNotes: string;
  identityNotes: string;
  preferredOutfits: string;
  settingNotes: string;
  preferredLanguage: Language | "Any";
  contentDos: string;
  contentDonts: string;
  brandDirection: string;
  clientNotes: string;
  // Opt-in only — has no effect until AI Creator Fit / scoring actually ships.
  aiBrainEnabled: boolean;
}

// Rule-based (no AI involved) read on how ready a Creator's setup is —
// computed from field presence, never stored, so it can never drift from
// what's actually filled in.
export type CreatorSetupStatus = "draft" | "in_progress" | "ready";

// A public creator profile's own real, provider-reported stats — built from
// the same post-list response as their reels (see search-reels's
// extractProfileInfo), never estimated or fabricated client-side. Any field
// the provider didn't expose is left undefined rather than guessed.
export interface ReelProfileInfo {
  platform: Platform;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  verified?: boolean;
  followerCount?: number;
  followingCount?: number;
  // TikTok calls this "heart"/"heartCount" — the creator's all-time likes total.
  likesCount?: number;
  videoCount?: number;
}

export interface ReelVideo {
  id: string;
  platform: Platform;
  username: string;
  // Real permalink for ingested reels; still the dedup key when saving into a Collection.
  sourceUrl: string;
  // Real preview image for ingested reels. Mock/legacy items have no image and
  // fall back to thumbGradient instead.
  thumbnailUrl?: string;
  // Direct playable video URL, when the provider exposes one. These are often
  // short-lived signed CDN URLs and may fail to embed cross-origin — consumers
  // should fall back gracefully (e.g. to thumbnailUrl + an external "watch" link).
  videoUrl?: string;
  // Full raw caption/description text (tags above are just the hashtags parsed
  // out of it) — undefined for mock/legacy items.
  caption?: string;
  views: string;
  viewsRaw: number;
  // Real per-video engagement counts, when the provider exposes them.
  // Undefined means "not available", never defaulted to 0.
  likes?: number;
  comments?: number;
  shares?: number;
  tags: string[];
  saved: boolean;
  used: boolean;
  // Present for mock/legacy items (a CSS gradient placeholder). Real ingested
  // reels use thumbnailUrl instead — components should fall back to a shared
  // default gradient when both are absent, never fabricate one per video.
  thumbGradient?: string;
  duration: string;
  durationSec: number;
  // Everything below is AI-derived or curation metadata that doesn't exist yet
  // for a freshly-ingested real reel — undefined means "not analyzed yet", not
  // "false"/"zero". Filtering on these treats undefined as "unknown, excluded
  // from a specific filter value" rather than guessing. Only mock data and,
  // later, real AI tagging (V2/V3) populate these.
  talking?: boolean;
  aiReady?: boolean;
  aiScore?: number;
  difficulty?: Difficulty;
  setting?: Setting;
  contentStyle?: ContentStyle;
  creatorFit?: number;
  trending?: boolean;
  postedDaysAgo?: number;
  language?: Language;
}

// The long-lived creative folder's workflow stage. Draft -> Sent happens
// automatically on send, Sent -> Completed happens automatically once any
// Submission is delivered (client_os DB trigger) — this is a status readout,
// not really a manual field, though it stays editable as a fallback.
// Production progress lives on each Submission instead — a Collection can
// have several Submissions at once, so it has no single "In Production" state.
export type CollectionStatus = "Draft" | "Sent" | "Completed";

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
  // Client-uploaded delivered video for this exact reel — lets the read-only
  // Finished view show a side-by-side against the original reference.
  finishedVideoUrl?: string;
  // Where this concept was originally found — set once, at save time, by
  // whichever research surface saved it ("Creativity Hub", "IG Research —
  // Nightshade"). Pure history/context, never client-editable after the fact.
  sourceLabel?: string;
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
  // Client-writable — the only two fields on a Submission the client can set.
  favorited: boolean;
  approvedAt?: string;
}

export type RegenerationReason =
  | "Body"
  | "Face"
  | "Tattoos"
  | "Outfit"
  | "Movement"
  | "Scene"
  | "Technical issue"
  | "Creative preference"
  | "Other";

export type RegenerationStatus = "Requested" | "Acknowledged" | "Done";

// A structured regeneration request (client_os.regeneration_requests) — replaces
// the earlier activity-log-only version. isFree is decided at request time from
// the reason (QC-type reasons are always free; creative ones may be billable),
// shown to the client so there's never a billing surprise.
export interface RegenerationRequest {
  id: string;
  collectionId: string;
  submissionId?: string;
  submissionIndex: number;
  conceptId: string;
  reason: RegenerationReason;
  isFree: boolean;
  note: string;
  status: RegenerationStatus;
  createdAt: string;
}

// Workspace-level pooled plan — reused specifically for Enterprise (the real
// ReelForge model sells Enterprise as one shared arrangement across 3+
// creators, unlike Starter/Growth/Scale which are each sold per single
// creator — see CreatorPackage below). Set by ReelForge, read-only for the
// client (client_os.workspace_packages). A workspace has this row only if
// it's actually on an Enterprise arrangement.
export interface WorkspacePackage {
  planName: string;
  monthlyAllowance: number;
  regenerationsIncluded: number;
  creatorSetupsIncluded: number;
  billingCycleStart: string;
}

// Real per-creator plan tier, matching ReelForge's actual pricing (Starter/
// Growth/Scale are each sold per single creator; confirmed against
// reelforgeai.net). Set by ReelForge staff — no client-facing write path yet
// (client_os.creator_packages). A creator with no CreatorPackage has no
// active plan; that must always read as "No active plan," never a default
// free tier.
export type PlanTier = "S" | "M" | "L" | "Enterprise";

export interface CreatorPackage {
  creatorId: string;
  planTier: PlanTier;
  planLabel: string;
  // undefined for Enterprise (custom quote, not a flat monthly price).
  priceMonthly?: number;
  monthlyReelAllowance: number;
  billingCycleStart: string;
  status: "active" | "paused" | "cancelled";
}

// A trained IG/TikTok research account belonging to a Creator (up to 5 per
// creator per platform). Real login/session/proxy handling lives entirely
// outside this app (client_os.research_accounts never stores credentials) —
// this is just the account's identity, sync state, and shared "who last
// opened it" context so any authorized team member can pick up the same
// research session, not a login object.
export type ResearchAccountStatus = "active" | "needs_attention" | "disconnected";

export interface ResearchAccount {
  id: string;
  creatorId: string;
  platform: Platform;
  label: string;
  status: ResearchAccountStatus;
  lastSyncedAt?: string;
  lastOpenedAt?: string;
  // Swipe-mode watermark — feed items synced at or before this have already
  // been shown to the team, so nobody re-sees the same reel on a later visit.
  lastShownSyncedAt?: string;
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
  regenerationRequests: RegenerationRequest[];
  status: CollectionStatus;
  // Real Supabase timestamp — format for display with formatRelativeTime()
  // rather than storing a precomputed string like "2 hours ago".
  updatedAt: string;
  history: CollectionHistoryEntry[];
  // Present only once archived. Archiving is always a whole-family action
  // (every version shares the same archived state together) — never set on
  // just one version of a family while its siblings stay active.
  archivedAt?: string;
}
