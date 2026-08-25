import type { CollectionHistoryEntry } from "../types";
import { formatTimestampFromIso } from "./dateFormat";

// Intentional V1 taxonomy — see useCollectionsStore.ts for where each is
// created. Kept small on purpose: no view/open/navigation events, no per-
// keystroke note-save events.
export type ActivityEventType =
  | "collection_created"
  | "collection_renamed"
  | "collection_status_changed"
  | "concept_added"
  | "concept_removed"
  | "concept_marked_used"
  | "concept_marked_unused"
  | "concept_rejected"
  | "submission_created"
  | "regeneration_requested"
  | "delivery_eta_set"
  | "submission_finished"
  | "submission_check_inbox";

// Shape of a row from client_os.activity_events. Append-only from the client's
// perspective — SELECT + INSERT only, no UPDATE/DELETE grant at all.
export interface ActivityEventRow {
  id: string;
  workspace_id: string;
  collection_id: string | null;
  submission_id: string | null;
  event_type: ActivityEventType;
  message: string;
  created_at: string;
}

export function historyEntryFromRow(row: ActivityEventRow): CollectionHistoryEntry {
  return { label: row.message, date: formatTimestampFromIso(row.created_at) };
}

export function activityEventInsert(
  workspaceId: string,
  eventType: ActivityEventType,
  message: string,
  opts: { collectionId?: string; submissionId?: string } = {}
) {
  return {
    workspace_id: workspaceId,
    collection_id: opts.collectionId ?? null,
    submission_id: opts.submissionId ?? null,
    event_type: eventType,
    message,
  };
}
