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
// Bounds waitForUpdateToFinish's poll once Connector has announced it's
// updating -- generous enough for a real download+install+relaunch (the
// macOS/Windows installers are tens of MB) on an ordinary connection, not
// just a same-network unit-test-speed restart. Giving up after this just
// means the VA sees a clear "taking longer than expected, try again"
// message instead of waiting forever -- restart still completes on its own
// in the background regardless.
const UPDATE_WAIT_MAX_MS = 120_000;
// How long startResearchFromClick waits, right after nudging an
// already-running Connector to check for an update, before concluding "no
// update, proceed normally". Deliberately short and fixed -- this runs on
// every ordinary "Start research" click, not just the rarer wake path, so
// it must stay small enough to be imperceptible when (the common case) no
// update is found, while still giving Connector's own update-manifest fetch
// a real chance to answer first.
const UPDATE_PRECHECK_MAX_MS = 1600;
// A `next()` response with reel: null is Connector legitimately reporting
// "the local buffer was empty and Instagram's own feed hasn't refilled it
// yet" (see ensurePending() in session-server.mjs), not an error -- but
// leaving it to the VA to notice and click Next again to "wake up" another
// attempt is exactly the manual-retry UX this bounds away. NEXT_RETRY_TOTAL_MS
// caps how long next() will keep quietly retrying on the VA's behalf before
// giving up and surfacing the existing recovery banner; NEXT_RETRY_GAP_MS is
// just a small pause between attempts, not a change to Connector's own
// per-attempt timing (still exactly ensurePending's existing 2x4000ms).
// Matches Connector's own PREFETCH_MAX_DURATION_MS (session-server.mjs) --
// real [trace] evidence showed genuine post-exhaustion recovery can take
// 60-70s, so this must not give up sooner than the server itself would
// still be quietly trying on the VA's behalf in the background.
const NEXT_RETRY_TOTAL_MS = 90_000;
const NEXT_RETRY_GAP_MS = 500;

export interface LiveComment {
  id: string;
  username: string | null;
  text: string;
  postedAt: number | null;
  likeCount: number | null;
}

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

// `updating` mirrors what lib.rs's spawn_update_check posts to Connector's
// own /update-status the instant it's actually about to install an update
// it's already decided is safe to install now (see session-server.mjs) --
// reachable-but-updating is what lets the UI show a real "Connector is
// updating" state instead of misreading the restart that follows as a
// generic failure. Every existing checkHealth() caller only ever needed
// reachability, so it stays a thin wrapper rather than being rewritten.
async function fetchHealth(): Promise<{ reachable: boolean; updating: boolean }> {
  try {
    const res = await fetch(`${SESSION_SERVER_URL}/health`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { reachable: false, updating: false };
    const body = await res.json().catch(() => null);
    return { reachable: true, updating: !!body?.updating };
  } catch {
    return { reachable: false, updating: false };
  }
}

async function checkHealth(): Promise<boolean> {
  return (await fetchHealth()).reachable;
}

// A custom-scheme handoff doesn't navigate the page away, and when
// Connector is already running (the normal case) nothing here ever runs —
// checkHealth() alone already succeeded. Reached from retryWithWake() (the
// "needs_connector" button) and from startResearchFromClick() below (every
// ordinary "Start research" click, to nudge an already-running Connector
// into checking for an update too) — both only ever called from a real
// click, confirmed by direct testing that navigating to a custom scheme
// from anywhere else (a mount effect, a timer) does not reliably reach
// Connector, either because the browser suppresses it outright or shows a
// permission prompt the VA never expected and has no reason to trust enough
// to approve. A real, deliberate click is what makes that prompt (if the
// OS/browser shows one at all) legible instead of a mysterious interruption.
//
// Tauri's single-instance plugin means this reaches an already-running
// Connector exactly the same way it reaches a cold-launched one (see
// lib.rs's single_instance callback) — there's no separate "ping an
// already-running instance" API needed, this already is one.
function wakeConnector() {
  window.location.href = "reelforge-connect://wake?account=wake&token=wake";
}

// Polls reachability like a plain wait would, but also watches for
// Connector announcing it's installing an update it already decided is
// safe to install now (see fetchHealth's own comment) so the caller can
// switch into a clear "updating" state instead of only ever seeing
// reachable/unreachable.
async function waitForConnectorOrUpdate(maxMs: number): Promise<"ready" | "updating" | "timeout"> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 800));
    const health = await fetchHealth();
    if (health.reachable && health.updating) return "updating";
    if (health.reachable) return "ready";
  }
  return "timeout";
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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Best-effort but not silent: a release call that fails outright (e.g. an
// auth hiccup landing at the same moment, unrelated to the lock itself)
// used to be swallowed by a bare .catch(() => {}), orphaning the lock for
// the rest of its 5-minute lease with no trace. One retry, matching the
// same retry-once-on-transient-failure pattern Connector's own archive path
// already uses for its analogous case.
//
// Uses a raw fetch with keepalive instead of supabase.functions.invoke (which
// doesn't expose that option) -- this call is also the one endSession fires
// from a beforeunload/pagehide handler on a *real* tab close/reload, and
// without keepalive the browser can abort it mid-flight before it reaches
// the server, orphaning the lock for the rest of its lease with no error to
// even log.
async function releaseLock(accountId: string) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/release-research-account-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ accountId }),
        keepalive: true,
      });
      if (res.ok) return;
    } catch {
      // network failure — fall through to retry/log below
    }
    if (attempt === 2) {
      console.error(`[lock] release-research-account-lock failed for account ${accountId}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
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
// "updating" — Connector announced (via /health's `updating` flag) that
// it's installing an update it already decided is safe to install right
// now, found either by this wake or by an already-running instance being
// nudged into checking (see startResearchFromClick). Distinct from "error"/
// "needs_connector" specifically so this never reads as a broken Connector
// -- it always resolves on its own into a real session once the updated
// process comes back up (see waitForUpdateToFinish), never into a dead end
// needing a VA click to recover from.
export type LiveSessionStatus =
  | "idle"
  | "checking"
  | "connecting"
  | "updating"
  | "active"
  | "error"
  | "needs_connector"
  | "in_use";

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
  // Mirrors busyRef as real state (a ref alone can't trigger a re-render) so
  // the UI can show that a next()/prev() request is genuinely in flight —
  // on a fresh session this can legitimately take several seconds (up to
  // ~8s server-side: see ensurePending in session-server.mjs) while
  // Instagram's own feed refills an exhausted local buffer. Purely a visual
  // signal; it doesn't change next()/prev()'s own gating.
  const [navBusy, setNavBusy] = useState(false);
  const pendingRef = useRef<{ accountId: string; platform: Platform } | null>(null);
  // The account/platform behind whichever session most recently sat in
  // "idle" (ended, or found reachable at initial check) -- kept only so the
  // idle-reachability poll below has something to hand to needs_connector's
  // pendingRef when Connector disappears while nothing else is watching it.
  const lastIdleAccountRef = useRef<{ accountId: string; platform: Platform } | null>(null);
  // Which account this tab currently holds the live-research lock for, if
  // any — set the instant start-research-live-session actually acquires it,
  // well before sessionRef gets set (that only happens once Connector's own
  // /sessions POST resolves, which can take a while). Tracking this
  // separately from sessionRef is what lets a tab-close/unmount mid-connect
  // still release a lock it already holds, even though no session was ever
  // fully established.
  const lockedAccountIdRef = useRef<string | null>(null);
  // Guards startSession/retryWithWake against a second call landing before
  // the first has had a chance to move status off "needs_connector"/"idle"
  // (a fast double-click, or two nearly-simultaneous events from the same
  // click) -- a plain `disabled` prop only helps once React has re-rendered,
  // and a synchronous double-invocation can beat that render. Checked and
  // set synchronously at the very top of both functions, before any await,
  // so the second call is rejected outright rather than racing the first
  // one's own start-research-live-session call for the same lock.
  const startInFlightRef = useRef(false);
  // True only for the span of retryWithWake before beginSession is called
  // (the wakeConnector() hand-off, the reachability wait, and the visible
  // countdown) -- nothing is held yet during that window (no session, no
  // lock), so there is nothing real for a tab-close/reload to clean up.
  // Needed because window.location.href = "reelforge-connect://..." (the
  // only way that's been confirmed to reliably reach Connector -- see
  // wakeConnector()'s own comment) can itself fire a spurious pagehide in
  // Chrome/Safari as part of the browser handing off to the OS, even though
  // the tab never actually unloads. Without this, that false pagehide ran
  // endSession() mid-flow -- silently snapping status back to "idle" while
  // retryWithWake kept running underneath, hiding the countdown behind the
  // idle/checking branch (checked earlier in the ternary) and leaving the
  // in-flight guard stuck so the visible "Start research" button did
  // nothing when clicked.
  const wakingRef = useRef(false);
  // Set the instant retryWithWake confirms Connector reachable, so the
  // *next* startSession() call (the separate, explicit "Start research"
  // click that follows) knows this Connector process really did just
  // cold-launch and still plays the settle-time countdown once — without
  // retryWithWake itself chaining straight into a session start. Cleared
  // the moment it's consumed (or found stale on a failed health check), so
  // it can never cause a countdown to reappear on an unrelated later click.
  const justWokeRef = useRef(false);
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
    if (session) lastIdleAccountRef.current = { accountId: session.accountId, platform: platformRef.current };
    sessionRef.current = null;
    stopHeartbeat();
    setCurrentReel(null);
    setHasPrev(false);
    setError(null);
    setStatus("idle");

    // Release whatever lock this tab currently holds (or is mid-acquiring),
    // independent of whether a real Connector session was ever established.
    // Gating this on `session` being non-null used to mean a tab closed (or
    // an attempt abandoned) while still connecting -- lock already acquired,
    // sessionRef never set -- never released it at all, since this whole
    // block was skipped by the early `if (!session) return` below.
    //
    // Awaited, not fire-and-forget: startSession() already does
    // `await endSession()` as its first step before acquiring a new lock --
    // but that only serialized on this function's synchronous part unless
    // the release itself is also awaited. Without this, a fast End Research
    // -> Start Research on the same tab could have the new acquisition's
    // conditional UPDATE reach the database before this release's UPDATE
    // did, finding the just-ended lock still present and reporting the
    // account as already in use by its own prior holder.
    const lockedAccountId = lockedAccountIdRef.current;
    if (lockedAccountId) {
      lockedAccountIdRef.current = null;
      await releaseLock(lockedAccountId);
    }

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
      lastIdleAccountRef.current = { accountId, platform };
      setStatus("idle");
      return;
    }
    pendingRef.current = { accountId, platform };
    setStatus("needs_connector");
  }, []);

  // "idle" (Research session ended, or the very first check already found
  // Connector reachable) previously never re-verified Connector on its own
  // -- only starting a new session, or a heartbeat/visibility check during
  // an ACTIVE session, ever discovered it had gone away. That left "Research
  // session ended" showing even after Connector was fully quit, instead of
  // the real "Start ReelForge Connector" state. Polls only while sitting
  // idle; stops the moment status moves on for any reason (a session
  // starts, or it's already needs_connector). Same primitive (checkHealth)
  // and same needs_connector transition already used everywhere else here.
  useEffect(() => {
    if (status !== "idle") return;
    const interval = window.setInterval(async () => {
      if (await checkHealth()) return;
      if (lastIdleAccountRef.current) pendingRef.current = lastIdleAccountRef.current;
      setStatus("needs_connector");
    }, 5000);
    return () => window.clearInterval(interval);
  }, [status]);

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
      lockedAccountIdRef.current = null;
      void releaseLock(accountId);
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
          lockSecret?: string;
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

        // The lock is genuinely acquired the moment this call succeeds --
        // well before Connector's own /sessions POST below resolves. Record
        // it now so a tab close/unmount during that (potentially slow, cold
        // Chromium) wait still releases it, not just a clean success/fail.
        lockedAccountIdRef.current = accountId;

        const connectorStartedAt = performance.now();
        const res = await fetch(`${SESSION_SERVER_URL}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, token: data.token, lockSecret: data.lockSecret }),
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
              lockedAccountIdRef.current = null; // someone else holds it now, nothing left to release
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

  // Shared end of every path that discovers Connector is updating
  // (retryWithWake below, and startResearchFromClick's own precheck) --
  // reuses beginSession exactly as-is, so once the updated process reports
  // healthy again this continues straight into a real session with no
  // extra click, instead of landing back on "idle" waiting for the VA to
  // press Start research a second time.
  const waitForUpdateToFinish = useCallback(
    async (accountId: string, platform: Platform) => {
      setStatus("updating");
      setError(null);
      const deadline = Date.now() + UPDATE_WAIT_MAX_MS;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 800));
        const health = await fetchHealth();
        if (health.reachable && !health.updating) {
          await beginSession(accountId, platform);
          return;
        }
      }
      setStatus("error");
      setError("The Connector update is taking longer than expected. Please try again in a moment.");
    },
    [beginSession]
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
      if (startInFlightRef.current) return;
      startInFlightRef.current = true;
      try {
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
          // Set before the countdown below, not after -- SwipeResearchPlayer's
          // status ternary checks "checking" before it checks wakeCountdown,
          // so the countdown text would never actually render while status
          // was still "checking". "connecting" matches neither, letting the
          // ternary fall through to the countdown branch, exactly like
          // retryWithWake's own countdown used to rely on.
          setStatus("connecting");
          // Only true right after retryWithWake woke Connector from a cold
          // launch and stopped there (see its own comment) — the ordinary
          // already-running-Connector path below never touches this, so it
          // stays exactly as silent/instant as before.
          if (justWokeRef.current) {
            justWokeRef.current = false;
            for (let remaining = WAKE_STARTUP_DELAY_SEC; remaining > 0; remaining--) {
              setWakeCountdown(remaining);
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
            setWakeCountdown(null);
          }
          await beginSession(accountId, platform);
          return;
        }

        justWokeRef.current = false;
        pendingRef.current = { accountId, platform };
        setStatus("needs_connector");
      } finally {
        startInFlightRef.current = false;
      }
    },
    [workspaceId, endSession, beginSession]
  );

  // One of two places that ever navigate to reelforge-connect:// to wake
  // Connector (the other is startResearchFromClick below) — must only ever
  // be called directly from a real click (see SwipeResearchPlayer), not
  // from an effect or a timer.
  const retryWithWake = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending || startInFlightRef.current) return;
    startInFlightRef.current = true;
    wakingRef.current = true;
    try {
      setStatus("connecting");
      setError(null);
      wakeConnector();
      const outcome = await waitForConnectorOrUpdate(WAKE_TIMEOUT_MS);
      if (outcome === "timeout") {
        setStatus("error");
        setError("Couldn't reach ReelForge Connector. Make sure it's installed, then try again.");
        return;
      }
      wakingRef.current = false;

      if (outcome === "updating") {
        // Found an update on this same cold launch -- it should win over a
        // stale Connector, not the other way around. waitForUpdateToFinish
        // shows the dedicated "updating" state and, once the updated
        // process is back up, continues straight into a real session
        // itself -- no second "Start research" click needed.
        await waitForUpdateToFinish(pending.accountId, pending.platform);
        return;
      }

      // Connector is reachable now and not updating, but starting a real
      // Research session is a separate, explicit action from waking
      // Connector -- land back on the same ready screen startSession's
      // "idle" status already shows (with its own "Start research" button)
      // instead of chaining straight into the settle-time countdown and a
      // session start. justWokeRef makes the *next* startSession() call
      // show that countdown once, since this Connector process really did
      // just cold-launch.
      //
      // Nothing is held at this point -- no session, no lock -- so a real
      // tab close can go back to being handled normally.
      justWokeRef.current = true;
      setStatus("idle");
    } finally {
      wakingRef.current = false;
      startInFlightRef.current = false;
    }
  }, [waitForUpdateToFinish]);

  // The already-running-Connector counterpart to retryWithWake: fired from
  // the exact same "Start research" click startSession() already handles,
  // just before it. Pings Connector via the identical wakeConnector()
  // hand-off -- Tauri's single-instance plugin means that reaches an
  // already-running process exactly the same way it reaches a cold-launched
  // one (see lib.rs), re-running its own spawn_update_check with no second
  // updater system involved. Waits only UPDATE_PRECHECK_MAX_MS (short and
  // fixed, since this now runs on every ordinary start) for Connector to
  // announce an update before giving up and proceeding with the completely
  // unmodified startSession() -- so the common no-update case stays exactly
  // as fast as it already was, plus one small fixed pre-check.
  const startResearchFromClick = useCallback(
    async (accountId: string, platform: Platform) => {
      if (startInFlightRef.current) return;
      startInFlightRef.current = true;
      wakingRef.current = true;
      let updating = false;
      try {
        wakeConnector();
        const deadline = Date.now() + UPDATE_PRECHECK_MAX_MS;
        while (Date.now() < deadline) {
          const health = await fetchHealth();
          if (health.reachable && health.updating) {
            updating = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 400));
        }
      } finally {
        wakingRef.current = false;
      }

      if (updating) {
        try {
          await waitForUpdateToFinish(accountId, platform);
        } finally {
          startInFlightRef.current = false;
        }
        return;
      }

      // No update found in the short precheck window -- proceed exactly as
      // an ordinary click always has. Cleared first so startSession's own
      // identical guard (checked at its very top) doesn't mistake this
      // precheck's still-true flag for a second call already in flight.
      startInFlightRef.current = false;
      await startSession(accountId, platform);
    },
    [startSession, waitForUpdateToFinish]
  );

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
    setNavBusy(true);
    const deadline = Date.now() + NEXT_RETRY_TOTAL_MS;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
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
        setError(null);
        setHasPrev(!!body.hasPrev);
        if (body.reel) {
          setCurrentReel(liveReelToVideo(body.reel, platformRef.current));
          return;
        }
        // reel: null here means Connector's own refill wait (now up to
        // ~90s of its own background retrying, see maybePrefetch in
        // session-server.mjs) came up empty, not a failure -- retry
        // automatically, within a bounded total window, instead of
        // requiring the VA to click Next again. Bails out early if the
        // session itself changed underneath this call (e.g. ended) so a
        // stale retry loop never keeps running against a dead session.
        if (sessionRef.current !== session) {
          setError("This research session has changed. Try again.");
          return;
        }
        if (Date.now() >= deadline) {
          // Deliberately attributes the wait to Instagram, not to
          // ReelForge/Connector -- this is reached only after both the
          // background prefetch and this retry loop have already spent up
          // to ~90s genuinely trying, matching real observed worst-case
          // refill latency, not a quick give-up.
          setError("Instagram's feed is taking longer than usual to load more reels. Try again.");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, NEXT_RETRY_GAP_MS));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the next reel.");
    } finally {
      busyRef.current = false;
      setNavBusy(false);
    }
  }, [recoverFromDeadSession]);

  const prev = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || busyRef.current) return;
    busyRef.current = true;
    setNavBusy(true);
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
      setError(null);
      if (body.reel) setCurrentReel(liveReelToVideo(body.reel, platformRef.current));
      setHasPrev(!!body.hasPrev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't go back.");
    } finally {
      busyRef.current = false;
      setNavBusy(false);
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

  // Read-only, on-demand only (see CommentsPanel — it only calls this once
  // the VA has stayed on a reel for a few seconds with the panel open,
  // never for every reel while scrolling). reelId is passed back through so
  // the caller can discard a response that arrives after the VA has since
  // moved to a different reel, the same defensive check next()/prev() use.
  const fetchComments = useCallback(
    async (
      reelId: string,
      sourceUrl: string
    ): Promise<{ available: boolean; comments: LiveComment[]; reelId: string; error?: string }> => {
      const session = sessionRef.current;
      if (!session) return { available: false, comments: [], reelId, error: "No active research session." };
      try {
        const res = await fetch(`${SESSION_SERVER_URL}/sessions/${session.sessionId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionSecret: session.sessionSecret, reelId, sourceUrl }),
        });
        const body = await res.json();
        return {
          available: !!body.available,
          comments: Array.isArray(body.comments) ? body.comments : [],
          reelId,
          error: body.error,
        };
      } catch (err) {
        return {
          available: false,
          comments: [],
          reelId,
          error: err instanceof Error ? err.message : "Couldn't load comments for this reel.",
        };
      }
    },
    []
  );

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
      // See wakingRef's own comment: wakeConnector()'s custom-scheme
      // hand-off can itself trigger a spurious pagehide that never actually
      // unloads the page. Nothing is held yet during that window anyway, so
      // skipping is safe -- and necessary, since running endSession() here
      // for real would silently corrupt the still-in-progress wake/countdown
      // flow underneath it.
      if (wakingRef.current) return;
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
    navBusy,
    startSession,
    endSession,
    checkInitialReachability,
    next,
    prev,
    like,
    follow,
    block,
    fetchComments,
    retryWithWake,
    startResearchFromClick,
  };
}
