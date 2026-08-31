import { useEffect, useRef, useState } from "react";
import { MessageCircle, Loader2, Heart, ChevronDown } from "lucide-react";
import type { ReelVideo } from "../../types";
import type { LiveComment } from "../../state/useLiveResearchSession";

// Read-only, on-demand only -- never prefetched, never polled. Two distinct
// load moments, both deliberate:
//  1. The panel is opened for the reel currently in view -> load right away.
//  2. The panel stays open and the VA moves to a different reel (Next/Prev)
//     -> wait DWELL_MS of them actually staying on that reel before loading
//     its comments, so a quick skim through several reels with the panel
//     open never fires a burst of comment fetches for reels nobody actually
//     paused on. Skipping away before the dwell elapses cancels the pending
//     load entirely -- nothing was ever requested for that reel.
// Closing the panel (isOpen false) tears down any pending timer and fetches
// nothing until it's reopened -- there is no comment-fetch activity at all
// while it's closed.
const DWELL_MS = 5000;

type ReelResult =
  | { status: "loaded"; comments: LiveComment[] }
  | { status: "empty" }
  | { status: "unavailable"; error?: string };

export function CommentsPanel({
  video,
  isOpen,
  fetchComments,
}: {
  video: ReelVideo | null;
  isOpen: boolean;
  fetchComments: (reelId: string, sourceUrl: string) => Promise<{ available: boolean; comments: LiveComment[]; reelId: string; error?: string }>;
}) {
  const [displayReelId, setDisplayReelId] = useState<string | null>(null);
  const [dwelling, setDwelling] = useState(false);
  const [loading, setLoading] = useState(false);

  const wasOpenRef = useRef(false);
  const dwellTimerRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  // Every reel this panel-open session has actually finished fetching for,
  // so bouncing back to a reel already loaded (e.g. a dwell for a different
  // reel gets cancelled by returning here) shows its real result again
  // instead of a stale "loading" left over from that cancelled dwell.
  const resultsRef = useRef<Map<string, ReelResult>>(new Map());

  useEffect(() => {
    function clearDwellTimer() {
      if (dwellTimerRef.current !== null) {
        window.clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
    }

    async function runFetch(targetVideo: ReelVideo) {
      const myRequestId = ++requestIdRef.current;
      setLoading(true);
      setDwelling(false);
      setDisplayReelId(targetVideo.id);
      const result = await fetchComments(targetVideo.id, targetVideo.sourceUrl);
      // A newer open/close/reel-change already superseded this request --
      // never let a late response overwrite what's currently shown.
      if (myRequestId !== requestIdRef.current) return;
      const stored: ReelResult = !result.available
        ? { status: "unavailable", error: result.error }
        : result.comments.length === 0
          ? { status: "empty" }
          : { status: "loaded", comments: result.comments };
      resultsRef.current.set(targetVideo.id, stored);
      setLoading(false);
    }

    clearDwellTimer();

    if (!isOpen || !video) {
      wasOpenRef.current = isOpen;
      // Invalidate any fetch already in flight so its response, if it
      // lands after this, is discarded rather than shown once reopened.
      requestIdRef.current++;
      setLoading(false);
      setDwelling(false);
      return;
    }

    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;

    if (justOpened) {
      resultsRef.current = new Map();
      void runFetch(video);
      return;
    }

    if (resultsRef.current.has(video.id)) {
      // Already have a real result for this reel (it was fully loaded
      // before, or the VA is back after an in-flight fetch already
      // finished) -- show it again, no new request.
      requestIdRef.current++;
      setLoading(false);
      setDwelling(false);
      setDisplayReelId(video.id);
      return;
    }

    // Panel was already open and the reel changed under it (Next/Prev) --
    // only load after a genuine dwell, never on every swipe. Deliberately
    // leaves displayReelId/loading alone here -- whatever was on screen for
    // the previous reel just stays there until this dwell actually
    // completes, rather than flashing to empty the instant the VA moves on.
    setDwelling(true);
    dwellTimerRef.current = window.setTimeout(() => {
      dwellTimerRef.current = null;
      void runFetch(video);
    }, DWELL_MS);

    return () => clearDwellTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, video?.id]);

  if (!isOpen) return null;

  const result = displayReelId ? resultsRef.current.get(displayReelId) : undefined;

  return (
    <div
      className="w-full h-[min(80vh,700px)] rounded-xl border border-[#1a130b] flex flex-col overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #070707, #020202)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.035), inset 0 0 0 1px rgba(0,0,0,0.4), 0 16px 32px -18px rgba(0,0,0,0.8), 0 0 0 0.5px rgba(211,148,72,0.45), 0 0 10px rgba(211,148,72,0.12)",
      }}
    >
      {/* Comments/Notes tabs — Notes has no backing feature yet (no note
          storage exists anywhere in the app), so it's shown per the Figma
          reference but disabled rather than invented. */}
      <div className="flex items-center border-b border-white/[0.08]">
        <button
          type="button"
          className="flex items-center gap-1.5 px-4 h-11 text-[12.5px] font-medium text-[#D39448] border-b-2 border-[#D39448]"
        >
          <MessageCircle size={13} />
          Comments
        </button>
        <button
          type="button"
          disabled
          title="Notes aren't available yet"
          className="flex items-center gap-1.5 px-4 h-11 text-[12.5px] text-neutral-600 cursor-not-allowed"
        >
          Notes
        </button>
      </div>

      <div className="px-4 pt-3 flex items-center justify-between">
        <span className="text-[10.5px] tracking-[0.14em] uppercase text-neutral-500 font-medium">Top Comments</span>
        {/* Sorting isn't implemented (comments render in whatever order the
            provider returns) — shown to match the reference, disabled
            rather than pretending to sort. */}
        <button
          type="button"
          disabled
          title="Sorting isn't available yet"
          className="flex items-center gap-1 text-[11px] text-neutral-600 cursor-not-allowed"
        >
          Most Relevant
          <ChevronDown size={11} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!video ? (
          <div className="h-full flex items-center justify-center text-center">
            <p className="text-[11.5px] text-neutral-600">No reel is being viewed right now.</p>
          </div>
        ) : dwelling ? (
          <div className="h-full flex items-center justify-center text-center">
            <p className="text-[11.5px] text-neutral-600">·</p>
          </div>
        ) : loading || !result ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2">
            <Loader2 size={16} className="animate-spin text-white/40" />
            <p className="text-[11.5px] text-neutral-500">Loading comments…</p>
          </div>
        ) : result.status === "unavailable" ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-1.5 px-2">
            <p className="text-[12.5px] text-neutral-400">Comments aren't available for this reel right now.</p>
            {result.error && <p className="text-[11px] text-neutral-600">{result.error}</p>}
          </div>
        ) : result.status === "empty" ? (
          <div className="h-full flex items-center justify-center text-center">
            <p className="text-[12.5px] text-neutral-500">No comments yet on this reel.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {result.comments.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2 text-[12.5px] leading-snug">
                <div>
                  <span className="text-neutral-200 font-medium">{c.username ?? "unknown"}</span>{" "}
                  <span className="text-neutral-400">{c.text}</span>
                  {typeof c.likeCount === "number" && (
                    <div className="text-[11px] text-neutral-600 mt-0.5">{c.likeCount.toLocaleString()} likes</div>
                  )}
                </div>
                {/* Read-only, like the rest of this panel — there's no
                    comment-level like action on the real account. */}
                <Heart size={12} className="shrink-0 mt-0.5 text-neutral-700" />
              </li>
            ))}
          </ul>
        )}
      </div>

      {result?.status === "loaded" && (
        // No pagination/API support for loading more than this batch, so
        // this stays disabled rather than promising a "load more" that
        // isn't real — shown per the reference with the real fetched count.
        <div className="p-3 border-t border-white/[0.08]">
          <button
            type="button"
            disabled
            title="Loading more comments isn't available yet"
            className="w-full h-9 rounded-lg border border-white/[0.06] text-[12px] text-neutral-600 cursor-not-allowed"
          >
            View all {result.comments.length} comments
          </button>
        </div>
      )}
    </div>
  );
}
