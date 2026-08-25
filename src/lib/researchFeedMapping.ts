import type { Platform, ReelVideo } from "../types";

export interface ResearchFeedItemRow {
  id: string;
  // True per-row, strictly increasing identity — the real ordering/watermark
  // key. synced_at is shared across every reel in the same sync batch, so it
  // can't give per-item resolution (see the migration that added this).
  seq: number;
  platform: string;
  source_username: string;
  source_url: string;
  thumbnail_url: string | null;
  video_url: string | null;
  caption: string | null;
  views_raw: number;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  tags: string[];
  duration_sec: number;
  posted_days_ago: number | null;
  synced_at: string;
}

// Exported for useLiveResearchSession — a live session's reels come
// straight from Connector's in-memory extraction, not this table, but need
// the exact same raw-number -> display-string treatment.
export function formatViews(raw: number): string {
  if (raw >= 1_000_000) return `${(raw / 1_000_000).toFixed(1)}M`;
  if (raw >= 1_000) return `${(raw / 1_000).toFixed(1)}K`;
  return String(raw);
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Same normalization search-reels already does server-side for TikHub
// results — a synced feed item is just a reel from a different source, so it
// becomes the exact same ReelVideo shape the rest of the app already knows
// how to render, save, and file into Collections.
export function researchFeedItemToVideo(row: ResearchFeedItemRow): ReelVideo {
  return {
    id: row.id,
    platform: row.platform as Platform,
    username: row.source_username,
    sourceUrl: row.source_url,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    videoUrl: row.video_url ?? undefined,
    caption: row.caption ?? undefined,
    // views_raw/duration_sec are NOT NULL default 0 on this table, so a
    // stored 0 can't be told apart from "a real zero" at the column level
    // — but a Reel with genuinely zero views/duration essentially never
    // happens for anything worth archiving, so treating 0 as "never
    // captured" and hiding it (empty string, same convention live reels
    // already use — see useLiveResearchSession's liveReelToVideo) is the
    // honest choice: never show a fabricated number.
    views: row.views_raw > 0 ? formatViews(row.views_raw) : "",
    viewsRaw: row.views_raw,
    likes: row.likes ?? undefined,
    comments: row.comments ?? undefined,
    shares: row.shares ?? undefined,
    tags: row.tags,
    saved: false,
    used: false,
    duration: row.duration_sec > 0 ? formatDuration(row.duration_sec) : "",
    durationSec: row.duration_sec,
    postedDaysAgo: row.posted_days_ago ?? undefined,
  };
}
