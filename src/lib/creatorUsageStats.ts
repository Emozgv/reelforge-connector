import type { Collection, CreatorPackage } from "../types";

export interface CreatorUsageStats {
  reelsUsed: number;
  reelsTotal: number;
  // Real count of billable (isFree === false) regeneration requests this
  // creator has filed, all-time — shown with no denominator, since the real
  // ReelForge model sells regenerations as separate add-on packs (5/10/25),
  // not a bundled per-plan allowance. Inventing a "total" here would be the
  // exact kind of fake number this pass is meant to avoid.
  paidRegenerationsUsed: number;
}

// Same approximation as computeUsageStats (all-time rather than cycle-scoped
// — Collection history only keeps display-formatted dates, not raw ISO), but
// scoped to one creator's own Collections instead of the whole workspace.
export function computeCreatorUsageStats(pkg: CreatorPackage, collections: Collection[]): CreatorUsageStats {
  const creatorCollections = collections.filter((c) => c.creatorId === pkg.creatorId);

  let reelsUsed = 0;
  let paidRegenerationsUsed = 0;
  for (const collection of creatorCollections) {
    for (const submission of collection.submissions) {
      if (submission.status !== "Finished") continue;
      reelsUsed += submission.conceptIds.length;
    }
    paidRegenerationsUsed += collection.regenerationRequests.filter((r) => !r.isFree).length;
  }

  return {
    reelsUsed,
    reelsTotal: pkg.monthlyReelAllowance,
    paidRegenerationsUsed,
  };
}
