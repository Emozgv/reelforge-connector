import { supabase } from "./supabase";
import type { Platform, ReelProfileInfo, ReelVideo } from "../types";

// How many reels to request per page of a profile lookup — fast first batch,
// then the same size again on each "Load more" rather than preloading everything.
export const PROFILE_PAGE_SIZE = 18;

export interface SearchReelsResult {
  results: ReelVideo[];
  error?: string;
  // Only present for "profile" mode — the creator's real, provider-reported
  // stats and the pagination handle for fetching further pages.
  profile?: ReelProfileInfo;
  secUid?: string;
  cursor?: string;
  hasMore?: boolean;
}

interface RawSearchReelsResponse {
  results?: ReelVideo[];
  error?: string;
  profile?: ReelProfileInfo;
  secUid?: string;
  cursor?: string;
  hasMore?: boolean;
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
  };
}

// Only "tiktok" is wired to a real source right now — the search-reels Edge
// Function rejects anything else. Instagram follows once its TikHub
// endpoints are confirmed (the public docs excerpt didn't expose them).
export async function searchReels(platform: Platform, query: string): Promise<SearchReelsResult> {
  return invokeSearchReels({ platform, mode: "search", query, count: 24 });
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
