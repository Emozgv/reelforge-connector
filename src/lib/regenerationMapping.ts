import type { RegenerationReason, RegenerationRequest, RegenerationStatus } from "../types";
import { formatTimestampFromIso } from "./dateFormat";

// Reasons tied to a QC/production defect are always a free reshoot; anything
// else is a creative change that may be billable — decided once, at request
// time, so the client always knows which kind of request they're sending.
const FREE_REASONS: RegenerationReason[] = ["Body", "Face", "Tattoos", "Technical issue"];

export function isFreeReason(reason: RegenerationReason): boolean {
  return FREE_REASONS.includes(reason);
}

// Shape of a row from client_os.regeneration_requests.
export interface RegenerationRequestRow {
  id: string;
  workspace_id: string;
  collection_id: string;
  submission_id: string | null;
  submission_index: number;
  reason: RegenerationReason;
  is_free: boolean;
  note: string;
  status: RegenerationStatus;
  created_at: string;
  updated_at: string;
}

export function regenerationRequestFromRow(row: RegenerationRequestRow): RegenerationRequest {
  return {
    id: row.id,
    collectionId: row.collection_id,
    submissionId: row.submission_id ?? undefined,
    submissionIndex: row.submission_index,
    reason: row.reason,
    isFree: row.is_free,
    note: row.note,
    status: row.status,
    createdAt: formatTimestampFromIso(row.created_at),
  };
}
