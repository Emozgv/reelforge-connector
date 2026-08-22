import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { creators } from "../../data/mockData";
import type { CollectionsStore } from "../../state/useCollectionsStore";
import { CreatorFilterBar } from "./CreatorFilterBar";
import { CollectionRow } from "./CollectionRow";
import { CollectionWorkspace } from "./CollectionWorkspace";
import { NewCollectionPanel } from "./NewCollectionPanel";

export function CollectionsPage({ collectionsStore }: { collectionsStore: CollectionsStore }) {
  const { collections, renameCollection, duplicateCollection, deleteCollection } = collectionsStore;
  const [activeCreatorId, setActiveCreatorId] = useState<string | "all">("all");
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const groups = useMemo(() => {
    const relevantCreators =
      activeCreatorId === "all" ? creators : creators.filter((c) => c.id === activeCreatorId);
    return relevantCreators
      .map((creator) => ({
        creator,
        items: collections.filter((c) => c.creator === creator.name),
      }))
      .filter((g) => g.items.length > 0);
  }, [collections, activeCreatorId]);

  const activeCollection = collections.find((c) => c.id === activeCollectionId) ?? null;

  if (activeCollection) {
    return (
      <CollectionWorkspace
        collection={activeCollection}
        onBack={() => setActiveCollectionId(null)}
        onUpdateNotes={(notes) => collectionsStore.updateNotes(activeCollection.id, notes)}
        onUpdateStatus={(status) => collectionsStore.updateStatus(activeCollection.id, status)}
        onRemoveVideo={(videoId) => collectionsStore.removeVideoFromCollection(activeCollection.id, videoId)}
        onSetConceptStatus={(videoId, status) =>
          collectionsStore.setConceptStatus(activeCollection.id, videoId, status)
        }
        onSendSubmission={(note) => collectionsStore.sendSubmission(activeCollection.id, note)}
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
            className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#c99a5f] text-[#0a0a0c] text-[12.5px] font-medium hover:bg-[#ddb87e] transition-colors duration-150 shrink-0"
          >
            <Plus size={14} />
            New Collection
          </button>
        </div>

        <div className="mt-5">
          <CreatorFilterBar creators={creators} activeId={activeCreatorId} onSelect={setActiveCreatorId} />
        </div>

        <div className="mt-6 space-y-7">
          {groups.map(({ creator, items }) => (
            <div key={creator.id}>
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-5 h-5 rounded-full ring-1 ring-white/15"
                  style={{ background: creator.avatarColor }}
                />
                <h2 className="text-[13.5px] font-medium text-neutral-200">{creator.name}</h2>
                <span className="text-[11px] text-neutral-600">{items.length} collections</span>
              </div>
              <div className="rounded-xl surface-panel divide-y divide-white/[0.05] overflow-hidden">
                {items.map((c) => (
                  <CollectionRow
                    key={c.id}
                    collection={c}
                    onOpen={() => setActiveCollectionId(c.id)}
                    onRename={(name) => renameCollection(c.id, name)}
                    onDuplicate={() => duplicateCollection(c.id)}
                    onDelete={() => deleteCollection(c.id)}
                  />
                ))}
              </div>
            </div>
          ))}

          {groups.length === 0 && (
            <div className="rounded-xl surface-panel py-16 text-center">
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
        onCreate={(name, creatorName, note) => {
          collectionsStore.createCollection(name, creatorName, note);
          const matched = creators.find((c) => c.name === creatorName);
          if (matched) setActiveCreatorId(matched.id);
        }}
      />
    </div>
  );
}
