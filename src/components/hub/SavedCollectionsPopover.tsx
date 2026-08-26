import { useState } from "react";
import { X, FolderHeart, ArrowUpRight } from "lucide-react";
import type { Collection, Creator } from "../../types";
import { formatRelativeTime } from "../../lib/relativeTime";
import { COLLECTION_STATUS_STYLES, effectiveCollectionStatus } from "../collections/CollectionRow";
import { CollectionVersionMenu } from "../collections/CollectionVersionMenu";
import { groupCollectionsByFamily, isVersionableCollection, nextCollectionName } from "../../lib/collectionNaming";
import { DEFAULT_THUMB_GRADIENT } from "../../data/mockData";

export function SavedCollectionsPopover({
  open,
  creator,
  collections,
  onClose,
  onOpenCollection,
  onCreateNextVersion,
}: {
  open: boolean;
  creator: Creator | null;
  collections: Collection[];
  onClose: () => void;
  onOpenCollection: (collectionId: string) => void;
  // Reuses the real Collections store's own versioning action — a version
  // created from here is the exact same Collection family the main
  // Collections page sees, never a Saved-only copy. Resolves to the new
  // version's id so this popover can switch its own row to show it.
  onCreateNextVersion: (collectionId: string) => Promise<string | null>;
}) {
  // Which version of each family is currently showing in this popover —
  // defaults to the newest version (same default as CollectionRow), keyed by
  // the family's base name so a switch survives the list re-rendering as
  // saves come in elsewhere.
  const [selectedVersionByFamily, setSelectedVersionByFamily] = useState<Record<string, string>>({});

  if (!open || !creator) return null;

  const ownCollections = collections.filter((c) => c.creatorId === creator.id);
  const totalConcepts = ownCollections.reduce((sum, c) => sum + c.concepts.length, 0);
  // Same grouping the main Collections page uses — "Aesthetic Reels" and
  // "Aesthetic Reels 2" collapse into one row with a version switcher,
  // instead of listing every version as its own unrelated row.
  const families = groupCollectionsByFamily(ownCollections).sort(
    (a, b) => Number(b[0].name === "Quick Saves") - Number(a[0].name === "Quick Saves")
  );

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[3px] animate-fade-in" />

      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[420px] rounded-2xl bg-[#141416] border border-white/[0.09] shadow-2xl animate-rise-in overflow-hidden">
          <div className="flex items-center justify-between px-5 h-14 border-b border-white/[0.07]">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-6 h-6 rounded-full shrink-0 ring-1 ring-white/20 overflow-hidden"
                style={creator.profileImage ? undefined : { background: creator.avatarColor }}
              >
                {creator.profileImage && (
                  <img src={creator.profileImage} alt={creator.name} className="w-full h-full object-cover" />
                )}
              </div>
              <h2 className="text-[15px] font-serif font-medium text-neutral-50 truncate">
                {creator.name}'s collections
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.06] transition-colors duration-150 shrink-0"
            >
              <X size={15} />
            </button>
          </div>

          <p className="px-5 pt-3 text-[11px] text-neutral-500">
            {totalConcepts} saved concept{totalConcepts === 1 ? "" : "s"} across {ownCollections.length}{" "}
            collection{ownCollections.length === 1 ? "" : "s"}
          </p>

          <div className="px-3 py-2 max-h-[360px] overflow-y-auto">
            {families.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center py-10">
                <FolderHeart size={20} className="text-neutral-700 mb-2" />
                <p className="text-[12.5px] text-neutral-400">Nothing saved for {creator.name} yet.</p>
              </div>
            )}
            {families.map((family) => {
              const familyKey = family[0].id;
              const selectedId = selectedVersionByFamily[familyKey];
              const current = family.find((f) => f.id === selectedId) ?? family[family.length - 1];
              const suggestedName = nextCollectionName(current.name, family.map((f) => f.name));

              return (
                <div
                  key={familyKey}
                  onClick={() => {
                    onOpenCollection(current.id);
                    onClose();
                  }}
                  className="group w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-white/[0.05] transition-colors duration-150 cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-md overflow-hidden shrink-0 grid grid-cols-2 grid-rows-2 gap-[1.5px] bg-black/30">
                    {Array.from({ length: 4 }).map((_, i) =>
                      current.concepts[i] ? (
                        current.concepts[i].video.thumbnailUrl ? (
                          <img
                            key={i}
                            src={current.concepts[i].video.thumbnailUrl}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div
                            key={i}
                            style={{ background: current.concepts[i].video.thumbGradient ?? DEFAULT_THUMB_GRADIENT }}
                          />
                        )
                      ) : (
                        <div key={i} className="bg-white/[0.03]" />
                      )
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    {isVersionableCollection(current.name) ? (
                      <CollectionVersionMenu
                        family={family}
                        currentId={current.id}
                        nextName={suggestedName}
                        onSwitch={(id) => setSelectedVersionByFamily((prev) => ({ ...prev, [familyKey]: id }))}
                        onCreateNext={() => {
                          void onCreateNextVersion(current.id).then((newId) => {
                            if (newId) setSelectedVersionByFamily((prev) => ({ ...prev, [familyKey]: newId }));
                          });
                        }}
                      >
                        <p className="text-[12.5px] text-neutral-100 truncate">
                          {current.name}
                          {family.length > 1 && (
                            <span className="ml-1.5 text-[10px] font-normal text-neutral-600">
                              {family.length} versions
                            </span>
                          )}
                        </p>
                      </CollectionVersionMenu>
                    ) : (
                      <p className="text-[12.5px] text-neutral-100 truncate">{current.name}</p>
                    )}
                    <p className="text-[11px] text-neutral-500">
                      {current.concepts.length} concept{current.concepts.length === 1 ? "" : "s"} ·{" "}
                      {formatRelativeTime(current.updatedAt)}
                    </p>
                  </div>
                  <span
                    className={[
                      "shrink-0 text-[10px] font-medium px-1.5 py-[2px] rounded-[4px]",
                      COLLECTION_STATUS_STYLES[effectiveCollectionStatus(current)],
                    ].join(" ")}
                  >
                    {effectiveCollectionStatus(current)}
                  </span>
                  <ArrowUpRight
                    size={13}
                    className="shrink-0 text-neutral-700 group-hover:text-[#D39448] transition-colors duration-150"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
