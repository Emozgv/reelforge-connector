import type { Platform, ReelVideo } from "../types";

export interface ResearchFeedItemRow {
  id: string;
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

function formatViews(raw: number): string {
  if (raw >= 1_000_000) return `${(raw / 1_000_000).toFixed(1)}M`;
  if (raw >= 1_000) return `${(raw / 1_000).toFixed(1)}K`;
  return String(raw);
}

function formatDuration(totalSeconds: number): string {
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
    views: formatViews(row.views_raw),
    viewsRaw: row.views_raw,
    likes: row.likes ?? undefined,
    comments: row.comments ?? undefined,
    shares: row.shares ?? undefined,
    tags: row.tags,
    saved: false,
    used: false,
    duration: formatDuration(row.duration_sec),
    durationSec: row.duration_sec,
    postedDaysAgo: row.posted_days_ago ?? undefined,
  };
}
