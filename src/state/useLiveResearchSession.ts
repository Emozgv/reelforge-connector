import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatDuration, formatViews } from "../lib/researchFeedMapping";
import type { Platform, ReelVideo } from "../types";

// ReelForge Connector's local session server (scripts/session-server.mjs) —
// see its own header comment for the full architecture reasoning. The web
// app talks to it directly; no deep link, no relaunch, for every
// next/prev/like while a research session is actually active.
const SESSION_SERVER_URL = "http://127.0.0.1:48211";
const HEARTBEAT_MS = 20_000;
const WAKE_TIMEOUT_MS = 15_000;

interface RawLiveReel {
  id: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  caption: string | null;
  username: string | null;
  viewsRaw: number;
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
    views: formatViews(raw.viewsRaw ?? 0),
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
// Connector is already running (the normal case) the OS delivers it with
// no relaunch/prompt — this is the same mechanism connecting/resyncing
// already used, just for the sole purpose of "make sure the process (and
// therefore its session server) is alive."
function wakeConnector() {
  window.location.href = "reelforge-connect://wake?account=wake&token=wake";
}

async function ensureConnectorReady(): Promise<boolean> {
  if (await checkHealth()) return true;
  wakeConnector();
  const deadline = Date.now() + WAKE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 800));
    if (await checkHealth()) return true;
  }
  return false;
}

export type LiveSessionStatus = "idle" | "connecting" | "active" | "error";

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

  const startSession = useCallback(
    async (accountId: string, platform: Platform) => {
      await endSession();

      if (platform !== "instagram") {
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
      setStatus("connecting");
      setError(null);
      setCurrentReel(null);
      setHasPrev(false);

      const ready = await ensureConnectorReady();
      if (!ready) {
        setStatus("error");
        setError("Couldn't reach ReelForge Connector. Make sure it's installed, then try again.");
        return;
      }

      const { data, error: invokeError } = await supabase.functions.invoke<{
        token?: string;
        error?: string;
      }>("start-research-live-session", { body: { workspaceId, accountId } });

      if (invokeError || !data?.token) {
        setStatus("error");
        setError(data?.error ?? "Couldn't start a research session.");
        return;
      }

      try {
        const res = await fetch(`${SESSION_SERVER_URL}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, token: data.token }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't start a research session.");

        sessionRef.current = { accountId, sessionId: body.sessionId, sessionSecret: body.sessionSecret };
        setCurrentReel(body.reel ? liveReelToVideo(body.reel, platform) : null);
        setHasPrev(false);
        setStatus("active");

        heartbeatRef.current = window.setInterval(() => {
          const s = sessionRef.current;
          if (!s) return;
          void fetch(`${SESSION_SERVER_URL}/sessions/${s.sessionId}/heartbeat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionSecret: s.sessionSecret }),
          }).catch(() => {});
        }, HEARTBEAT_MS);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Couldn't start a research session.");
      }
    },
    [workspaceId, endSession]
  );

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
  // the session too — best-effort, since Connector's own heartbeat timeout
  // is the real safety net if this doesn't get a chance to fire.
  useEffect(() => {
    function handleUnload() {
      void endSession();
    }
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [endSession]);

  useEffect(() => () => void endSession(), [endSession]);

  return { currentReel, hasPrev, status, error, startSession, endSession, next, prev, like };
}
