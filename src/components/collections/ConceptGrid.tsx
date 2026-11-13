import { FolderHeart } from "lucide-react";
import type { Collection, CollectionConcept, ConceptStatus, Creator } from "../../types";
import { ConceptCard } from "./ConceptCard";

export function ConceptGrid({
  concepts,
  submittedConceptIds,
  creators,
  collections,
  currentCreatorId,
  ansicht = "raster",
  leerText,
  onStatusChange,
  onRemove,
  onNotesChange,
  onOpen,
  onReassign,
  onAssignToAnother,
}: {
  concepts: CollectionConcept[];
  submittedConceptIds: Set<string>;
  creators: Creator[];
  collections: Collection[];
  currentCreatorId: string | undefined;
  ansicht?: "raster" | "liste";
  /** Eigener Leertext, z. B. wenn ein Filter nichts uebrig laesst. */
  leerText?: string;
  onStatusChange: (videoId: string, status: ConceptStatus) => void;
  onRemove: (videoId: string) => void;
  onNotesChange: (videoId: string, notes: string) => void;
  onOpen: (concept: CollectionConcept) => void;
  onReassign: (videoId: string, targetCreatorId: string, targetCollectionId: string | undefined) => Promise<{ error: string | null }>;
  onAssignToAnother: (videoId: string, targetCreatorId: string, targetCollectionId: string | undefined) => Promise<{ error: string | null }>;
}) {
  if (concepts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center rounded-[11px] border border-[#1a130b] py-20">
        <FolderHeart size={20} className="text-[#6f7075] mb-2.5" />
        <p className="text-[13.5px] text-[#dcdcde]">{leerText ?? "No concepts saved yet."}</p>
        {!leerText && (
          <p className="text-[12px] text-[#8c877e] mt-1.5">
            Save Reels for this creator from the Creativity Hub to add them here.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={ansicht === "liste" ? "flex flex-col gap-2" : "grid grid-cols-4 gap-3.5"}>
      {concepts.map((concept, i) => (
        <div
          key={concept.video.id}
          className="animate-rise-in"
          style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}
        >
          <ConceptCard
            concept={concept}
            submitted={submittedConceptIds.has(concept.video.id)}
            creators={creators}
            collections={collections}
            currentCreatorId={currentCreatorId}
            ansicht={ansicht}
            onStatusChange={(status) => onStatusChange(concept.video.id, status)}
            onRemove={() => onRemove(concept.video.id)}
            onNotesChange={(notes) => onNotesChange(concept.video.id, notes)}
            onOpen={() => onOpen(concept)}
            onReassign={(targetCreatorId, targetCollectionId) => onReassign(concept.video.id, targetCreatorId, targetCollectionId)}
            onAssignToAnother={(targetCreatorId, targetCollectionId) => onAssignToAnother(concept.video.id, targetCreatorId, targetCollectionId)}
          />
        </div>
      ))}
    </div>
  );
}
