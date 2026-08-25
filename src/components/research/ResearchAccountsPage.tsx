import { useEffect, useMemo, useState } from "react";
import { Plus, X, Users, LayoutGrid, Play, Check, Loader2, RotateCw } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { researchFeedItemToVideo, type ResearchFeedItemRow } from "../../lib/researchFeedMapping";
import type { Creator, Platform, ReelVideo, ResearchAccount } from "../../types";
import type { CollectionsStore } from "../../state/useCollectionsStore";
import type { ConnectStart, ResearchAccountsStore } from "../../state/useResearchAccounts";
import { MAX_RESEARCH_ACCOUNTS_PER_PLATFORM } from "../../state/useResearchAccounts";
import { useLiveResearchSession } from "../../state/useLiveResearchSession";
import { CreatorSelector } from "../hub/CreatorSelector";
import { PlatformIcon } from "../hub/PlatformIcon";
import { VideoGrid } from "../hub/VideoGrid";
import { SavePanel } from "../hub/SavePanel";
import { SavedCollectionsPopover } from "../hub/SavedCollectionsPopover";
import { ReelDetailModal } from "../hub/ReelDetailModal";
import { SwipeResearchPlayer, type LikeStatus } from "./SwipeResearchPlayer";
import { DownloadConnectorButton } from "./DownloadConnectorButton";

const PLATFORM_LABEL: Record<Platform, string> = { instagram: "IG Research", tiktok: "TikTok Research" };

function accountsFor(accounts: ResearchAccount[], creatorId: string, platform: Platform): ResearchAccount[] {
  return accounts
    .filter((a) => a.creatorId === creatorId && a.platform === platform)
    .sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""));
}

const STATUS_LABEL: Record<ResearchAccount["status"], string> = {
  connecting: "Connecting…",
  active: "Active",
  needs_attention: "Needs attention",
  disconnected: "Disconnected",
};
const STATUS_DOT: Record<ResearchAccount["status"], string> = {
  connecting: "bg-amber-400 animate-pulse",
  active: "bg-emerald-400",
  needs_attention: "bg-amber-400",
  disconnected: "bg-neutral-600",
};

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
    setAccountId(currentAccounts[0]?.id ?? null);
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

  // The live research session itself — this is the actual architecture
  // change: opening a connected Instagram account starts a real, persistent
  // Reels session on the authenticated account (see useLiveResearchSession
  // and connector-app/scripts/session-server.mjs), and closing/switching
  // away from it ends that session. Nothing here is reconstructed from
  // client_os.research_feed_items — that table remains, but only as
  // Archive's history, never as what the active swipe queue is built from.
  useEffect(() => {
    if (!currentAccount || currentAccount.status !== "active") {
      void liveSession.endSession();
      return;
    }
    void liveSession.startSession(currentAccount.id, currentAccount.platform);
    return () => {
      void liveSession.endSession();
    };
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

  // A real platform action on the real connected account — the whole point
  // is that Instagram's/TikTok's own recommendation algorithm actually
  // stops surfacing this creator afterward, not a local ReelForge-only
  // blacklist. Only ever reports "done" once Connector has confirmed the
  // real block genuinely took effect (see session-server.mjs's Session.block).
  async function handleBlockCreator(video: ReelVideo) {
    if (blockStatus[video.id] === "pending" || blockStatus[video.id] === "done") return;
    setBlockStatus((prev) => ({ ...prev, [video.id]: "pending" }));
    const { blocked } = await liveSession.block();
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
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1400px] xl:max-w-[1650px] 2xl:max-w-[1900px] mx-auto px-10 xl:px-16 2xl:px-24 pt-8 pb-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <span className="h-px w-5 bg-gradient-to-r from-transparent to-[#D39448]/60" />
              <span className="text-[11px] tracking-[0.22em] uppercase text-[#D39448]/85 font-medium">
                Research Accounts
              </span>
            </div>
            <h1 className="text-[26px] font-serif font-medium text-neutral-50">
              Research from your own trained feeds
            </h1>
            <p className="mt-1.5 text-[13px] text-neutral-500 max-w-xl">
              Swipe through a Creator's own Instagram/TikTok research account, then save straight into the same
              Collections you already use.
            </p>
          </div>
          <DownloadConnectorButton />
        </div>

        {/* context toolbar */}
        <div className="mt-6 flex items-center gap-3 flex-wrap">
          <CreatorSelector creators={creators} selected={selectedCreator} onSelect={setSelectedCreator} />

          <div className="flex items-center h-11 p-1 rounded-full glass-panel">
            {(["instagram", "tiktok"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={[
                  "flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] capitalize transition-all duration-200",
                  platform === p
                    ? "bg-[#D39448]/15 text-[#D39448] shadow-[inset_0_0_0_1px_rgba(211,148,72,0.35)]"
                    : "text-neutral-500 hover:text-neutral-300",
                ].join(" ")}
              >
                <PlatformIcon platform={p} size={12} />
                {p === "instagram" ? "Instagram" : "TikTok"}
              </button>
            ))}
          </div>
        </div>

        {/* research account rail */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          {currentAccounts.map((a) => (
            <button
              key={a.id}
              onClick={() => setAccountId(a.id)}
              className={[
                "group flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full border transition-all duration-150",
                a.id === currentAccount?.id
                  ? "border-[#D39448]/45 bg-[#D39448]/[0.1] text-[#D39448]"
                  : "border-white/[0.08] text-neutral-400 hover:text-neutral-200 hover:border-white/[0.16]",
              ].join(" ")}
            >
              <span className={["w-2 h-2 rounded-full shrink-0", STATUS_DOT[a.status]].join(" ")} title={STATUS_LABEL[a.status]} />
              <span className="text-[12.5px]">{a.label}</span>
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
            className="flex items-center gap-1 h-9 px-3 rounded-full border border-dashed border-white/[0.14] text-[12.5px] text-neutral-500 hover:text-neutral-200 hover:border-white/25 transition-colors duration-150 disabled:opacity-30 disabled:cursor-default"
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

        <div className="shimmer-divider mt-6" />

        {!currentAccount ? (
          <div className="mt-6 flex flex-col items-center justify-center text-center rounded-xl surface-panel py-24">
            <Users size={20} className="text-neutral-700 mb-2.5" />
            <p className="text-[14.5px] font-serif text-neutral-300">
              No {platform === "instagram" ? "Instagram" : "TikTok"} research accounts for {selectedCreator.name} yet.
            </p>
            <p className="text-[12px] text-neutral-600 mt-1.5">Connect one above to start researching from its trained feed.</p>
          </div>
        ) : (
          <>
            <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-[12px] text-neutral-500">
                <PlatformIcon platform={currentAccount.platform} size={12} />
                <span className="text-neutral-300 font-medium">{currentAccount.label}</span>
                {currentAccount.username && <span className="text-neutral-600">@{currentAccount.username}</span>}
                {currentAccount.status === "connecting" && (
                  <>
                    <span>·</span>
                    <span className="text-amber-400/90">Connecting…</span>
                  </>
                )}
              </div>

              <div className="flex items-center h-9 p-1 rounded-full glass-panel">
                <button
                  onClick={() => setMode("swipe")}
                  className={[
                    "flex items-center gap-1.5 h-7 px-3 rounded-full text-[12px] transition-all duration-200",
                    mode === "swipe" ? "bg-[#D39448]/15 text-[#D39448]" : "text-neutral-500 hover:text-neutral-300",
                  ].join(" ")}
                >
                  <Play size={11} />
                  Swipe
                </button>
                <button
                  onClick={() => setMode("archive")}
                  className={[
                    "flex items-center gap-1.5 h-7 px-3 rounded-full text-[12px] transition-all duration-200",
                    mode === "archive" ? "bg-[#D39448]/15 text-[#D39448]" : "text-neutral-500 hover:text-neutral-300",
                  ].join(" ")}
                >
                  <LayoutGrid size={11} />
                  Archive
                </button>
              </div>
            </div>

            <div className="mt-5">
              {mode === "swipe" ? (
                <SwipeResearchPlayer
                  account={currentAccount}
                  currentReel={currentSwipeVideo}
                  hasPrev={liveSession.hasPrev}
                  loading={liveSession.status === "connecting"}
                  sessionStatus={liveSession.status}
                  sessionError={liveSession.error}
                  onNext={() => void liveSession.next()}
                  onPrev={() => void liveSession.prev()}
                  onSaveClick={(video) => {
                    if (!video.saved) setSavePanelVideo(video);
                  }}
                  onAddToCollection={() => setSavedPopoverOpen(true)}
                  onExitToArchive={() => setMode("archive")}
                  onLikeClick={handleLikeClick}
                  likeStatus={likeStatus}
                  onBlockCreator={handleBlockCreator}
                  blockStatus={blockStatus}
                  onRefreshSession={() => void liveSession.startSession(currentAccount.id, currentAccount.platform)}
                  onRetryWake={() => {
                    // needs_connector -> the wake path (must run from this
                    // real click); a plain error -> just start over.
                    if (liveSession.status === "needs_connector") void liveSession.retryWithWake();
                    else void liveSession.startSession(currentAccount.id, currentAccount.platform);
                  }}
                  active={active}
                />
              ) : feedError ? (
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
