import type { Collection, CollectionStatus } from "../types";

// Shape of a row from client_os.collections (snake_case, as returned by PostgREST).
// Nested concepts/submissions/history are separate real tables (client_os.concepts,
// submissions, activity_events) — useCollectionsStore.ts fetches and merges them in.
export interface CollectionRow {
  id: string;
  workspace_id: string;
  creator_id: string;
  name: string;
  notes: string;
  status: CollectionStatus;
  created_at: string;
  updated_at: string;
}

export function collectionMetaFromRow(
  row: CollectionRow
): Pick<Collection, "id" | "creatorId" | "name" | "notes" | "status" | "updatedAt"> {
  return {
    id: row.id,
    creatorId: row.creator_id,
    name: row.name,
    notes: row.notes ?? "",
    status: row.status,
    updatedAt: row.updated_at,
  };
}
