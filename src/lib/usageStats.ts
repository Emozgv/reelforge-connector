import type { Collection, Creator, WorkspacePackage } from "../types";
import { creatorSetupStatus } from "./creatorMapping";

export interface UsageStats {
  reelsUsed: number;
  reelsTotal: number;
  regenerationsUsed: number;
  regenerationsTotal: number;
  creatorSetupsUsed: number;
  creatorSetupsTotal: number;
}

// Simplified V1.5 approximation, all-time rather than cycle-scoped (Collection
// history only keeps display-formatted dates, not raw ISO, so cycle filtering
// isn't reliable yet): reels used = concepts delivered in Finished
// submissions, regenerations used = requests filed, creator setups used =
// Creators whose rule-based setup status is "ready". No proration/rollover.
export function computeUsageStats(
  pkg: WorkspacePackage,
  collections: Collection[],
  creators: Creator[]
): UsageStats {
  let reelsUsed = 0;
  let regenerationsUsed = 0;
  for (const collection of collections) {
    for (const submission of collection.submissions) {
      if (submission.status !== "Finished") continue;
      reelsUsed += submission.conceptIds.length;
    }
    regenerationsUsed += collection.regenerationRequests.length;
  }

  const creatorSetupsUsed = creators.filter((c) => creatorSetupStatus(c) === "ready").length;

  return {
    reelsUsed,
    reelsTotal: pkg.monthlyAllowance,
    regenerationsUsed,
    regenerationsTotal: pkg.regenerationsIncluded,
    creatorSetupsUsed,
    creatorSetupsTotal: pkg.creatorSetupsIncluded,
  };
}
