import { Bookmark, Sparkles, FolderPlus, ExternalLink, Play, Eye } from "lucide-react";
import type { ReelVideo } from "../../types";
import { PlatformIcon } from "./PlatformIcon";

export function VideoCard({
  video,
  onSaveClick,
  onAddToCollection,
}: {
  video: ReelVideo;
  onSaveClick: (video: ReelVideo) => void;
  onAddToCollection?: (video: ReelVideo) => void;
}) {
  return (
    <div className="group relative aspect-[9/16] w-full rounded-2xl overflow-hidden border border-white/[0.08] transition-all duration-300 ease-out hover:-translate-y-1 hover:border-[#d7a463]/35 hover:shadow-[0_18px_40px_-12px_rgba(0,0,0,0.6)] cursor-pointer">
      <div
        className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        style={{ background: video.thumbGradient }}
      />

      <div
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
        }}
      />

      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/30" />
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/25" />

      {/* top row: platform, duration, optional AI score — subtle, always visible */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between">
        <div className="w-6 h-6 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center border border-white/10">
          <PlatformIcon platform={video.platform} size={11.5} />
        </div>
        <span className="flex items-center gap-1 text-[10.5px] text-white/90 bg-black/45 backdrop-blur-md border border-white/10 rounded-full px-2 py-[2px] font-medium tabular-nums">
          {video.aiReady && <span className="text-[#e8c896]">AI {video.aiScore}</span>}
          {video.aiReady && <span className="text-white/30">·</span>}
          {video.duration}
        </span>
      </div>

      {/* center play affordance */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover:scale-100">
        <div className="w-12 h-12 rounded-full bg-white/[0.12] backdrop-blur-md border border-white/20 flex items-center justify-center">
          <Play size={15} className="text-white ml-0.5" fill="white" />
        </div>
      </div>

      {/* right quick-action rail — hover only */}
      <div className="absolute top-11 right-2.5 flex flex-col gap-1.5 translate-x-3 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSaveClick(video);
          }}
          title={video.saved ? "Unsave" : "Save"}
          className={[
            "w-7 h-7 rounded-full flex items-center justify-center border backdrop-blur-md transition-colors",
            video.saved
              ? "bg-[#d7a463] border-[#d7a463] text-[#0a0a0c]"
              : "bg-black/45 border-white/10 text-white hover:bg-black/65",
          ].join(" ")}
        >
          <Bookmark size={12.5} fill={video.saved ? "currentColor" : "none"} strokeWidth={2} />
        </button>
        <button
          onClick={(e) => e.stopPropagation()}
          title="Find similar"
          className="w-7 h-7 rounded-full flex items-center justify-center bg-black/45 border border-white/10 text-white backdrop-blur-md hover:bg-black/65 transition-colors"
        >
          <Sparkles size={12.5} strokeWidth={2} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddToCollection?.(video);
          }}
          title="Add to collection"
          className="w-7 h-7 rounded-full flex items-center justify-center bg-black/45 border border-white/10 text-white backdrop-blur-md hover:bg-black/65 transition-colors"
        >
          <FolderPlus size={12.5} strokeWidth={2} />
        </button>
        <button
          onClick={(e) => e.stopPropagation()}
          title="Open source"
          className="w-7 h-7 rounded-full flex items-center justify-center bg-black/45 border border-white/10 text-white backdrop-blur-md hover:bg-black/65 transition-colors"
        >
          <ExternalLink size={12.5} strokeWidth={2} />
        </button>
      </div>

      {/* persistent saved indicator (visible without hover) */}
      {video.saved && (
        <div className="absolute top-2.5 right-2.5 group-hover:opacity-0 transition-opacity duration-200 w-6 h-6 rounded-full bg-[#d7a463] flex items-center justify-center">
          <Bookmark size={11} fill="currentColor" className="text-[#0a0a0c]" strokeWidth={2} />
        </div>
      )}

      {/* bottom content — identity, views, and used-state always visible; tags + fit on hover */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[12.5px] text-white font-medium truncate">@{video.username}</span>
          <span className="flex items-center gap-1 text-[11.5px] text-white/85 font-medium shrink-0 tabular-nums">
            <Eye size={11} className="text-white/50" />
            {video.views}
          </span>
        </div>

        {video.used && (
          <div className="mt-1 flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-neutral-400/70" />
            <span className="text-[10px] text-neutral-400/90">Used</span>
          </div>
        )}

        <div className="mt-1.5 flex items-center gap-2 h-4 overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {video.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-[10px] text-white/60">
              {tag}
            </span>
          ))}
          {video.creatorFit >= 80 && (
            <span
              title="Estimated fit — not a guarantee"
              className="ml-auto text-[10px] text-[#e8c896]/90 tabular-nums shrink-0"
            >
              {video.creatorFit}% fit
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
