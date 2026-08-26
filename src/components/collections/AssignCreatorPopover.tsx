import { useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import type { Collection, Creator } from "../../types";
import { groupCollectionsByFamily } from "../../lib/collectionNaming";

type Action = "copy" | "move";

// Anchored popover for reassigning a saved Concept to a different creator —
// mirrors SavePanel's "Save for X" + collection-list pattern so this feels
// like a natural extension of Save, not a new UI language. "Change creator"
// (move) is only offered when the caller says it's safe (i.e. the concept
// hasn't been submitted yet); "Assign to another creator" (copy) is always
// available.
export function AssignCreatorPopover({
  creators,
  collections,
  currentCreatorId,
  canMove,
  onClose,
  onConfirm,
}: {
  creators: Creator[];
  collections: Collection[];
  currentCreatorId: string | undefined;
  canMove: boolean;
  onClose: () => void;
  onConfirm: (action: Action, targetCreatorId: string, targetCollectionId: string | undefined) => void;
}) {
  const [action, setAction] = useState<Action>("copy");
  const [targetCreatorId, setTargetCreatorId] = useState<string | null>(null);

  const otherCreators = creators.filter((c) => c.id !== currentCreatorId);
  const targetCreator = creators.find((c) => c.id === targetCreatorId);
  const collectionsForTarget = targetCreatorId
    ? groupCollectionsByFamily(collections.filter((c) => c.creatorId === targetCreatorId))
        .map((family) => family[family.length - 1])
        .filter((c) => c.name !== "Quick Saves")
    : [];

  function confirm(targetCollectionId?: string) {
    if (!targetCreatorId) return;
    onConfirm(action, targetCreatorId, targetCollectionId);
  }

  return (
    <div
      onMouseLeave={onClose}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-7 z-20 w-60 rounded-lg surface-panel-strong p-1 animate-fade-in"
    >
      {!targetCreatorId ? (
        <>
          {canMove && (
            <div className="flex items-center gap-1 p-1 mb-1">
              {(["copy", "move"] as Action[]).map((a) => (
                <button
                  key={a}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAction(a);
                  }}
                  className={[
                    "flex-1 text-[10.5px] font-medium px-2 py-1 rounded-md transition-colors",
                    action === a ? "bg-white/[0.08] text-neutral-100" : "text-neutral-500 hover:text-neutral-300",
                  ].join(" ")}
                >
                  {a === "copy" ? "Assign to another" : "Change creator"}
                </button>
              ))}
            </div>
          )}
          <p className="px-2 pt-1 pb-1 text-[10px] tracking-wide uppercase text-neutral-600">
            {action === "copy" ? "Also assign to" : "Move to"}
          </p>
          {otherCreators.length === 0 && (
            <p className="px-2 py-2 text-[11px] text-neutral-600">No other creators yet.</p>
          )}
          {otherCreators.map((c) => (
            <button
              key={c.id}
              onClick={(e) => {
                e.stopPropagation();
                setTargetCreatorId(c.id);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.06] transition-colors"
            >
              <div className="w-4 h-4 rounded-full shrink-0" style={{ background: c.avatarColor }} />
              <span className="text-[11.5px] text-neutral-200 truncate flex-1 text-left">{c.name}</span>
              <ChevronRight size={12} className="text-neutral-600 shrink-0" />
            </button>
          ))}
        </>
      ) : (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setTargetCreatorId(null);
            }}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            <ArrowLeft size={11} />
            {targetCreator?.name}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              confirm(undefined);
            }}
            className="w-full text-left px-2 py-1.5 rounded-md text-[11.5px] text-[#D39448] hover:bg-[#D39448]/10 transition-colors"
          >
            Quick Saves
          </button>
          {collectionsForTarget.length > 0 && (
            <>
              <p className="px-2 pt-1.5 pb-0.5 text-[10px] tracking-wide uppercase text-neutral-600">Or a collection</p>
              {collectionsForTarget.map((c) => (
                <button
                  key={c.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    confirm(c.id);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-md text-[11.5px] text-neutral-300 hover:bg-white/[0.06] transition-colors truncate"
                >
                  {c.name}
                </button>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
