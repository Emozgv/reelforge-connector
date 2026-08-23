import type { CollectionConcept, ConceptStatus, ContentStyle, Difficulty, Platform, ReelVideo, Setting } from "../types";
import { formatTimestampFromIso } from "./dateFormat";

// Shape of a row from client_os.concepts (snake_case, as returned by PostgREST).
// aiScore/creatorFit/talking/aiReady/trending/postedDaysAgo are mock-estimate
// fields with no dedicated columns beyond ai_score/creator_fit — the rest live
// in ai_metadata (jsonb) rather than growing the schema for prototype-only data.
export interface ConceptRow {
  id: string;
  workspace_id: string;
  collection_id: string;
  platform: Platform | null;
  source_username: string | null;
  source_url: string | null;
  thumbnail_url: string | null;
  views_raw: number | null;
  duration_sec: number | null;
  tags: string[];
  content_style: string | null;
  difficulty: Difficulty | null;
  setting: Setting | null;
  ai_score: number | null;
  creator_fit: number | null;
  status: ConceptStatus;
  produced_at: string | null;
  ai_metadata: Record<string, unknown>;
  notes: string;
  creator_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ConceptAiMetadata {
  talking?: boolean;
  aiReady?: boolean;
  trending?: boolean;
  postedDaysAgo?: number;
}

function formatViews(raw: number): string {
  const k = raw / 1000;
  return k >= 1000 ? `${(k / 1000).toFixed(1)}M` : `${k.toFixed(1)}K`;
}

function formatDuration(sec: number): string {
  return `0:${sec.toString().padStart(2, "0")}`;
}

// The saved Concept's own DB row id doubles as ReelVideo.id — a persisted
// Concept has exactly one identity, not a separate "video" id and "concept" id.
export function conceptFromRow(row: ConceptRow): CollectionConcept {
  const meta = (row.ai_metadata ?? {}) as ConceptAiMetadata;
  const viewsRaw = row.views_raw ?? 0;
  const durationSec = row.duration_sec ?? 0;

  const video: ReelVideo = {
    id: row.id,
    platform: row.platform ?? "instagram",
    username: row.source_username ?? "",
    sourceUrl: row.source_url ?? "",
    views: formatViews(viewsRaw),
    viewsRaw,
    tags: row.tags ?? [],
    saved: true,
    used: row.status === "Used",
    thumbGradient: row.thumbnail_url ?? "linear-gradient(160deg,#2c3140,#1a1d29)",
    duration: formatDuration(durationSec),
    durationSec,
    talking: meta.talking ?? false,
    aiReady: meta.aiReady ?? false,
    aiScore: row.ai_score ?? 0,
    difficulty: row.difficulty ?? "Easy",
    setting: row.setting ?? "Indoor",
    contentStyle: (row.content_style ?? "POV") as ContentStyle,
    creatorFit: row.creator_fit ?? 0,
    trending: meta.trending ?? false,
    postedDaysAgo: meta.postedDaysAgo ?? 0,
  };

  return {
    video,
    status: row.status,
    producedDate: row.produced_at ? formatTimestampFromIso(row.produced_at) : undefined,
    notes: row.notes ?? "",
    creatorId: row.creator_id ?? undefined,
  };
}

export function conceptToInsertRow(
  video: ReelVideo,
  collectionId: string,
  workspaceId: string,
  notes?: string,
  creatorId?: string
) {
  return {
    workspace_id: workspaceId,
    collection_id: collectionId,
    platform: video.platform,
    source_username: video.username,
    source_url: video.sourceUrl || null,
    thumbnail_url: video.thumbGradient,
    views_raw: video.viewsRaw,
    duration_sec: video.durationSec,
    tags: video.tags,
    content_style: video.contentStyle,
    difficulty: video.difficulty,
    setting: video.setting,
    ai_score: video.aiScore,
    creator_fit: video.creatorFit,
    status: "Unused" as ConceptStatus,
    notes: notes || "",
    creator_id: creatorId || null,
    ai_metadata: {
      talking: video.talking,
      aiReady: video.aiReady,
      trending: video.trending,
      postedDaysAgo: video.postedDaysAgo,
    },
  };
}
