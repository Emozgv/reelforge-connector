import { Clock, FolderHeart, Inbox, PackageCheck, Sparkles, Users } from "lucide-react";
import type { Collection, Creator, WorkspacePackage } from "../../types";
import type { ActivityFeedItem } from "../../state/useActivityFeed";
import { computeUsageStats } from "../../lib/usageStats";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function StatusStripItem({ label, value, last }: { label: string; value: number; last?: boolean }) {
  return (
    <div className={["flex-1 px-5 py-3.5", !last && "border-r border-white/[0.06]"].join(" ")}>
      <span className="text-[10px] tracking-wide uppercase text-neutral-500">{label}</span>
      <p className="mt-1 text-[19px] font-serif text-neutral-100 tabular-nums">{value}</p>
    </div>
  );
}

export function DashboardPage({
  userName,
  creators,
  collections,
  activity,
  workspacePackage,
  onOpenHub,
  onOpenCreator,
  onOpenCollection,
  onOpenCollections,
}: {
  userName?: string;
  creators: Creator[];
  collections: Collection[];
  activity: { items: ActivityFeedItem[]; loading: boolean };
  workspacePackage: WorkspacePackage | null;
  onOpenHub: () => void;
  onOpenCreator: (creatorId: string) => void;
  onOpenCollection: (collectionId: string) => void;
  onOpenCollections: () => void;
}) {
  const allSubmissions = collections.flatMap((c) => c.submissions.map((s) => ({ ...s, collection: c })));
  const activeSubmissions = allSubmissions.filter((s) => s.status !== "Finished");
  const needsAttention = allSubmissions.filter((s) => s.status === "Check Inbox");
  const finishedCount = allSubmissions.filter((s) => s.status === "Finished").length;
  const savedTotal = collections.reduce((sum, c) => sum + c.concepts.length, 0);
  const activeCollectionsCount = collections.filter((c) => c.status !== "Completed").length;

  const usage = workspacePackage ? computeUsageStats(workspacePackage, collections, creators) : null;

  const firstName = userName ? (userName.includes("@") ? userName.split("@")[0] : userName) : "";

  // The hero leads with whichever single number is most true right now —
  // never a wall of equal-weight stats. Attention beats production beats
  // a quiet "you're set up" read.
  const heroFocus =
    needsAttention.length > 0
      ? {
          value: needsAttention.length,
          label: needsAttention.length === 1 ? "submission needs you" : "submissions need you",
          accent: true,
          pulse: true,
        }
      : activeSubmissions.length > 0
        ? {
            value: activeSubmissions.length,
            label: activeSubmissions.length === 1 ? "reel in production" : "reels in production",
            accent: false,
            pulse: false,
          }
        : {
            value: savedTotal,
            label: savedTotal === 1 ? "concept saved, ready to brief" : "concepts saved, ready to brief",
            accent: false,
            pulse: false,
          };

  return (
    <div className="h-full overflow-y-auto">
      {/* hero — dominant, full-bleed focus band, shared visual language with the Creativity Hub */}
      <div className="relative overflow-hidden px-8 xl:px-12 pt-12 pb-10">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(760px 360px at 14% -25%, rgba(215,164,99,0.14), transparent 62%)",
          }}
        />
        <div className="relative z-10 max-w-[1160px] mx-auto flex items-end justify-between gap-8 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="h-px w-5 bg-gradient-to-r from-transparent to-[#d7a463]/60" />
              <span className="text-[11px] tracking-[0.22em] uppercase text-[#d7a463]/85 font-medium">
                Dashboard
              </span>
            </div>
            <h1 className="text-[36px] leading-[1.1] font-serif font-medium text-neutral-50">
              {greeting()}
              {firstName && (
                <>
                  , <span className="text-gradient-warm">{firstName}</span>
                </>
              )}
            </h1>
            <p className="mt-2.5 text-[13.5px] text-neutral-500 max-w-md">
              Here's where everything stands right now.
            </p>

            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={onOpenHub}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-[#c99a5f] text-[#0a0a0c] text-[12.5px] font-medium hover:bg-[#ddb87e] transition-colors duration-150 press-feedback"
              >
                <Sparkles size={14} />
                Find your next concept
              </button>

              {collections.length > 0 && (
                <button
                  onClick={onOpenCollections}
                  className="flex items-center gap-2.5 h-10 pl-3.5 pr-4 rounded-full glass-panel hover:bg-white/[0.06] transition-colors duration-150"
                >
                  <FolderHeart size={14} className="text-[#ddb87e]" />
                  <span className="text-[12px] text-neutral-300">
                    <span className="text-neutral-100 font-medium">{activeCollectionsCount}</span> active collection
                    {activeCollectionsCount === 1 ? "" : "s"}
                  </span>
                </button>
              )}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p
              className={[
                "text-[58px] leading-none font-serif font-medium tabular-nums",
                heroFocus.accent ? "text-[#e8c896]" : "text-neutral-50",
              ].join(" ")}
            >
              {heroFocus.value}
            </p>
            <p className="mt-2 text-[12px] text-neutral-400 flex items-center justify-end gap-1.5">
              {heroFocus.pulse && <span className="w-1.5 h-1.5 rounded-full bg-[#e8c896] animate-pulse" />}
              {heroFocus.label}
            </p>
          </div>
        </div>

        <div className="shimmer-divider absolute bottom-0 left-0 right-0" />
      </div>

      <div className="max-w-[1160px] mx-auto px-8 pt-7 pb-8">
        <div className="rounded-xl surface-panel-strong flex overflow-hidden">
          <StatusStripItem label="Creators" value={creators.length} />
          <StatusStripItem label="Saved concepts" value={savedTotal} />
          <StatusStripItem label="In production" value={activeSubmissions.length} />
          <StatusStripItem label="Delivered" value={finishedCount} last />
        </div>

        <div className="mt-6 grid grid-cols-[1fr_300px] gap-5 items-start">
          <div className="space-y-5">
            {needsAttention.length > 0 && (
              <div className="rounded-xl border border-[#c99a5f]/25 bg-[#c99a5f]/[0.06] p-4">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Inbox size={13} className="text-[#ddb87e]" />
                  <h2 className="text-[13px] font-medium text-neutral-100">Needs your attention</h2>
                </div>
                <div className="space-y-1">
                  {needsAttention.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => onOpenCollection(s.collection.id)}
                      className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg hover:bg-white/[0.05] transition-colors duration-150 text-left"
                    >
                      <span className="text-[12.5px] text-neutral-200 truncate">
                        {s.collection.name} <span className="text-neutral-600">· Submission #{s.index}</span>
                      </span>
                      <span className="shrink-0 text-[10px] font-medium px-1.5 py-[2px] rounded-[4px] text-[#f0c987] bg-[#c99a5f]/20 animate-pulse">
                        Check Inbox
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl surface-panel p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13px] font-medium text-neutral-200">Creators</h2>
                <span className="text-[11px] text-neutral-600">{creators.length}</span>
              </div>
              {creators.length === 0 ? (
                <p className="text-[12px] text-neutral-500">No creators yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2.5">
                  {creators.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onOpenCreator(c.id)}
                      title={c.name}
                      className="flex items-center gap-2 pl-1 pr-3 h-9 rounded-full border border-white/[0.08] hover:border-white/[0.16] hover:bg-white/[0.04] transition-colors duration-150"
                    >
                      <div
                        className="w-6.5 h-6.5 rounded-full shrink-0 ring-1 ring-white/15 overflow-hidden"
                        style={{ width: 26, height: 26, ...(c.profileImage ? {} : { background: c.avatarColor }) }}
                      >
                        {c.profileImage && <img src={c.profileImage} alt={c.name} className="w-full h-full object-cover" />}
                      </div>
                      <span className="text-[12.5px] text-neutral-200">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {usage && workspacePackage && (
              <div className="rounded-xl surface-panel p-4">
                <span className="text-[10.5px] tracking-wide uppercase text-neutral-500">
                  {workspacePackage.planName} plan
                </span>
                <p className="mt-1.5 text-[13px] text-neutral-200">
                  <span className="text-[19px] font-serif text-neutral-50">{usage.reelsUsed}</span>
                  <span className="text-neutral-500"> / {usage.reelsTotal} reels used</span>
                </p>
                <div className="mt-2.5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#c99a5f] to-[#e8c896]"
                    style={{ width: `${Math.min(100, (usage.reelsUsed / usage.reelsTotal) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-neutral-600 leading-relaxed">
                  {usage.regenerationsUsed} / {usage.regenerationsTotal} regenerations ·{" "}
                  {usage.creatorSetupsUsed} / {usage.creatorSetupsTotal} creator setups
                </p>
              </div>
            )}

            <div className="rounded-xl surface-panel p-4">
              <span className="text-[10.5px] tracking-wide uppercase text-neutral-500 flex items-center gap-1.5">
                <Clock size={10} />
                Recent activity
              </span>
              <div className="mt-2.5 space-y-2.5">
                {activity.loading && <p className="text-[11.5px] text-neutral-600">Loading…</p>}
                {!activity.loading && activity.items.length === 0 && (
                  <p className="text-[11.5px] text-neutral-600">Nothing yet — activity shows up here as you go.</p>
                )}
                {activity.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => item.collectionId && onOpenCollection(item.collectionId)}
                    disabled={!item.collectionId}
                    className="w-full flex items-start gap-2 text-left disabled:cursor-default group"
                  >
                    <div className="mt-[5px] w-1 h-1 rounded-full bg-[#c99a5f]/60 shrink-0" />
                    <div className="min-w-0">
                      <p
                        className={[
                          "text-[11.5px] text-neutral-300 leading-snug",
                          item.collectionId && "group-hover:text-[#e8c896] transition-colors duration-150",
                        ].join(" ")}
                      >
                        {item.message}
                      </p>
                      <p className="text-[10.5px] text-neutral-600">{item.relativeTime}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {finishedCount > 0 && (
              <div className="rounded-xl surface-panel p-4">
                <span className="text-[10.5px] tracking-wide uppercase text-neutral-500 flex items-center gap-1.5">
                  <PackageCheck size={10} />
                  Delivered
                </span>
                <p className="mt-1.5 text-[12px] text-neutral-400 leading-relaxed">
                  {finishedCount} batch{finishedCount === 1 ? "" : "es"} ready in your Library.
                </p>
              </div>
            )}

            {creators.length === 0 && (
              <div className="rounded-xl surface-panel p-4 flex items-center gap-2.5">
                <Users size={14} className="text-neutral-600 shrink-0" />
                <p className="text-[11.5px] text-neutral-500">Add a Creator to get started.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
