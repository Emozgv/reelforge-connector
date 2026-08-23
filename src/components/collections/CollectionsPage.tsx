import { useMemo, useState } from "react";
import { FolderHeart, Plus } from "lucide-react";
import type { Creator } from "../../types";
import type { CollectionsStore } from "../../state/useCollectionsStore";
import { groupCollectionsByFamily } from "../../lib/collectionNaming";
import { CreatorFilterBar } from "./CreatorFilterBar";
import { CollectionRow } from "./CollectionRow";
import { CollectionWorkspace } from "./CollectionWorkspace";
import { NewCollectionPanel } from "./NewCollectionPanel";

export function CollectionsPage({
  creators,
  collectionsStore,
  openCollectionId,
  onOpenCollectionIdChange,
  onCloseCollection,
  backLabel,
}: {
  creators: Creator[];
  collectionsStore: CollectionsStore;
  // Controlled from App so other pages (e.g. a creator's profile) can deep-link
  // straight into a specific collection's workspace.
  openCollectionId: string | null;
  onOpenCollectionIdChange: (id: string | null) => void;
  // Leaving the workspace entirely (the "Back" button) — respects wherever the
  // Collection was opened from, unlike onOpenCollectionIdChange(null) which is
  // used for in-page navigation (switching tabs, opening a different row).
  onCloseCollection: () => void;
  backLabel: string;
}) {
  const { collections, renameCollection, duplicateCollection, deleteCollection } = collectionsStore;
  const [activeCreatorId, setActiveCreatorId] = useState<string | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const activeCollectionId = openCollectionId;
  const setActiveCollectionId = (id: string | null) => {
    collectionsStore.clearSaveError();
    onOpenCollectionIdChange(id);
  };

  const groups = useMemo(() => {
    const relevantCreators =
      activeCreatorId === "all" ? creators : creators.filter((c) => c.id === activeCreatorId);
    return relevantCreators
      .map((creator) => ({
        creator,
        // One entry per numbered family ("Aesthetic Reels" + "Aesthetic Reels 2"
        // is one folder, not two independent rows) — oldest -> newest within.
        families: groupCollectionsByFamily(collections.filter((c) => c.creatorId === creator.id)),
      }))
      .filter((g) => g.families.length > 0);
  }, [collections, activeCreatorId]);

  const activeCollection = collections.find((c) => c.id === activeCollectionId) ?? null;

  if (activeCollection) {
    return (
      <CollectionWorkspace
        collection={activeCollection}
        creators={creators}
        saveError={collectionsStore.saveError}
        onBack={() => {
          collectionsStore.clearSaveError();
          onCloseCollection();
        }}
        backLabel={backLabel}
        onUpdateNotes={(notes) => collectionsStore.updateNotes(activeCollection.id, notes)}
        onUpdateStatus={(status) => collectionsStore.updateStatus(activeCollection.id, status)}
        onRemoveVideo={(videoId) => collectionsStore.removeVideoFromCollection(activeCollection.id, videoId)}
        onSetConceptStatus={(videoId, status) =>
          collectionsStore.setConceptStatus(activeCollection.id, videoId, status)
        }
        onSetConceptNotes={(videoId, notes) =>
          collectionsStore.updateConceptNotes(activeCollection.id, videoId, notes)
        }
        onSendSubmission={(note) => collectionsStore.sendSubmission(activeCollection.id, note)}
        siblingCollections={collections
          .filter((c) => c.creatorId === activeCollection.creatorId && c.id !== activeCollection.id)
          .map((c) => ({ id: c.id, name: c.name, status: c.status }))}
        onStartNext={async (name) => {
          const result = await collectionsStore.createCollection(name, activeCollection.creatorId, "");
          if (result.id) setActiveCollectionId(result.id);
        }}
        onSwitchCollection={(id) => setActiveCollectionId(id)}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1080px] mx-auto px-8 pt-6 pb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <span className="text-[10.5px] tracking-[0.14em] uppercase text-[#c99a5f]/75 font-medium">
              Collections
            </span>
            <h1 className="mt-1 text-[20px] font-serif font-medium text-neutral-50">
              Every creator's creative folders
            </h1>
            <p className="mt-1 text-[12.5px] text-neutral-500 max-w-lg">
              Saved concepts organized per creator, ready to brief into production.
            </p>
          </div>

          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#c99a5f] text-[#0a0a0c] text-[12.5px] font-medium hover:bg-[#ddb87e] transition-colors duration-150 shrink-0 press-feedback"
          >
            <Plus size={14} />
            New Collection
          </button>
        </div>

        {collectionsStore.error && (
          <p className="mt-4 text-[12px] text-rose-300/85 rounded-lg surface-field px-3 py-2 max-w-lg">
            Couldn't load Collections — {collectionsStore.error}
          </p>
        )}
        {collectionsStore.saveError && (
          <p className="mt-4 text-[12px] text-rose-300/85 rounded-lg surface-field px-3 py-2 max-w-lg">
            {collectionsStore.saveError}
          </p>
        )}

        <div className="mt-5">
          <CreatorFilterBar creators={creators} activeId={activeCreatorId} onSelect={setActiveCreatorId} />
        </div>

        <div className="mt-6 space-y-7">
          {groups.map(({ creator, families }) => (
            <div key={creator.id}>
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-5 h-5 rounded-full ring-1 ring-white/15"
                  style={{ background: creator.avatarColor }}
                />
                <h2 className="text-[13.5px] font-medium text-neutral-200">{creator.name}</h2>
                <span className="text-[11px] text-neutral-600">
                  {families.length} collection{families.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="rounded-xl surface-panel divide-y divide-white/[0.05] [&>*:first-child]:rounded-t-xl [&>*:last-child]:rounded-b-xl">
                {families.map((family) => {
                  const current = family[family.length - 1];
                  return (
                    <CollectionRow
                      key={current.id}
                      family={family}
                      current={current}
                      creators={creators}
                      onOpen={() => setActiveCollectionId(current.id)}
                      onSwitch={(id) => setActiveCollectionId(id)}
                      onRename={(name) => renameCollection(current.id, name)}
                      onDuplicate={() => duplicateCollection(current.id)}
                      onDelete={() => deleteCollection(current.id)}
                      onStartNext={async (name) => {
                        const result = await collectionsStore.createCollection(name, current.creatorId, "");
                        if (result.id) setActiveCollectionId(result.id);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {groups.length === 0 && (
            <div className="rounded-xl surface-panel py-16 text-center">
              <FolderHeart size={20} className="mx-auto text-neutral-700 mb-2.5" />
              <p className="text-[13px] text-neutral-400">No collections yet.</p>
              <p className="text-[12px] text-neutral-600 mt-1">
                Create one, or save a Reel from the Creativity Hub.
              </p>
            </div>
          )}
        </div>
      </div>

      <NewCollectionPanel
        open={createOpen}
        creators={creators}
        defaultCreatorId={activeCreatorId !== "all" ? activeCreatorId : undefined}
        onClose={() => setCreateOpen(false)}
        onCreate={(name, creatorId, note) => {
          void collectionsStore.createCollection(name, creatorId, note);
          setActiveCreatorId(creatorId);
        }}
      />
    </div>
  );
}
