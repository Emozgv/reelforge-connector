import { useState } from "react";
import { collections as initialCollections } from "../data/mockData";
import type { Collection, CollectionStatus, ConceptStatus, ReelVideo, SubmissionStatus } from "../types";

function formatTimestamp(d: Date): string {
  const day = d.getDate().toString().padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short" });
  const year = d.getFullYear();
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${day} ${month} ${year} · ${hh}:${mm}`;
}

/**
 * In-memory (session-only) collections state shared between the Creativity Hub
 * and the Collections page, so saving a Reel into a collection is immediately
 * reflected everywhere. Resets on reload — there is no backend yet.
 */
export function useCollectionsStore() {
  const [collections, setCollections] = useState<Collection[]>(() => initialCollections);

  function addVideoToCollection(collectionId: string, video: ReelVideo) {
    setCollections((prev) =>
      prev.map((c) => {
        if (c.id !== collectionId) return c;
        if (c.concepts.some((k) => k.video.id === video.id)) return c;
        return {
          ...c,
          concepts: [
            { video: { ...video, saved: true }, status: "Unused", submissionIds: [] },
            ...c.concepts,
          ],
          lastUpdated: "Just now",
          history: [...c.history, { label: "1 concept added", date: "Just now" }],
        };
      })
    );
  }

  function createCollection(
    name: string,
    creatorName: string,
    note: string,
    initialVideo?: ReelVideo
  ): string {
    const id = `col-new-${Date.now()}`;
    setCollections((prev) => [
      {
        id,
        name,
        creator: creatorName,
        notes: note,
        status: "Draft",
        lastUpdated: "Just now",
        history: [{ label: "Collection created", date: "Just now" }],
        concepts: initialVideo
          ? [{ video: { ...initialVideo, saved: true }, status: "Unused", submissionIds: [] }]
          : [],
        submissions: [],
      },
      ...prev,
    ]);
    return id;
  }

  function removeVideoFromCollection(collectionId: string, videoId: string) {
    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId
          ? { ...c, concepts: c.concepts.filter((k) => k.video.id !== videoId), lastUpdated: "Just now" }
          : c
      )
    );
  }

  function setConceptStatus(collectionId: string, videoId: string, status: ConceptStatus) {
    setCollections((prev) =>
      prev.map((c) => {
        if (c.id !== collectionId) return c;
        let historyAddition: Collection["history"] = [];
        if (status === "Used" || status === "Rejected") {
          historyAddition = [{ label: `1 concept marked ${status}`, date: "Just now" }];
        }
        return {
          ...c,
          concepts: c.concepts.map((k) =>
            k.video.id === videoId
              ? {
                  ...k,
                  status,
                  producedDate: status === "Used" ? formatTimestamp(new Date()) : undefined,
                }
              : k
          ),
          lastUpdated: "Just now",
          history: [...c.history, ...historyAddition],
        };
      })
    );
  }

  // Sending is separate from marking concepts Used — it only records that a batch
  // of concepts was submitted. Their individual status is tracked independently,
  // and a Collection can be sent more than once (resending is allowed; the UI
  // warns the caller first if the batch overlaps a prior submission). The new
  // Submission always starts "In Progress" — the client never chooses its status.
  function sendSubmission(collectionId: string, note: string) {
    setCollections((prev) =>
      prev.map((c) => {
        if (c.id !== collectionId) return c;
        const included = c.concepts.filter((k) => k.status !== "Rejected");
        if (included.length === 0) return c;
        const submissionId = `sub-${c.id}-${Date.now()}`;
        const sentAt = formatTimestamp(new Date());
        return {
          ...c,
          status: "Sent",
          lastUpdated: "Just now",
          concepts: c.concepts.map((k) =>
            included.some((e) => e.video.id === k.video.id)
              ? { ...k, submissionIds: [...k.submissionIds, submissionId] }
              : k
          ),
          submissions: [
            ...c.submissions,
            {
              id: submissionId,
              index: c.submissions.length + 1,
              conceptIds: included.map((k) => k.video.id),
              sentAt,
              note: note || undefined,
              status: "In Progress",
            },
          ],
          history: [
            ...c.history,
            { label: `Sent ${included.length} concept${included.length === 1 ? "" : "s"} to ReelForge`, date: sentAt },
          ],
        };
      })
    );
  }

  // Simulates a production-status update from ReelForge Internal. Intentionally
  // NOT wired to any client-facing control — production status is read-only for
  // the client; this exists only so the prototype can demonstrate state changes
  // via mock/dev data until the real Internal connection lands.
  function setSubmissionStatus(collectionId: string, submissionId: string, status: SubmissionStatus) {
    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId
          ? {
              ...c,
              submissions: c.submissions.map((s) => (s.id === submissionId ? { ...s, status } : s)),
            }
          : c
      )
    );
  }

  function updateNotes(collectionId: string, notes: string) {
    setCollections((prev) => prev.map((c) => (c.id === collectionId ? { ...c, notes } : c)));
  }

  function updateStatus(collectionId: string, status: CollectionStatus) {
    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId
          ? {
              ...c,
              status,
              lastUpdated: "Just now",
              history: [...c.history, { label: `Marked ${status}`, date: "Just now" }],
            }
          : c
      )
    );
  }

  function renameCollection(collectionId: string, name: string) {
    setCollections((prev) => prev.map((c) => (c.id === collectionId ? { ...c, name } : c)));
  }

  function duplicateCollection(collectionId: string) {
    setCollections((prev) => {
      const source = prev.find((c) => c.id === collectionId);
      if (!source) return prev;
      const copy: Collection = {
        ...source,
        id: `col-dup-${Date.now()}`,
        name: `${source.name} copy`,
        status: "Draft",
        lastUpdated: "Just now",
        history: [{ label: "Duplicated collection", date: "Just now" }],
        concepts: source.concepts.map((k) => ({ ...k, submissionIds: [] })),
        submissions: [],
      };
      return [copy, ...prev];
    });
  }

  function deleteCollection(collectionId: string) {
    setCollections((prev) => prev.filter((c) => c.id !== collectionId));
  }

  return {
    collections,
    addVideoToCollection,
    createCollection,
    removeVideoFromCollection,
    setConceptStatus,
    sendSubmission,
    setSubmissionStatus,
    updateNotes,
    updateStatus,
    renameCollection,
    duplicateCollection,
    deleteCollection,
  };
}

export type CollectionsStore = ReturnType<typeof useCollectionsStore>;
