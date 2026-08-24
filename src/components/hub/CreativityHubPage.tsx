import { useEffect, useMemo, useState } from "react";
import { Search, Shuffle, RefreshCw, Bookmark, SlidersHorizontal, Info, CloudOff, ChevronDown, Loader2 } from "lucide-react";
import { searchReels, fetchProfileReels, fetchMoreProfileReels } from "../../lib/searchReels";
import type { Creator, Platform, ReelProfileInfo, ReelVideo } from "../../types";
import type { CollectionsStore } from "../../state/useCollectionsStore";
import { CreatorSelector } from "./CreatorSelector";
import { FilterDrawer } from "./FilterDrawer";
import { HeroReelRails } from "./HeroReelRail";
import { StarfieldBackground } from "../shared/StarfieldBackground";
import { RotatingMicrocopy } from "./RotatingMicrocopy";
import { SavedCollectionsPopover } from "./SavedCollectionsPopover";
import { SavePanel } from "./SavePanel";
import { VideoGrid } from "./VideoGrid";
import { ProfilePlatformDropdown } from "./ProfilePlatformDropdown";
import { ProfileHeader } from "./ProfileHeader";
import { ReelDetailModal } from "./ReelDetailModal";
import { DEFAULT_FILTERS, countActiveFilters, type HubFilters } from "./filterTypes";

const NICHE_CHIPS = [
  "Cute blonde girl",
  "Golf lifestyle",
  "Gym POV",
  "Talking storytime",
  "Beach aesthetic",
  "Golden hour",
];

export function CreativityHubPage({
  creators,
  creatorsError,
  collectionsStore,
  onOpenCollection,
  active = true,
}: {
  creators: Creator[];
  creatorsError?: string | null;
  collectionsStore: CollectionsStore;
  onOpenCollection: (collectionId: string) => void;
  // False while this page is kept mounted but hidden behind another route —
  // only used to pause any playing reel video, never to reset state.
  active?: boolean;
}) {
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(creators[0] ?? null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [videos, setVideos] = useState<ReelVideo[]>([]);
  // Kept fully independent per button — sharing one flag made both icons
  // spin no matter which button was actually clicked.
  const [refreshSpinning, setRefreshSpinning] = useState(false);
  const [shuffleSpinning, setShuffleSpinning] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [platformNotice, setPlatformNotice] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<{ kind: "search" | "profile"; value: string } | null>(null);
  const [profileHandle, setProfileHandle] = useState("");
  const [profilePlatform, setProfilePlatform] = useState<Platform>("tiktok");
  const [profile, setProfile] = useState<ReelProfileInfo | null>(null);
  const [profileSecUid, setProfileSecUid] = useState<string | null>(null);
  const [profileCursor, setProfileCursor] = useState<string | null>(null);
  const [profileHasMore, setProfileHasMore] = useState(false);
  const [searchCursor, setSearchCursor] = useState<string | null>(null);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters, setFilters] = useState<HubFilters>(DEFAULT_FILTERS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [savePanelVideo, setSavePanelVideo] = useState<ReelVideo | null>(null);
  const [savedPopoverOpen, setSavedPopoverOpen] = useState(false);
  const [detailVideoId, setDetailVideoId] = useState<string | null>(null);

  useEffect(() => {
    if (!creators.some((c) => c.id === selectedCreator?.id)) {
      setSelectedCreator(creators[0] ?? null);
    }
  }, [creators, selectedCreator]);

  // Real persisted count for the selected creator — how many concepts across
  // all their collections, not just the mock feed's local "saved" flag.
  const savedCount = collectionsStore.collections
    .filter((c) => c.creatorId === selectedCreator?.id)
    .reduce((sum, c) => sum + c.concepts.length, 0);
  const savedCountLabel = savedCount > 99 ? "99+" : String(savedCount);
  const activeFilterCount = countActiveFilters(filters);

  const filtered = useMemo(() => {
    let list = videos.filter((v) => {
      if (filters.platform !== "all" && v.platform !== filters.platform) return false;
      if (filters.length === "0-5" && !(v.durationSec <= 5)) return false;
      if (filters.length === "6-9" && !(v.durationSec >= 6 && v.durationSec <= 9)) return false;
      if (filters.length === "10-12" && !(v.durationSec >= 10 && v.durationSec <= 12)) return false;
      // Undefined (not analyzed yet) is "unknown" — it matches neither side
      // of a talking/non-talking filter, rather than defaulting to one.
      if (filters.talking === "talking" && v.talking !== true) return false;
      if (filters.talking === "nontalking" && v.talking !== false) return false;
      if (filters.aiFriendly && !v.aiReady) return false;
      if (filters.difficulty !== "any" && v.difficulty !== filters.difficulty) return false;
      if (filters.setting !== "any" && v.setting !== filters.setting) return false;
      if (filters.contentStyle !== "any" && v.contentStyle !== filters.contentStyle) return false;
      if (filters.creatorFit === "high" && !(v.creatorFit !== undefined && v.creatorFit >= 80)) return false;
      if (filters.creatorFit === "medium" && !(v.creatorFit !== undefined && v.creatorFit >= 50)) return false;
      if (filters.used === "used" && !v.used) return false;
      if (filters.used === "unused" && v.used) return false;
      if (filters.savedState === "saved" && !v.saved) return false;
      if (filters.savedState === "unsaved" && v.saved) return false;
      if (filters.language !== "any" && v.language !== filters.language) return false;
      if (filters.views === "10k" && v.viewsRaw < 10000) return false;
      if (filters.views === "50k" && v.viewsRaw < 50000) return false;
      if (filters.views === "100k" && v.viewsRaw < 100000) return false;
      return true;
    });

    if (filters.sort === "recent") {
      list = [...list].sort((a, b) => (a.postedDaysAgo ?? Infinity) - (b.postedDaysAgo ?? Infinity));
    } else if (filters.sort === "trending") {
      list = [...list].sort((a, b) => Number(!!b.trending) - Number(!!a.trending) || b.viewsRaw - a.viewsRaw);
    }

    return list;
  }, [videos, filters]);

  // Gallery position within the currently displayed grid — derived from the
  // live `filtered` list (not a frozen snapshot) so the modal's saved state
  // and prev/next boundaries always match what's actually on screen.
  const detailIndex = filtered.findIndex((v) => v.id === detailVideoId);
  const detailVideo = detailIndex >= 0 ? filtered[detailIndex] : null;

  // Shared by both research modes — one gives real videos or a provider
  // error, the caller decides what "success" means for its own UI copy.
  async function loadVideos(
    fetcher: () => Promise<{
      results: ReelVideo[];
      error?: string;
      profile?: ReelProfileInfo;
      secUid?: string;
      cursor?: string;
      hasMore?: boolean;
    }>,
    opts?: { isProfile?: boolean; isSearch?: boolean }
  ) {
    setSearching(true);
    setSearchError(false);
    const res = await fetcher();
    // Every failure from a real call today is the provider, not us — show one
    // calm, on-brand message rather than the raw provider error text, so an
    // upstream outage never makes the page itself look broken. The raw reason
    // still goes to the console for us to debug, never to the client UI.
    if (res.error) {
      console.error("[search-reels] provider error:", res.error);
      setSearchError(true);
      setVideos([]);
      if (opts?.isProfile) {
        setProfile(null);
        setProfileSecUid(null);
        setProfileCursor(null);
        setProfileHasMore(false);
      }
      if (opts?.isSearch) {
        setSearchCursor(null);
        setSearchHasMore(false);
      }
    } else {
      setSearchError(false);
      setVideos(res.results);
      if (opts?.isProfile) {
        setProfile(res.profile ?? null);
        setProfileSecUid(res.secUid ?? null);
        setProfileCursor(res.cursor ?? null);
        setProfileHasMore(!!res.hasMore);
      }
      if (opts?.isSearch) {
        setSearchCursor(res.cursor ?? null);
        setSearchHasMore(!!res.hasMore);
      }
    }
    setSearching(false);
  }

  // `cursorOverride` is only passed by Refresh, to advance to a fresh batch
  // of the same keyword instead of re-fetching page 1. `platformOverride` is
  // only passed by the platform pill's own click handler — reading straight
  // off the just-clicked value avoids a stale-state race with setFilters.
  async function runSearch(q: string, cursorOverride?: string, platformOverride?: "all" | Platform) {
    const trimmed = q.trim();
    if (!trimmed) return;
    const platform = platformOverride ?? filters.platform;
    setPlatformNotice(null);
    setLastAction({ kind: "search", value: trimmed });
    setProfile(null);
    setProfileSecUid(null);
    setProfileCursor(null);
    setProfileHasMore(false);
    await loadVideos(() => searchReels(platform, trimmed, cursorOverride), { isSearch: true });
  }

  // Profile-based research: a public creator's own recent reels, independent
  // of the keyword search endpoint.
  async function runProfileLookup(handle: string) {
    const trimmed = handle.trim();
    if (!trimmed) return;
    setPlatformNotice(null);
    setLastAction({ kind: "profile", value: trimmed });
    await loadVideos(() => fetchProfileReels(profilePlatform, trimmed), { isProfile: true });
  }

  // Fetches the next page of the same creator's reels and appends them —
  // fast first batch on lookup, then the user pulls in more only as needed.
  async function loadMoreProfileVideos() {
    if (!profileSecUid || !profileCursor || !profileHasMore || loadingMore) return;
    setLoadingMore(true);
    const { results, error, cursor, hasMore } = await fetchMoreProfileReels(
      profilePlatform,
      profileSecUid,
      profileCursor
    );
    if (error) {
      console.error("[search-reels] provider error (load more):", error);
      setProfileHasMore(false);
    } else {
      // TikHub's cursor can land back on the last item of the previous page —
      // drop anything we've already got rather than showing/saving a duplicate.
      let addedCount = 0;
      setVideos((prev) => {
        const seen = new Set(prev.map((v) => v.id));
        const fresh = results.filter((v) => !seen.has(v.id));
        addedCount = fresh.length;
        return [...prev, ...fresh];
      });
      // A cursor that isn't advancing and returns nothing new is effectively
      // the end, even if the provider still claims hasMore — stop rather than
      // let "Load more" spin forever on a stuck page.
      const stuck = addedCount === 0 && (cursor ?? null) === profileCursor;
      setProfileCursor(cursor ?? null);
      setProfileHasMore(!!hasMore && !stuck);
    }
    setLoadingMore(false);
  }

  // Re-runs whatever's currently open — used only by the outage card's Retry,
  // which needs to actually retry the failed fetch, not reset the Hub.
  function retryLastAction() {
    if (!lastAction) return;
    void (lastAction.kind === "search" ? runSearch(lastAction.value) : runProfileLookup(lastAction.value));
  }

  // Refresh: unconditionally resets the Hub back to its default home
  // state — clears the active keyword/profile and every result, regardless
  // of what's currently open. It never re-fetches a batch of the same topic
  // (that's Shuffle's job, entirely separate below).
  function handleRefresh() {
    setRefreshSpinning(true);
    setLastAction(null);
    setVideos([]);
    setSearchError(false);
    setPlatformNotice(null);
    setQuery("");
    setProfileHandle("");
    setProfile(null);
    setProfileSecUid(null);
    setProfileCursor(null);
    setProfileHasMore(false);
    setSearchCursor(null);
    setSearchHasMore(false);
    setDetailVideoId(null);
    window.setTimeout(() => setRefreshSpinning(false), 280);
  }

  // Shuffle: keeps the active keyword/profile exactly as-is and swaps in a
  // DIFFERENT batch for it — the next cursor page of the same search
  // keyword or the same profile, never the identical results twice in a
  // row, and never resetting the Hub (that's Refresh's job, above). From
  // home (no active search) it shuffles in a fresh random niche instead.
  function handleShuffle() {
    if (lastAction?.kind === "search") {
      setShuffleSpinning(true);
      setDetailVideoId(null);
      void runSearch(lastAction.value, searchHasMore ? (searchCursor ?? undefined) : undefined).finally(() =>
        setShuffleSpinning(false)
      );
      return;
    }
    if (lastAction?.kind === "profile") {
      setShuffleSpinning(true);
      setDetailVideoId(null);
      if (profileSecUid && profileHasMore && profileCursor) {
        void (async () => {
          setSearching(true);
          const { results, error, cursor, hasMore } = await fetchMoreProfileReels(
            profilePlatform,
            profileSecUid,
            profileCursor
          );
          if (error) {
            console.error("[search-reels] provider error (shuffle):", error);
            setSearchError(true);
          } else {
            setVideos(results);
            setProfileCursor(cursor ?? null);
            setProfileHasMore(!!hasMore);
          }
          setSearching(false);
          setShuffleSpinning(false);
        })();
      } else {
        // Pagination exhausted (or no cursor yet) — the only "fresh" batch
        // left is the same profile's first page again.
        void runProfileLookup(lastAction.value).finally(() => setShuffleSpinning(false));
      }
      return;
    }
    const next = NICHE_CHIPS[Math.floor(Math.random() * NICHE_CHIPS.length)];
    setQuery(next);
    setShuffleSpinning(true);
    void runSearch(next).finally(() => setShuffleSpinning(false));
  }

  function markSaved(id: string) {
    setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, saved: true } : v)));
  }

  function handleSaveClick(video: ReelVideo) {
    if (video.saved) {
      setVideos((prev) => prev.map((v) => (v.id === video.id ? { ...v, saved: false } : v)));
    } else {
      setSavePanelVideo(video);
    }
  }

  // One-click save straight into the selected creator's "Quick Saves"
  // collection — no picker. Same target collection the SavePanel's own
  // Quick Save button writes to, just without a UI in between.
  function quickSaveVideo(video: ReelVideo) {
    markSaved(video.id);
    const quickSaves = collectionsStore.collections.find(
      (c) => c.creatorId === selectedCreator?.id && c.name === "Quick Saves"
    );
    if (quickSaves) {
      void collectionsStore.addVideoToCollection(quickSaves.id, video);
    } else if (selectedCreator) {
      void collectionsStore.createCollection("Quick Saves", selectedCreator.id, "", video);
    }
  }

  // The detail modal's Save button is a direct Quick Save (fast, gallery-like
  // browsing) — only an already-saved video still needs the instant toggle-off.
  function handleDetailSaveClick(video: ReelVideo) {
    if (video.saved) {
      handleSaveClick(video);
    } else {
      quickSaveVideo(video);
    }
  }

  if (!selectedCreator) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-sm">
          {creatorsError ? (
            <>
              <p className="text-[14px] text-neutral-300">Couldn't load Creators.</p>
              <p className="mt-1.5 text-[12px] text-neutral-500">{creatorsError}</p>
            </>
          ) : (
            <>
              <p className="text-[14px] text-neutral-300">Add a Creator to start discovering concepts.</p>
              <p className="mt-1.5 text-[12px] text-neutral-500">Go to Creators → New Creator.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* hero */}
      <div className="relative overflow-hidden px-10 xl:px-16 2xl:px-24 pt-16 pb-12 bg-[#020508]">
        <StarfieldBackground starCount={34} />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(720px 340px at 50% -20%, rgba(224,164,79,0.15), transparent 65%)",
          }}
        />
        <HeroReelRails />

        <div className="relative z-10 max-w-3xl xl:max-w-4xl 2xl:max-w-5xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2.5 mb-3">
            <span className="h-px w-5 bg-gradient-to-r from-transparent to-[#D39448]/60" />
            <span className="text-[11px] tracking-[0.22em] uppercase text-[#D39448]/85 font-medium">
              Creativity Hub
            </span>
            <span className="h-px w-5 bg-gradient-to-l from-transparent to-[#D39448]/60" />
          </div>
          <h1 className="text-[42px] leading-[1.08] font-hub-hero font-medium text-neutral-50">
            Discover your next{" "}
            <span className="text-gradient-warm">winning concept</span>
          </h1>
          <p className="mt-3.5 text-[15px] text-neutral-400">
            Curated Reels and TikToks, organized for{" "}
            <span className="text-[#D39448] font-medium">{selectedCreator.name}</span>
          </p>

          <div className="mt-8 relative max-w-xl mx-auto">
            <div
              className={[
                "relative flex items-center rounded-2xl transition-all duration-300",
                focused ? "glow-ring bg-white/[0.05]" : "glass-panel",
              ].join(" ")}
            >
              <Search size={17} className="absolute left-[18px] text-neutral-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runSearch(query);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder='Search concepts, e.g. "cute blonde girl" — press Enter'
                className="w-full h-[54px] pl-12 pr-4 bg-transparent text-[15px] text-neutral-100 placeholder:text-neutral-500 outline-none"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {NICHE_CHIPS.map((chip, i) => (
              <button
                key={chip}
                onClick={() => {
                  setQuery(chip);
                  void runSearch(chip);
                }}
                className="animate-chip-drift text-[12px] px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] text-neutral-400 hover:text-[#D39448] hover:border-[#D39448]/30 hover:bg-[#D39448]/[0.06] transition-colors"
                style={{
                  animationDelay: `${i * 420}ms`,
                  animationDuration: `${4.6 + i * 0.35}s`,
                }}
              >
                {chip}
              </button>
            ))}
          </div>

          <RotatingMicrocopy />
        </div>

        <div className="shimmer-divider absolute bottom-0 left-0 right-0" />
      </div>

      {/* toolbar */}
      <div className="max-w-[1400px] xl:max-w-[1650px] 2xl:max-w-[1900px] mx-auto px-10 xl:px-16 2xl:px-24 pt-7">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <CreatorSelector creators={creators} selected={selectedCreator} onSelect={setSelectedCreator} />

            <div className="flex items-center h-11 p-1 rounded-full glass-panel">
              {(["instagram", "tiktok", "all"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setFilters((f) => ({ ...f, platform: p }));
                    // Only a keyword search actually queries a provider by
                    // platform — re-run it with the freshly picked one.
                    // Profile mode has its own separate platform dropdown,
                    // so this pill doesn't touch it.
                    if (lastAction?.kind === "search") void runSearch(lastAction.value, undefined, p);
                  }}
                  className={[
                    "h-9 px-4 rounded-full text-[13px] capitalize transition-all duration-200",
                    filters.platform === p
                      ? "bg-[#D39448]/15 text-[#D39448] shadow-[inset_0_0_0_1px_rgba(211,148,72,0.35)]"
                      : "text-neutral-500 hover:text-neutral-300",
                  ].join(" ")}
                >
                  {p === "all" ? "All" : p}
                </button>
              ))}
            </div>
          </div>

          {/* profile-based research — a public creator's own reels, independent
              of (and a fallback for) the keyword search above */}
          <div className="flex-1 min-w-[240px] max-w-sm flex items-center gap-1.5 h-11 pl-1.5 pr-3.5 rounded-full glass-panel">
            <ProfilePlatformDropdown value={profilePlatform} onChange={setProfilePlatform} />
            <input
              value={profileHandle}
              onChange={(e) => setProfileHandle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runProfileLookup(profileHandle);
              }}
              placeholder="Browse a public profile — @username"
              className="flex-1 min-w-0 bg-transparent text-[12.5px] text-neutral-200 placeholder:text-neutral-500 outline-none"
            />
            <button
              onClick={() => void runProfileLookup(profileHandle)}
              disabled={!profileHandle.trim() || searching}
              className="shrink-0 text-[11.5px] font-medium text-[#D39448] hover:brightness-110 transition-[filter] disabled:opacity-40"
            >
              Browse
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setSavedPopoverOpen(true)}
              title="See everything saved for this creator"
              className="flex items-center gap-1.5 h-11 px-4 rounded-full glass-panel hover:bg-white/[0.06] transition-colors text-[13px] text-neutral-300"
            >
              <Bookmark size={13} className="text-[#D39448]" />
              <span className="tabular-nums text-neutral-100">{savedCountLabel}</span> saved
            </button>

            <button
              onClick={handleRefresh}
              disabled={searching}
              title="Refresh — back to the Hub home"
              className="flex items-center justify-center w-11 h-11 rounded-full glass-panel hover:bg-white/[0.06] transition-colors text-neutral-300 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <RefreshCw size={15} className={refreshSpinning ? "animate-spin" : ""} />
            </button>

            <button
              onClick={handleShuffle}
              disabled={searching}
              title={lastAction ? "Shuffle — fresh batch, same topic" : "Shuffle in a fresh niche"}
              className="flex items-center justify-center w-11 h-11 rounded-full glass-panel hover:bg-white/[0.06] transition-colors text-neutral-300 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <Shuffle size={15} className={shuffleSpinning ? "animate-spin" : ""} />
            </button>

            <button
              onClick={() => setDrawerOpen(true)}
              className="relative flex items-center gap-2 h-11 px-4 rounded-full glass-panel hover:bg-white/[0.06] transition-colors text-[13px] text-neutral-300"
            >
              <SlidersHorizontal size={14} />
              Filters
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#D39448] text-[#020508] text-[10px] font-semibold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {platformNotice && (
          <div className="mb-5 flex items-center gap-2 rounded-xl surface-panel px-4 py-3 text-[12.5px] text-neutral-400">
            <Info size={14} className="shrink-0 text-neutral-500" />
            {platformNotice}
          </div>
        )}

        {searchError ? (
          <div className="flex flex-col items-center justify-center text-center rounded-xl surface-panel py-24">
            <CloudOff size={20} className="text-neutral-700 mb-2.5" />
            <p className="text-[14.5px] font-serif text-neutral-300">Research is taking a short timeout.</p>
            <p className="text-[12px] text-neutral-600 mt-1.5 max-w-sm">
              One of our external data providers is currently unavailable. Everything inside ReelForge is running
              normally.
            </p>
            <button
              onClick={retryLastAction}
              disabled={searching || !lastAction}
              className="mt-5 flex items-center gap-2 h-9 px-4 rounded-full surface-panel hover:bg-white/[0.06] transition-colors text-[12.5px] text-neutral-300 disabled:opacity-50"
            >
              <Shuffle size={13} className={searching ? "animate-spin" : ""} />
              Retry
            </button>
          </div>
        ) : (
          <>
            {lastAction?.kind === "profile" && profile && <ProfileHeader profile={profile} />}

            <VideoGrid
              videos={filtered}
              onSaveClick={handleSaveClick}
              onAddToCollection={setSavePanelVideo}
              onOpenDetail={(video) => setDetailVideoId(video.id)}
              spacious
              emptyTitle={
                searching
                  ? lastAction?.kind === "profile"
                    ? `Loading @${lastAction.value.replace(/^@/, "")}'s reels…`
                    : "Searching…"
                  : lastAction
                    ? "No results found."
                    : "Search a niche, or browse a public profile above."
              }
              emptyHint={
                searching
                  ? "Pulling fresh results."
                  : lastAction?.kind === "profile"
                    ? "Double-check the username, or try a different public profile."
                    : lastAction
                      ? "Try a different keyword, or press Refresh for a new batch."
                      : 'Try one of the suggestions, or type your own — e.g. "cute blonde girl".'
              }
            />

            {lastAction?.kind === "profile" && filtered.length > 0 && profileHasMore && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={() => void loadMoreProfileVideos()}
                  disabled={loadingMore}
                  className="flex items-center gap-2 h-10 px-5 rounded-full glass-panel hover:bg-white/[0.06] transition-colors text-[13px] text-neutral-300 disabled:opacity-60"
                >
                  {loadingMore ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                  {loadingMore ? "Loading more…" : "Load more reels"}
                </button>
              </div>
            )}
          </>
        )}

        <div className="h-10" />
      </div>

      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        onChange={setFilters}
      />

      <SavePanel
        open={!!savePanelVideo}
        video={savePanelVideo}
        creators={creators}
        defaultCreatorId={selectedCreator.id}
        collections={collectionsStore.collections}
        onClose={() => setSavePanelVideo(null)}
        onQuickSave={(note, creatorOverrideId) => {
          if (!savePanelVideo) return;
          markSaved(savePanelVideo.id);
          const targetCreatorId = creatorOverrideId ?? selectedCreator.id;
          const quickSaves = collectionsStore.collections.find(
            (c) => c.creatorId === targetCreatorId && c.name === "Quick Saves"
          );
          if (quickSaves) {
            void collectionsStore.addVideoToCollection(quickSaves.id, savePanelVideo, note);
          } else {
            void collectionsStore.createCollection("Quick Saves", targetCreatorId, "", savePanelVideo, note);
          }
        }}
        onSaveToCollection={(collectionId, note) => {
          if (!savePanelVideo) return;
          markSaved(savePanelVideo.id);
          void collectionsStore.addVideoToCollection(collectionId, savePanelVideo, note);
        }}
        onCreateCollection={(name, note, creatorOverrideId) => {
          if (!savePanelVideo) return;
          markSaved(savePanelVideo.id);
          const targetCreatorId = creatorOverrideId ?? selectedCreator.id;
          void collectionsStore.createCollection(name, targetCreatorId, "", savePanelVideo, note);
        }}
      />

      <SavedCollectionsPopover
        open={savedPopoverOpen}
        creator={selectedCreator}
        collections={collectionsStore.collections}
        onClose={() => setSavedPopoverOpen(false)}
        onOpenCollection={onOpenCollection}
        onCreateNextVersion={async (collectionId) => {
          const result = await collectionsStore.createNextVersion(collectionId);
          return result.id;
        }}
      />

      <ReelDetailModal
        video={detailVideo}
        open={!!detailVideoId}
        creator={selectedCreator}
        onClose={() => setDetailVideoId(null)}
        onSaveClick={handleDetailSaveClick}
        onAddToCollection={(video) => {
          setSavePanelVideo(video);
          setDetailVideoId(null);
        }}
        onPrev={() => {
          if (detailIndex > 0) setDetailVideoId(filtered[detailIndex - 1].id);
        }}
        onNext={() => {
          if (detailIndex >= 0 && detailIndex < filtered.length - 1) setDetailVideoId(filtered[detailIndex + 1].id);
        }}
        hasPrev={detailIndex > 0}
        hasNext={detailIndex >= 0 && detailIndex < filtered.length - 1}
        active={active}
      />
    </div>
  );
}
