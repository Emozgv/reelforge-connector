import { supabase } from "./supabase";
import type { Platform, ReelProfileInfo, ReelVideo } from "../types";

// How many reels to request per page of a profile lookup — fast first batch,
// then the same size again on each "Load more" rather than preloading everything.
export const PROFILE_PAGE_SIZE = 24;

export interface SearchReelsResult {
  results: ReelVideo[];
  error?: string;
  // Only present for "profile" mode — the creator's real, provider-reported
  // stats and the pagination handle for fetching further pages.
  profile?: ReelProfileInfo;
  secUid?: string;
  cursor?: string;
  hasMore?: boolean;
  // Instagram profile mode only — set when the provider couldn't retrieve
  // this profile's reels after real retries and a fallback source, distinct
  // from a profile that genuinely just has zero reels (results is empty
  // either way, but this flag says which case it is).
  reelsUnavailable?: boolean;
  // Instagram profile mode only — true when `results` is real but the server
  // stopped backfilling early because of an actual provider failure (not
  // because the profile ran out of reels). Distinct from reelsUnavailable:
  // this batch is NOT empty, just possibly short — never silently presented
  // as a complete result.
  partial?: boolean;
}

interface RawSearchReelsResponse {
  results?: ReelVideo[];
  error?: string;
  profile?: ReelProfileInfo;
  secUid?: string;
  cursor?: string;
  hasMore?: boolean;
  reelsUnavailable?: boolean;
  partial?: boolean;
}

async function invokeSearchReels(body: Record<string, unknown>): Promise<SearchReelsResult> {
  const { data, error } = await supabase.functions.invoke<RawSearchReelsResponse>("search-reels", { body });

  if (error) {
    // supabase-js's default error.message is a generic "non-2xx status code"
    // — the actual reason we send back is in the response body instead.
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      try {
        const responseBody = await context.clone().json();
        if (typeof responseBody?.error === "string") return { results: [], error: responseBody.error };
      } catch {
        // fall through to the generic message below
      }
    }
    return { results: [], error: error.message };
  }
  if (data?.error) {
    return { results: [], error: data.error };
  }
  return {
    results: data?.results ?? [],
    profile: data?.profile,
    secUid: data?.secUid,
    cursor: data?.cursor,
    hasMore: data?.hasMore,
    reelsUnavailable: data?.reelsUnavailable,
    partial: data?.partial,
  };
}

// TikTok and Instagram are both real, plus "all" — a merged, interleaved
// search of both providers at once, each with its own pagination cursor
// tracked server-side inside one opaque compound cursor string.
// `cursor` lets a Refresh on an already-active keyword search request a
// fresh batch (each provider's own next-page offset/token) instead of
// re-fetching page 1.
export async function searchReels(
  platform: "all" | Platform,
  query: string,
  cursor?: string
): Promise<SearchReelsResult> {
  return invokeSearchReels({ platform, mode: "search", query, count: 24, cursor });
}

// Profile-based research, page 1: fetch a public creator's own recent reels
// plus their real profile stats. Independent of the niche search endpoint,
// so it keeps working even while TikHub's search endpoint is unstable.
export async function fetchProfileReels(platform: Platform, username: string): Promise<SearchReelsResult> {
  return invokeSearchReels({ platform, mode: "profile", query: username, count: PROFILE_PAGE_SIZE });
}

// Next page of the same profile's reels — needs the secUid + cursor handed
// back from fetchProfileReels (or a previous call to this), so it skips
// re-resolving the profile.
export async function fetchMoreProfileReels(
  platform: Platform,
  secUid: string,
  cursor: string
): Promise<SearchReelsResult> {
  return invokeSearchReels({ platform, mode: "profile_more", secUid, cursor, count: PROFILE_PAGE_SIZE });
}

// Re-resolves one already-saved Collection concept into a fresh, currently
// playable ReelVideo, by its original share URL — a saved concept never has
// its own play_addr persisted (signed CDN URLs expire), so opening it for
// playback always asks TikHub for a live one instead.
export async function resolveReelVideo(platform: Platform, sourceUrl: string): Promise<SearchReelsResult> {
  return invokeSearchReels({ platform, mode: "resolve", query: sourceUrl });
}
