import { Search, SearchX, Loader2 } from "lucide-react";
import type { ReelVideo } from "../../types";
import { VideoCard } from "./VideoCard";

export function VideoGrid({
  videos,
  onSaveClick,
  onAddToCollection,
  onOpenDetail,
  spacious = false,
  loading = false,
  loadingLabel = "ReelForge is finding fresh results…",
  emptyTitle = "No results match your search.",
  emptyHint = "Try a different keyword or platform.",
}: {
  videos: ReelVideo[];
  onSaveClick: (video: ReelVideo) => void;
  onAddToCollection?: (video: ReelVideo) => void;
  onOpenDetail?: (video: ReelVideo) => void;
  spacious?: boolean;
  // True while a fetch is in flight — swaps the empty-state icon from
  // "no results" (a magnifying glass with an X) to a plain searching icon,
  // since a search that's still running isn't a dead end. When a PREVIOUS
  // batch is still on screen, this instead renders that batch dimmed with a
  // centered "working" overlay on top, so a new search/Shuffle can never
  // look like the click didn't register.
  loading?: boolean;
  loadingLabel?: string;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  if (videos.length === 0) {
    return (
      <div
        className={[
          "flex flex-col items-center justify-center text-center rounded-xl surface-panel",
          spacious ? "py-28" : "py-20",
        ].join(" ")}
      >
        {loading ? (
          <Search size={20} className="text-neutral-700 mb-2.5 animate-pulse" />
        ) : (
          <SearchX size={20} className="text-neutral-700 mb-2.5" />
        )}
        <p className={spacious ? "text-[14.5px] font-serif text-neutral-300" : "text-[13.5px] text-neutral-300"}>
          {emptyTitle}
        </p>
        <p className="text-[12px] text-neutral-600 mt-1.5">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className={[
          "grid grid-cols-4 transition-[opacity,filter] duration-200",
          spacious ? "gap-5" : "gap-3.5",
          loading ? "opacity-40 blur-[1.5px] pointer-events-none select-none" : "",
        ].join(" ")}
      >
        {videos.map((video, i) => (
          <div key={video.id} className="animate-rise-in" style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}>
            <VideoCard
              video={video}
              onSaveClick={onSaveClick}
              onAddToCollection={onAddToCollection}
              onOpenDetail={onOpenDetail}
            />
          </div>
        ))}
      </div>

      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="flex flex-col items-center gap-3 rounded-2xl surface-panel px-7 py-5 shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
            <Loader2 size={20} className="text-[#D39448] animate-spin" />
            <p className="text-[13px] text-neutral-200 font-medium">{loadingLabel}</p>
            <p className="text-[11.5px] text-neutral-500">Good research can take a few seconds — hang tight.</p>
          </div>
        </div>
      )}
    </div>
  );
}
