import type { ReelVideo } from "../../types";
import { VideoCard } from "./VideoCard";

export function VideoGrid({
  videos,
  onSaveClick,
  onAddToCollection,
  spacious = false,
  emptyTitle = "No results match your search.",
  emptyHint = "Try a different keyword or platform.",
}: {
  videos: ReelVideo[];
  onSaveClick: (video: ReelVideo) => void;
  onAddToCollection?: (video: ReelVideo) => void;
  spacious?: boolean;
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
          <VideoCard video={video} onSaveClick={onSaveClick} onAddToCollection={onAddToCollection} />
        </div>
      ))}
    </div>
  );
}
