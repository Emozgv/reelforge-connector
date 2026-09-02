import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  X,
  Users,
  LayoutGrid,
  Play,
  Check,
  Loader2,
  RotateCw,
  Info,
  RefreshCw,
  Square,
  CheckCircle2,
  StickyNote,
  FolderOpen,
  Bookmark,
  Diamond,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { researchFeedItemToVideo, type ResearchFeedItemRow } from "../../lib/researchFeedMapping";
import type { Creator, Platform, ReelVideo, ResearchAccount } from "../../types";
import type { CollectionsStore } from "../../state/useCollectionsStore";
import type { ConnectStart, ResearchAccountsStore } from "../../state/useResearchAccounts";
import { MAX_RESEARCH_ACCOUNTS_PER_PLATFORM } from "../../state/useResearchAccounts";
import { useLiveResearchSession, type LiveSessionStatus } from "../../state/useLiveResearchSession";
import { CreatorSelector } from "../hub/CreatorSelector";
import { PlatformIcon } from "../hub/PlatformIcon";
import { VideoGrid } from "../hub/VideoGrid";
import { SavePanel } from "../hub/SavePanel";
import { SavedCollectionsPopover } from "../hub/SavedCollectionsPopover";
import { ReelDetailModal } from "../hub/ReelDetailModal";
import { SwipeResearchPlayer, type LikeStatus, type FollowStatus } from "./SwipeResearchPlayer";
import { DownloadConnectorButton } from "./DownloadConnectorButton";
import { CommentsPanel } from "./CommentsPanel";
import { StarfieldBackground } from "../shared/StarfieldBackground";

// Local, page-scoped copy of DashboardPage.tsx's PANEL/PANEL_STYLE —
// byte-identical values, duplicated rather than imported so that frozen
// file stays untouched. The user was explicit: Dashboard's panel IS the
// brand DNA, not a close approximation of it — no gold ring, no extra
// depth tuning, just the same panel.
const PANEL = "rounded-xl border border-[#1a130b]";
const PANEL_STYLE = {
  background: "linear-gradient(180deg, #070707, #020202)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035), inset 0 0 0 1px rgba(0,0,0,0.4), 0 16px 32px -18px rgba(0,0,0,0.8)",
} as const;

function SessionRow({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-neutral-500">{label}</span>
      <span className={["text-[12px] font-medium text-right", muted ? "text-neutral-600" : "text-neutral-50"].join(" ")}>
        {value}
      </span>
    </div>
  );
}

function QuickActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  spinning,
  danger,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  spinning?: boolean;
  // Whole-button red treatment for a genuinely destructive/ending action
  // (End Research) — only applied while it's actually clickable, so an
  // inactive End Research still reads as inert, not alarming.
  danger?: boolean;
}) {
  const inactive = disabled || !onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inactive}
      title={!onClick ? "Not available yet" : undefined}
      className={[
        "press-feedback flex items-center gap-2.5 h-12 px-3.5 rounded-lg border text-[12.5px] transition-colors duration-150",
        inactive
          ? "border-white/[0.06] bg-[#0c0c0e] text-neutral-600 cursor-not-allowed"
          : danger
            ? "border-rose-500/30 bg-rose-500/[0.08] text-rose-200 hover:border-rose-500/50 hover:bg-rose-500/[0.14]"
            : "border-white/[0.07] bg-[#111114] text-neutral-50 hover:border-[#D39448]/35 hover:bg-[#161613]",
      ].join(" ")}
    >
      <Icon
        size={14}
        className={[
          spinning ? "animate-spin" : "",
          inactive ? "text-neutral-600" : danger ? "text-rose-400" : "text-[#D39448]",
        ].join(" ")}
      />
      {label}
    </button>
  );
}

const PLATFORM_LABEL: Record<Platform, string> = { instagram: "IG Research", tiktok: "TikTok Research" };

// Same hover-or-click, click-outside-to-close pattern as
// DownloadConnectorButton's platform choice popover — hover is the primary
// path (a quick "what does this mean" glance), click keeps it open for
// anyone on touch/trackpad-without-hover.
function ResearchInfoPopover() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="About Research training signals"
        className="w-5 h-5 rounded-full flex items-center justify-center text-neutral-600 hover:text-neutral-300 transition-colors duration-150"
      >
        <Info size={14} />
      </button>

      {open && (
        <div className="absolute left-0 top-7 z-20 w-[300px] rounded-xl bg-[#141416] border border-white/[0.09] shadow-2xl p-4 animate-fade-in">
          <p className="text-[11px] tracking-[0.08em] uppercase text-neutral-500 font-medium mb-1">What works</p>
          <p className="text-[12.5px] text-neutral-400 leading-relaxed mb-3">
            Likes, follows, blocks, and other supported interactions are applied to the connected Research Account
            and can help shape the feed.
          </p>
          <p className="text-[11px] tracking-[0.08em] uppercase text-neutral-500 font-medium mb-1">
            Current limitation
          </p>
          <p className="text-[12.5px] text-neutral-400 leading-relaxed mb-3">
            Watch-time signals are not fully supported inside ReelForge yet.
          </p>
          <p className="text-[11px] tracking-[0.08em] uppercase text-[#D39448] font-medium mb-1">
            Recommendation <span className="normal-case tracking-normal text-neutral-600">(optional)</span>
          </p>
          <p className="text-[12.5px] text-neutral-400 leading-relaxed">
            For the best starting experience, pre-train the Research Account directly on Instagram before connecting
            it to ReelForge. This gives a stronger initial feed while ReelForge continues training through supported
            interactions.
          </p>
        </div>
      )}
    </div>
  );
}

// Stable display order (whatever the store already returns, i.e. creation
// order) — selecting an account must never reshuffle this chip row.
function accountsFor(accounts: ResearchAccount[], creatorId: string, platform: Platform): ResearchAccount[] {
  return accounts.filter((a) => a.creatorId === creatorId && a.platform === platform);
}

// Separate from display order on purpose: only used to pick a resume point
// when switching Creator/platform, never for the chip row's own ordering.
function mostRecentlyOpened(accounts: ResearchAccount[]): ResearchAccount | null {
  return (
    [...accounts].sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""))[0] ?? null
  );
}

const STATUS_LABEL: Record<ResearchAccount["status"], string> = {
  connecting: "Connecting…",
  active: "Active",
  needs_attention: "Needs attention",
  disconnected: "Disconnected",
};
const STATUS_DOT: Record<ResearchAccount["status"], string> = {
  connecting: "bg-amber-400 animate-pulse",
  active: "bg-emerald-400 pulse-live",
  needs_attention: "bg-amber-400",
  disconnected: "bg-neutral-600",
};
const STATUS_DOT_PULSE_COLOR: Partial<Record<ResearchAccount["status"], string>> = {
  active: "rgba(52,211,153,0.55)",
};

// Connector Status chip's reachability, derived straight from the same
// LiveSessionStatus the player already uses for its own "Connector needs to
// start" state (see useLiveResearchSession's checkHealth/checkInitialReachability) —
// not a separate signal. "needs_connector" is the only state that means
// Connector genuinely isn't reachable; every other state (idle/connecting/
// updating/active/in_use/error) implies a health check already succeeded at
// some point. Version is intentionally still not shown here — Connector
// doesn't report its own version over /health today.
function connectorReachability(status: LiveSessionStatus): { label: string; dotClass: string; pulseColor?: string } {
  if (status === "needs_connector") return { label: "Not running", dotClass: "bg-rose-500" };
  if (status === "checking") return { label: "Checking…", dotClass: "bg-amber-400 animate-pulse" };
  return { label: "Connected", dotClass: "bg-emerald-400 pulse-live", pulseColor: "rgba(52,211,153,0.55)" };
}

// reelforge-connect:// is registered by the ReelForge Connector desktop app
// (connector-app/) — a small, self-contained helper (bundles its own Node +
// Playwright, no install for the VA beyond the app itself) that opens a
// real, visible Instagram/TikTok login window and waits for the VA to
// actually finish logging in, including whatever verification the platform
// asks for. Nothing in this web app or that link ever sees a password.
function connectDeepLink(platform: Platform, start: ConnectStart): string {
  return `reelforge-connect://connect?platform=${platform}&account=${encodeURIComponent(start.id)}&token=${encodeURIComponent(start.token)}`;
}

// The real "Connect Research Account" flow, in two steps. Step 1 (this
// modal's form) only asks for a label + the account's public username — no
// password, because a stored password could never reliably get through a
// real Instagram/TikTok login on its own (2FA, SMS codes, checkpoints, and
// CAPTCHAs are the norm, not the exception). Submitting the form issues a
// one-time token and hands off to the ReelForge Connector desktop app via a
// reelforge-connect:// link — the actual login happens there, in a real
// browser window, not inside ReelForge. Only once Connector detects a
// genuine session cookie and hands it back does the account go "Active"
// here — this modal just reflects that live status, it never sets it.
function ConnectAccountModal({
  platform,
  mode,
  initialStart,
  initialLabel,
  liveAccount,
  onSubmitNew,
  onClose,
}: {
  platform: Platform;
  mode: "new" | "reconnect";
  initialStart: ConnectStart | null;
  initialLabel?: string;
  liveAccount: ResearchAccount | null;
  onSubmitNew: (label: string, username: string) => Promise<{ start: ConnectStart | null; error: string | null }>;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [start, setStart] = useState<ConnectStart | null>(initialStart);
  const [helperNotDetected, setHelperNotDetected] = useState(false);
  const platformName = platform === "instagram" ? "Instagram" : "TikTok";

  function openConnector(nextStart: ConnectStart) {
    setHelperNotDetected(false);
    window.location.href = connectDeepLink(platform, nextStart);
    window.setTimeout(() => {
      if (!document.hidden) setHelperNotDetected(true);
    }, 1400);
  }

  // Hands off to the desktop helper the moment we have a token — for
  // "new", that's right after the form submits; for "reconnect", start is
  // already present when the modal opens.
  useEffect(() => {
    if (start) openConnector(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setSubmitting(true);
    setFormError(null);
    const { start: newStart, error: connectError } = await onSubmitNew(label.trim() || username.trim(), username.trim());
    setSubmitting(false);
    if (connectError) setFormError(connectError);
    else if (newStart) {
      setStart(newStart);
      openConnector(newStart);
    }
  }

  const status = liveAccount?.status;

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/75 backdrop-blur-[3px] animate-fade-in" />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[440px] rounded-2xl bg-[#141416] border border-white/[0.09] shadow-2xl p-5 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-serif text-neutral-50">
              {mode === "reconnect" ? `Reconnect ${initialLabel ?? "this account"}` : `Connect a ${platformName} account`}
            </h2>
            <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-200">
              <X size={16} />
            </button>
          </div>

          {!start ? (
            <form onSubmit={handleSubmit}>
              <p className="mt-1.5 text-[11.5px] text-neutral-500 leading-relaxed">
                You'll log into the real {platformName} account yourself in a moment — this just sets it up.
              </p>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">Label (optional)</label>
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. Lifestyle & Storytime"
                    className="mt-1 w-full h-9 px-3 rounded-lg surface-field text-[12.5px] text-neutral-100 placeholder:text-neutral-600 outline-none focus-glow"
                  />
                </div>
                <div>
                  <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">{platformName} username</label>
                  <input
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="@username"
                    className="mt-1 w-full h-9 px-3 rounded-lg surface-field text-[12.5px] text-neutral-100 placeholder:text-neutral-600 outline-none focus-glow"
                  />
                </div>
              </div>

              {formError && <p className="mt-3 text-[11.5px] text-rose-300/85">{formError}</p>}

              <button
                type="submit"
                disabled={submitting || !username.trim()}
                className="mt-4 w-full h-10 rounded-full bg-[#D39448] text-[#020508] text-[13px] font-medium hover:brightness-110 transition-[filter] duration-150 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {submitting ? "Setting up…" : "Continue"}
              </button>
            </form>
          ) : status === "active" ? (
            <div className="mt-4">
              <div className="flex items-center gap-2 text-emerald-400 text-[13px]">
                <Check size={15} />
                Connected — this is now a genuine, authenticated session.
              </div>
              <p className="mt-1.5 text-[11.5px] text-neutral-500 leading-relaxed">
                Its real feed will start appearing under {initialLabel ?? "this account"}.
              </p>
              <button
                onClick={onClose}
                className="mt-4 w-full h-10 rounded-full bg-[#D39448] text-[#020508] text-[13px] font-medium hover:brightness-110 transition-[filter] duration-150"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-[11.5px] text-neutral-500 leading-relaxed">
                ReelForge Connector should be opening now. A real, visible {platformName} login window will appear there —
                log in as you normally would, including any verification step {platformName} asks for. It closes itself
                the moment you're actually logged in, and this page updates on its own.
              </p>

              <div className="mt-4 flex items-center gap-2 text-[12px] text-amber-300/90">
                <Loader2 size={13} className="animate-spin" />
                Waiting for ReelForge Connector…
              </div>

              {helperNotDetected && (
                <div className="mt-3 rounded-lg surface-field px-3 py-2.5">
                  <p className="text-[11.5px] text-neutral-400 leading-relaxed">
                    Nothing opened? You may not have ReelForge Connector installed yet, or your browser blocked it — ask
                    your ReelForge admin for the installer, or retry below once it's installed.
                  </p>
                  <button
                    onClick={() => start && openConnector(start)}
                    className="mt-2 flex items-center gap-1.5 text-[12px] text-[#D39448] hover:text-[#e3a75f] transition-colors duration-150"
                  >
                    <RotateCw size={11} />
                    Try opening ReelForge Connector again
                  </button>
                </div>
              )}

              {status === "needs_attention" && (
                <p className="mt-3 text-[11.5px] text-amber-300/80">
                  This is taking a while, or a previous attempt didn't finish. You can close this and press Reconnect
                  to get a fresh link.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

type Mode = "swipe" | "archive";

export function ResearchAccountsPage({
  creators,
  creatorsError,
  collectionsStore,
  researchAccountsStore,
  userId,
  workspaceId,
  active,
  onOpenCollection,
}: {
  creators: Creator[];
  creatorsError?: string | null;
  collectionsStore: CollectionsStore;
  researchAccountsStore: ResearchAccountsStore;
  userId?: string;
  workspaceId?: string;
  // This page now stays mounted (see App.tsx) so the live research session
  // survives navigating to other Client OS sections and back — `active`
  // is only "is this the section actually on screen right now," for
  // gating things that should stop when it isn't (keyboard shortcuts,
  // video playback), not the session's own lifecycle.
  active: boolean;
  // Navigates to the Collections page for a specific collection — used by
  // the Collection button's browse popover (see SavedCollectionsPopover),
  // same navigation App.tsx already wires up for the Hub/Dashboard/etc.
  onOpenCollection: (collectionId: string) => void;
}) {
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(creators[0] ?? null);
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("swipe");
  // Archive only, from here down — the live session (below) drives Swipe.
  const [rawItems, setRawItems] = useState<ResearchFeedItemRow[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [feedError, setFeedError] = useState(false);
  const [detailVideoId, setDetailVideoId] = useState<string | null>(null);
  const [savePanelVideo, setSavePanelVideo] = useState<ReelVideo | null>(null);
  // Save and Collection are genuinely different actions, not two doors into
  // the same picker: Save opens the familiar quick-save/choose-a-collection
  // panel (SavePanel), Collection opens the same browse-your-collections
  // popover Creativity Hub's own "N saved" pill already uses
  // (SavedCollectionsPopover) — a pure browse/navigate view, not a save
  // target. Reusing that existing component rather than building another.
  const [savedPopoverOpen, setSavedPopoverOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [connectFlow, setConnectFlow] = useState<{ mode: "new" | "reconnect"; start: ConnectStart | null; label?: string } | null>(null);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const [likeStatus, setLikeStatus] = useState<Record<string, LikeStatus>>({});
  const [followStatus, setFollowStatus] = useState<Record<string, FollowStatus>>({});
  const [blockStatus, setBlockStatus] = useState<Record<string, "pending" | "done" | "failed">>({});
  const liveSession = useLiveResearchSession(workspaceId);

  useEffect(() => {
    if (!creators.some((c) => c.id === selectedCreator?.id)) setSelectedCreator(creators[0] ?? null);
  }, [creators, selectedCreator]);

  const currentAccounts = useMemo(
    () => (selectedCreator ? accountsFor(researchAccountsStore.accounts, selectedCreator.id, platform) : []),
    [researchAccountsStore.accounts, selectedCreator, platform]
  );
  const currentAccount = currentAccounts.find((a) => a.id === accountId) ?? currentAccounts[0] ?? null;

  // A cancelled-login message belongs to the specific account/context it
  // failed in — moving away from that context (switching platform, picking
  // a different account, a different Creator) should leave it behind, not
  // carry it along as a stale warning about an attempt that has nothing to
  // do with what's now on screen.
  useEffect(() => {
    setReconnectError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCreator?.id, platform, currentAccount?.id]);

  // While a connect/reconnect is pending, poll for the real status flip —
  // this app has no other way to learn that the local connector script
  // (running outside the browser) has finished a real login.
  useEffect(() => {
    if (!connectFlow?.start) return;
    const interval = window.setInterval(() => {
      void researchAccountsStore.refetch();
    }, 2500);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectFlow?.start?.id]);

  const connectFlowAccount = connectFlow?.start
    ? researchAccountsStore.accounts.find((a) => a.id === connectFlow.start!.id) ?? null
    : null;

  // A connect/reconnect attempt can die outside this tab entirely — the VA
  // closes the real login window, or it just times out — and
  // connect-worker.mjs reports that back by flipping this row to
  // needs_attention (see cancel-research-account-connect). Waiting for the
  // VA to notice a hint buried in still-open "waiting" copy isn't a real
  // recovery path, so this closes the modal itself the moment that lands —
  // dropping back to the account rail, which already has a real Reconnect
  // action, is the actual clean retry state.
  useEffect(() => {
    if (connectFlowAccount?.status !== "needs_attention") return;
    setConnectFlow(null);
    setReconnectError("Login didn't finish — it may have been closed or timed out. Press Reconnect to try again.");
  }, [connectFlowAccount?.status]);

  // Switching Creator or platform re-picks whichever account was worked on
  // most recently — a real, DB-backed resume point, not device-local memory.
  useEffect(() => {
    setAccountId(mostRecentlyOpened(currentAccounts)?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCreator?.id, platform]);

  async function loadFeed(accountId: string) {
    setLoadingFeed(true);
    setFeedError(false);
    // seq (a true per-row identity) is the deterministic order — synced_at
    // alone is shared by every reel in the same sync batch and can't fully
    // order or tie-break within it.
    const { data, error } = await supabase
      .schema("client_os")
      .from("research_feed_items")
      .select("*")
      .eq("research_account_id", accountId)
      .order("seq", { ascending: false });
    if (error) {
      setFeedError(true);
      setRawItems([]);
    } else {
      setRawItems(data as ResearchFeedItemRow[]);
    }
    setLoadingFeed(false);
  }

  useEffect(() => {
    if (!currentAccount) {
      setRawItems([]);
      return;
    }
    void researchAccountsStore.markOpened(currentAccount.id, userId);
    void loadFeed(currentAccount.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount?.id]);

  // Archive now fills in live as the VA actually scrolls through the real
  // session (see session-server.mjs's next()), not just from the old
  // connect-time/resync capture — refetching on switching into Archive
  // picks up whatever's landed since this account was last opened, without
  // needing a live subscription for what's still a history/cache view.
  useEffect(() => {
    if (mode === "archive" && currentAccount) void loadFeed(currentAccount.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // The live research session itself never auto-starts just because the
  // selected account/platform changed — switching Instagram <-> TikTok or
  // to a different account always lands on the same neutral "session
  // ended, press Start research" state End research already produces,
  // never a feed that's suddenly playing again on its own. Only an actual
  // click (the "Start research" button, or "Start ReelForge Connector")
  // ever begins a session — see useLiveResearchSession's startSession,
  // which is exactly what onRefreshSession/onRetryWake already call.
  //
  // What this effect still does on every account/platform change: cleanly
  // end whatever session was running before, so switching away always
  // closes the previous live session rather than leaving it running
  // unattended in the background. Navigating to a different Client OS
  // section and back does NOT hit this at all (currentAccount doesn't
  // change), which is what keeps a session already running across that
  // kind of navigation.
  useEffect(() => {
    // Every account/platform switch (not just the very first one) needs to
    // both end whatever session was running on the previous account AND
    // re-verify Connector's real reachability for the newly selected one —
    // endSession() alone always lands on "idle" ("Start research"), which
    // looks identical whether Connector is actually reachable or was quit
    // entirely. Previously this reachability check only ran once ever (see
    // git history), so switching accounts while Connector was down kept
    // showing "Start research" until the separate 5s idle-poll eventually
    // caught up.
    if (!currentAccount) return;
    void (async () => {
      await liveSession.endSession();
      await liveSession.checkInitialReachability(currentAccount.id, currentAccount.platform);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount?.id, currentAccount?.status]);

  const videos = useMemo(
    () => rawItems.map((r) => ({ ...researchFeedItemToVideo(r), saved: savedIds.has(r.id) })),
    [rawItems, savedIds]
  );

  const currentSwipeVideo = liveSession.currentReel
    ? { ...liveSession.currentReel, saved: savedIds.has(liveSession.currentReel.id) }
    : null;

  const detailIndex = videos.findIndex((v) => v.id === detailVideoId);
  const detailVideo = detailIndex >= 0 ? videos[detailIndex] : null;

  function markSaved(id: string) {
    setSavedIds((prev) => new Set(prev).add(id));
  }

  function sourceLabelFor(account: ResearchAccount): string {
    return `${PLATFORM_LABEL[account.platform]} — ${account.label}`;
  }

  // A real Like — acts directly on this account's real, currently-open
  // Reels session (see useLiveResearchSession.like / session-server.mjs's
  // Session.like), not a local toggle and not a separate deep-link round
  // trip. Success is only ever reported once Connector has confirmed
  // Instagram's own button genuinely changed state.
  async function handleLikeClick(video: ReelVideo) {
    if (likeStatus[video.id] === "pending" || likeStatus[video.id] === "liked") return;
    setLikeStatus((prev) => ({ ...prev, [video.id]: "pending" }));
    const { liked } = await liveSession.like();
    setLikeStatus((prev) => ({ ...prev, [video.id]: liked ? "liked" : "failed" }));
  }

  // A real platform action on the real connected account (see
  // session-server.mjs's Session.follow) — same shape as handleLikeClick.
  async function handleFollowClick(video: ReelVideo) {
    if (followStatus[video.id] === "pending" || followStatus[video.id] === "following") return;
    setFollowStatus((prev) => ({ ...prev, [video.id]: "pending" }));
    const { following, error } = await liveSession.follow();
    if (!following) console.error(`[follow] failed for ${video.username || video.id}: ${error ?? "(no error message)"}`);
    setFollowStatus((prev) => ({ ...prev, [video.id]: following ? "following" : "failed" }));
  }

  // A real platform action on the real connected account — the whole point
  // is that Instagram's/TikTok's own recommendation algorithm actually
  // stops surfacing this creator afterward, not a local ReelForge-only
  // blacklist. Only ever reports "done" once Connector has confirmed the
  // real block genuinely took effect (see session-server.mjs's Session.block).
  async function handleBlockCreator(video: ReelVideo) {
    if (blockStatus[video.id] === "pending" || blockStatus[video.id] === "done") return;
    setBlockStatus((prev) => ({ ...prev, [video.id]: "pending" }));
    const { blocked, error } = await liveSession.block();
    // Diagnostic-only, no behavior change yet -- surfaces the real reason
    // instead of only ever showing "Retry" with no way to tell why.
    if (!blocked) console.error(`[block] failed for ${video.username || video.id}: ${error ?? "(no error message)"}`);
    setBlockStatus((prev) => ({ ...prev, [video.id]: blocked ? "done" : "failed" }));
  }

  if (!selectedCreator) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-sm">
          {creatorsError ? (
            <p className="text-[14px] text-neutral-300">Couldn't load Creators.</p>
          ) : (
            <>
              <p className="text-[14px] text-neutral-300">Add a Creator to set up Research Accounts.</p>
              <p className="mt-1.5 text-[12px] text-neutral-500">Go to Creators → New Creator.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-y-auto" style={{ background: "#020203" }}>
      {/* Scoped, stronger than the shared .dashboard-starfield-boost (which
          stays untouched for the frozen Dashboard) — this page gets its
          own bump on top of it, same pattern as Creativity Hub. */}
      <style>{`
        .rf-research-starfield .star-twinkle { opacity: 0.6 !important; box-shadow: 0 0 4px rgba(255,250,240,0.45) !important; transform: scale(0.85); }
        @media (prefers-reduced-motion: no-preference) {
          .rf-research-starfield .star-twinkle { animation-name: star-twinkle-boosted !important; }
        }
      `}</style>
      <div className="relative max-w-[1400px] xl:max-w-[1650px] 2xl:max-w-[1900px] mx-auto px-10 xl:px-16 2xl:px-24 pt-8 pb-8">
        {/* Confined to the header/hero band only — not the whole scrollable
            page — same as how Dashboard/Creativity Hub scope their
            starfield to just the hero, not every panel below it. */}
        <div className="dashboard-starfield-boost rf-research-starfield pointer-events-none absolute inset-x-0 top-0 h-[160px] overflow-hidden">
          <StarfieldBackground starCount={110} />
        </div>
        <div className="relative flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <span className="text-[11px] tracking-[0.22em] uppercase text-[#D39448] font-medium">
                Research Accounts
              </span>
            </div>
            <h1 className="text-[34px] font-serif font-medium text-neutral-50 flex items-center gap-2">
              Live research. Real insights.
              <ResearchInfoPopover />
            </h1>
            <p className="mt-1.5 text-[13px] text-neutral-500 max-w-xl">
              Monitor creator content, capture winning concepts, and save directly into your Collections.
            </p>
          </div>
          <div className="flex flex-col items-end gap-11 shrink-0">
            <DownloadConnectorButton />
            {/* Reachability is real, driven straight off liveSession.status
                (the same signal the player uses for "Connector needs to
                start") — see connectorReachability() above. Version is
                still not shown: Connector doesn't report it over /health
                today, and DownloadConnectorButton deliberately avoids its
                own status indicator (see its comment), so this stays the
                one real reachability readout on the page. */}
            {(() => {
              const reachability = connectorReachability(liveSession.status);
              return (
                <div
                  title={reachability.label}
                  className="flex items-center gap-4 h-[52px] px-4 rounded-xl border border-[#1a130b]"
                  style={PANEL_STYLE}
                >
                  <div className="leading-tight">
                    <p className="text-[12px] text-neutral-400">Connector Status</p>
                    <p className="flex items-center gap-1.5 text-[12.5px] text-neutral-300 mt-0.5">
                      <span
                        className={["w-1.5 h-1.5 rounded-full", reachability.dotClass].join(" ")}
                        style={{ ["--pulse-live-color" as string]: reachability.pulseColor }}
                      />
                      {reachability.label}
                    </p>
                  </div>
                  <Diamond size={14} className="text-neutral-500 shrink-0" />
                </div>
              );
            })()}
          </div>
        </div>

        {/* consolidated toolbar — Creator, platform, and connected-account
            chips in one row, matching the reference. Same account rail as
            before, just no longer a separate row underneath. */}
        <div className={PANEL + " mt-4 flex items-center gap-3 flex-wrap px-4 py-3"} style={PANEL_STYLE}>
          <CreatorSelector creators={creators} selected={selectedCreator} onSelect={setSelectedCreator} />

          <span className="w-px h-8 bg-white/[0.08] shrink-0" />

          <div className="flex items-center h-11 p-1 rounded-full glass-panel">
            {(["instagram", "tiktok"] as const).map((p) => {
              // Temporarily disabled while TikTok's real-session reliability
              // (login blocks, feed freshness) gets re-verified on a clean
              // account/device/network — see connect-worker.mjs and
              // session-server.mjs, both left fully intact. Instagram is
              // completely unaffected; platform state already defaults to
              // "instagram" and this is the only place it's ever changed,
              // so disabling the click here is enough to fully block access.
              const disabled = p === "tiktok";
              return (
                <button
                  key={p}
                  onClick={() => {
                    if (!disabled) setPlatform(p);
                  }}
                  disabled={disabled}
                  title={disabled ? "TikTok Research is temporarily unavailable" : undefined}
                  className={[
                    "press-feedback flex items-center gap-1.5 h-9 px-4 rounded-full border text-[13px] capitalize transition-colors duration-150",
                    disabled
                      ? "border-transparent text-neutral-700 opacity-50 cursor-not-allowed"
                      : platform === p
                        ? "border-[#141009] text-[#f0c58c]"
                        : "border-transparent text-neutral-500 hover:text-neutral-300",
                  ].join(" ")}
                  style={!disabled && platform === p ? { background: "linear-gradient(90deg, #2a1e11, #1a1510)" } : undefined}
                >
                  <PlatformIcon platform={p} size={12} />
                  {p === "instagram" ? "Instagram" : "TikTok"}
                  {disabled && (
                    <span className="ml-0.5 text-[9px] tracking-wide uppercase text-neutral-600 font-medium">
                      Beta
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <span className="text-[11.5px] text-neutral-600 ml-1 shrink-0">Connected Accounts</span>
          {currentAccounts.map((a) => (
            <button
              key={a.id}
              onClick={() => setAccountId(a.id)}
              className={[
                "press-feedback group flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full border transition-all duration-150",
                a.id === currentAccount?.id
                  ? "border-[#D39448]/60 bg-[#D39448]/[0.16] text-[#D39448]"
                  : "border-white/[0.08] text-neutral-200 hover:text-neutral-50 hover:border-[#D39448]/35",
              ].join(" ")}
            >
              <PlatformIcon platform={a.platform} size={12} />
              <span className="text-[12.5px]">{a.label}</span>
              <span
                className={["w-2 h-2 rounded-full shrink-0", STATUS_DOT[a.status]].join(" ")}
                title={STATUS_LABEL[a.status]}
                style={{ ["--pulse-live-color" as string]: STATUS_DOT_PULSE_COLOR[a.status] }}
              />
              {(a.status === "needs_attention" || a.status === "disconnected") && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    setReconnectError(null);
                    const { start, error } = await researchAccountsStore.reconnectAccount(a.id, a.platform);
                    if (start) setConnectFlow({ mode: "reconnect", start, label: a.label });
                    else setReconnectError(error);
                  }}
                  title="Reconnect"
                  className="text-neutral-500 hover:text-[#D39448] transition-colors duration-150"
                >
                  <RotateCw size={11} />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void researchAccountsStore.deleteAccount(a.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-rose-300 transition-opacity duration-150"
              >
                <X size={11} />
              </button>
            </button>
          ))}
          <button
            onClick={() => {
              setReconnectError(null);
              setConnectFlow({ mode: "new", start: null });
            }}
            disabled={currentAccounts.length >= MAX_RESEARCH_ACCOUNTS_PER_PLATFORM}
            title={
              currentAccounts.length >= MAX_RESEARCH_ACCOUNTS_PER_PLATFORM
                ? `Up to ${MAX_RESEARCH_ACCOUNTS_PER_PLATFORM} accounts`
                : "Connect a research account"
            }
            className="press-feedback flex items-center gap-1 h-9 px-3 rounded-full border border-dashed border-white/[0.14] text-[12.5px] text-neutral-500 hover:text-neutral-200 hover:border-white/25 transition-colors duration-150 disabled:opacity-30 disabled:cursor-default"
          >
            <Plus size={13} />
            Connect account
          </button>
        </div>
        {reconnectError && <p className="mt-2 text-[11.5px] text-rose-300/85">{reconnectError}</p>}


        {connectFlow && (
          <ConnectAccountModal
            platform={platform}
            mode={connectFlow.mode}
            initialStart={connectFlow.start}
            initialLabel={connectFlow.label}
            liveAccount={connectFlowAccount}
            onClose={() => setConnectFlow(null)}
            onSubmitNew={async (label, username) => {
              const { start, error } = await researchAccountsStore.connectAccount(selectedCreator.id, platform, label, username);
              if (start) {
                setAccountId(start.id);
                setConnectFlow({ mode: "new", start, label });
              }
              return { start, error };
            }}
          />
        )}

        {!currentAccount ? (
          <div className="mt-6 flex flex-col items-center justify-center text-center rounded-xl surface-panel py-24">
            <Users size={20} className="text-neutral-700 mb-2.5" />
            <p className="text-[14.5px] font-serif text-neutral-300">
              No {platform === "instagram" ? "Instagram" : "TikTok"} research accounts for {selectedCreator.name} yet.
            </p>
            <p className="text-[12px] text-neutral-600 mt-1.5">Connect one above to start researching from its trained feed.</p>
          </div>
        ) : mode === "swipe" ? (
          <div className="mt-5 flex justify-center gap-7 items-start">
            {/* LEFT: Session Context + Quick Actions */}
            <div className="w-[290px] shrink-0 flex flex-col gap-4">
              <div className={PANEL + " p-5"} style={PANEL_STYLE}>
                <p className="text-[10.5px] tracking-[0.14em] uppercase text-neutral-500 font-medium mb-3">
                  Session Context
                </p>
                <div className="space-y-3">
                  <SessionRow
                    label="Account"
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        @{currentAccount.username || currentAccount.label}
                        <PlatformIcon platform={currentAccount.platform} size={11} />
                      </span>
                    }
                  />
                  <SessionRow
                    label="Platform"
                    value={currentAccount.platform === "instagram" ? "Instagram Reels" : "TikTok Videos"}
                  />
                  <SessionRow
                    label="Session"
                    value={
                      <span>
                        {currentAccount.label}
                        {liveSession.status === "active" && <span className="text-emerald-400"> - Active</span>}
                      </span>
                    }
                  />
                  {/* No session-start timestamp, elapsed-duration, or scan
                      counter exists anywhere in the live session state today
                      — shown per the reference for layout, left as an honest
                      "—" rather than invented values. */}
                  <SessionRow label="Started" value="—" muted />
                  <SessionRow label="Duration" value="—" muted />
                  <SessionRow label="Items Scanned" value="—" muted />
                </div>
              </div>

              <div className={PANEL + " p-5"} style={PANEL_STYLE}>
                <p className="text-[10.5px] tracking-[0.14em] uppercase text-neutral-500 font-medium mb-3">
                  Quick Actions
                </p>
                <div className="flex flex-col gap-2.5">
                  <QuickActionButton
                    icon={RefreshCw}
                    label="Refresh Feed"
                    spinning={liveSession.status === "connecting" || liveSession.status === "checking"}
                    disabled={liveSession.status !== "active"}
                    onClick={() => void liveSession.startResearchFromClick(currentAccount.id, currentAccount.platform)}
                  />
                  <QuickActionButton
                    icon={Square}
                    label="End Research"
                    disabled={liveSession.status !== "active"}
                    onClick={() => void liveSession.endSession()}
                    danger
                  />
                  {/* No "reviewed" state exists on any feed item yet. */}
                  <QuickActionButton icon={CheckCircle2} label="Mark All As Reviewed" />
                  {/* No creator-note storage exists anywhere in the app yet. */}
                  <QuickActionButton icon={StickyNote} label="Add Creator Note" />
                </div>
              </div>
            </div>

            {/* CENTER: the live reel player, now sitting inside its own
                Design-DNA panel (matching Session Context/Intelligence)
                instead of floating as a bare card — the video itself was
                pulled in slightly so it reads as content inside a panel,
                not the panel itself. */}
            <div className="w-[382px] shrink-0 self-stretch flex">
              <div className={PANEL + " p-4 flex-1 flex flex-col items-center"} style={PANEL_STYLE}>
                <div className="w-full max-w-[345px] flex items-center justify-between mb-3">
                  <span className="flex items-center gap-1.5 text-[12px] text-neutral-400">
                    <span className="text-neutral-500">Now Viewing</span>
                    {currentSwipeVideo && (
                      <>
                        <PlatformIcon platform={currentSwipeVideo.platform} size={12} />
                        <span className="text-neutral-50 font-medium">@{currentSwipeVideo.username}</span>
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMode("archive")}
                    className="text-[11.5px] text-[#D39448] hover:brightness-110 transition-[filter]"
                  >
                    View archive
                  </button>
                </div>
                {/* The logged-in research account itself — already shown in
                    Session Context on the left, repeated here so this panel
                    is self-explanatory on its own too. */}
                <div className="w-full max-w-[345px] flex items-center gap-1.5 mb-4 text-[11px] text-neutral-500">
                  <PlatformIcon platform={currentAccount.platform} size={11} />
                  Logged in as <span className="text-neutral-50 font-medium">@{currentAccount.username || currentAccount.label}</span>
                </div>
                <SwipeResearchPlayer
                account={currentAccount}
                currentReel={currentSwipeVideo}
                hasPrev={liveSession.hasPrev}
                loading={liveSession.status === "connecting" || liveSession.status === "checking"}
                navBusy={liveSession.navBusy}
                sessionStatus={liveSession.status}
                sessionError={liveSession.error}
                wakeCountdown={liveSession.wakeCountdown}
                lockedByLabel={liveSession.lockedByLabel}
                onNext={() => void liveSession.next()}
                onPrev={() => void liveSession.prev()}
                onLikeClick={handleLikeClick}
                likeStatus={likeStatus}
                onFollowClick={handleFollowClick}
                followStatus={followStatus}
                onBlockCreator={handleBlockCreator}
                blockStatus={blockStatus}
                onRefreshSession={() => void liveSession.startResearchFromClick(currentAccount.id, currentAccount.platform)}
                onRetryWake={() => {
                  // needs_connector -> the wake path (must run from this
                  // real click); a plain error -> just start over. Both
                  // startResearchFromClick and retryWithWake check for a
                  // pending Connector update before actually starting.
                  if (liveSession.status === "needs_connector") void liveSession.retryWithWake();
                  else void liveSession.startResearchFromClick(currentAccount.id, currentAccount.platform);
                }}
                active={active}
                />
              </div>
            </div>

            {/* RIGHT: Intelligence (Comments/Notes) + Save to Collection —
                one continuous card, matching the reference, instead of two
                separate stacked panels the VA had to scroll past. */}
            <div className="w-[390px] shrink-0 self-stretch flex min-h-0">
              <div className={PANEL + " flex-1 flex flex-col min-h-0"} style={PANEL_STYLE}>
                <p className="px-4 pt-4 text-[10.5px] tracking-[0.14em] uppercase text-neutral-500 font-medium">
                  Intelligence
                </p>
                {/* Fills whatever extra height this panel picks up from
                    self-stretch matching the center column's height, so the
                    comment list grows/shrinks with it instead of leaving
                    Save to Collection floating at a fixed offset. */}
                <div className="flex-1 flex flex-col min-h-0">
                  <CommentsPanel video={currentSwipeVideo} isOpen fetchComments={liveSession.fetchComments} />
                </div>

                <div className="p-4 border-t border-white/[0.08]">
                  <p className="text-[10.5px] tracking-[0.14em] uppercase text-neutral-500 font-medium mb-3">
                    Save to Collection
                  </p>
                  <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setSavedPopoverOpen(true)}
                    className="flex items-center justify-center gap-2 h-[52px] rounded-xl border border-white/[0.08] text-[13px] text-neutral-50 hover:border-[#D39448]/35 hover:bg-[#D39448]/[0.05] transition-colors duration-150"
                  >
                    <FolderOpen size={15} className="text-[#D39448]" />
                    Creator's Collections
                  </button>
                  <button
                    type="button"
                    disabled={!currentSwipeVideo || currentSwipeVideo.saved}
                    onClick={() => currentSwipeVideo && !currentSwipeVideo.saved && setSavePanelVideo(currentSwipeVideo)}
                    className="flex items-center justify-center gap-2 h-[52px] rounded-xl text-[#2a1c0e] text-[13px] font-medium hover:brightness-110 transition-[filter] duration-150 disabled:opacity-40 disabled:cursor-default press-feedback"
                    style={{ background: "linear-gradient(90deg, #D39448, #EAC088)", boxShadow: "0 6px 20px -6px rgba(211,148,72,0.55)" }}
                  >
                    <Bookmark size={15} fill={currentSwipeVideo?.saved ? "currentColor" : "none"} />
                    {currentSwipeVideo?.saved ? "Saved" : "Quicksave"}
                  </button>
                  </div>
                </div>
              </div>
              </div>
            </div>
        ) : (
          <>
            <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-[12px] text-neutral-500">
                <PlatformIcon platform={currentAccount.platform} size={12} />
                <span className="text-neutral-50 font-medium">{currentAccount.label}</span>
                {currentAccount.username && <span className="text-neutral-600">@{currentAccount.username}</span>}
              </div>

              <div className="flex items-center h-9 p-1 rounded-full glass-panel">
                <button
                  onClick={() => setMode("swipe")}
                  className="flex items-center gap-1.5 h-7 px-3 rounded-full text-[12px] transition-all duration-200 text-neutral-500 hover:text-neutral-300"
                >
                  <Play size={11} />
                  Swipe
                </button>
                <button
                  onClick={() => setMode("archive")}
                  className="flex items-center gap-1.5 h-7 px-3 rounded-full border border-[#141009] text-[12px] text-[#f0c58c]"
                  style={{ background: "linear-gradient(90deg, #2a1e11, #1a1510)" }}
                >
                  <LayoutGrid size={11} />
                  Archive
                </button>
              </div>
            </div>

            <div className="mt-5">
              {feedError ? (
                <div className="flex flex-col items-center justify-center text-center rounded-xl surface-panel py-24">
                  <p className="text-[13px] text-neutral-400">Couldn't load this account's archive.</p>
                </div>
              ) : (
                <VideoGrid
                  videos={videos}
                  onSaveClick={(video) => {
                    if (!video.saved) setSavePanelVideo(video);
                  }}
                  onAddToCollection={() => setSavedPopoverOpen(true)}
                  onOpenDetail={(video) => setDetailVideoId(video.id)}
                  spacious
                  showEngagement
                  loading={loadingFeed}
                  loadingLabel="Loading this account's archive…"
                  emptyTitle={
                    currentAccount.status === "connecting"
                      ? "This account is still connecting."
                      : "Nothing archived yet."
                  }
                  emptyHint={
                    currentAccount.status === "connecting"
                      ? "Its real feed will start appearing here once it's ready."
                      : "Reels you've researched will accumulate here over time."
                  }
                />
              )}
            </div>
          </>
        )}
      </div>

      <SavePanel
        open={!!savePanelVideo}
        video={savePanelVideo}
        creators={creators}
        defaultCreatorId={selectedCreator.id}
        collections={collectionsStore.collections}
        onClose={() => setSavePanelVideo(null)}
        onQuickSave={(note, creatorOverrideId) => {
          if (!savePanelVideo || !currentAccount) return;
          markSaved(savePanelVideo.id);
          const targetCreatorId = creatorOverrideId ?? selectedCreator.id;
          const quickSaves = collectionsStore.collections.find(
            (c) => c.creatorId === targetCreatorId && c.name === "Quick Saves"
          );
          const label = sourceLabelFor(currentAccount);
          if (quickSaves) {
            void collectionsStore.addVideoToCollection(quickSaves.id, savePanelVideo, note, undefined, label);
          } else {
            void collectionsStore.createCollection("Quick Saves", targetCreatorId, "", savePanelVideo, note, undefined, label);
          }
        }}
        onSaveToCollection={(collectionId, note) => {
          if (!savePanelVideo || !currentAccount) return;
          markSaved(savePanelVideo.id);
          void collectionsStore.addVideoToCollection(collectionId, savePanelVideo, note, undefined, sourceLabelFor(currentAccount));
        }}
        onCreateCollection={(name, note, creatorOverrideId) => {
          if (!savePanelVideo || !currentAccount) return;
          markSaved(savePanelVideo.id);
          const targetCreatorId = creatorOverrideId ?? selectedCreator.id;
          void collectionsStore.createCollection(
            name,
            targetCreatorId,
            "",
            savePanelVideo,
            note,
            undefined,
            sourceLabelFor(currentAccount)
          );
        }}
      />

      <SavedCollectionsPopover
        open={savedPopoverOpen}
        creator={selectedCreator}
        collections={collectionsStore.collections}
        onClose={() => setSavedPopoverOpen(false)}
        onOpenCollection={onOpenCollection}
        onCreateNextVersion={async (collectionId) => {
          const result = await collectionsStore.createNextVersion(collectionId);
          return result.id;
        }}
      />

      <ReelDetailModal
        video={detailVideo}
        open={!!detailVideoId}
        creator={selectedCreator}
        onClose={() => setDetailVideoId(null)}
        onSaveClick={(video) => setSavePanelVideo(video)}
        onAddToCollection={() => {
          setSavedPopoverOpen(true);
          setDetailVideoId(null);
        }}
        onPrev={() => {
          if (detailIndex > 0) setDetailVideoId(videos[detailIndex - 1].id);
        }}
        onNext={() => {
          if (detailIndex >= 0 && detailIndex < videos.length - 1) setDetailVideoId(videos[detailIndex + 1].id);
        }}
        hasPrev={detailIndex > 0}
        hasNext={detailIndex >= 0 && detailIndex < videos.length - 1}
      />
    </div>
  );
}
