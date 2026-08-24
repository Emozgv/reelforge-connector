import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, X, Users, LayoutGrid, Play } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { researchFeedItemToVideo, type ResearchFeedItemRow } from "../../lib/researchFeedMapping";
import type { Creator, Platform, ReelVideo, ResearchAccount } from "../../types";
import type { CollectionsStore } from "../../state/useCollectionsStore";
import type { ResearchAccountsStore } from "../../state/useResearchAccounts";
import { MAX_RESEARCH_ACCOUNTS_PER_PLATFORM } from "../../state/useResearchAccounts";
import { CreatorSelector } from "../hub/CreatorSelector";
import { PlatformIcon } from "../hub/PlatformIcon";
import { VideoGrid } from "../hub/VideoGrid";
import { SavePanel } from "../hub/SavePanel";
import { ReelDetailModal } from "../hub/ReelDetailModal";
import { SwipeResearchPlayer } from "./SwipeResearchPlayer";
import { formatRelativeTime } from "../../lib/relativeTime";

const PLATFORM_LABEL: Record<Platform, string> = { instagram: "IG Research", tiktok: "TikTok Research" };

function accountsFor(accounts: ResearchAccount[], creatorId: string, platform: Platform): ResearchAccount[] {
  return accounts
    .filter((a) => a.creatorId === creatorId && a.platform === platform)
    .sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""));
}

function NewAccountChip({ onCreate, disabled }: { onCreate: (label: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? `Up to ${MAX_RESEARCH_ACCOUNTS_PER_PLATFORM} accounts` : "Add a research account"}
        className="flex items-center gap-1 h-9 px-3 rounded-full border border-dashed border-white/[0.14] text-[12.5px] text-neutral-500 hover:text-neutral-200 hover:border-white/25 transition-colors duration-150 disabled:opacity-30 disabled:cursor-default"
      >
        <Plus size={13} />
        Add account
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!label.trim()) return;
        onCreate(label.trim());
        setLabel("");
        setOpen(false);
      }}
      className="flex items-center gap-1.5"
    >
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => !label.trim() && setOpen(false)}
        placeholder="e.g. Lifestyle & Storytime"
        className="h-9 px-3 rounded-full surface-field text-[12.5px] text-neutral-100 placeholder:text-neutral-600 outline-none focus-glow w-[190px]"
      />
      <button type="submit" className="h-9 px-3 rounded-full bg-[#D39448] text-[#020508] text-[12.5px] font-medium">
        Add
      </button>
    </form>
  );
}

type Mode = "swipe" | "archive";

export function ResearchAccountsPage({
  creators,
  creatorsError,
  collectionsStore,
  researchAccountsStore,
  userId,
}: {
  creators: Creator[];
  creatorsError?: string | null;
  collectionsStore: CollectionsStore;
  researchAccountsStore: ResearchAccountsStore;
  userId?: string;
}) {
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(creators[0] ?? null);
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("swipe");
  const [rawItems, setRawItems] = useState<ResearchFeedItemRow[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [feedError, setFeedError] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [swipeIndex, setSwipeIndex] = useState(0);
  const [detailVideoId, setDetailVideoId] = useState<string | null>(null);
  const [savePanelVideo, setSavePanelVideo] = useState<ReelVideo | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!creators.some((c) => c.id === selectedCreator?.id)) setSelectedCreator(creators[0] ?? null);
  }, [creators, selectedCreator]);

  const currentAccounts = useMemo(
    () => (selectedCreator ? accountsFor(researchAccountsStore.accounts, selectedCreator.id, platform) : []),
    [researchAccountsStore.accounts, selectedCreator, platform]
  );
  const currentAccount = currentAccounts.find((a) => a.id === accountId) ?? currentAccounts[0] ?? null;

  // Switching Creator or platform re-picks whichever account was worked on
  // most recently — a real, DB-backed resume point, not device-local memory.
  useEffect(() => {
    setAccountId(currentAccounts[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCreator?.id, platform]);

  async function loadFeed(accountId: string) {
    setLoadingFeed(true);
    setFeedError(false);
    const { data, error } = await supabase
      .schema("client_os")
      .from("research_feed_items")
      .select("*")
      .eq("research_account_id", accountId)
      .order("synced_at", { ascending: false });
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
    setSwipeIndex(0);
    void loadFeed(currentAccount.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount?.id]);

  const videos = useMemo(
    () => rawItems.map((r) => ({ ...researchFeedItemToVideo(r), saved: savedIds.has(r.id) })),
    [rawItems, savedIds]
  );

  // Swipe queue: unseen items first (oldest-unseen-first, so the order feels
  // like scrolling forward through what accumulated since last time), then
  // already-seen ones appended as a fallback rather than a dead end.
  const swipeQueue = useMemo(() => {
    const watermark = currentAccount?.lastShownSyncedAt;
    const withMeta = rawItems.map((r) => ({
      video: { ...researchFeedItemToVideo(r), saved: savedIds.has(r.id) },
      syncedAt: r.synced_at,
    }));
    const unseen = withMeta.filter((x) => !watermark || x.syncedAt > watermark).sort((a, b) => a.syncedAt.localeCompare(b.syncedAt));
    const seen = withMeta.filter((x) => watermark && x.syncedAt <= watermark).sort((a, b) => a.syncedAt.localeCompare(b.syncedAt));
    return [...unseen, ...seen];
  }, [rawItems, currentAccount?.lastShownSyncedAt, savedIds]);

  function handleSwipeIndexChange(i: number) {
    setSwipeIndex(i);
    const item = swipeQueue[i];
    if (item && currentAccount) void researchAccountsStore.markSeen(currentAccount.id, item.syncedAt);
  }

  const detailIndex = videos.findIndex((v) => v.id === detailVideoId);
  const detailVideo = detailIndex >= 0 ? videos[detailIndex] : null;

  function markSaved(id: string) {
    setSavedIds((prev) => new Set(prev).add(id));
  }

  function sourceLabelFor(account: ResearchAccount): string {
    return `${PLATFORM_LABEL[account.platform]} — ${account.label}`;
  }

  async function handleRefresh() {
    if (!currentAccount) return;
    setSyncing(true);
    await researchAccountsStore.requestSync(currentAccount.id);
    await loadFeed(currentAccount.id);
    window.setTimeout(() => setSyncing(false), 900);
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
              <span
                className={[
                  "w-2 h-2 rounded-full shrink-0",
                  a.status === "active" ? "bg-emerald-400" : a.status === "needs_attention" ? "bg-amber-400" : "bg-neutral-600",
                ].join(" ")}
              />
              <span className="text-[12.5px]">{a.label}</span>
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
          <NewAccountChip
            disabled={currentAccounts.length >= MAX_RESEARCH_ACCOUNTS_PER_PLATFORM}
            onCreate={(label) => void researchAccountsStore.createAccount(selectedCreator.id, platform, label)}
          />
        </div>

        <div className="shimmer-divider mt-6" />

        {!currentAccount ? (
          <div className="mt-6 flex flex-col items-center justify-center text-center rounded-xl surface-panel py-24">
            <Users size={20} className="text-neutral-700 mb-2.5" />
            <p className="text-[14.5px] font-serif text-neutral-300">
              No {platform === "instagram" ? "Instagram" : "TikTok"} research accounts for {selectedCreator.name} yet.
            </p>
            <p className="text-[12px] text-neutral-600 mt-1.5">Add one above to start researching from its trained feed.</p>
          </div>
        ) : (
          <>
            <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-[12px] text-neutral-500">
                <PlatformIcon platform={currentAccount.platform} size={12} />
                <span className="text-neutral-300 font-medium">{currentAccount.label}</span>
                <span>·</span>
                <span>
                  {currentAccount.lastSyncedAt
                    ? `Synced ${formatRelativeTime(currentAccount.lastSyncedAt)}`
                    : "Not synced yet"}
                </span>
              </div>

              <div className="flex items-center gap-2">
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
                <button
                  onClick={() => void handleRefresh()}
                  disabled={syncing}
                  className="flex items-center gap-1.5 h-9 px-3.5 rounded-full glass-panel hover:bg-white/[0.06] transition-colors duration-150 text-[12.5px] text-neutral-300 disabled:opacity-50"
                >
                  <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
                  {syncing ? "Sync requested…" : "Refresh feed"}
                </button>
              </div>
            </div>

            <div className="mt-5">
              {feedError ? (
                <div className="flex flex-col items-center justify-center text-center rounded-xl surface-panel py-24">
                  <p className="text-[13px] text-neutral-400">Couldn't load this account's feed.</p>
                </div>
              ) : mode === "swipe" ? (
                <SwipeResearchPlayer
                  account={currentAccount}
                  videos={swipeQueue.map((x) => x.video)}
                  index={Math.min(swipeIndex, Math.max(swipeQueue.length - 1, 0))}
                  onIndexChange={handleSwipeIndexChange}
                  loadingMore={loadingFeed}
                  onNearEnd={() => void loadFeed(currentAccount.id)}
                  onSaveClick={(video) => {
                    if (!video.saved) setSavePanelVideo(video);
                  }}
                  onAddToCollection={setSavePanelVideo}
                  onExitToArchive={() => setMode("archive")}
                />
              ) : (
                <VideoGrid
                  videos={videos}
                  onSaveClick={(video) => {
                    if (!video.saved) setSavePanelVideo(video);
                  }}
                  onAddToCollection={setSavePanelVideo}
                  onOpenDetail={(video) => setDetailVideoId(video.id)}
                  spacious
                  loading={loadingFeed}
                  loadingLabel="Loading this account's research feed…"
                  emptyTitle="No synced reels yet."
                  emptyHint="Press Refresh feed to request a sync for this account."
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

      <ReelDetailModal
        video={detailVideo}
        open={!!detailVideoId}
        creator={selectedCreator}
        onClose={() => setDetailVideoId(null)}
        onSaveClick={(video) => setSavePanelVideo(video)}
        onAddToCollection={(video) => {
          setSavePanelVideo(video);
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
