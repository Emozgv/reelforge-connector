import { useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown, ExternalLink, Loader2, Heart, Play as PlayIcon, MoreHorizontal, Link as LinkIcon, Check, Ban, AlertTriangle, Square, MessageCircle, Send } from "lucide-react";
import type { ReelVideo, ResearchAccount } from "../../types";
import type { LiveSessionStatus } from "../../state/useLiveResearchSession";
import { PlatformIcon } from "../hub/PlatformIcon";
import { DEFAULT_THUMB_GRADIENT } from "../../data/mockData";
import { formatDuration } from "../../lib/researchFeedMapping";
import { formatCompactNumber } from "../../lib/formatCount";
import { DownloadConnectorLink } from "./DownloadConnectorButton";

export type LikeStatus = "pending" | "liked" | "failed";
export type FollowStatus = "pending" | "following" | "failed";
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
function SwipeSlide({
  video,
  active,
  pageActive,
  onLikeClick,
  likeStatus,
  onFollowClick,
  followStatus,
  onBlockCreator,
  blockStatus,
  canLike,
}: {
  video: ReelVideo;
  active: boolean;
  pageActive: boolean;
  onLikeClick: () => void;
  likeStatus?: LikeStatus;
  onFollowClick: () => void;
  followStatus?: FollowStatus;
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
        <div className="flex items-center gap-2">
          <p className="text-[14px] text-white font-medium">@{video.username}</p>
          {canLike && (
            <button
              type="button"
              onClick={onFollowClick}
              disabled={followStatus === "pending" || followStatus === "following"}
              className={[
                "text-[11px] font-medium disabled:cursor-default",
                followStatus === "following" ? "text-white/50" : "text-[#D39448] hover:text-[#e0a860]",
              ].join(" ")}
              title={
                followStatus === "following"
                  ? "Following on the real account"
                  : followStatus === "pending"
                    ? "Following…"
                    : followStatus === "failed"
                      ? "Couldn't confirm the follow — try again"
                      : "Follow on the real account"
              }
            >
              {followStatus === "following"
                ? "Following"
                : followStatus === "pending"
                  ? "Following…"
                  : followStatus === "failed"
                    ? "Retry"
                    : "Follow"}
            </button>
          )}
        </div>
        {video.caption && (
          <button
            type="button"
            onClick={() => setCaptionExpanded((v) => !v)}
            className={["mt-1 text-left text-[12.5px] text-white/95 leading-snug", captionExpanded ? "" : "line-clamp-2"].join(" ")}
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

      {/* right stat rail — matches the Research Accounts Figma reference
          exactly: Like is the one real action here (acts on the actual
          Instagram account, same live session); comment/share counts are
          real data from the reel itself (video.comments/video.shares) but
          purely informational, same as Figma shows them — no comment-level
          or share action exists to back an interactive button there. Save/
          Add-to-Collection moved to the dedicated Save-to-Collection panel
          (ResearchAccountsPage) to match the reference, which doesn't show
          them on the video itself. */}
      <div className="absolute bottom-6 right-3 flex flex-col items-center gap-4">
        {canLike && (
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
            <span className="text-[9.5px] text-white/80 tabular-nums">
              {likeStatus === "pending"
                ? "…"
                : likeStatus === "failed"
                  ? "Retry"
                  : video.likes !== undefined
                    ? formatCompactNumber(video.likes)
                    : "Like"}
            </span>
          </button>
        )}
        <div className="flex flex-col items-center gap-1 text-white">
          <span className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center">
            <MessageCircle size={19} />
          </span>
          {video.comments !== undefined && (
            <span className="text-[9.5px] text-white/80 tabular-nums">{formatCompactNumber(video.comments)}</span>
          )}
        </div>
        {video.shares !== undefined && (
          <div className="flex flex-col items-center gap-1 text-white">
            <span className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center">
              <Send size={18} />
            </span>
            <span className="text-[9.5px] text-white/80 tabular-nums">{formatCompactNumber(video.shares)}</span>
          </div>
        )}
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
  navBusy,
  sessionStatus,
  sessionError,
  wakeCountdown,
  lockedByLabel,
  onNext,
  onPrev,
  onLikeClick,
  likeStatus,
  onFollowClick,
  followStatus,
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
  // True while a next()/prev() request is genuinely in flight -- on a
  // fresh/exhausted local buffer this can legitimately take several
  // seconds waiting for Instagram's own feed to refill (see
  // ensurePending() in session-server.mjs). Purely a visual "still
  // working" signal; the chevrons already handle their own gating.
  navBusy: boolean;
  sessionStatus: LiveSessionStatus;
  sessionError: string | null;
  wakeCountdown: number | null;
  lockedByLabel: string | null;
  onNext: () => void;
  onPrev: () => void;
  onLikeClick: (video: ReelVideo) => void;
  likeStatus: Record<string, LikeStatus>;
  onFollowClick: (video: ReelVideo) => void;
  followStatus: Record<string, FollowStatus>;
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
        className="relative w-[345px] h-[min(76vh,670px)] rounded-2xl overflow-hidden border border-white/[0.08]"
      >
        {currentReel ? (
          <SwipeSlide
            key={currentReel.id}
            video={currentReel}
            active
            pageActive={active}
            onLikeClick={() => onLikeClick(currentReel)}
            likeStatus={likeStatus[currentReel.id]}
            onFollowClick={() => onFollowClick(currentReel)}
            followStatus={followStatus[currentReel.id]}
            onBlockCreator={() => onBlockCreator(currentReel)}
            blockStatus={blockStatus[currentReel.id]}
            canLike={currentReel.platform === "instagram" || currentReel.platform === "tiktok"}
          />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center bg-[#0d0d0f] text-center px-6">
            {connecting ? (
              <>
                <Loader2 size={18} className="text-amber-400/80 animate-pulse mb-1" />
                <p className="text-[13px] text-neutral-100">This account is still connecting.</p>
                <p className="mt-1.5 text-[11.5px] text-neutral-600">
                  Once ReelForge finishes setting up its real session, this account's feed will start appearing here
                  automatically.
                </p>
              </>
            ) : sessionStatus === "in_use" ? (
              // A Research Account only ever has one active live session at
              // a time, across tabs, devices, and team members — this
              // shows up either when starting a session finds it already
              // held, or when a running session's own lock lapses because
              // someone else started one first.
              <>
                <Square size={16} className="text-neutral-600 mb-1" />
                <p className="text-[13px] text-neutral-100">This account is already being researched.</p>
                <p className="mt-1.5 text-[11.5px] text-neutral-600 max-w-[220px]">
                  {lockedByLabel ?? "Another team member"} is using it right now. Try again once they're done.
                </p>
                <button
                  type="button"
                  onClick={onRefreshSession}
                  className="mt-4 h-9 px-4 rounded-full glass-panel text-[12.5px] text-neutral-300 hover:bg-white/[0.06] transition-colors duration-150"
                >
                  Check again
                </button>
              </>
            ) : sessionStatus === "updating" ? (
              // Connector found a newer version and is installing it before
              // Research starts, rather than letting an outdated Connector
              // start unnoticed -- this must never read as the generic
              // needs_connector/error states below, since nothing is broken
              // and no click is needed: it resolves into Research on its own
              // once the updated Connector comes back up.
              <>
                <Loader2 size={20} className="text-[#D39448] animate-spin" />
                <p className="mt-3 text-[12.5px] text-neutral-400">Updating ReelForge Connector…</p>
                <p className="mt-1.5 text-[11.5px] text-neutral-600 max-w-[220px]">
                  Research will start automatically as soon as it's ready.
                </p>
              </>
            ) : sessionStatus === "needs_connector" ? (
              <>
                <p className="text-[13px] text-neutral-100">ReelForge Connector needs to start.</p>
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
                <p className="text-[13px] text-neutral-100">Couldn't start this research session.</p>
                {sessionError && <p className="mt-1.5 text-[11.5px] text-neutral-600">{sessionError}</p>}
                <button
                  type="button"
                  onClick={onRetryWake}
                  className="mt-4 h-9 px-4 rounded-full glass-panel text-[12.5px] text-neutral-300 hover:bg-white/[0.06] transition-colors duration-150"
                >
                  Try again
                </button>
              </>
            ) : sessionStatus === "idle" || sessionStatus === "checking" ? (
              <>
                {sessionStatus === "checking" ? (
                  <Loader2 size={16} className="text-neutral-500 animate-spin mb-1" />
                ) : (
                  <Square size={16} className="text-neutral-600 mb-1" />
                )}
                <p className="text-[13px] text-neutral-100">
                  {sessionStatus === "checking" ? "Checking Research status…" : "Research session ended."}
                </p>
                <p className="mt-1.5 text-[11.5px] text-neutral-600 max-w-[220px]">
                  Archive, saves, and this account's connection are untouched — start a new live session whenever
                  you're ready.
                </p>
                <button
                  type="button"
                  disabled={sessionStatus === "checking"}
                  onClick={onRefreshSession}
                  className="mt-4 h-9 px-4 rounded-full bg-[#D39448] text-[#020508] text-[12.5px] font-medium hover:brightness-110 transition-[filter] duration-150 disabled:opacity-40 disabled:cursor-default"
                >
                  Start research
                </button>
              </>
            ) : wakeCountdown !== null ? (
              // Connector just woke from a cold launch and answered /health,
              // but that alone doesn't mean it's settled enough for a full
              // session start yet — this visible pause (not an extra wait on
              // top of anything, just what fills this same window) is what
              // stops research from starting the instant it's reachable.
              <>
                <Loader2 size={20} className="text-[#D39448] animate-spin" />
                <p className="mt-3 text-[12.5px] text-neutral-400">Starting research in {wakeCountdown}…</p>
              </>
            ) : sessionStatus === "connecting" ? (
              // Covers both: the health-check wait right after a click
              // (before a cold-launch countdown even starts, or when
              // Connector was already running and there's no countdown at
              // all), and the real session-establishing work after the
              // countdown ends. Distinct from the generic "Loading your
              // feed…" fallback below so a click always shows an immediate,
              // clearly-labeled response instead of the same static text
              // used for an unrelated already-active reload.
              <>
                <Loader2 size={20} className="text-[#D39448] animate-spin" />
                <p className="mt-3 text-[12.5px] text-neutral-400">Starting Research…</p>
              </>
            ) : sessionStatus === "active" ? (
              // A session did start, but its very first reel pull came back
              // empty (Connector's session.next() gives up after ~8s if
              // Instagram's own feed hasn't yielded anything yet — see
              // ensurePending in session-server.mjs). Nothing polls or
              // retries this on its own, and hasPrev/currentReel are both
              // falsy here too, so without this branch the chevrons never
              // appear and the generic spinner below never recovers.
              <>
                <Loader2 size={20} className="text-[#D39448] animate-spin" />
                <p className="mt-3 text-[12.5px] text-neutral-400">Feed hasn't loaded a reel yet.</p>
                <button
                  type="button"
                  onClick={onRefreshSession}
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

        {/* currentReel truthy skips the whole status overlay above, which
            is otherwise the only place sessionError/sessionStatus ever
            render -- so a next()/prev() failure while a reel is already on
            screen (Connector drops mid-session, request fails) previously
            left the stale reel showing with zero indication anything was
            wrong, chevrons visually unchanged but silently failing on every
            further click. This surfaces that exact case without hiding the
            reel or touching the overlay logic above. */}
        {currentReel && sessionError && (
          <div className="absolute inset-x-3 top-12 z-30 rounded-lg bg-rose-950/90 backdrop-blur-sm px-3 py-2 flex items-center gap-2 shadow-lg">
            <AlertTriangle size={13} className="text-rose-300 shrink-0" />
            <p className="flex-1 text-[11px] text-rose-100 leading-snug">{sessionError}</p>
            <button
              type="button"
              onClick={onRefreshSession}
              className="shrink-0 text-[11px] font-medium text-white underline underline-offset-2 hover:text-rose-200"
            >
              Retry
            </button>
          </div>
        )}

        {hasPrev && (
          <button
            type="button"
            onClick={goPrev}
            title={navBusy ? "Waiting for the next reel to load…" : "Previous"}
            className="absolute top-2 left-1/2 -translate-x-1/2 z-10 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition-colors"
          >
            {navBusy ? <Loader2 size={14} className="animate-spin" /> : <ChevronUp size={16} />}
          </button>
        )}
        {currentReel && (
          <button
            type="button"
            onClick={goNext}
            title={navBusy ? "Waiting for the next reel to load…" : "Next"}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition-colors disabled:opacity-40"
          >
            {loading || navBusy ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>

      <p className="mt-3 text-[11px] text-neutral-600">Scroll, swipe, or use ↑ / ↓ to move between reels.</p>
    </div>
  );
}
