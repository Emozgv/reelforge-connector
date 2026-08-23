import { Clapperboard, CheckCircle2, Clock, FolderHeart, FolderOpen, Inbox, Sparkles, Users } from "lucide-react";
import type { Collection, Creator, WorkspacePackage } from "../../types";
import type { ActivityFeedItem } from "../../state/useActivityFeed";
import { computeUsageStats } from "../../lib/usageStats";
import { formatRelativeTime } from "../../lib/relativeTime";
import { StarfieldBackground } from "../shared/StarfieldBackground";

// Local time of the person actually looking at the screen — already
// naturally "session aware" without any extra plumbing.
function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// A purely decorative curve — never tied to real usage numbers, it's the
// same visual flourish for every workspace. The real number lives in the
// progress bar next to it.
function GrowthSparkline() {
  return (
    <svg viewBox="0 0 220 46" fill="none" className="absolute right-0 bottom-0 w-[62%] h-[46px] opacity-70">
      <path
        d="M0 36 C 14 34, 22 30, 32 32 S 48 40, 58 38 S 72 20, 84 22 S 100 34, 112 30 S 128 12, 142 16 S 158 26, 170 22 S 188 6, 200 10 S 214 4, 220 3"
        stroke="url(#spark-grad)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="220" y2="0">
          <stop offset="0%" stopColor="#c99a5f" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f0c987" stopOpacity="0.95" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function StatChip({
  icon,
  label,
  sublabel,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  value: number;
}) {
  return (
    <div className="flex-1 flex items-center gap-3.5 px-5 xl:px-6 py-5">
      <div className="w-11 h-11 rounded-lg shrink-0 flex items-center justify-center border border-[#c99a5f]/25 bg-white/[0.015] text-[#ddb87e]">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] tracking-wide uppercase text-neutral-500 truncate">{label}</p>
        <p className="text-[22px] font-serif text-neutral-50 tabular-nums leading-tight">{value}</p>
        <p className="text-[10.5px] text-neutral-600">{sublabel}</p>
      </div>
    </div>
  );
}

function PanelHeader({ title, onViewAll, cta = "View all" }: { title: string; onViewAll?: () => void; cta?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[13px] font-medium text-neutral-200">{title}</h2>
      {onViewAll && (
        <button
          onClick={onViewAll}
          className="text-[11px] font-medium text-[#ddb87e] hover:text-[#e8c896] transition-colors duration-150"
        >
          {cta}
        </button>
      )}
    </div>
  );
}

const CONCEPT_STAGE_STYLES: Record<string, string> = {
  Saved: "text-neutral-400 bg-white/[0.05]",
  "In Review": "text-sky-300/85 bg-sky-400/10",
  "In Production": "text-[#f0c987] bg-[#c99a5f]/15",
  Delivered: "text-emerald-300/85 bg-emerald-400/10",
};

// Real production stage for a Collection, reused to badge its most recent
// concept preview — derived from actual Collection/Submission state, never
// a separate stored field.
function collectionStage(c: Collection): string {
  if (c.status === "Completed") return "Delivered";
  if (c.status === "Draft") return "Saved";
  const latest = c.submissions[c.submissions.length - 1];
  if (latest && (latest.status === "In Progress" || latest.status === "Check Inbox")) return "In Production";
  return "In Review";
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
  onOpenCreators,
  onOpenSettings,
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
  onOpenCreators: () => void;
  onOpenSettings: () => void;
}) {
  const allSubmissions = collections.flatMap((c) => c.submissions.map((s) => ({ ...s, collection: c })));
  const activeSubmissions = allSubmissions.filter((s) => s.status !== "Finished");
  const needsAttention = allSubmissions.filter((s) => s.status === "Check Inbox");
  const finishedCount = allSubmissions.filter((s) => s.status === "Finished").length;
  const savedTotal = collections.reduce((sum, c) => sum + c.concepts.length, 0);
  const activeCollectionsCount = collections.filter((c) => c.status !== "Completed").length;

  const recentCollections = [...collections]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 3);

  const usage = workspacePackage ? computeUsageStats(workspacePackage, collections, creators) : null;

  const firstName = userName ? (userName.includes("@") ? userName.split("@")[0] : userName) : "";

  return (
    <div className="h-full overflow-y-auto">
      {/* hero — a real night-sky photograph, not a CSS approximation, so the mood matches exactly */}
      <div
        className="relative overflow-hidden px-8 xl:px-12 pt-10 pb-9 h-[300px] xl:h-[320px] bg-[#050505]"
        style={{
          backgroundImage: "url(/images/dashboard-hero-sky.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center bottom",
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-black/40" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-[#0c0c0e]" />
        <StarfieldBackground starCount={40} />
        <div className="relative z-10 max-w-[1200px] mx-auto flex items-end justify-between gap-8 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-3.5">
              <span className="h-px w-5 bg-gradient-to-r from-transparent to-[#d7a463]/60" />
              <span className="text-[11px] tracking-[0.22em] uppercase text-[#d7a463]/85 font-medium">
                Dashboard
              </span>
            </div>
            <h1 className="text-[42px] xl:text-[46px] leading-[1.1] font-serif font-medium text-neutral-50">
              {greeting()}
              {firstName && <>, {firstName}</>}
            </h1>
            <p className="mt-2.5 text-[14px] text-neutral-400 max-w-md">
              Here's where everything stands right now.
            </p>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={onOpenHub}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-[#c99a5f] text-[#0a0a0c] text-[13px] font-medium hover:bg-[#ddb87e] transition-colors duration-150 press-feedback"
              >
                <Sparkles size={14} />
                Find your next concept
              </button>

              {collections.length > 0 && (
                <button
                  onClick={onOpenCollections}
                  className="flex items-center gap-2.5 h-11 pl-4 pr-5 rounded-full border border-white/[0.16] hover:bg-white/[0.05] transition-colors duration-150"
                >
                  <FolderHeart size={14} className="text-[#ddb87e]" />
                  <span className="text-[12.5px] text-neutral-300">
                    <span className="text-neutral-100 font-medium">{activeCollectionsCount}</span> active collection
                    {activeCollectionsCount === 1 ? "" : "s"}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-8 pt-7 pb-8">
        {needsAttention.length > 0 && (
          <div className="mb-5 rounded-xl border border-[#c99a5f]/25 bg-[#c99a5f]/[0.06] p-4">
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

        <div className="rounded-xl surface-panel-strong flex divide-x divide-white/[0.06] overflow-hidden">
          <StatChip icon={<Users size={16} />} label="Creators" sublabel="active" value={creators.length} />
          <StatChip
            icon={<FolderOpen size={16} />}
            label="Saved concepts"
            sublabel="concepts"
            value={savedTotal}
          />
          <StatChip
            icon={<Clapperboard size={16} />}
            label="In production"
            sublabel="projects"
            value={activeSubmissions.length}
          />
          <StatChip icon={<CheckCircle2 size={16} />} label="Delivered" sublabel="completed" value={finishedCount} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-5 items-start">
          <div className="rounded-xl surface-panel p-4">
            <PanelHeader title="Creators" onViewAll={onOpenCreators} />
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
            {creators.length === 0 && (
              <p className="mt-1 text-[11.5px] text-neutral-500 flex items-center gap-2">
                <Users size={13} className="text-neutral-600 shrink-0" /> Add a Creator to get started.
              </p>
            )}
          </div>

          <div className="rounded-xl surface-panel p-4 relative overflow-hidden">
            <PanelHeader title={workspacePackage ? `${workspacePackage.planName} plan` : "Plan"} onViewAll={onOpenSettings} cta="View plan" />
            {usage && workspacePackage ? (
              <>
                <p className="text-[13px] text-neutral-200">
                  <span className="text-[19px] font-serif text-neutral-50">{usage.reelsUsed}</span>
                  <span className="text-neutral-500"> / {usage.reelsTotal} reels used</span>
                </p>
                <div className="relative mt-2.5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#c99a5f] to-[#e8c896]"
                    style={{ width: `${Math.min(100, (usage.reelsUsed / usage.reelsTotal) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-neutral-600 leading-relaxed">
                  {usage.regenerationsUsed} / {usage.regenerationsTotal} regenerations ·{" "}
                  {usage.creatorSetupsUsed} / {usage.creatorSetupsTotal} creator setups
                </p>
                <GrowthSparkline />
              </>
            ) : (
              <p className="text-[12px] text-neutral-500">No active plan yet.</p>
            )}
          </div>

          <div className="rounded-xl surface-panel p-4">
            <PanelHeader title="Recent Concepts" onViewAll={onOpenCollections} />
            {recentCollections.length === 0 ? (
              <p className="text-[12px] text-neutral-500">Save your first concept from the Creativity Hub.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {recentCollections.map((c) => {
                  const stage = collectionStage(c);
                  const preview = c.concepts[0];
                  return (
                    <button
                      key={c.id}
                      onClick={() => onOpenCollection(c.id)}
                      className="text-left rounded-lg overflow-hidden border border-white/[0.06] hover:border-white/[0.14] transition-colors duration-150"
                    >
                      <div
                        className="h-16 w-full"
                        style={{ background: preview?.video.thumbGradient ?? "linear-gradient(135deg,#1a1a1d,#0f0f11)" }}
                      />
                      <div className="p-2">
                        <p className="text-[11.5px] text-neutral-200 truncate">{c.name}</p>
                        <p className="text-[10px] text-neutral-600 mt-0.5">{c.concepts.length} concepts</p>
                        <span
                          className={[
                            "mt-1.5 inline-block text-[9.5px] font-medium px-1.5 py-[2px] rounded-[4px]",
                            CONCEPT_STAGE_STYLES[stage],
                          ].join(" ")}
                        >
                          {stage}
                        </span>
                        <p className="mt-1 text-[9.5px] text-neutral-700">Updated {formatRelativeTime(c.updatedAt)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl surface-panel p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Clock size={11} className="text-neutral-500" />
              <h2 className="text-[13px] font-medium text-neutral-200">Recent Activity</h2>
            </div>
            <div className="space-y-2.5">
              {activity.loading && <p className="text-[11.5px] text-neutral-600">Loading…</p>}
              {!activity.loading && activity.items.length === 0 && (
                <p className="text-[11.5px] text-neutral-600">Nothing yet — activity shows up here as you go.</p>
              )}
              {activity.items.slice(0, 6).map((item) => (
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
        </div>
      </div>
    </div>
  );
}
