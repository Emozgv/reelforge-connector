import { useEffect, useRef, useState } from "react";
import { Bookmark, FolderPlus, ChevronUp, ChevronDown, ExternalLink, Loader2, Heart, Play as PlayIcon, RotateCw, MoreHorizontal, Link as LinkIcon, Check, Ban, AlertTriangle } from "lucide-react";
import type { ReelVideo, ResearchAccount } from "../../types";
import type { LiveSessionStatus } from "../../state/useLiveResearchSession";
import { PlatformIcon } from "../hub/PlatformIcon";
import { DEFAULT_THUMB_GRADIENT } from "../../data/mockData";
import { formatDuration } from "../../lib/researchFeedMapping";
import { DownloadConnectorLink } from "./DownloadConnectorButton";

export type LikeStatus = "pending" | "liked" | "failed";
export type BlockStatus = "pending" | "done" | "failed";

// One video, full-bleed within its slot, autoplaying when both this slide
// and the whole page are active, paused otherwise — the same play/fallback
// pattern ReelDetailModal already uses, just without the surrounding modal
// chrome. `pageActive` (distinct from `active`, which today is always true
// since only the current reel is ever rendered) is what keeps this from
// still playing/decoding video and listening for keystrokes while the VA
// has navigated to a different Client OS section — Research Accounts stays
// mounted so its live session survives that navigation (see App.tsx), so
// this has to police its own "is anyone actually looking at this" state
// instead of relying on being unmounted.
function SwipeSlide({ video, active, pageActive, onSaveClick, onAddToCollection, onLikeClick, likeStatus, onBlockCreator, blockStatus, canLike }: {
  video: ReelVideo;
  active: boolean;
  pageActive: boolean;
  onSaveClick: () => void;
  onAddToCollection: () => void;
  onLikeClick: () => void;
  likeStatus?: LikeStatus;
  onBlockCreator: () => void;
  blockStatus?: BlockStatus;
  canLike: boolean;
}) {
  const [videoError, setVideoError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [paused, setPaused] = useState(false);
  // Instagram's private feed API doesn't reliably carry a duration field for
  // Reels the way it does for other media types — server-side extraction
  // left this at 0 more often than not. The real, always-correct source is
  // the actual playing <video> element itself once its metadata loads.
  const [liveDurationSec, setLiveDurationSec] = useState<number | null>(null);
  // Drives the thin progress line at the bottom — real playback position
  // read straight off the <video> element via its own timeupdate event,
  // never a separate hand-rolled clock that could drift from what's
  // actually on screen.
  const [progress, setProgress] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [blockConfirming, setBlockConfirming] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVideoError(false);
    setCaptionExpanded(false);
    setPaused(false);
    setLiveDurationSec(null);
    setProgress(0);
    setMenuOpen(false);
    setLinkCopied(false);
    setBlockConfirming(false);
  }, [video.id]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (active && pageActive && !paused) void el.play().catch(() => {});
    else el.pause();
  }, [active, pageActive, paused]);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  function togglePlayback() {
    setPaused((p) => !p);
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(video.sourceUrl).catch(() => {});
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 1500);
  }

  const platformLabel = video.platform === "tiktok" ? "TikTok" : "Instagram";

  return (
    <div className="relative h-full w-full bg-black">
      {video.videoUrl && !videoError ? (
        <div className="absolute inset-0" onClick={togglePlayback}>
          <video
            ref={videoRef}
            src={video.videoUrl}
            poster={video.thumbnailUrl}
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setVideoError(true)}
            onLoadedMetadata={() => {
              const d = videoRef.current?.duration;
              if (typeof d === "number" && isFinite(d) && d > 0) setLiveDurationSec(Math.round(d));
            }}
            onTimeUpdate={() => {
              const el = videoRef.current;
              if (!el || !isFinite(el.duration) || el.duration <= 0) return;
              setProgress(el.currentTime / el.duration);
            }}
          />
          {paused && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <span className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                <PlayIcon size={22} className="text-white/90 ml-1" fill="currentColor" />
              </span>
            </div>
          )}
        </div>
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
            type="button"
            onClick={() => setCaptionExpanded((v) => !v)}
            className={["mt-1 text-left text-[12.5px] text-white/85 leading-snug", captionExpanded ? "" : "line-clamp-2"].join(" ")}
          >
            {video.caption}
          </button>
        )}
        <div className="mt-2 flex items-center gap-3 text-[11.5px] text-white/70 tabular-nums">
          {/* Live reels: no real platform view count means no view count
              shown — never a misleading 0 (see useLiveResearchSession's
              liveReelToVideo, which leaves views as "" for exactly this). */}
          {video.views && <span>{video.views} views</span>}
          {video.likes !== undefined && <span>{video.likes.toLocaleString()} likes</span>}
        </div>
      </div>

      {/* right action rail. Like is a real action on the actual Instagram
          account (it acts on this exact live session, no separate context
          spin-up) — kept visually separate, above a divider, from Save /
          Add-to-Collection below, which are ReelForge-only actions and
          never touch the real account. */}
      <div className="absolute bottom-6 right-3 flex flex-col items-center gap-4">
        {canLike && (
          <>
            <button
              type="button"
              onClick={onLikeClick}
              disabled={likeStatus === "pending" || likeStatus === "liked"}
              className="flex flex-col items-center gap-1 text-white group disabled:cursor-default"
              title={
                likeStatus === "liked"
                  ? "Liked on the real Instagram account"
                  : likeStatus === "pending"
                    ? "Liking on Instagram…"
                    : likeStatus === "failed"
                      ? "Couldn't confirm the like — try again"
                      : "Like on the real Instagram account"
              }
            >
              <span className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/65 transition-colors">
                {likeStatus === "pending" ? (
                  <Loader2 size={19} className="animate-spin text-white/80" />
                ) : (
                  <Heart
                    size={19}
                    fill={likeStatus === "liked" ? "currentColor" : "none"}
                    className={likeStatus === "liked" ? "text-rose-400" : likeStatus === "failed" ? "text-rose-400/70" : ""}
                  />
                )}
              </span>
              <span className="text-[9.5px] text-white/80">
                {likeStatus === "liked" ? "Liked" : likeStatus === "pending" ? "Liking…" : likeStatus === "failed" ? "Retry" : "Like"}
              </span>
            </button>
            <span className="w-6 h-px bg-white/15" />
          </>
        )}
        <button
          type="button"
          onClick={onSaveClick}
          className="flex flex-col items-center gap-1 text-white group"
          title={video.saved ? "Saved" : "Quick Save"}
        >
          <span className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/65 transition-colors">
            <Bookmark size={19} fill={video.saved ? "currentColor" : "none"} className={video.saved ? "text-[#D39448]" : ""} />
          </span>
          <span className="text-[9.5px] text-white/80">{video.saved ? "Saved" : "Save"}</span>
        </button>
        <button type="button" onClick={onAddToCollection} className="flex flex-col items-center gap-1 text-white group" title="Add to collection">
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
        {liveDurationSec !== null && (
          <span className="text-[10.5px] text-white/90 bg-black/45 backdrop-blur-md border border-white/10 rounded-full px-2 py-[2px] font-medium tabular-nums">
            {formatDuration(liveDurationSec)}
          </span>
        )}
      </div>

      {/* Three-dot menu — kept small on purpose. Copy link is a real, local
          action (it just reads video.sourceUrl). Block creator is a real
          platform action on the actual connected account (see
          session-server.mjs's Session.block) — not a local hide — so it
          gets one confirm step first, since it's genuinely consequential
          and not easily reversible the way Like/Save are. */}
      <div ref={menuRef} className="absolute top-3 right-3">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          title="More"
          className="w-7 h-7 rounded-full bg-black/45 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/65 transition-colors"
        >
          <MoreHorizontal size={14} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-9 z-20 w-48 rounded-xl bg-[#141416] border border-white/[0.09] shadow-2xl p-1.5 animate-fade-in">
            {blockConfirming ? (
              <div className="px-2.5 py-2">
                <p className="flex items-start gap-1.5 text-[11.5px] text-neutral-300 leading-snug">
                  <AlertTriangle size={13} className="text-amber-400/90 shrink-0 mt-0.5" />
                  Block @{video.username} on the real {platformLabel} account?
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setBlockConfirming(false)}
                    className="flex-1 h-7 rounded-lg text-[11.5px] text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.06] transition-colors duration-150"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBlockConfirming(false);
                      setMenuOpen(false);
                      onBlockCreator();
                    }}
                    className="flex-1 h-7 rounded-lg bg-rose-500/90 text-white text-[11.5px] font-medium hover:bg-rose-500 transition-colors duration-150"
                  >
                    Block
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="w-full flex items-center gap-2 h-8 px-2.5 rounded-lg text-[12px] text-neutral-300 hover:bg-white/[0.06] hover:text-neutral-100 transition-colors duration-150"
                >
                  {linkCopied ? <Check size={12} className="text-[#D39448]" /> : <LinkIcon size={12} />}
                  {linkCopied ? "Copied" : "Copy link"}
                </button>
                <button
                  type="button"
                  disabled={blockStatus === "pending" || blockStatus === "done"}
                  onClick={() => setBlockConfirming(true)}
                  className="w-full flex items-center gap-2 h-8 px-2.5 rounded-lg text-[12px] text-rose-300/90 hover:bg-rose-500/10 hover:text-rose-200 transition-colors duration-150 disabled:opacity-40 disabled:cursor-default"
                >
                  {blockStatus === "pending" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : blockStatus === "done" ? (
                    <Check size={12} />
                  ) : (
                    <Ban size={12} />
                  )}
                  {blockStatus === "pending" ? "Blocking…" : blockStatus === "done" ? "Blocked" : blockStatus === "failed" ? "Couldn't block — retry" : "Block creator"}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Thin Reels/TikTok-style progress line — visual feedback only, not
          a scrubber: no handle, not draggable, not clickable. Starts fresh
          from the left on every new reel (progress resets to 0 in the
          video.id-keyed effect above). */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/15">
        <div
          className="h-full bg-white"
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </div>
    </div>
  );
}

const WHEEL_THRESHOLD = 60;
const SWIPE_THRESHOLD = 50;

// Driven by a real, persistent Instagram session (see
// useLiveResearchSession) rather than an array + index into stored reels —
// there's exactly one current reel; forward/back are real requests, not
// array navigation. hasPrev/loading/status/error all reflect that live
// session's actual state.
export function SwipeResearchPlayer({
  account,
  currentReel,
  hasPrev,
  loading,
  sessionStatus,
  sessionError,
  onNext,
  onPrev,
  onSaveClick,
  onAddToCollection,
  onExitToArchive,
  onLikeClick,
  likeStatus,
  onBlockCreator,
  blockStatus,
  onRetryWake,
  onRefreshSession,
  active,
}: {
  account: ResearchAccount;
  currentReel: ReelVideo | null;
  hasPrev: boolean;
  loading: boolean;
  sessionStatus: LiveSessionStatus;
  sessionError: string | null;
  onNext: () => void;
  onPrev: () => void;
  onSaveClick: (video: ReelVideo) => void;
  onAddToCollection: (video: ReelVideo) => void;
  onExitToArchive: () => void;
  onLikeClick: (video: ReelVideo) => void;
  likeStatus: Record<string, LikeStatus>;
  onBlockCreator: (video: ReelVideo) => void;
  blockStatus: Record<string, BlockStatus>;
  onRetryWake: () => void;
  onRefreshSession: () => void;
  // Whether Research Accounts is the section actually on screen — the page
  // itself stays mounted across navigation now (see App.tsx), so this is
  // what gates video playback and the arrow-key shortcuts instead.
  active: boolean;
}) {
  const connecting = account.status === "connecting";
  const wheelAccum = useRef(0);
  const touchStartY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // One deliberate navigation action must move exactly one reel — a fast
  // trackpad flick fires many wheel events in quick succession (each with
  // its own large deltaY), and without a cooldown each one could cross the
  // threshold on its own and fire another navigation before the first
  // finished, "flying through" several reels from what felt like one
  // gesture. Centralizing the lock (rather than only in the wheel handler)
  // means keyboard repeat and rapid clicks get the same one-motion-one-reel
  // guarantee. This is a client-side debounce on top of — not a substitute
  // for — the live session itself only ever processing one next/prev at a
  // time.
  const navLockedRef = useRef(false);
  const NAV_LOCK_MS = 350;

  function lockNav() {
    navLockedRef.current = true;
    window.setTimeout(() => {
      navLockedRef.current = false;
    }, NAV_LOCK_MS);
  }

  function goNext() {
    if (navLockedRef.current || loading) return;
    lockNav();
    onNext();
  }
  function goPrev() {
    if (!hasPrev || navLockedRef.current || loading) return;
    lockNav();
    onPrev();
  }

  useEffect(() => {
    // Research Accounts stays mounted while another Client OS section is on
    // screen (see App.tsx) — without this, its arrow-key shortcuts would
    // keep firing globally the whole time, stealing keystrokes meant for
    // wherever the VA actually navigated to.
    if (!active) return;
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
  }, [hasPrev, loading, active]);

  function handleWheel(e: React.WheelEvent) {
    // Don't accumulate momentum while locked out — otherwise a fast flick's
    // trailing wheel events pile up past the threshold during the lock, and
    // the instant it clears, that leftover accumulation fires an extra,
    // unintended navigation on its own.
    if (navLockedRef.current) {
      wheelAccum.current = 0;
      return;
    }
    wheelAccum.current += e.deltaY;
    if (wheelAccum.current > WHEEL_THRESHOLD) {
      wheelAccum.current = 0;
      goNext();
    } else if (wheelAccum.current < -WHEEL_THRESHOLD) {
      wheelAccum.current = 0;
      goPrev();
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-2 mb-3 text-[12px] text-neutral-500">
        <PlatformIcon platform={account.platform} size={12} />
        <span className="text-neutral-300 font-medium">{account.label}</span>
        <span>·</span>
        <button type="button" onClick={onExitToArchive} className="text-[#D39448] hover:brightness-110 transition-[filter]">
          View archive
        </button>
        <span>·</span>
        <button
          type="button"
          onClick={onRefreshSession}
          disabled={sessionStatus === "connecting"}
          title="End this live session and start a brand-new one — a fresh FYP, not a replay of this session's history"
          className="flex items-center gap-1 text-neutral-400 hover:text-neutral-200 transition-colors disabled:opacity-40 disabled:cursor-default"
        >
          <RotateCw size={11} className={sessionStatus === "connecting" ? "animate-spin" : ""} />
          Refresh feed
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
        {currentReel ? (
          <SwipeSlide
            key={currentReel.id}
            video={currentReel}
            active
            pageActive={active}
            onSaveClick={() => onSaveClick(currentReel)}
            onAddToCollection={() => onAddToCollection(currentReel)}
            onLikeClick={() => onLikeClick(currentReel)}
            likeStatus={likeStatus[currentReel.id]}
            onBlockCreator={() => onBlockCreator(currentReel)}
            blockStatus={blockStatus[currentReel.id]}
            canLike={currentReel.platform === "instagram" || currentReel.platform === "tiktok"}
          />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center bg-[#0d0d0f] text-center px-6">
            {connecting ? (
              <>
                <Loader2 size={18} className="text-amber-400/80 animate-pulse mb-1" />
                <p className="text-[13px] text-neutral-300">This account is still connecting.</p>
                <p className="mt-1.5 text-[11.5px] text-neutral-600">
                  Once ReelForge finishes setting up its real session, this account's feed will start appearing here
                  automatically.
                </p>
              </>
            ) : sessionStatus === "needs_connector" ? (
              <>
                <p className="text-[13px] text-neutral-300">ReelForge Connector needs to start.</p>
                <p className="mt-1.5 text-[11.5px] text-neutral-600 max-w-[220px]">
                  It isn't running right now — press below to start it and begin researching.
                </p>
                <button
                  type="button"
                  onClick={onRetryWake}
                  className="mt-4 h-9 px-4 rounded-full bg-[#D39448] text-[#020508] text-[12.5px] font-medium hover:brightness-110 transition-[filter] duration-150"
                >
                  Start ReelForge Connector
                </button>
                <p className="mt-3 text-[11px] text-neutral-600">
                  Don't have it yet? <DownloadConnectorLink className="text-neutral-400 hover:text-neutral-200 underline underline-offset-2 transition-colors" />
                </p>
              </>
            ) : sessionStatus === "error" ? (
              <>
                <p className="text-[13px] text-neutral-300">Couldn't start this research session.</p>
                {sessionError && <p className="mt-1.5 text-[11.5px] text-neutral-600">{sessionError}</p>}
                <button
                  type="button"
                  onClick={onRetryWake}
                  className="mt-4 h-9 px-4 rounded-full glass-panel text-[12.5px] text-neutral-300 hover:bg-white/[0.06] transition-colors duration-150"
                >
                  Try again
                </button>
              </>
            ) : (
              <>
                <Loader2 size={20} className="text-[#D39448] animate-spin" />
                <p className="mt-3 text-[12.5px] text-neutral-400">Loading your feed…</p>
              </>
            )}
          </div>
        )}

        {hasPrev && (
          <button
            type="button"
            onClick={goPrev}
            title="Previous"
            className="absolute top-2 left-1/2 -translate-x-1/2 z-10 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition-colors"
          >
            <ChevronUp size={16} />
          </button>
        )}
        {currentReel && (
          <button
            type="button"
            onClick={goNext}
            title="Next"
            className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition-colors disabled:opacity-40"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>

      <p className="mt-3 text-[11px] text-neutral-600">Scroll, swipe, or use ↑ / ↓ to move between reels.</p>
    </div>
  );
}
