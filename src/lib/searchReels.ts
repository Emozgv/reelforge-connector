import { supabase } from "./supabase";
import type { Platform, ReelVideo } from "../types";

export interface SearchReelsResult {
  results: ReelVideo[];
  error?: string;
}

async function invokeSearchReels(body: Record<string, unknown>): Promise<SearchReelsResult> {
  const { data, error } = await supabase.functions.invoke<{ results?: ReelVideo[]; error?: string }>(
    "search-reels",
    { body }
  );

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
  return { results: data?.results ?? [] };
}

// Only "tiktok" is wired to a real source right now — the search-reels Edge
// Function rejects anything else. Instagram follows once its TikHub
// endpoints are confirmed (the public docs excerpt didn't expose them).
export async function searchReels(platform: Platform, query: string): Promise<SearchReelsResult> {
  return invokeSearchReels({ platform, mode: "search", query, count: 24 });
}

// Profile-based research: fetch a public creator's own recent reels instead
// of a keyword search. Independent of the niche search endpoint, so it
// keeps working even while TikHub's search endpoint specifically is unstable.
export async function fetchProfileReels(platform: Platform, username: string): Promise<SearchReelsResult> {
  return invokeSearchReels({ platform, mode: "profile", query: username, count: 24 });
}
