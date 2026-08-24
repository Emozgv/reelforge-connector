import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { collectionMetaFromRow, type CollectionRow } from "../lib/collectionMapping";
import { conceptFromRow, conceptToInsertRow, type ConceptRow } from "../lib/conceptMapping";
import { submissionFromRow, type SubmissionConceptRow, type SubmissionRow } from "../lib/submissionMapping";
import { activityEventInsert, historyEntryFromRow, type ActivityEventRow } from "../lib/activityMapping";
import {
  isFreeReason,
  regenerationRequestFromRow,
  type RegenerationRequestRow,
} from "../lib/regenerationMapping";
import { formatTimestamp } from "../lib/dateFormat";
import { collectionBaseName, collectionFamily, nextCollectionName } from "../lib/collectionNaming";
import type { Collection, CollectionStatus, ConceptStatus, ReelVideo, RegenerationReason } from "../types";

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
  // Families currently mid-creation of their next version — guards against
  // two "New version" clicks (or any other double-fire) both reading the same
  // not-yet-updated collections list and computing the same next number.
  const pendingVersionKeysRef = useRef<Set<string>>(new Set());

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
      const [
        collectionsResult,
        conceptsResult,
        submissionsResult,
        submissionConceptsResult,
        activityResult,
        regenerationResult,
      ] = await Promise.all([
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
        supabase
          .schema("client_os")
          .from("regeneration_requests")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false }),
      ]);

      if (!active) return;

      const firstError =
        collectionsResult.error ??
        conceptsResult.error ??
        submissionsResult.error ??
        submissionConceptsResult.error ??
        activityResult.error ??
        regenerationResult.error;
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

      const regenerationsByCollectionId = new Map<string, Collection["regenerationRequests"]>();
      for (const row of regenerationResult.data as RegenerationRequestRow[]) {
        const list = regenerationsByCollectionId.get(row.collection_id) ?? [];
        list.push(regenerationRequestFromRow(row));
        regenerationsByCollectionId.set(row.collection_id, list);
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
            regenerationRequests: regenerationsByCollectionId.get(row.id) ?? [],
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
  async function addVideoToCollection(
    collectionId: string,
    video: ReelVideo,
    notes?: string,
    creatorId?: string,
    sourceLabel?: string
  ) {
    const target = collectionsRef.current.find((c) => c.id === collectionId);
    if (!target || !workspaceId) return;
    if (target.concepts.some((k) => k.video.sourceUrl && k.video.sourceUrl === video.sourceUrl)) return;

    const { data, error: insertError } = await supabase
      .schema("client_os")
      .from("concepts")
      .insert(conceptToInsertRow(video, collectionId, workspaceId, notes, creatorId, sourceLabel))
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
    initialVideo?: ReelVideo,
    conceptNotes?: string,
    conceptCreatorId?: string,
    sourceLabel?: string
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
        .insert(conceptToInsertRow(initialVideo, meta.id, workspaceId, conceptNotes, conceptCreatorId, sourceLabel))
        .select()
        .single();
      if (conceptRow) concepts = [conceptFromRow(conceptRow as ConceptRow)];
    }

    const created: Collection = { ...meta, concepts, submissions: [], history: [], regenerationRequests: [] };
    setCollections((prev) => [created, ...prev]);
    void logActivity(meta.id, "collection_created", "Collection created");
    return { id: created.id, error: null };
  }

  // A DB trigger auto-creates every creator's "Quick Saves" collection the
  // moment the creator row is inserted — but that insert happens entirely
  // server-side, so this store's local `collections` state has no idea it
  // exists until the next full fetch. Called right after creating a new
  // creator so a Quick Save right afterward finds it immediately instead of
  // racing the trigger with a client-side createCollection (which would just
  // fail on the same-name unique constraint).
  async function syncQuickSavesForCreator(creatorId: string) {
    if (!workspaceId) return;
    if (collectionsRef.current.some((c) => c.creatorId === creatorId && c.name === "Quick Saves")) return;
    const { data } = await supabase
      .schema("client_os")
      .from("collections")
      .select("*")
      .eq("creator_id", creatorId)
      .eq("name", "Quick Saves")
      .maybeSingle();
    if (!data) return;
    const meta = collectionMetaFromRow(data as CollectionRow);
    setCollections((prev) =>
      prev.some((c) => c.id === meta.id)
        ? prev
        : [{ ...meta, concepts: [], submissions: [], history: [], regenerationRequests: [] }, ...prev]
    );
  }

  // Creates the next numbered version of a Collection's family — the name is
  // always computed here, from the freshest known collections list, at the
  // exact moment of creation. Never accepts a name from the caller, so a
  // stale suggestion computed earlier at render time can never be what
  // actually gets inserted. Guarded against concurrent calls for the same
  // family so two rapid clicks can't both land on e.g. "Foo 3".
  async function createNextVersion(collectionId: string): Promise<{ id: string | null; error: string | null }> {
    const source = collectionsRef.current.find((c) => c.id === collectionId);
    if (!source) return { id: null, error: "Collection not found." };

    const key = `${source.creatorId}::${collectionBaseName(source.name)}`;
    if (pendingVersionKeysRef.current.has(key)) {
      return { id: null, error: null }; // a next-version request for this family is already in flight
    }
    pendingVersionKeysRef.current.add(key);

    try {
      const family = collectionFamily(
        source.name,
        collectionsRef.current.filter((c) => c.creatorId === source.creatorId)
      );
      const name = nextCollectionName(source.name, family.map((f) => f.name));
      return await createCollection(name, source.creatorId, "");
    } finally {
      pendingVersionKeysRef.current.delete(key);
    }
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

  function updateConceptNotes(collectionId: string, videoId: string, notes: string) {
    // Autosaves as the user types, matching the collection-level notes pattern
    // — intentionally not logged to Activity.
    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId
          ? { ...c, concepts: c.concepts.map((k) => (k.video.id === videoId ? { ...k, notes } : k)) }
          : c
      )
    );
    void supabase.schema("client_os").from("concepts").update({ notes }).eq("id", videoId);
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

  // Client-side upload of the actual delivered video for one reel, so the
  // read-only Finished view can show it next to the original reference.
  async function uploadFinishedVideo(
    collectionId: string,
    conceptId: string,
    file: File
  ): Promise<{ error: string | null }> {
    if (!workspaceId) return { error: "No active workspace." };

    const ext = file.name.split(".").pop() || "mp4";
    const path = `${workspaceId}/${conceptId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("client-os-finished-videos")
      .upload(path, file, { upsert: true, cacheControl: "3600" });

    if (uploadError) return { error: uploadError.message };

    const { data: publicUrlData } = supabase.storage.from("client-os-finished-videos").getPublicUrl(path);
    const url = `${publicUrlData.publicUrl}?v=${Date.now()}`;

    const previous = collectionsRef.current;
    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId
          ? { ...c, concepts: c.concepts.map((k) => (k.video.id === conceptId ? { ...k, finishedVideoUrl: url } : k)) }
          : c
      )
    );

    const { error: updateError } = await supabase
      .schema("client_os")
      .from("concepts")
      .update({ finished_video_url: url })
      .eq("id", conceptId);

    if (updateError) {
      setCollections(previous);
      return { error: updateError.message };
    }
    return { error: null };
  }

  // Writes a real row to client_os.regeneration_requests (free/paid decided
  // here, at request time, from the reason) plus the usual activity entry.
  // status starts "Requested" and only a future Internal connection can move
  // it — same system-controlled pattern as Submission.status.
  async function requestRegeneration(
    collectionId: string,
    submissionIndex: number,
    conceptId: string,
    reason: RegenerationReason,
    note: string
  ) {
    if (!workspaceId) return;
    const target = collectionsRef.current.find((c) => c.id === collectionId);
    const submission = target?.submissions.find((s) => s.index === submissionIndex);
    const isFree = isFreeReason(reason);

    const { data, error: insertError } = await supabase
      .schema("client_os")
      .from("regeneration_requests")
      .insert({
        workspace_id: workspaceId,
        collection_id: collectionId,
        submission_id: submission?.id ?? null,
        submission_index: submissionIndex,
        concept_id: conceptId,
        reason,
        is_free: isFree,
        note,
      })
      .select()
      .single();

    if (insertError || !data) {
      setSaveError(
        isUniqueViolation(insertError)
          ? "This reel already has an open regeneration request."
          : "Couldn't send that regeneration request — please try again."
      );
      return;
    }

    const request = regenerationRequestFromRow(data as RegenerationRequestRow);
    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId ? { ...c, regenerationRequests: [request, ...c.regenerationRequests] } : c
      )
    );

    const concept = target?.concepts.find((k) => k.video.id === conceptId);
    const reelLabel = concept ? `@${concept.video.username}` : `a reel in Submission #${submissionIndex}`;
    const kind = isFree ? "free replacement" : "possible billable regeneration";
    const message = note
      ? `Regeneration requested for ${reelLabel} (Submission #${submissionIndex}) — ${reason} (${kind}): "${note}"`
      : `Regeneration requested for ${reelLabel} (Submission #${submissionIndex}) — ${reason} (${kind})`;
    void logActivity(collectionId, "regeneration_requested", message, submission?.id);
  }

  async function toggleFavoriteSubmission(collectionId: string, submissionId: string, favorited: boolean) {
    const previous = collectionsRef.current;
    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId
          ? { ...c, submissions: c.submissions.map((s) => (s.id === submissionId ? { ...s, favorited } : s)) }
          : c
      )
    );

    const { error: updateError } = await supabase
      .schema("client_os")
      .from("submissions")
      .update({ favorited })
      .eq("id", submissionId);

    if (updateError) {
      setCollections(previous);
      setSaveError("Couldn't save that — please try again.");
    }
  }

  async function approveSubmission(collectionId: string, submissionId: string) {
    const previous = collectionsRef.current;
    const approvedAtIso = new Date().toISOString();
    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId
          ? {
              ...c,
              submissions: c.submissions.map((s) =>
                s.id === submissionId ? { ...s, approvedAt: formatTimestamp(new Date(approvedAtIso)) } : s
              ),
            }
          : c
      )
    );

    const { error: updateError } = await supabase
      .schema("client_os")
      .from("submissions")
      .update({ approved_at: approvedAtIso })
      .eq("id", submissionId);

    if (updateError) {
      setCollections(previous);
      setSaveError("Couldn't approve that — please try again.");
    }
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

  async function duplicateCollection(
    collectionId: string,
    targetName?: string
  ): Promise<{ id: string | null }> {
    const source = collectionsRef.current.find((c) => c.id === collectionId);
    if (!source || !workspaceId) return { id: null };

    const { data, error: insertError } = await supabase
      .schema("client_os")
      .from("collections")
      .insert({
        workspace_id: workspaceId,
        creator_id: source.creatorId,
        name: targetName || `${source.name} copy`,
        notes: source.notes,
        status: "Draft",
      })
      .select()
      .single();

    if (insertError || !data) {
      setSaveError("Couldn't duplicate that collection — please try again.");
      return { id: null };
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
        .insert(source.concepts.map((k) => conceptToInsertRow(k.video, meta.id, workspaceId, k.notes, k.creatorId)))
        .select();
      if (conceptRows) concepts = (conceptRows as ConceptRow[]).map(conceptFromRow);
    }

    const copy: Collection = { ...meta, concepts, submissions: [], history: [], regenerationRequests: [] };
    setCollections((prev) => [copy, ...prev]);

    const suffix = concepts.length > 0 ? ` with ${concepts.length} concept${concepts.length === 1 ? "" : "s"}` : "";
    void logActivity(meta.id, "collection_created", `Duplicated from "${source.name}"${suffix}`);
    return { id: meta.id };
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

  // Archiving/restoring is always a whole-family action — every version of
  // "Foo", "Foo 2", "Foo 3", ... moves together, never just the one the
  // client happened to click on. Both resolve the family fresh from
  // collectionsRef.current, same as createNextVersion, rather than trusting
  // a list handed in from render time.
  async function archiveCollectionFamily(collectionId: string) {
    const source = collectionsRef.current.find((c) => c.id === collectionId);
    if (!source) return;
    const family = collectionFamily(
      source.name,
      collectionsRef.current.filter((c) => c.creatorId === source.creatorId)
    );
    const ids = family.map((f) => f.id);
    const archivedAtIso = new Date().toISOString();

    const previous = collectionsRef.current;
    setCollections((prev) => prev.map((c) => (ids.includes(c.id) ? { ...c, archivedAt: archivedAtIso } : c)));

    const { error: updateError } = await supabase
      .schema("client_os")
      .from("collections")
      .update({ archived_at: archivedAtIso })
      .in("id", ids);

    if (updateError) {
      setCollections(previous);
      setSaveError("Couldn't archive that collection — please try again.");
      return;
    }
    void logActivity(collectionId, "collection_status_changed", `Archived "${collectionBaseName(source.name)}"`);
  }

  async function restoreCollectionFamily(collectionId: string) {
    const source = collectionsRef.current.find((c) => c.id === collectionId);
    if (!source) return;
    const family = collectionFamily(
      source.name,
      collectionsRef.current.filter((c) => c.creatorId === source.creatorId)
    );
    const ids = family.map((f) => f.id);

    const previous = collectionsRef.current;
    setCollections((prev) => prev.map((c) => (ids.includes(c.id) ? { ...c, archivedAt: undefined } : c)));

    const { error: updateError } = await supabase
      .schema("client_os")
      .from("collections")
      .update({ archived_at: null })
      .in("id", ids);

    if (updateError) {
      setCollections(previous);
      setSaveError("Couldn't restore that collection — please try again.");
      return;
    }
    void logActivity(collectionId, "collection_status_changed", `Restored "${collectionBaseName(source.name)}"`);
  }

  function clearSaveError() {
    setSaveError(null);
  }

  return {
    collections,
    loading,
    error,
    saveError,
    clearSaveError,
    addVideoToCollection,
    createCollection,
    syncQuickSavesForCreator,
    createNextVersion,
    removeVideoFromCollection,
    setConceptStatus,
    updateConceptNotes,
    requestRegeneration,
    toggleFavoriteSubmission,
    approveSubmission,
    uploadFinishedVideo,
    sendSubmission,
    updateNotes,
    updateStatus,
    renameCollection,
    duplicateCollection,
    deleteCollection,
    archiveCollectionFamily,
    restoreCollectionFamily,
  };
}

export type CollectionsStore = ReturnType<typeof useCollectionsStore>;
