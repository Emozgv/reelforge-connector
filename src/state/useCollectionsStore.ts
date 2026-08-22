import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { collectionMetaFromRow, type CollectionRow } from "../lib/collectionMapping";
import { conceptFromRow, conceptToInsertRow, type ConceptRow } from "../lib/conceptMapping";
import { submissionFromRow, type SubmissionConceptRow, type SubmissionRow } from "../lib/submissionMapping";
import { activityEventInsert, historyEntryFromRow, type ActivityEventRow } from "../lib/activityMapping";
import { formatTimestamp } from "../lib/dateFormat";
import type { Collection, CollectionStatus, ConceptStatus, ReelVideo } from "../types";

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

function isForeignKeyViolation(error: { code?: string } | null): boolean {
  return error?.code === "23503";
}

/**
 * Collection metadata, Concepts, Submissions, and now Activity/History are all
 * fetched from and persisted to Supabase. There is no mock/local data left in
 * this store — every field on Collection comes from a real client_os table.
 * Submission status/delivery_url remain system-controlled (no client
 * UPDATE/DELETE grant); Activity is append-only (SELECT + INSERT only).
 */
export function useCollectionsStore(workspaceId: string | undefined) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const collectionsRef = useRef<Collection[]>([]);
  collectionsRef.current = collections;

  useEffect(() => {
    if (!workspaceId) {
      setCollections([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      const [collectionsResult, conceptsResult, submissionsResult, submissionConceptsResult, activityResult] =
        await Promise.all([
          supabase
            .schema("client_os")
            .from("collections")
            .select("*")
            .eq("workspace_id", workspaceId)
            .order("name", { ascending: true }),
          supabase.schema("client_os").from("concepts").select("*").eq("workspace_id", workspaceId),
          supabase
            .schema("client_os")
            .from("submissions")
            .select("*")
            .eq("workspace_id", workspaceId)
            .order("index", { ascending: true }),
          supabase.schema("client_os").from("submission_concepts").select("*"),
          supabase
            .schema("client_os")
            .from("activity_events")
            .select("*")
            .eq("workspace_id", workspaceId)
            .order("created_at", { ascending: true }),
        ]);

      if (!active) return;

      const firstError =
        collectionsResult.error ??
        conceptsResult.error ??
        submissionsResult.error ??
        submissionConceptsResult.error ??
        activityResult.error;
      if (firstError) {
        setError(firstError.message);
        setCollections([]);
        setLoading(false);
        return;
      }

      const conceptsByCollectionId = new Map<string, Collection["concepts"]>();
      for (const row of conceptsResult.data as ConceptRow[]) {
        const list = conceptsByCollectionId.get(row.collection_id) ?? [];
        list.push(conceptFromRow(row));
        conceptsByCollectionId.set(row.collection_id, list);
      }

      const conceptIdsBySubmissionId = new Map<string, string[]>();
      for (const row of submissionConceptsResult.data as SubmissionConceptRow[]) {
        const list = conceptIdsBySubmissionId.get(row.submission_id) ?? [];
        list.push(row.concept_id);
        conceptIdsBySubmissionId.set(row.submission_id, list);
      }

      const submissionsByCollectionId = new Map<string, Collection["submissions"]>();
      for (const row of submissionsResult.data as SubmissionRow[]) {
        const list = submissionsByCollectionId.get(row.collection_id) ?? [];
        list.push(submissionFromRow(row, conceptIdsBySubmissionId.get(row.id) ?? []));
        submissionsByCollectionId.set(row.collection_id, list);
      }

      const historyByCollectionId = new Map<string, Collection["history"]>();
      for (const row of activityResult.data as ActivityEventRow[]) {
        if (!row.collection_id) continue;
        const list = historyByCollectionId.get(row.collection_id) ?? [];
        list.push(historyEntryFromRow(row));
        historyByCollectionId.set(row.collection_id, list);
      }

      const rows = collectionsResult.data as CollectionRow[];
      setCollections(
        rows.map((row) => {
          const meta = collectionMetaFromRow(row);
          return {
            ...meta,
            history: historyByCollectionId.get(row.id) ?? [],
            concepts: conceptsByCollectionId.get(row.id) ?? [],
            submissions: submissionsByCollectionId.get(row.id) ?? [],
          };
        })
      );
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [workspaceId]);

  // Logs a real activity event after its underlying action has already
  // succeeded. A failure here is non-blocking — the real action already
  // happened, so we just skip adding the (cosmetic) history entry rather than
  // surfacing an error for it.
  async function logActivity(
    collectionId: string,
    eventType: Parameters<typeof activityEventInsert>[1],
    message: string,
    submissionId?: string
  ) {
    if (!workspaceId) return;
    const { data } = await supabase
      .schema("client_os")
      .from("activity_events")
      .insert(activityEventInsert(workspaceId, eventType, message, { collectionId, submissionId }))
      .select()
      .single();

    if (data) {
      const entry = historyEntryFromRow(data as ActivityEventRow);
      setCollections((prev) =>
        prev.map((c) => (c.id === collectionId ? { ...c, history: [...c.history, entry] } : c))
      );
    }
  }

  async function applyMetaUpdate(
    collectionId: string,
    patch: Partial<Collection>,
    dbPatch: Record<string, unknown>
  ) {
    const previous = collectionsRef.current;
    setCollections((prev) => prev.map((c) => (c.id === collectionId ? { ...c, ...patch } : c)));
    setSaveError(null);

    const { error: updateError } = await supabase
      .schema("client_os")
      .from("collections")
      .update(dbPatch)
      .eq("id", collectionId);

    if (updateError) {
      setCollections(previous);
      setSaveError("Couldn't save that change — please try again.");
      return false;
    }
    return true;
  }

  // Duplicate-save rule: the same source_url saved twice into the SAME
  // Collection is treated as already-saved, not a new row (enforced for real
  // by a unique index on client_os.concepts(collection_id, source_url), so
  // this local check is just a fast path — concurrent/multi-tab saves still
  // can't create a duplicate). Saving the same source into a DIFFERENT
  // Collection is allowed. No global (cross-collection) dedup exists yet.
  async function addVideoToCollection(collectionId: string, video: ReelVideo) {
    const target = collectionsRef.current.find((c) => c.id === collectionId);
    if (!target || !workspaceId) return;
    if (target.concepts.some((k) => k.video.sourceUrl && k.video.sourceUrl === video.sourceUrl)) return;

    const { data, error: insertError } = await supabase
      .schema("client_os")
      .from("concepts")
      .insert(conceptToInsertRow(video, collectionId, workspaceId))
      .select()
      .single();

    if (insertError || !data) {
      if (isUniqueViolation(insertError)) return; // already saved into this collection — quiet no-op
      setSaveError("Couldn't save that concept — please try again.");
      return;
    }

    const concept = conceptFromRow(data as ConceptRow);
    setCollections((prev) =>
      prev.map((c) => (c.id === collectionId ? { ...c, concepts: [concept, ...c.concepts] } : c))
    );
    void logActivity(collectionId, "concept_added", "1 concept added");
  }

  async function createCollection(
    name: string,
    creatorId: string,
    note: string,
    initialVideo?: ReelVideo
  ): Promise<{ id: string | null; error: string | null }> {
    if (!workspaceId) return { id: null, error: "No active workspace." };

    const { data, error: insertError } = await supabase
      .schema("client_os")
      .from("collections")
      .insert({ workspace_id: workspaceId, creator_id: creatorId, name, notes: note })
      .select()
      .single();

    if (insertError || !data) {
      return { id: null, error: insertError?.message ?? "Couldn't create collection." };
    }

    const meta = collectionMetaFromRow(data as CollectionRow);
    let concepts: Collection["concepts"] = [];

    if (initialVideo) {
      const { data: conceptRow } = await supabase
        .schema("client_os")
        .from("concepts")
        .insert(conceptToInsertRow(initialVideo, meta.id, workspaceId))
        .select()
        .single();
      if (conceptRow) concepts = [conceptFromRow(conceptRow as ConceptRow)];
    }

    const created: Collection = { ...meta, concepts, submissions: [], history: [] };
    setCollections((prev) => [created, ...prev]);
    void logActivity(meta.id, "collection_created", "Collection created");
    return { id: created.id, error: null };
  }

  // A Concept already referenced by a real Submission (client_os.submission_concepts)
  // can't be deleted — the database rejects it (23503, FK ON DELETE RESTRICT)
  // rather than silently stripping it out of submission history. We surface
  // that as a clear, subtle message instead of a generic failure.
  async function removeVideoFromCollection(collectionId: string, videoId: string) {
    const previous = collectionsRef.current;
    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId ? { ...c, concepts: c.concepts.filter((k) => k.video.id !== videoId) } : c
      )
    );

    const { error: deleteError } = await supabase.schema("client_os").from("concepts").delete().eq("id", videoId);

    if (deleteError) {
      setCollections(previous);
      setSaveError(
        isForeignKeyViolation(deleteError)
          ? "This concept was already sent to ReelForge and can't be removed."
          : "Couldn't remove that concept — please try again."
      );
      return;
    }
    void logActivity(collectionId, "concept_removed", "1 concept removed");
  }

  async function setConceptStatus(collectionId: string, videoId: string, status: ConceptStatus) {
    const previous = collectionsRef.current;
    const producedAtIso = status === "Used" ? new Date().toISOString() : null;

    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId
          ? {
              ...c,
              concepts: c.concepts.map((k) =>
                k.video.id === videoId
                  ? { ...k, status, producedDate: producedAtIso ? formatTimestamp(new Date(producedAtIso)) : undefined }
                  : k
              ),
            }
          : c
      )
    );

    const { error: updateError } = await supabase
      .schema("client_os")
      .from("concepts")
      .update({ status, produced_at: producedAtIso })
      .eq("id", videoId);

    if (updateError) {
      setCollections(previous);
      setSaveError("Couldn't update that concept — please try again.");
      return;
    }

    const eventType = status === "Used" ? "concept_marked_used" : status === "Rejected" ? "concept_rejected" : "concept_marked_unused";
    const message = status === "Used" ? "Concept marked as Used" : status === "Rejected" ? "Concept marked as Rejected" : "Concept marked as Unused";
    void logActivity(collectionId, eventType, message);
  }

  // Sending creates one real Submission row plus one submission_concepts row
  // per included Concept (every non-Rejected concept in the Collection —
  // there's no separate concept-picker UI, matching existing V1 behavior).
  // Sending a Concept does NOT mark it Used — production usage and submission
  // membership are tracked independently. New submissions always start
  // "Sent"; only a future Internal connection (service_role, never the
  // browser) can move them through In Progress / Check Inbox / Finished.
  async function sendSubmission(collectionId: string, note: string) {
    const target = collectionsRef.current.find((c) => c.id === collectionId);
    if (!target || !workspaceId) return;
    const included = target.concepts.filter((k) => k.status !== "Rejected");
    if (included.length === 0) return;

    const { data: submissionRow, error: insertError } = await supabase
      .schema("client_os")
      .from("submissions")
      .insert({ workspace_id: workspaceId, collection_id: collectionId, note: note || null })
      .select()
      .single();

    if (insertError || !submissionRow) {
      setSaveError("Couldn't send to ReelForge — please try again.");
      return;
    }

    const row = submissionRow as SubmissionRow;
    const { error: linkError } = await supabase
      .schema("client_os")
      .from("submission_concepts")
      .insert(included.map((k) => ({ submission_id: row.id, concept_id: k.video.id })));

    if (linkError) {
      setSaveError(
        "Submission was sent but not all concepts could be attached — please refresh and check before resending."
      );
    }

    const submission = submissionFromRow(row, included.map((k) => k.video.id));
    setCollections((prev) =>
      prev.map((c) => (c.id === collectionId ? { ...c, submissions: [...c.submissions, submission] } : c))
    );
    void applyMetaUpdate(collectionId, { status: "Sent" }, { status: "Sent" });
    void logActivity(collectionId, "submission_created", `Submission #${row.index} sent to ReelForge`, row.id);
  }

  function updateNotes(collectionId: string, notes: string) {
    // Autosaves as the user types — intentionally not logged to Activity.
    void applyMetaUpdate(collectionId, { notes }, { notes });
  }

  async function updateStatus(collectionId: string, status: CollectionStatus) {
    const ok = await applyMetaUpdate(collectionId, { status }, { status });
    if (ok) void logActivity(collectionId, "collection_status_changed", `Marked ${status}`);
  }

  async function renameCollection(collectionId: string, name: string) {
    const ok = await applyMetaUpdate(collectionId, { name }, { name });
    if (ok) void logActivity(collectionId, "collection_renamed", `Renamed to "${name}"`);
  }

  async function duplicateCollection(collectionId: string) {
    const source = collectionsRef.current.find((c) => c.id === collectionId);
    if (!source || !workspaceId) return;

    const { data, error: insertError } = await supabase
      .schema("client_os")
      .from("collections")
      .insert({
        workspace_id: workspaceId,
        creator_id: source.creatorId,
        name: `${source.name} copy`,
        notes: source.notes,
        status: "Draft",
      })
      .select()
      .single();

    if (insertError || !data) {
      setSaveError("Couldn't duplicate that collection — please try again.");
      return;
    }

    const meta = collectionMetaFromRow(data as CollectionRow);

    // Duplicating a Collection duplicates its Concept rows too — otherwise the
    // copy would show concepts locally that don't actually exist under its new
    // collection_id, and they'd vanish on refresh. Submissions are NOT copied —
    // a duplicate is a fresh Draft with no submission history of its own.
    let concepts: Collection["concepts"] = [];
    if (source.concepts.length > 0) {
      const { data: conceptRows } = await supabase
        .schema("client_os")
        .from("concepts")
        .insert(source.concepts.map((k) => conceptToInsertRow(k.video, meta.id, workspaceId)))
        .select();
      if (conceptRows) concepts = (conceptRows as ConceptRow[]).map(conceptFromRow);
    }

    const copy: Collection = { ...meta, concepts, submissions: [], history: [] };
    setCollections((prev) => [copy, ...prev]);

    const suffix = concepts.length > 0 ? ` with ${concepts.length} concept${concepts.length === 1 ? "" : "s"}` : "";
    void logActivity(meta.id, "collection_created", `Duplicated from "${source.name}"${suffix}`);
  }

  async function deleteCollection(collectionId: string) {
    const previous = collectionsRef.current;
    setCollections((prev) => prev.filter((c) => c.id !== collectionId));

    const { error: deleteError } = await supabase
      .schema("client_os")
      .from("collections")
      .delete()
      .eq("id", collectionId);

    if (deleteError) {
      setCollections(previous);
      setSaveError("Couldn't delete that collection — please try again.");
    }
  }

  return {
    collections,
    loading,
    error,
    saveError,
    addVideoToCollection,
    createCollection,
    removeVideoFromCollection,
    setConceptStatus,
    sendSubmission,
    updateNotes,
    updateStatus,
    renameCollection,
    duplicateCollection,
    deleteCollection,
  };
}

export type CollectionsStore = ReturnType<typeof useCollectionsStore>;
