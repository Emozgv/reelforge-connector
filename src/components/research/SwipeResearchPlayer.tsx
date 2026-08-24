import { useEffect, useRef, useState } from "react";
import { Bookmark, FolderPlus, ChevronUp, ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import type { ReelVideo, ResearchAccount } from "../../types";
import { PlatformIcon } from "../hub/PlatformIcon";
import { DEFAULT_THUMB_GRADIENT } from "../../data/mockData";

// One video, full-bleed within its slot, autoplaying when active and paused
// otherwise — the same play/fallback pattern ReelDetailModal already uses,
// just without the surrounding modal chrome.
function SwipeSlide({ video, active, onSaveClick, onAddToCollection }: {
  video: ReelVideo;
  active: boolean;
  onSaveClick: () => void;
  onAddToCollection: () => void;
}) {
  const [videoError, setVideoError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [captionExpanded, setCaptionExpanded] = useState(false);

  useEffect(() => {
    setVideoError(false);
    setCaptionExpanded(false);
  }, [video.id]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (active) void el.play().catch(() => {});
    else el.pause();
  }, [active]);

  const platformLabel = video.platform === "tiktok" ? "TikTok" : "Instagram";

  return (
    <div className="relative h-full w-full bg-black">
      {video.videoUrl && !videoError ? (
        <video
          ref={videoRef}
          src={video.videoUrl}
          poster={video.thumbnailUrl}
          loop
          playsInline
          controls
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setVideoError(true)}
        />
      ) : (
        <>
          {video.thumbnailUrl ? (
            <img src={video.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0" style={{ background: video.thumbGradient ?? DEFAULT_THUMB_GRADIENT }} />
          )}
          {/* Playback inside ReelForge is the point of this whole mode — this
              external link is deliberately a small secondary fallback, only
              for the rare item with no direct video, never the primary way
              to view research content. */}
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-[12px] text-white/70">This reel isn't playable in ReelForge yet.</p>
            <a
              href={video.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[11.5px] text-white/80 hover:text-white underline underline-offset-2 transition-colors"
            >
              <ExternalLink size={11} />
              View original on {platformLabel}
            </a>
          </div>
        </>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

      {/* bottom-left: who/what */}
      <div className="absolute bottom-4 left-4 right-20">
        <p className="text-[14px] text-white font-medium">@{video.username}</p>
        {video.caption && (
          <button
            onClick={() => setCaptionExpanded((v) => !v)}
            className={["mt-1 text-left text-[12.5px] text-white/85 leading-snug", captionExpanded ? "" : "line-clamp-2"].join(" ")}
          >
            {video.caption}
          </button>
        )}
        <div className="mt-2 flex items-center gap-3 text-[11.5px] text-white/70 tabular-nums">
          <span>{video.views} views</span>
          {video.likes !== undefined && <span>{video.likes.toLocaleString()} likes</span>}
        </div>
      </div>

      {/* right action rail — the same Save / Add-to-Collection actions the
          rest of the app uses, just laid out TikTok-style */}
      <div className="absolute bottom-6 right-3 flex flex-col items-center gap-4">
        <button
          onClick={onSaveClick}
          className="flex flex-col items-center gap-1 text-white group"
          title={video.saved ? "Saved" : "Quick Save"}
        >
          <span className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/65 transition-colors">
            <Bookmark size={19} fill={video.saved ? "currentColor" : "none"} className={video.saved ? "text-[#D39448]" : ""} />
          </span>
          <span className="text-[9.5px] text-white/80">{video.saved ? "Saved" : "Save"}</span>
        </button>
        <button onClick={onAddToCollection} className="flex flex-col items-center gap-1 text-white group" title="Add to collection">
          <span className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/65 transition-colors">
            <FolderPlus size={19} />
          </span>
          <span className="text-[9.5px] text-white/80">Collection</span>
        </button>
      </div>

      <div className="absolute top-3 left-3 flex items-center gap-1.5">
        <div className="w-6 h-6 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center border border-white/10">
          <PlatformIcon platform={video.platform} size={11} />
        </div>
        <span className="text-[10.5px] text-white/90 bg-black/45 backdrop-blur-md border border-white/10 rounded-full px-2 py-[2px] font-medium tabular-nums">
          {video.duration}
        </span>
      </div>
    </div>
  );
}

const WHEEL_THRESHOLD = 60;
const SWIPE_THRESHOLD = 50;

export function SwipeResearchPlayer({
  account,
  videos,
  index,
  onIndexChange,
  loadingMore,
  onNearEnd,
  onSaveClick,
  onAddToCollection,
  onExitToArchive,
}: {
  account: ResearchAccount;
  videos: ReelVideo[];
  index: number;
  onIndexChange: (i: number) => void;
  loadingMore: boolean;
  onNearEnd: () => void;
  onSaveClick: (video: ReelVideo) => void;
  onAddToCollection: (video: ReelVideo) => void;
  onExitToArchive: () => void;
}) {
  const connecting = account.status === "connecting";
  const wheelAccum = useRef(0);
  const touchStartY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasNext = index < videos.length - 1;
  const hasPrev = index > 0;

  function goNext() {
    if (hasNext) onIndexChange(index + 1);
  }
  function goPrev() {
    if (hasPrev) onIndexChange(index - 1);
  }

  // Prefetch — stay a few reels ahead of the swipe cursor so it never stalls
  // waiting on the network mid-session.
  useEffect(() => {
    if (videos.length - index <= 3) onNearEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, videos.length]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, videos.length]);

  function handleWheel(e: React.WheelEvent) {
    wheelAccum.current += e.deltaY;
    if (wheelAccum.current > WHEEL_THRESHOLD) {
      wheelAccum.current = 0;
      goNext();
    } else if (wheelAccum.current < -WHEEL_THRESHOLD) {
      wheelAccum.current = 0;
      goPrev();
    }
  }

  const current = videos[index];

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-2 mb-3 text-[12px] text-neutral-500">
        <PlatformIcon platform={account.platform} size={12} />
        <span className="text-neutral-300 font-medium">{account.label}</span>
        <span>·</span>
        <span className="tabular-nums">
          {videos.length > 0 ? `${index + 1} of ${videos.length} loaded` : "No reels loaded"}
        </span>
        <span>·</span>
        <button onClick={onExitToArchive} className="text-[#D39448] hover:brightness-110 transition-[filter]">
          View archive
        </button>
      </div>

      <div
        ref={containerRef}
        onWheel={handleWheel}
        onTouchStart={(e) => {
          touchStartY.current = e.touches[0].clientY;
        }}
        onTouchEnd={(e) => {
          if (touchStartY.current === null) return;
          const delta = touchStartY.current - e.changedTouches[0].clientY;
          if (delta > SWIPE_THRESHOLD) goNext();
          else if (delta < -SWIPE_THRESHOLD) goPrev();
          touchStartY.current = null;
        }}
        className="relative w-[360px] h-[min(76vh,660px)] rounded-2xl overflow-hidden border border-white/[0.08] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]"
      >
        {current ? (
          <SwipeSlide
            key={current.id}
            video={current}
            active
            onSaveClick={() => onSaveClick(current)}
            onAddToCollection={() => onAddToCollection(current)}
          />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center bg-[#0d0d0f] text-center px-6">
            {loadingMore ? (
              <Loader2 size={20} className="text-[#D39448] animate-spin" />
            ) : connecting ? (
              <>
                <Loader2 size={18} className="text-amber-400/80 animate-pulse mb-1" />
                <p className="text-[13px] text-neutral-300">This account is still connecting.</p>
                <p className="mt-1.5 text-[11.5px] text-neutral-600">
                  Once ReelForge finishes setting up its real session, this account's feed will start appearing here
                  automatically.
                </p>
              </>
            ) : (
              <>
                <p className="text-[13px] text-neutral-300">Nothing new to research yet.</p>
                <p className="mt-1.5 text-[11.5px] text-neutral-600">
                  Press Refresh feed (in the archive view) to request a new sync for this account.
                </p>
              </>
            )}
          </div>
        )}

        {hasPrev && (
          <button
            onClick={goPrev}
            title="Previous"
            className="absolute top-2 left-1/2 -translate-x-1/2 z-10 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition-colors"
          >
            <ChevronUp size={16} />
          </button>
        )}
        {(hasNext || loadingMore) && (
          <button
            onClick={goNext}
            disabled={!hasNext}
            title="Next"
            className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition-colors disabled:opacity-40"
          >
            {loadingMore && !hasNext ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>

      <p className="mt-3 text-[11px] text-neutral-600">Scroll, swipe, or use ↑ / ↓ to move between reels.</p>
    </div>
  );
}
