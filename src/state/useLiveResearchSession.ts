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
// Purely a visible "let it start properly" pause after Connector just woke
// up from a cold launch -- not an extra wait added on top of WAKE_TIMEOUT_MS
// (which only bounds how long we wait for it to become reachable at all).
const WAKE_STARTUP_DELAY_SEC = 10;
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

// A 403/404 from the session server means Connector itself is fine but this
// specific session no longer exists there anymore (reaped after a
// heartbeat gap — e.g. a backgrounded tab getting its timers throttled —
// or Connector restarted) — distinct from a network failure, which means
// Connector itself is unreachable. Worth telling apart: one needs a fresh
// session (automatic, no VA action needed), the other needs Connector
// actually started again.
function isSessionGoneStatus(status: number) {
  return status === 403 || status === 404;
}

// "checking" is deliberately its own state, distinct from both "idle" and
// "connecting" — it's the brief window where Connector's reachability
// simply isn't known yet (mid checkHealth() call). Folding it into "idle"
// or "connecting" is exactly what let the UI show a misleading state
// during that window before (a stale neutral screen, or a "Loading your
// feed" spinner implying a feed fetch that hadn't actually started yet).
// "connecting" is now reserved for the part that's actually true of it:
// Connector is confirmed reachable and a real session is being created.
// "in_use" — a Research Account may only have one active live session at a
// time, across tabs, devices, and team members (the underlying Instagram/
// TikTok session is a single real browser context; letting two callers
// drive it silently clobbered each other's cached sync_token). Set when
// start-research-live-session reports the account's lock is currently held
// by someone else; lockedByLabel names who.
export type LiveSessionStatus = "idle" | "checking" | "connecting" | "active" | "error" | "needs_connector" | "in_use";

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
  // Set only during retryWithWake's post-wake pause (see WAKE_STARTUP_DELAY_MS
  // below) — null the rest of the time, including during a normal
  // already-running-Connector session start.
  const [wakeCountdown, setWakeCountdown] = useState<number | null>(null);
  // Who currently holds the account's live-research lock, set only alongside
  // status === "in_use".
  const [lockedByLabel, setLockedByLabel] = useState<string | null>(null);
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

  // Always leaves the UI in a genuinely neutral state, not just a cleared
  // ref — this is what makes "End research" (and the no-account/inactive-
  // account branch) actually show a clean start state instead of a stale
  // last reel with no session behind it. Harmless when startSession calls
  // this as its own first step too: the "idle" flash is immediately
  // overwritten by "connecting" a moment later.
  const endSession = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    stopHeartbeat();
    setCurrentReel(null);
    setHasPrev(false);
    setError(null);
    setStatus("idle");
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
    // Frees this account for someone else right away instead of waiting out
    // the ~5min lock lease. Best-effort too — a failure here just means the
    // lease itself expires on its own shortly after.
    supabase.functions.invoke("release-research-account-lock", { body: { accountId: session.accountId } }).catch(() => {});
  }, [stopHeartbeat]);

  // Called once, the first time a Research Account becomes available (app
  // load, or the very first account ever selected) — never on a later
  // account/platform switch, which still just calls endSession() as before.
  // Without this, that first render fell straight into endSession()'s
  // "idle" state, which reads as "Research session ended" even though no
  // session had ever existed yet — genuinely wrong when Connector isn't
  // even running, and the real "Start ReelForge Connector" state only
  // showed up a click later. This mirrors startSession's own first check
  // (checking -> idle or needs_connector) but deliberately stops short of
  // beginSession() — reachable settles into idle, same as if nothing had
  // run at all, so it never starts a session on its own.
  const checkInitialReachability = useCallback(async (accountId: string, platform: Platform) => {
    if (platform !== "instagram" && platform !== "tiktok") return;
    setStatus("checking");
    if (await checkHealth()) {
      setStatus("idle");
      return;
    }
    pendingRef.current = { accountId, platform };
    setStatus("needs_connector");
  }, []);

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
      // This attempt is being abandoned client-side (20s begin-session
      // timeout, or Connector became unreachable) -- release whatever lock
      // it may have already acquired, or a retry (same user, same tab) will
      // find its own still-valid lock and get falsely told the account is
      // "already being researched" by itself. A no-op if this attempt never
      // actually got as far as acquiring one.
      supabase.functions.invoke("release-research-account-lock", { body: { accountId } }).catch(() => {});
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
      setLockedByLabel(null);

      let timedOut = false;
      const timeoutId = window.setTimeout(() => {
        if (isStale()) return;
        timedOut = true;
        fallBackToNeedsConnector(accountId, platform);
      }, BEGIN_SESSION_TIMEOUT_MS);

      // Diagnostic-only timing, no behavior change -- pairs with the
      // [timing] logs inside Connector's session-server.mjs so a slow
      // "Loading your feed…" report can be attributed to a specific step
      // instead of guessed at.
      const startedAt = performance.now();
      try {
        const { data, error: invokeError } = await supabase.functions.invoke<{
          token?: string;
          error?: string;
          holder?: string;
        }>("start-research-live-session", { body: { workspaceId, accountId } });
        console.log(`[timing] start-research-live-session invoke: ${(performance.now() - startedAt).toFixed(0)}ms`);

        if (isStale() || timedOut) return;

        if (invokeError || !data?.token) {
          // supabase-js only sets a generic message on invokeError for a
          // non-2xx response — the real { error, holder } body (specifically
          // the "in_use" conflict) only comes through via error.context.
          let body = data;
          if (invokeError) {
            const context = (invokeError as { context?: Response }).context;
            body = await context?.json().catch(() => undefined);
          }
          if (body?.error === "in_use") {
            setStatus("in_use");
            setLockedByLabel(body.holder ?? "another team member");
            return;
          }
          setStatus("error");
          setError(body?.error ?? "Couldn't start a research session.");
          return;
        }

        const connectorStartedAt = performance.now();
        const res = await fetch(`${SESSION_SERVER_URL}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, token: data.token }),
        });
        const body = await res.json();
        console.log(
          `[timing] connector POST /sessions (chromium+nav+first-reel, see Connector's own log for the breakdown): ${(performance.now() - connectorStartedAt).toFixed(0)}ms`
        );
        console.log(`[timing] beginSession total: ${(performance.now() - startedAt).toFixed(0)}ms`);
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
          })
            .then((res) => {
              // The old code only had a .catch() here, so a non-2xx
              // response (this session doesn't exist anymore, but
              // Connector itself answered just fine) was silently treated
              // as a successful heartbeat — the UI kept believing a
              // session that the server had already reaped was still
              // alive, right up until the VA's next click failed with no
              // explanation. A live tab, backgrounded and later resumed,
              // is exactly when this happened: browsers throttle
              // setInterval while hidden, heartbeats arrive late, the
              // server reaps the session, and the tab returns none the
              // wiser until this check catches it.
              if (res.ok || sessionRef.current !== s) return;
              if (isSessionGoneStatus(res.status)) void beginSession(accountId, platform);
              else fallBackToNeedsConnector(accountId, platform);
            })
            .catch(() => {
              // A real network failure — Connector itself is unreachable.
              if (sessionRef.current !== s) return;
              fallBackToNeedsConnector(accountId, platform);
            });

          // Same tick, one more thing it does — keeps this account's
          // exclusive live-research lock alive. If this session lost the
          // lock (lease lapsed and someone else started a session on the
          // same account first), end this one and show who has it now,
          // rather than let it keep silently driving a session that's no
          // longer exclusively ours per the one-session-per-account rule.
          void supabase.functions
            .invoke<{ ok?: boolean; holder?: string | null }>("refresh-research-account-lock", {
              body: { accountId: s.accountId },
            })
            .then(({ data }) => {
              if (data?.ok || sessionRef.current !== s) return;
              void fetch(`${SESSION_SERVER_URL}/sessions/${s.sessionId}/end`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionSecret: s.sessionSecret }),
              }).catch(() => {});
              sessionRef.current = null;
              stopHeartbeat();
              setCurrentReel(null);
              setStatus("in_use");
              setLockedByLabel(data?.holder ?? "another team member");
            })
            .catch(() => {
              // Best-effort — a real network failure here doesn't mean the
              // lock was actually lost, so this deliberately does nothing
              // rather than kicking the VA out over a blip.
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
    [workspaceId, fallBackToNeedsConnector, stopHeartbeat]
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
      // Reachability isn't known yet — say so, rather than defaulting to
      // "idle" (looks like nothing is happening) or "connecting" (implies
      // a session is already being created) for the ~1.5s checkHealth()
      // can genuinely take.
      setStatus("checking");

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

    // Connector answering /health doesn't mean it's actually settled enough
    // for a full session start (cold-launched process, browser binaries,
    // etc.) -- a visible countdown here, instead of starting the instant
    // it's reachable, is what gives it that room.
    for (let remaining = WAKE_STARTUP_DELAY_SEC; remaining > 0; remaining--) {
      if (!pendingRef.current) {
        setWakeCountdown(null); // superseded (e.g. account/platform switched away)
        return;
      }
      setWakeCountdown(remaining);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setWakeCountdown(null);

    await beginSession(pending.accountId, pending.platform);
  }, [beginSession]);

  // Shared by next/prev: a dead-session response (Connector's fine, this
  // particular session just isn't there anymore — see isSessionGoneStatus)
  // shouldn't just surface an error and leave the VA stuck on a swipe that
  // silently does nothing forever. Starting a fresh session recovers the
  // feed automatically; the specific reel the VA was swiping toward is
  // lost, but a live, working feed beats an endless dead end.
  const recoverFromDeadSession = useCallback(
    (accountId: string) => {
      void beginSession(accountId, platformRef.current);
    },
    [beginSession]
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
      if (!res.ok) {
        if (isSessionGoneStatus(res.status)) {
          recoverFromDeadSession(session.accountId);
          return;
        }
        throw new Error(body.error ?? "Couldn't load the next reel.");
      }
      if (body.reel) setCurrentReel(liveReelToVideo(body.reel, platformRef.current));
      setHasPrev(!!body.hasPrev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the next reel.");
    } finally {
      busyRef.current = false;
    }
  }, [recoverFromDeadSession]);

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
      if (!res.ok) {
        if (isSessionGoneStatus(res.status)) {
          recoverFromDeadSession(session.accountId);
          return;
        }
        throw new Error(body.error ?? "Couldn't go back.");
      }
      if (body.reel) setCurrentReel(liveReelToVideo(body.reel, platformRef.current));
      setHasPrev(!!body.hasPrev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't go back.");
    } finally {
      busyRef.current = false;
    }
  }, [recoverFromDeadSession]);

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

  // A real platform action on the real connected account (see
  // session-server.mjs's Session.follow) — same shape as like().
  const follow = useCallback(async (): Promise<{ following: boolean; error?: string }> => {
    const session = sessionRef.current;
    if (!session) return { following: false, error: "No active research session." };
    try {
      const res = await fetch(`${SESSION_SERVER_URL}/sessions/${session.sessionId}/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionSecret: session.sessionSecret }),
      });
      const body = await res.json();
      return { following: !!body.following, error: body.error };
    } catch (err) {
      return { following: false, error: err instanceof Error ? err.message : "Couldn't follow this creator." };
    }
  }, []);

  // A real platform action on the real connected account (see
  // session-server.mjs's Session.block) — never a local-only hide.
  const block = useCallback(async (): Promise<{ blocked: boolean; error?: string }> => {
    const session = sessionRef.current;
    if (!session) return { blocked: false, error: "No active research session." };
    try {
      const res = await fetch(`${SESSION_SERVER_URL}/sessions/${session.sessionId}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionSecret: session.sessionSecret }),
      });
      const body = await res.json();
      return { blocked: !!body.blocked, error: body.error };
    } catch (err) {
      return { blocked: false, error: err instanceof Error ? err.message : "Couldn't block this creator." };
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

  // The fast path back from a backgrounded tab — don't just wait for the
  // next (possibly still-throttled right after becoming visible again)
  // heartbeat tick. The moment the tab is actually visible again, check the
  // session immediately: if it's gone, recover right away instead of
  // leaving the VA looking at a stale reel (or a stuck loader, if a
  // navigation was already in flight) for however long it takes the
  // regular interval to notice.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const s = sessionRef.current;
      if (!s) return;
      fetch(`${SESSION_SERVER_URL}/sessions/${s.sessionId}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionSecret: s.sessionSecret }),
      })
        .then((res) => {
          if (res.ok || sessionRef.current !== s) return;
          if (isSessionGoneStatus(res.status)) void beginSession(s.accountId, platformRef.current);
          else fallBackToNeedsConnector(s.accountId, platformRef.current);
        })
        .catch(() => {
          if (sessionRef.current !== s) return;
          fallBackToNeedsConnector(s.accountId, platformRef.current);
        });
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [beginSession, fallBackToNeedsConnector]);

  useEffect(() => () => void endSession(), [endSession]);

  return {
    currentReel,
    hasPrev,
    status,
    error,
    wakeCountdown,
    lockedByLabel,
    startSession,
    endSession,
    checkInitialReachability,
    next,
    prev,
    like,
    follow,
    block,
    retryWithWake,
  };
}
