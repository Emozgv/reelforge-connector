import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatDuration, formatViews } from "../lib/researchFeedMapping";
import type { Platform, ReelVideo } from "../types";

// ReelForge Connector's local session server (scripts/session-server.mjs) —
// see its own header comment for the full architecture reasoning. The web
// app talks to it directly; no deep link, no relaunch, for every
// next/prev/like while a research session is actually active.
const SESSION_SERVER_URL = "http://127.0.0.1:48211";
const HEARTBEAT_MS = 15_000;
const WAKE_TIMEOUT_MS = 15_000;
const BEGIN_SESSION_TIMEOUT_MS = 20_000;

interface RawLiveReel {
  id: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  caption: string | null;
  username: string | null;
  viewsRaw: number | null;
  likes: number | null;
  comments: number | null;
  durationSec: number;
  postedDaysAgo: number | null;
}

function liveReelToVideo(raw: RawLiveReel, platform: Platform): ReelVideo {
  return {
    id: raw.id,
    platform,
    username: raw.username ?? "unknown",
    sourceUrl: raw.sourceUrl,
    thumbnailUrl: raw.thumbnailUrl ?? undefined,
    videoUrl: raw.videoUrl ?? undefined,
    caption: raw.caption ?? undefined,
    // No real platform-provided view count for this reel — the live player
    // hides the metric instead of showing a misleading 0 (see
    // SwipeResearchPlayer). viewsRaw still needs a number to satisfy
    // ReelVideo's shared shape, but it's never rendered for a live reel.
    views: raw.viewsRaw != null ? formatViews(raw.viewsRaw) : "",
    viewsRaw: raw.viewsRaw ?? 0,
    likes: raw.likes ?? undefined,
    comments: raw.comments ?? undefined,
    tags: [],
    saved: false,
    used: false,
    duration: formatDuration(raw.durationSec ?? 0),
    durationSec: raw.durationSec ?? 0,
    postedDaysAgo: raw.postedDaysAgo ?? undefined,
  };
}

async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${SESSION_SERVER_URL}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

// A custom-scheme handoff doesn't navigate the page away, and when
// Connector is already running (the normal case) nothing here ever runs —
// checkHealth() alone already succeeded. This is ONLY reached from
// retryWithWake(), which is only ever called from a real click (see
// SwipeResearchPlayer's "needs_connector" button) — confirmed by direct
// testing that navigating to a custom scheme from anywhere else (a mount
// effect, a timer) does not reliably reach Connector, either because the
// browser suppresses it outright or shows a permission prompt the VA never
// expected and has no reason to trust enough to approve. A real, deliberate
// click is what makes that prompt (if the OS/browser shows one at all)
// legible instead of a mysterious interruption.
function wakeConnector() {
  window.location.href = "reelforge-connect://wake?account=wake&token=wake";
}

async function waitForConnector(maxMs: number): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 800));
    if (await checkHealth()) return true;
  }
  return false;
}

export type LiveSessionStatus = "idle" | "connecting" | "active" | "error" | "needs_connector";

interface ActiveSession {
  accountId: string;
  sessionId: string;
  sessionSecret: string;
}

/**
 * Drives the ACTIVE Research Account swipe experience directly from a real,
 * persistent Instagram Reels session Connector keeps open — not from a
 * database of previously-synced reels. "Next" into new territory is a real
 * scroll on that real page; "previous" replays this session's own in-memory
 * history. Nothing here is written to Supabase — the session lives only as
 * long as this hook (and the underlying Connector process) does.
 */
export function useLiveResearchSession(workspaceId: string | undefined) {
  const [currentReel, setCurrentReel] = useState<ReelVideo | null>(null);
  const [hasPrev, setHasPrev] = useState(false);
  const [status, setStatus] = useState<LiveSessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<ActiveSession | null>(null);
  const platformRef = useRef<Platform>("instagram");
  const heartbeatRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const pendingRef = useRef<{ accountId: string; platform: Platform } | null>(null);
  // Bumped on every startSession/retryWithWake call. beginSession captures
  // its own value and checks it before every state write, so a slow/hung
  // attempt that's since been superseded (or a timeout that already forced
  // a fallback) can never clobber newer state after the fact.
  const attemptRef = useRef(0);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const endSession = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    stopHeartbeat();
    if (!session) return;
    try {
      await fetch(`${SESSION_SERVER_URL}/sessions/${session.sessionId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionSecret: session.sessionSecret }),
        keepalive: true,
      });
    } catch {
      // Best-effort — Connector's own heartbeat timeout closes it regardless.
    }
  }, [stopHeartbeat]);

  // Marks Connector unreachable mid-session (heartbeat failure, or a
  // beginSession attempt that never resolved) and puts the UI back into the
  // one state it can always recover from with a real click.
  const fallBackToNeedsConnector = useCallback(
    (accountId: string, platform: Platform) => {
      sessionRef.current = null;
      stopHeartbeat();
      pendingRef.current = { accountId, platform };
      setCurrentReel(null);
      setError(null);
      setStatus("needs_connector");
    },
    [stopHeartbeat]
  );

  // Does the actual work of talking to Connector once it's confirmed
  // reachable — shared by the silent automatic path (Connector already
  // running) and the explicit, click-triggered retry path (Connector needed
  // waking up first).
  const beginSession = useCallback(
    async (accountId: string, platform: Platform) => {
      const attemptId = ++attemptRef.current;
      const isStale = () => attemptRef.current !== attemptId;

      let timedOut = false;
      const timeoutId = window.setTimeout(() => {
        if (isStale()) return;
        timedOut = true;
        fallBackToNeedsConnector(accountId, platform);
      }, BEGIN_SESSION_TIMEOUT_MS);

      try {
        const { data, error: invokeError } = await supabase.functions.invoke<{
          token?: string;
          error?: string;
        }>("start-research-live-session", { body: { workspaceId, accountId } });

        if (isStale() || timedOut) return;

        if (invokeError || !data?.token) {
          setStatus("error");
          setError(data?.error ?? "Couldn't start a research session.");
          return;
        }

        const res = await fetch(`${SESSION_SERVER_URL}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, token: data.token }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't start a research session.");

        if (isStale() || timedOut) {
          // A newer attempt (or the timeout fallback) already took over —
          // don't let this late response resurrect a session nothing is
          // tracking anymore.
          void fetch(`${SESSION_SERVER_URL}/sessions/${body.sessionId}/end`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionSecret: body.sessionSecret }),
          }).catch(() => {});
          return;
        }

        sessionRef.current = { accountId, sessionId: body.sessionId, sessionSecret: body.sessionSecret };
        setCurrentReel(body.reel ? liveReelToVideo(body.reel, platform) : null);
        setHasPrev(false);
        setStatus("active");
        pendingRef.current = null;

        heartbeatRef.current = window.setInterval(() => {
          const s = sessionRef.current;
          if (!s) return;
          fetch(`${SESSION_SERVER_URL}/sessions/${s.sessionId}/heartbeat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionSecret: s.sessionSecret }),
          }).catch(() => {
            // Connector died (or became unreachable) while this tab stayed
            // open — the old behavior silently swallowed this, leaving the
            // UI stuck showing a session that no longer exists anywhere.
            // Detect it here and fall back to the one recoverable state.
            if (sessionRef.current !== s) return;
            fallBackToNeedsConnector(accountId, platform);
          });
        }, HEARTBEAT_MS);
      } catch (err) {
        if (isStale() || timedOut) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Couldn't start a research session.");
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    [workspaceId, fallBackToNeedsConnector]
  );

  // Opening a Research Account calls this automatically — it never attempts
  // to launch/wake Connector itself. If Connector is already running (the
  // normal case, e.g. it never fully quit, or the VA is on their second
  // account of the day), checkHealth() succeeds immediately and this is
  // completely silent and automatic. Only when it genuinely isn't running
  // does this stop and wait for a real click (see retryWithWake) — direct
  // testing confirmed that trying to launch Connector from here instead
  // (no user gesture behind it) does not reliably work.
  const startSession = useCallback(
    async (accountId: string, platform: Platform) => {
      await endSession();

      if (platform !== "instagram" && platform !== "tiktok") {
        setStatus("error");
        setError("Live research sessions aren't available for this platform yet.");
        setCurrentReel(null);
        return;
      }
      if (!workspaceId) {
        setStatus("error");
        setError("No active workspace.");
        return;
      }

      platformRef.current = platform;
      setError(null);
      setCurrentReel(null);
      setHasPrev(false);

      if (await checkHealth()) {
        setStatus("connecting");
        await beginSession(accountId, platform);
        return;
      }

      pendingRef.current = { accountId, platform };
      setStatus("needs_connector");
    },
    [workspaceId, endSession, beginSession]
  );

  // The ONLY place that ever navigates to reelforge-connect:// to wake
  // Connector — must only ever be called directly from a real click (see
  // SwipeResearchPlayer), not from an effect or a timer.
  const retryWithWake = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return;
    setStatus("connecting");
    setError(null);
    wakeConnector();
    const ready = await waitForConnector(WAKE_TIMEOUT_MS);
    if (!ready) {
      setStatus("error");
      setError("Couldn't reach ReelForge Connector. Make sure it's installed, then try again.");
      return;
    }
    await beginSession(pending.accountId, pending.platform);
  }, [beginSession]);

  const next = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || busyRef.current) return;
    busyRef.current = true;
    try {
      const res = await fetch(`${SESSION_SERVER_URL}/sessions/${session.sessionId}/next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionSecret: session.sessionSecret }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't load the next reel.");
      if (body.reel) setCurrentReel(liveReelToVideo(body.reel, platformRef.current));
      setHasPrev(!!body.hasPrev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the next reel.");
    } finally {
      busyRef.current = false;
    }
  }, []);

  const prev = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || busyRef.current) return;
    busyRef.current = true;
    try {
      const res = await fetch(`${SESSION_SERVER_URL}/sessions/${session.sessionId}/prev`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionSecret: session.sessionSecret }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't go back.");
      if (body.reel) setCurrentReel(liveReelToVideo(body.reel, platformRef.current));
      setHasPrev(!!body.hasPrev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't go back.");
    } finally {
      busyRef.current = false;
    }
  }, []);

  const like = useCallback(async (): Promise<{ liked: boolean; error?: string }> => {
    const session = sessionRef.current;
    if (!session) return { liked: false, error: "No active research session." };
    try {
      const res = await fetch(`${SESSION_SERVER_URL}/sessions/${session.sessionId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionSecret: session.sessionSecret }),
      });
      const body = await res.json();
      return { liked: !!body.liked, error: body.error };
    } catch (err) {
      return { liked: false, error: err instanceof Error ? err.message : "Couldn't like this reel." };
    }
  }, []);

  // A VA closing the tab (not just navigating within ReelForge) should end
  // the session too. Neither event is guaranteed to fire or to finish its
  // fetch before the page is actually torn down (pagehide fires more
  // reliably than beforeunload in some browsers, so both are wired), which
  // is exactly why Connector's own heartbeat timeout — now 15s between
  // beats, ~45s to close an unresponsive session — is the real backstop,
  // not a nice-to-have: it's what actually guarantees "closing the tab ends
  // the session soon" regardless of whether either of these fires.
  useEffect(() => {
    function handleUnload() {
      void endSession();
    }
    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
    };
  }, [endSession]);

  useEffect(() => () => void endSession(), [endSession]);

  return { currentReel, hasPrev, status, error, startSession, endSession, next, prev, like, retryWithWake };
}
