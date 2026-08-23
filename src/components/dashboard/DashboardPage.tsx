import { Clock, Inbox, PackageCheck, Sparkles, Users } from "lucide-react";
import type { Collection, Creator } from "../../types";
import type { ActivityFeedItem } from "../../state/useActivityFeed";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="rounded-xl surface-panel p-4">
      <span className="text-[10.5px] tracking-wide uppercase text-neutral-500">{label}</span>
      <p className={["mt-1.5 text-[26px] font-serif", accent ? "text-[#e8c896]" : "text-neutral-50"].join(" ")}>
        {value}
      </p>
    </div>
  );
}

export function DashboardPage({
  userName,
  creators,
  collections,
  activity,
  onOpenHub,
  onOpenCreator,
  onOpenCollection,
}: {
  userName?: string;
  creators: Creator[];
  collections: Collection[];
  activity: { items: ActivityFeedItem[]; loading: boolean };
  onOpenHub: () => void;
  onOpenCreator: (creatorId: string) => void;
  onOpenCollection: (collectionId: string) => void;
}) {
  const allSubmissions = collections.flatMap((c) => c.submissions.map((s) => ({ ...s, collection: c })));
  const activeSubmissions = allSubmissions.filter((s) => s.status !== "Finished");
  const needsAttention = allSubmissions.filter((s) => s.status === "Check Inbox");
  const finishedCount = allSubmissions.filter((s) => s.status === "Finished").length;
  const savedTotal = collections.reduce((sum, c) => sum + c.concepts.length, 0);

  // Preview-only — not a real package/billing figure yet (that's still V1.5
  // backend work). Shown so the shape of the feature is visible and clickable
  // rather than absent, per the product vision doc.
  const usagePreview = { used: Math.min(savedTotal, 60), total: 60, label: "Growth" };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1160px] mx-auto px-8 pt-10 pb-8">
        <span className="text-[10.5px] tracking-[0.14em] uppercase text-[#c99a5f]/75 font-medium">Dashboard</span>
        <h1 className="mt-1 text-[26px] font-serif font-medium text-neutral-50">
          {greeting()}{userName ? `, ${userName.split(" ")[0].split("@")[0]}` : ""}
        </h1>
        <p className="mt-1 text-[13px] text-neutral-500">Here's where everything stands right now.</p>

        <div className="mt-7 grid grid-cols-4 gap-3">
          <StatCard label="Creators" value={creators.length} />
          <StatCard label="Saved concepts" value={savedTotal} />
          <StatCard label="In production" value={activeSubmissions.length} accent={activeSubmissions.length > 0} />
          <StatCard label="Delivered" value={finishedCount} />
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

            <button
              onClick={onOpenHub}
              className="w-full rounded-xl border border-white/[0.07] bg-white/[0.015] hover:border-[#d7a463]/30 hover:bg-[#d7a463]/[0.04] transition-colors duration-150 p-4 flex items-center gap-3 text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-[#c99a5f]/15 flex items-center justify-center shrink-0">
                <Sparkles size={15} className="text-[#ddb87e]" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-neutral-100">Find your next concept</p>
                <p className="text-[11.5px] text-neutral-500">Open the Creativity Hub to keep researching.</p>
              </div>
            </button>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl surface-panel p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] tracking-wide uppercase text-neutral-500">{usagePreview.label} plan</span>
                <span className="text-[9px] tracking-wide uppercase text-neutral-600 border border-white/[0.08] rounded-[3px] px-1 py-[1px]">
                  preview
                </span>
              </div>
              <p className="mt-1.5 text-[13px] text-neutral-200">
                <span className="text-[19px] font-serif text-neutral-50">{usagePreview.used}</span>
                <span className="text-neutral-500"> / {usagePreview.total} reels used</span>
              </p>
              <div className="mt-2.5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#c99a5f] to-[#e8c896]"
                  style={{ width: `${Math.min(100, (usagePreview.used / usagePreview.total) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-neutral-600 leading-relaxed">
                Package &amp; billing detail lives in Settings once it's wired up.
              </p>
            </div>

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
