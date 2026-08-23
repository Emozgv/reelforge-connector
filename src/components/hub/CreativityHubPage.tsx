import { useEffect, useMemo, useState } from "react";
import { Search, Shuffle, Bookmark, SlidersHorizontal, AlertCircle } from "lucide-react";
import { searchReels } from "../../lib/searchReels";
import type { Creator, ReelVideo } from "../../types";
import type { CollectionsStore } from "../../state/useCollectionsStore";
import { CreatorSelector } from "./CreatorSelector";
import { FilterDrawer } from "./FilterDrawer";
import { HeroReelRails } from "./HeroReelRail";
import { StarfieldBackground } from "../shared/StarfieldBackground";
import { RotatingMicrocopy } from "./RotatingMicrocopy";
import { SavedCollectionsPopover } from "./SavedCollectionsPopover";
import { SavePanel } from "./SavePanel";
import { VideoGrid } from "./VideoGrid";
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
}: {
  creators: Creator[];
  creatorsError?: string | null;
  collectionsStore: CollectionsStore;
  onOpenCollection: (collectionId: string) => void;
}) {
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(creators[0] ?? null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [videos, setVideos] = useState<ReelVideo[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  const [filters, setFilters] = useState<HubFilters>(DEFAULT_FILTERS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [savePanelVideo, setSavePanelVideo] = useState<ReelVideo | null>(null);
  const [savedPopoverOpen, setSavedPopoverOpen] = useState(false);

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

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    if (filters.platform === "instagram") {
      setSearchError("Instagram search isn't connected yet — try TikTok or All for now.");
      return;
    }
    setSearching(true);
    setSearchError(null);
    setLastQuery(trimmed);
    const { results, error } = await searchReels("tiktok", trimmed);
    setVideos(results);
    setSearchError(error ?? null);
    setSearching(false);
  }

  function handleRefresh() {
    if (!lastQuery) return;
    setSpinning(true);
    void runSearch(lastQuery).finally(() => setSpinning(false));
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
                  onClick={() => setFilters((f) => ({ ...f, platform: p }))}
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
              disabled={!lastQuery || searching}
              title={lastQuery ? "Fetch a fresh batch for the same search" : "Search something first"}
              className="flex items-center gap-2 h-11 px-4 rounded-full glass-panel hover:bg-white/[0.06] transition-colors text-[13px] text-neutral-300 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <Shuffle size={14} className={spinning ? "animate-spin" : ""} />
              Refresh
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

        {searchError && (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/[0.06] px-4 py-3 text-[12.5px] text-rose-200/90">
            <AlertCircle size={14} className="shrink-0" />
            {searchError}
          </div>
        )}

        <VideoGrid
          videos={filtered}
          onSaveClick={handleSaveClick}
          onAddToCollection={setSavePanelVideo}
          spacious
          emptyTitle={
            searching
              ? "Searching…"
              : lastQuery
                ? "No results for that search."
                : "Search a niche above to discover real reels."
          }
          emptyHint={
            searching
              ? "Pulling fresh results from TikTok."
              : lastQuery
                ? "Try a different keyword, or press Refresh for a new batch."
                : 'Try one of the suggestions, or type your own — e.g. "cute blonde girl".'
          }
        />

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
      />
    </div>
  );
}
