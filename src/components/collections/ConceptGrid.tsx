import type { CollectionConcept, ConceptStatus } from "../../types";
import { ConceptCard } from "./ConceptCard";

export function ConceptGrid({
  concepts,
  submittedConceptIds,
  onStatusChange,
  onRemove,
}: {
  concepts: CollectionConcept[];
  submittedConceptIds: Set<string>;
  onStatusChange: (videoId: string, status: ConceptStatus) => void;
  onRemove: (videoId: string) => void;
}) {
  if (concepts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center rounded-xl surface-panel py-20">
        <p className="text-[13.5px] text-neutral-300">No concepts saved yet.</p>
        <p className="text-[12px] text-neutral-600 mt-1.5">
          Save Reels for this creator from the Creativity Hub to add them here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-3.5">
      {concepts.map((concept, i) => (
        <div
          key={concept.video.id}
          className="animate-rise-in"
          style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}
        >
          <ConceptCard
            concept={concept}
            submitted={submittedConceptIds.has(concept.video.id)}
            onStatusChange={(status) => onStatusChange(concept.video.id, status)}
            onRemove={() => onRemove(concept.video.id)}
          />
        </div>
      ))}
    </div>
  );
}
