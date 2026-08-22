import type { Collection } from "../../types";

export interface CreatorStats {
  collectionsCount: number;
  totalConcepts: number;
  used: number;
  unused: number;
  activeSubmissions: number;
}

// Collections/Submissions are never stored on the Creator itself — they're derived
// here from the Collections store via the real creator_id foreign key.
export function computeCreatorStats(creatorId: string, collections: Collection[]): CreatorStats {
  const own = collections.filter((c) => c.creatorId === creatorId);
  const allConcepts = own.flatMap((c) => c.concepts);
  const used = allConcepts.filter((c) => c.status === "Used").length;
  const unused = allConcepts.filter((c) => c.status === "Unused").length;
  const activeSubmissions = own
    .flatMap((c) => c.submissions)
    .filter((s) => s.status !== "Finished").length;

  return {
    collectionsCount: own.length,
    totalConcepts: allConcepts.length,
    used,
    unused,
    activeSubmissions,
  };
}
