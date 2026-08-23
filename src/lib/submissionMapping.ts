import type { Submission, SubmissionStatus } from "../types";
import { formatTimestampFromIso } from "./dateFormat";

// Shape of a row from client_os.submissions. status/delivery_url are
// system-controlled — the client can SELECT/INSERT this table but has no
// UPDATE/DELETE grant at all (enforced at the database, not just in RLS).
export interface SubmissionRow {
  id: string;
  workspace_id: string;
  collection_id: string;
  index: number;
  status: SubmissionStatus;
  note: string | null;
  delivery_url: string | null;
  submitted_at: string;
  updated_at: string;
  favorited: boolean;
  approved_at: string | null;
}

// Shape of a row from client_os.submission_concepts — the only place
// Submission↔Concept membership is recorded.
export interface SubmissionConceptRow {
  submission_id: string;
  concept_id: string;
}

export function submissionFromRow(row: SubmissionRow, conceptIds: string[]): Submission {
  return {
    id: row.id,
    index: row.index,
    conceptIds,
    sentAt: formatTimestampFromIso(row.submitted_at),
    note: row.note ?? undefined,
    status: row.status,
    deliveryUrl: row.delivery_url ?? undefined,
    favorited: row.favorited,
    approvedAt: row.approved_at ?? undefined,
  };
}
