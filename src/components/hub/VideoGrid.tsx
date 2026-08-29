import { useEffect, useState } from "react";
import { SearchX, Sparkles } from "lucide-react";
import type { ReelVideo } from "../../types";
import { VideoCard } from "./VideoCard";

// Cycled while a search/Shuffle is in flight so the loading state reads as
// active work happening in stages, not a single frozen spinner — reinforces
// "ReelForge is doing something for you right now" rather than "please wait."
const LOADING_STAGES = ["Searching for new videos…", "Filtering for quality…", "Preparing your batch…"];
const STAGE_INTERVAL_MS = 1400;

function useLoadingStage(active: boolean): string {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!active) {
      setStage(0);
      return;
    }
    const id = window.setInterval(() => {
      setStage((s) => (s + 1) % LOADING_STAGES.length);
    }, STAGE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [active]);
  return LOADING_STAGES[stage];
}

// The dedicated "working" panel — used both when the grid starts empty AND
// (critically) whenever a search/Shuffle is in flight even if a previous
// batch is still technically in state. It fully REPLACES whatever was on
// screen rather than dimming it underneath, on purpose: leaving old results
// visible during a new search reads as "did my click even register?" —
// confirmed directly by the user watching a client try it. Clearing to this
// panel the instant a new search starts removes that ambiguity completely.
function SearchingPanel({
  spacious,
  headline,
  hint,
  onCancel,
}: {
  spacious: boolean;
  headline: string;
  hint?: string;
  onCancel?: () => void;
}) {
  const stage = useLoadingStage(true);
  return (
    <div
      className={[
        "flex flex-col items-center justify-center text-center rounded-xl surface-panel",
        spacious ? "py-28" : "py-20",
      ].join(" ")}
    >
      <div className="relative mb-4 w-9 h-9 flex items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-[#D39448]/25 animate-ping" />
        <span className="absolute inset-0 rounded-full border border-[#D39448]/40" />
        <Sparkles size={16} className="relative text-[#D39448] animate-pulse" />
      </div>
      <p className={spacious ? "text-[15px] font-serif text-neutral-100" : "text-[13.5px] text-neutral-100"}>
        {headline}
      </p>
      <p key={stage} className="text-[12px] text-[#D39448]/80 mt-2 animate-fade-in tabular-nums">
        {stage}
      </p>
      {hint && <p className="text-[11.5px] text-neutral-600 mt-2.5 max-w-xs">{hint}</p>}
      {onCancel && (
        <button
          onClick={onCancel}
          className="mt-4 text-[11px] text-neutral-500 hover:text-neutral-300 underline underline-offset-2 transition-colors"
        >
          cancel search
        </button>
      )}
    </div>
  );
}

export function VideoGrid({
  videos,
  onSaveClick,
  onAddToCollection,
  onOpenDetail,
  spacious = false,
  loading = false,
  loadingLabel = "ReelForge is finding new videos for you…",
  onCancelLoading,
  emptyTitle = "No results match your search.",
  emptyHint = "Try a different keyword or platform.",
  showEngagement = false,
}: {
  videos: ReelVideo[];
  onSaveClick: (video: ReelVideo) => void;
  onAddToCollection?: (video: ReelVideo) => void;
  onOpenDetail?: (video: ReelVideo) => void;
  spacious?: boolean;
  // Research Archive-only: shows real Likes/Comments counts on each card
  // (see VideoCard) -- reliably persisted for archived reels (100% of real
  // rows have both), unlike Views, which real testing confirmed Instagram
  // essentially never exposes for Reels. Left off by default so Creativity
  // Hub's search results (a different data source, not audited for this)
  // are completely unaffected.
  showEngagement?: boolean;
  // True while a fetch is in flight. Whenever this is true, the grid (even a
  // previous batch still sitting in state) is fully replaced by a dedicated
  // "working" panel — see SearchingPanel above for why that's deliberate.
  loading?: boolean;
  loadingLabel?: string;
  // Escape hatch for a lookup that's taking a long time (e.g. a profile
  // that doesn't exist) — the header's own Refresh button is disabled for
  // the whole time `loading` is true, so this is the only way out until the
  // fetch itself resolves.
  onCancelLoading?: () => void;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  if (loading) {
    return (
      <SearchingPanel
        spacious={spacious}
        headline={loadingLabel}
        hint="Good research can take a few seconds — hang tight."
        onCancel={onCancelLoading}
      />
    );
  }

  if (videos.length === 0) {
    return (
      <div
        className={[
          "flex flex-col items-center justify-center text-center rounded-xl surface-panel",
          spacious ? "py-28" : "py-20",
        ].join(" ")}
      >
        <SearchX size={20} className="text-neutral-700 mb-2.5" />
        <p className={spacious ? "text-[14.5px] font-serif text-neutral-300" : "text-[13.5px] text-neutral-300"}>
          {emptyTitle}
        </p>
        <p className="text-[12px] text-neutral-600 mt-1.5">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className={["grid grid-cols-4", spacious ? "gap-5" : "gap-3.5"].join(" ")}>
      {videos.map((video, i) => (
        <div key={video.id} className="animate-rise-in" style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}>
          <VideoCard
            video={video}
            onSaveClick={onSaveClick}
            onAddToCollection={onAddToCollection}
            onOpenDetail={onOpenDetail}
            showEngagement={showEngagement}
          />
        </div>
      ))}
    </div>
  );
}
