import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Shuffle, RefreshCw, Bookmark, SlidersHorizontal, Info, CloudOff, ChevronDown, Loader2 } from "lucide-react";
import { searchReels, fetchProfileReels, fetchMoreProfileReels } from "../../lib/searchReels";
import { classifyContentStyle } from "../../lib/contentStyleClassifier";
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

// Local, page-scoped copies of the Dashboard's now-frozen surface language
// (see DashboardPage.tsx's PANEL/CARD) — duplicated rather than imported so
// the frozen Dashboard file stays completely untouched. Deliberately NOT
// applied to any shared sub-component (VideoGrid, SavePanel, CreatorSelector,
// etc.) since those are also used by the frozen Research Accounts page.
const HUB_PANEL_STYLE: React.CSSProperties = {
  background: "linear-gradient(180deg, #070707, #020202)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035), inset 0 0 0 1px rgba(0,0,0,0.4), 0 16px 32px -18px rgba(0,0,0,0.8)",
};
const HUB_CARD_BORDER = "#202024";
const HUB_CARD_STYLE: React.CSSProperties = {
  background: "#111114",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), 0 6px 14px -10px rgba(0,0,0,0.6)",
};

// The Hub is an OFM research workspace, not a general social search box —
// these are the default entry points, and their specificity matters more
// than it looks. A bare word like "gym" or "beach" is broad enough to pull
// in ads, coaching sales pitches, and pro-athlete highlight clips alongside
// the real creator content (confirmed by inspecting live results before
// writing this list). A phrase that names an actual creator-format hook
// ("get ready with me", "boyfriend does my makeup") searches far more
// narrowly and came back dramatically more relevant in the same testing.
//
// The litmus test for anything on this list: would an OFM agency actually
// save this as an idea because it could be RECREATED as entertaining
// creator content? A demographic/aesthetic label ("cute blonde girl",
// "beach aesthetic", "golden hour") or a bare lifestyle topic ("life
// update", "travel diary", "apartment tour") fails that test — there's no
// hook or scene to adapt, just a vibe or a category. A format, POV,
// reaction, prank, confession, ranking, or story beat passes it, because
// it's a repeatable bit any creator (a woman, a man, a couple, friends) can
// actually shoot. So the chips lean entirely on named, adaptable formats
// across the angles an OFM team actually works in: hooks/POVs, beauty,
// fitness, dating/couple dynamics, talking/confession content, fashion,
// and relatable situational comedy. Six are shown at a time, randomly
// sampled from this pool on load and on Refresh, so the entry points
// themselves feel fresh across visits instead of the same six forever.
const NICHE_CHIP_POOL = [
  "Get ready with me",
  "Boyfriend does my makeup",
  "Couple morning routine",
  "Storytime confession",
  "Rant to camera",
  "Boyfriend prank",
  "First date POV",
  "Home workout POV",
  "Makeup transformation",
  "Outfit try-on haul",
  "A day in my life",
  "Talking storytime",
  "Rating my exes",
  "POV: red flag or not",
  "Reacting to old photos",
  "Guess my age challenge",
  "Would you rather with my partner",
  "Ranking my green flags",
  "Partner reacts to my ex",
  "Telling my most embarrassing story",
  "POV: the text that changed everything",
  "Couple does a task swap",
  "Rating strangers' outfits, no judgment",
  "Confessing my most toxic trait",
  "Recreating our first date",
  "POV: coworker walks in",
  "Worst date storytime",
  "Golf trick shot fails",
  "Girl math explained",
  "Couple reveals who's more toxic",
];

function pickRandomChips(pool: string[], count: number): string[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// The grid's intended size for one keyword-search batch — kept as one named
// constant so the freshness/backfill logic below and the request itself
// (searchReels always asks for 24) can't silently drift apart.
const DISCOVERY_BATCH_SIZE = 24;
// How many extra server round-trips runSearch is allowed to make, beyond
// the first, to backfill past videos this session has already shown for the
// same platform+keyword — bounded so a heavily-repeated search/Shuffle can't
// chain into a long wait; a smaller-than-24 batch is an acceptable, honest
// outcome once this cap is hit rather than forcing more requests.
const MAX_FRESHNESS_ROUNDS = 2;

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
  const [displayedChips, setDisplayedChips] = useState<string[]>(() => pickRandomChips(NICHE_CHIP_POOL, 6));
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
  // True only when TikHub genuinely couldn't retrieve this profile's reels
  // (after real retries and a fallback source) — distinct from a profile
  // that just has zero reels, which stays false with an empty `videos`.
  const [profileReelsUnavailable, setProfileReelsUnavailable] = useState(false);
  // True when `videos` is real but incomplete because the server stopped
  // backfilling early after a genuine provider failure — never silently
  // presented as if it were the whole batch.
  const [profileResultsPartial, setProfileResultsPartial] = useState(false);
  const [searchCursor, setSearchCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters, setFilters] = useState<HubFilters>(DEFAULT_FILTERS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [savePanelVideo, setSavePanelVideo] = useState<ReelVideo | null>(null);
  const [savedPopoverOpen, setSavedPopoverOpen] = useState(false);
  const [detailVideoId, setDetailVideoId] = useState<string | null>(null);
  // Ids already shown this session, per "platform:query" key — lets a fresh
  // search or Shuffle on the same keyword silently skip past videos the user
  // has already seen instead of re-showing them, without needing any server-
  // side session state. Cleared only on Refresh (see handleRefresh below);
  // switching keywords or platforms just starts a new, empty key.
  const seenIdsRef = useRef<Map<string, Set<string>>>(new Map());
  // Bumped at the start of every fetch that can replace `videos` (runSearch,
  // loadVideos, and the profile Shuffle branch below). A search/Shuffle can
  // take a few real seconds now that the loading state is meant to stay
  // visible that whole time — long enough that a user can fire a second
  // search before the first resolves (new keyword, another chip, Shuffle
  // again). Without this, an OLDER request resolving AFTER a newer one would
  // silently overwrite the newer results, or flip `searching` back to false
  // early — both look identical to "old results came back" from the user's
  // side. Each fetch captures its own id and only commits `videos`/
  // `searching`/etc. if it's still the most recent one by the time it
  // resolves; a superseded request's response is discarded outright.
  const requestIdRef = useRef(0);

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

  // Ground truth for Used/Saved — cross-referenced against every concept
  // already saved anywhere in this workspace (by sourceUrl), not a
  // session-only flag. A video saved last week still shows as Saved today
  // if it resurfaces in a new search or Shuffle.
  const { savedSourceUrls, usedSourceUrls } = useMemo(() => {
    const saved = new Set<string>();
    const used = new Set<string>();
    for (const c of collectionsStore.collections) {
      for (const concept of c.concepts) {
        if (concept.video.sourceUrl) saved.add(concept.video.sourceUrl);
        if (concept.status === "Used" && concept.video.sourceUrl) used.add(concept.video.sourceUrl);
      }
    }
    return { savedSourceUrls: saved, usedSourceUrls: used };
  }, [collectionsStore.collections]);

  const filtered = useMemo(() => {
    let list = videos.filter((v) => {
      if (filters.platform !== "all" && v.platform !== filters.platform) return false;
      if (filters.length === "0-5" && !(v.durationSec <= 5)) return false;
      if (filters.length === "6-9" && !(v.durationSec >= 6 && v.durationSec <= 9)) return false;
      if (filters.length === "10-12" && !(v.durationSec >= 10 && v.durationSec <= 12)) return false;
      if (filters.contentStyle !== "any") {
        const style = v.contentStyle ?? classifyContentStyle(v.caption, v.tags);
        if (style !== filters.contentStyle) return false;
      }
      const isUsed = v.used || usedSourceUrls.has(v.sourceUrl);
      if (filters.used === "used" && !isUsed) return false;
      if (filters.used === "unused" && isUsed) return false;
      const isSaved = v.saved || savedSourceUrls.has(v.sourceUrl);
      if (filters.savedState === "saved" && !isSaved) return false;
      if (filters.savedState === "unsaved" && isSaved) return false;
      if (filters.views === "10k" && v.viewsRaw < 10000) return false;
      if (filters.views === "50k" && v.viewsRaw < 50000) return false;
      if (filters.views === "100k" && v.viewsRaw < 100000) return false;
      return true;
    });

    if (filters.sort === "recent") {
      list = [...list].sort((a, b) => (a.postedDaysAgo ?? Infinity) - (b.postedDaysAgo ?? Infinity));
    } else if (filters.sort === "mostViewed") {
      list = [...list].sort((a, b) => b.viewsRaw - a.viewsRaw);
    }

    return list;
  }, [videos, filters, savedSourceUrls, usedSourceUrls]);

  // Gallery position within the currently displayed grid — derived from the
  // live `filtered` list (not a frozen snapshot) so the modal's saved state
  // and prev/next boundaries always match what's actually on screen.
  const detailIndex = filtered.findIndex((v) => v.id === detailVideoId);
  const detailVideo = detailIndex >= 0 ? filtered[detailIndex] : null;

  // Shared by profile-based research — one gives real videos or a provider
  // error, the caller decides what "success" means for its own UI copy.
  // Keyword search has its own fetch loop (runSearch, below) since it also
  // needs freshness backfill that profile lookup doesn't.
  async function loadVideos(
    fetcher: () => Promise<{
      results: ReelVideo[];
      error?: string;
      profile?: ReelProfileInfo;
      secUid?: string;
      cursor?: string;
      hasMore?: boolean;
      reelsUnavailable?: boolean;
      partial?: boolean;
    }>,
    opts: { isProfile: true }
  ) {
    const requestId = ++requestIdRef.current;
    setSearching(true);
    setSearchError(false);
    if (opts.isProfile) {
      setProfileReelsUnavailable(false);
      setProfileResultsPartial(false);
    }
    const res = await fetcher();
    // A newer search/profile lookup/Shuffle has started since this one was
    // fired — this response is stale, discard it rather than let it
    // overwrite what the user actually asked for next.
    if (requestId !== requestIdRef.current) return;
    // Every failure from a real call today is the provider, not us — show one
    // calm, on-brand message rather than the raw provider error text, so an
    // upstream outage never makes the page itself look broken. The raw reason
    // still goes to the console for us to debug, never to the client UI.
    if (res.error) {
      console.error("[search-reels] provider error:", res.error);
      setSearchError(true);
      setVideos([]);
      setProfile(null);
      setProfileSecUid(null);
      setProfileCursor(null);
      setProfileHasMore(false);
    } else {
      setSearchError(false);
      setVideos(res.results);
      setProfile(res.profile ?? null);
      setProfileSecUid(res.secUid ?? null);
      setProfileCursor(res.cursor ?? null);
      setProfileHasMore(!!res.hasMore);
      setProfileReelsUnavailable(!!res.reelsUnavailable);
      setProfileResultsPartial(!!res.partial);
    }
    setSearching(false);
  }

  function seenIdsFor(key: string): Set<string> {
    let set = seenIdsRef.current.get(key);
    if (!set) {
      set = new Set();
      seenIdsRef.current.set(key, set);
    }
    return set;
  }

  // Keyword search's own fetch loop — separate from loadVideos because it
  // needs to do more than one thing a single fetch can't: skip videos this
  // session has already shown for the same platform+keyword (so a repeated
  // search or a Shuffle never just re-shows the same batch) and, if that
  // skip leaves the batch short, transparently pull another page to
  // backfill it, up to MAX_FRESHNESS_ROUNDS — capped so a heavily-repeated
  // search can't chain into a long wait; landing short of a full batch once
  // that cap is hit is an honest outcome, not a bug to paper over.
  //
  // `cursorOverride` lets Shuffle continue from the last known page instead
  // of restarting at page 1 (though restarting is also safe now — the seen-
  // id filter transparently skips anything already shown either way).
  // `platformOverride` is only passed by the platform pill's own click
  // handler — reading straight off the just-clicked value avoids a stale-
  // state race with setFilters.
  async function runSearch(q: string, cursorOverride?: string, platformOverride?: "all" | Platform) {
    const trimmed = q.trim();
    if (!trimmed) return;
    const requestId = ++requestIdRef.current;
    const platform = platformOverride ?? filters.platform;
    setPlatformNotice(null);
    setLastAction({ kind: "search", value: trimmed });
    setProfile(null);
    setProfileSecUid(null);
    setProfileCursor(null);
    setProfileHasMore(false);

    setSearching(true);
    setSearchError(false);

    const seen = seenIdsFor(`${platform}:${trimmed.toLowerCase()}`);
    const collected: ReelVideo[] = [];
    const collectedIds = new Set<string>();
    let cursor = cursorOverride;
    let hasMore = true;
    let hadError = false;

    for (
      let round = 0;
      round < MAX_FRESHNESS_ROUNDS && collected.length < DISCOVERY_BATCH_SIZE && hasMore;
      round++
    ) {
      const res = await searchReels(platform, trimmed, cursor);
      // A newer search/Shuffle has started since this one was fired — stop
      // backfilling and discard whatever this stale request already has;
      // whichever call is still current owns the grid and the loading state.
      if (requestId !== requestIdRef.current) return;
      if (res.error) {
        console.error("[search-reels] provider error:", res.error);
        hadError = true;
        break;
      }
      for (const v of res.results) {
        if (collected.length >= DISCOVERY_BATCH_SIZE) break;
        if (seen.has(v.id) || collectedIds.has(v.id)) continue;
        collectedIds.add(v.id);
        collected.push(v);
      }
      cursor = res.cursor;
      hasMore = !!res.hasMore;
    }
    if (requestId !== requestIdRef.current) return;

    if (hadError && collected.length === 0) {
      setSearchError(true);
      setVideos([]);
      setSearchCursor(null);
    } else {
      setSearchError(false);
      for (const v of collected) seen.add(v.id);
      setVideos(collected);
      setSearchCursor(cursor ?? null);
    }
    setSearching(false);
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
    const { results, error, cursor, hasMore, partial } = await fetchMoreProfileReels(
      profilePlatform,
      profileSecUid,
      profileCursor
    );
    if (error) {
      console.error("[search-reels] provider error (load more):", error);
      setProfileHasMore(false);
    } else {
      setProfileResultsPartial(!!partial);
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
    // Invalidates any search/profile/shuffle fetch still in flight — without
    // this, one could resolve after Refresh and quietly repopulate the grid
    // it just cleared back to the Hub's home state.
    requestIdRef.current++;
    setRefreshSpinning(true);
    // A cancel-search click during a still-in-flight fetch is the one caller
    // of this function where `searching` is true — loadVideos' own
    // setSearching(false) never runs for it, since the requestId bump just
    // above makes it stale and loadVideos bails out early instead.
    setSearching(false);
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
    setProfileReelsUnavailable(false);
    setSearchCursor(null);
    setDetailVideoId(null);
    // Back to a genuinely blank slate — forget which videos have already
    // been shown this session, so it's not "remembered" across a Refresh.
    seenIdsRef.current.clear();
    // Fresh set of suggested niches too, so the home state doesn't feel
    // like the same six chips forever.
    setDisplayedChips(pickRandomChips(NICHE_CHIP_POOL, 6));
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
      // Continuing from the last cursor when we have one skips straight to
      // unseen territory faster, but even a page-1 restart (no cursor) is
      // safe now — runSearch's own seen-id filter skips anything already
      // shown either way, so this never just re-shows the same batch.
      void runSearch(lastAction.value, searchCursor ?? undefined).finally(() => setShuffleSpinning(false));
      return;
    }
    if (lastAction?.kind === "profile") {
      setShuffleSpinning(true);
      setDetailVideoId(null);
      if (profileSecUid && profileHasMore && profileCursor) {
        void (async () => {
          const requestId = ++requestIdRef.current;
          setSearching(true);
          const { results, error, cursor, hasMore } = await fetchMoreProfileReels(
            profilePlatform,
            profileSecUid,
            profileCursor
          );
          // Only commit if nothing newer (another Shuffle, a new search, a
          // fresh profile lookup) has started in the meantime — otherwise
          // this stale response would clobber whatever the user asked for
          // next, or falsely mark the newer request's loading as finished.
          if (requestId === requestIdRef.current) {
            if (error) {
              console.error("[search-reels] provider error (shuffle):", error);
              setSearchError(true);
            } else {
              setVideos(results);
              setProfileCursor(cursor ?? null);
              setProfileHasMore(!!hasMore);
            }
            setSearching(false);
          }
          setShuffleSpinning(false);
        })();
      } else {
        // Pagination exhausted (or no cursor yet) — the only "fresh" batch
        // left is the same profile's first page again.
        void runProfileLookup(lastAction.value).finally(() => setShuffleSpinning(false));
      }
      return;
    }
    const next = NICHE_CHIP_POOL[Math.floor(Math.random() * NICHE_CHIP_POOL.length)];
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
      void collectionsStore.addVideoToCollection(quickSaves.id, video, undefined, undefined, "Creativity Hub");
    } else if (selectedCreator) {
      void collectionsStore.createCollection("Quick Saves", selectedCreator.id, "", video, undefined, undefined, "Creativity Hub");
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
    <div className="h-full overflow-y-auto" style={{ background: "#020203" }}>
      {/* hero */}
      <div className="relative overflow-hidden px-10 xl:px-16 2xl:px-24 pt-14 pb-10">
        <StarfieldBackground starCount={34} />
        <HeroReelRails />
        {/* Dims the decorative reel rails into calm ambient texture instead of
            a competing photo collage — keeps the atmosphere without it
            reading as a separate landing page from the rest of ReelForge. */}
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, #020203 0%, rgba(2,2,3,0.55) 30%, rgba(2,2,3,0.55) 70%, #020203 100%)" }} />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(720px 340px at 50% -20%, rgba(211,148,72,0.06), transparent 65%)",
          }}
        />

        <div className="relative z-10 max-w-3xl xl:max-w-4xl 2xl:max-w-5xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2.5 mb-3">
            <span className="h-px w-5 bg-gradient-to-r from-transparent to-[#c08e4e]/60" />
            <span className="text-[10.5px] tracking-[1.8px] uppercase text-[#c08e4e]">
              Creativity Hub
            </span>
            <span className="h-px w-5 bg-gradient-to-l from-transparent to-[#c08e4e]/60" />
          </div>
          <h1 className="text-[42px] leading-[1.08] font-hub-hero font-medium text-neutral-50">
            Discover your next{" "}
            <span className="text-gradient-warm">winning concept</span>
          </h1>
          <p className="mt-3.5 text-[14px] text-[#b1aba0]">
            Curated Reels and TikToks, organized for{" "}
            <span className="text-[#D39448] font-medium">{selectedCreator.name}</span>
          </p>

          <div className="mt-8 relative max-w-xl mx-auto">
            <div
              className="relative flex items-center rounded-2xl border transition-colors duration-200"
              style={{
                borderColor: focused ? "rgba(211,148,72,0.45)" : HUB_CARD_BORDER,
                boxShadow: focused ? "0 0 0 3px rgba(211,148,72,0.1)" : HUB_CARD_STYLE.boxShadow,
                background: HUB_CARD_STYLE.background,
              }}
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
            {displayedChips.map((chip, i) => (
              <button
                key={chip}
                onClick={() => {
                  setQuery(chip);
                  void runSearch(chip);
                }}
                className="animate-chip-drift text-[12px] px-3 py-1.5 rounded-full border border-[#202024] text-neutral-400 hover:text-[#D39448] hover:border-[#3a2a17] transition-colors"
                style={{
                  ...HUB_CARD_STYLE,
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

            <div className="flex items-center h-11 p-1 rounded-full border" style={{ borderColor: HUB_CARD_BORDER, ...HUB_CARD_STYLE }}>
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
                    "h-9 px-4 rounded-full border text-[13px] capitalize transition-colors duration-150",
                    filters.platform === p
                      ? "border-[#141009] text-[#f0c58c]"
                      : "border-transparent text-neutral-500 hover:text-neutral-300",
                  ].join(" ")}
                  style={filters.platform === p ? { background: "linear-gradient(90deg, #2a1e11, #1a1510)" } : undefined}
                >
                  {p === "all" ? "All" : p}
                </button>
              ))}
            </div>
          </div>

          {/* profile-based research — a public creator's own reels, independent
              of (and a fallback for) the keyword search above */}
          <div className="flex-1 min-w-[240px] max-w-sm flex items-center gap-1.5 h-11 pl-1.5 pr-3.5 rounded-full border" style={{ borderColor: HUB_CARD_BORDER, ...HUB_CARD_STYLE }}>
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
              className="flex items-center gap-1.5 h-11 px-4 rounded-full border border-[#202024] hover:border-[#2c2c32] hover:bg-white/[0.03] transition-colors text-[13px] text-neutral-300"
              style={HUB_CARD_STYLE}
            >
              <Bookmark size={13} className="text-[#D39448]" />
              <span className="tabular-nums text-neutral-100">{savedCountLabel}</span> saved
            </button>

            <button
              onClick={handleRefresh}
              disabled={searching}
              title="Refresh — back to the Hub home"
              className="flex items-center justify-center w-11 h-11 rounded-full border border-[#202024] hover:border-[#2c2c32] hover:bg-white/[0.03] transition-colors text-neutral-300 disabled:opacity-40 disabled:hover:bg-transparent"
              style={HUB_CARD_STYLE}
            >
              <RefreshCw size={15} className={refreshSpinning ? "animate-spin" : ""} />
            </button>

            <button
              onClick={handleShuffle}
              disabled={searching || !lastAction}
              title={lastAction ? "Shuffle — fresh batch, same topic" : "Search or browse a profile first"}
              className="flex items-center justify-center w-11 h-11 rounded-full border border-[#202024] hover:border-[#2c2c32] hover:bg-white/[0.03] transition-colors text-neutral-300 disabled:opacity-40 disabled:hover:bg-transparent"
              style={HUB_CARD_STYLE}
            >
              <Shuffle size={15} className={shuffleSpinning ? "animate-spin" : ""} />
            </button>

            <button
              onClick={() => setDrawerOpen(true)}
              className="relative flex items-center gap-2 h-11 px-4 rounded-full border border-[#202024] hover:border-[#2c2c32] hover:bg-white/[0.03] transition-colors text-[13px] text-neutral-300"
              style={HUB_CARD_STYLE}
            >
              <SlidersHorizontal size={14} />
              Filters
              {activeFilterCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#3a2a17] px-[5px] text-[9px] tracking-[0.5px] text-[#e8b273]">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="rounded-[12px] border border-[#1a130b] p-5" style={HUB_PANEL_STYLE}>
        {platformNotice && (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-[#202024] px-4 py-3 text-[12.5px] text-neutral-400" style={HUB_CARD_STYLE}>
            <Info size={14} className="shrink-0 text-neutral-500" />
            {platformNotice}
          </div>
        )}

        {searchError ? (
          <div className="flex flex-col items-center justify-center text-center rounded-xl border border-[#202024] py-24" style={HUB_CARD_STYLE}>
            <CloudOff size={20} className="text-neutral-700 mb-2.5" />
            <p className="text-[14.5px] font-serif text-neutral-300">Research is taking a short timeout.</p>
            <p className="text-[12px] text-neutral-600 mt-1.5 max-w-sm">
              One of our external data providers is currently unavailable. Everything inside ReelForge is running
              normally.
            </p>
            <button
              onClick={retryLastAction}
              disabled={searching || !lastAction}
              className="mt-5 flex items-center gap-2 h-9 px-4 rounded-full border border-[#202024] hover:border-[#2c2c32] hover:bg-white/[0.03] transition-colors text-[12.5px] text-neutral-300 disabled:opacity-50"
              style={HUB_CARD_STYLE}
            >
              <Shuffle size={13} className={searching ? "animate-spin" : ""} />
              Retry
            </button>
          </div>
        ) : (
          <>
            {lastAction?.kind === "profile" && profile && <ProfileHeader profile={profile} />}

            {profileResultsPartial && filtered.length > 0 && (
              <div className="mb-5 flex items-center gap-2 rounded-xl border border-[#202024] px-4 py-3 text-[12.5px] text-neutral-400" style={HUB_CARD_STYLE}>
                <Info size={14} className="shrink-0 text-neutral-500" />
                Only showing what loaded — our provider had a brief hiccup pulling the rest. Try Load more or
                Refresh for the full set.
              </div>
            )}

            <VideoGrid
              videos={filtered}
              onSaveClick={handleSaveClick}
              onAddToCollection={setSavePanelVideo}
              onOpenDetail={(video) => setDetailVideoId(video.id)}
              spacious
              loading={searching}
              onCancelLoading={handleRefresh}
              loadingLabel={
                shuffleSpinning
                  ? "ReelForge is shuffling in a fresh batch…"
                  : lastAction?.kind === "profile"
                    ? `ReelForge is loading @${lastAction.value.replace(/^@/, "")}'s reels…`
                    : "ReelForge is finding new videos for you…"
              }
              emptyTitle={
                profileReelsUnavailable
                  ? "This profile is playing hard to get."
                  : lastAction
                    ? "No results found."
                    : "Search a niche, or browse a public profile above."
              }
              emptyHint={
                profileReelsUnavailable
                  ? "Our provider couldn't retrieve its reels right now — try again shortly."
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
                  className="flex items-center gap-2 h-10 px-5 rounded-full border border-[#202024] hover:border-[#2c2c32] hover:bg-white/[0.03] transition-colors text-[13px] text-neutral-300 disabled:opacity-60"
                  style={HUB_CARD_STYLE}
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
        </div>

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
            void collectionsStore.addVideoToCollection(quickSaves.id, savePanelVideo, note, undefined, "Creativity Hub");
          } else {
            void collectionsStore.createCollection("Quick Saves", targetCreatorId, "", savePanelVideo, note, undefined, "Creativity Hub");
          }
        }}
        onSaveToCollection={(collectionId, note) => {
          if (!savePanelVideo) return;
          markSaved(savePanelVideo.id);
          void collectionsStore.addVideoToCollection(collectionId, savePanelVideo, note, undefined, "Creativity Hub");
        }}
        onCreateCollection={(name, note, creatorOverrideId) => {
          if (!savePanelVideo) return;
          markSaved(savePanelVideo.id);
          const targetCreatorId = creatorOverrideId ?? selectedCreator.id;
          void collectionsStore.createCollection(name, targetCreatorId, "", savePanelVideo, note, undefined, "Creativity Hub");
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
