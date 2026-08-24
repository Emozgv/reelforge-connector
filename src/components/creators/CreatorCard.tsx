import type { Creator, CreatorPackage } from "../../types";
import { creatorSetupStatus } from "../../lib/creatorMapping";
import { planBadgeLabel, planBadgeStyle } from "../../lib/planDisplay";
import type { CreatorStats } from "./creatorStats";

const SETUP_STATUS_STYLE = {
  draft: "text-neutral-500 bg-white/[0.05]",
  in_progress: "text-amber-300/80 bg-amber-400/10",
  ready: "text-emerald-300/80 bg-emerald-400/10",
} as const;
const SETUP_STATUS_LABEL = {
  draft: "Draft",
  in_progress: "In progress",
  ready: "Ready",
} as const;

export function CreatorCard({
  creator,
  stats,
  plan,
  onOpen,
}: {
  creator: Creator;
  stats: CreatorStats;
  plan: CreatorPackage | undefined;
  onOpen: () => void;
}) {
  const setupStatus = creatorSetupStatus(creator);
  const initials = creator.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <button
      onClick={onOpen}
      className="text-left rounded-xl border border-white/[0.07] bg-white/[0.015] hover:border-white/[0.14] hover:bg-white/[0.025] transition-colors duration-150 p-4"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center text-[13px] font-medium text-[#020508] shrink-0 ring-1 ring-white/15 overflow-hidden"
          style={creator.profileImage ? undefined : { background: creator.avatarColor }}
        >
          {creator.profileImage ? (
            <img src={creator.profileImage} alt={creator.name} className="w-full h-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div className="min-w-0">
          <h3 className="text-[14px] font-medium text-neutral-100 truncate">{creator.name}</h3>
          <p className="text-[11.5px] text-neutral-500 truncate">{creator.handle}</p>
        </div>
        <span
          className={["ml-auto shrink-0 text-[10px] font-medium px-1.5 py-[2px] rounded-[4px]", SETUP_STATUS_STYLE[setupStatus]].join(" ")}
        >
          {SETUP_STATUS_LABEL[setupStatus]}
        </span>
      </div>

      <div className="mt-3">
        <span className={["inline-block text-[10.5px] font-medium px-2 py-[3px] rounded-full", planBadgeStyle(plan)].join(" ")}>
          {planBadgeLabel(plan)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-y-1.5 text-[11.5px] text-neutral-400">
        <span>{stats.collectionsCount} collection{stats.collectionsCount === 1 ? "" : "s"}</span>
        <span>{stats.totalConcepts} concepts</span>
        <span>{stats.used} used</span>
        <span>{stats.unused} unused</span>
      </div>

      {stats.activeSubmissions > 0 && (
        <div className="mt-3 text-[11px] text-[#D39448]">
          {stats.activeSubmissions} active submission{stats.activeSubmissions === 1 ? "" : "s"}
        </div>
      )}

      {creator.traits.length > 0 && (
        <p className="mt-3 text-[11px] text-neutral-600 truncate">{creator.traits.slice(0, 4).join(" · ")}</p>
      )}
    </button>
  );
}
