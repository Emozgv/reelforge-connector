import { useState } from "react";
import { Plus } from "lucide-react";
import type { CollectionsStore } from "../../state/useCollectionsStore";
import type { CreatorsStore } from "../../state/useCreatorsStore";
import { CreatorCard } from "./CreatorCard";
import { computeCreatorStats } from "./creatorStats";
import { CreatorProfilePage } from "./CreatorProfilePage";
import { NewCreatorPanel } from "./NewCreatorPanel";

export function CreatorsPage({
  creatorsStore,
  collectionsStore,
  onOpenCollection,
}: {
  creatorsStore: CreatorsStore;
  collectionsStore: CollectionsStore;
  onOpenCollection: (collectionId: string) => void;
}) {
  const [activeCreatorId, setActiveCreatorId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const activeCreator = creatorsStore.creators.find((c) => c.id === activeCreatorId) ?? null;

  if (activeCreator) {
    return (
      <CreatorProfilePage
        creator={activeCreator}
        collections={collectionsStore.collections}
        creatorsStore={creatorsStore}
        onBack={() => setActiveCreatorId(null)}
        onOpenCollection={onOpenCollection}
        onCreateCollection={collectionsStore.createCollection}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1080px] mx-auto px-8 pt-6 pb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <span className="text-[10.5px] tracking-[0.14em] uppercase text-[#c99a5f]/75 font-medium">
              Creators
            </span>
            <h1 className="mt-1 text-[20px] font-serif font-medium text-neutral-50">
              Every creator you work with
            </h1>
            <p className="mt-1 text-[12.5px] text-neutral-500 max-w-lg">
              Their collections, activity, and creative profile — all in one place.
            </p>
          </div>

          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#c99a5f] text-[#0a0a0c] text-[12.5px] font-medium hover:bg-[#ddb87e] transition-colors duration-150 shrink-0"
          >
            <Plus size={14} />
            New Creator
          </button>
        </div>

        {creatorsStore.error && (
          <p className="mt-4 text-[12px] text-rose-300/85 rounded-lg surface-field px-3 py-2 max-w-lg">
            Couldn't load Creators — {creatorsStore.error}
          </p>
        )}

        {!creatorsStore.error && creatorsStore.creators.length === 0 && (
          <div className="mt-6 rounded-xl surface-panel py-16 text-center">
            <p className="text-[13px] text-neutral-400">No creators yet.</p>
            <p className="text-[12px] text-neutral-600 mt-1">Add your first Creator to get started.</p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-3 gap-3">
          {creatorsStore.creators.map((creator) => (
            <CreatorCard
              key={creator.id}
              creator={creator}
              stats={computeCreatorStats(creator.id, collectionsStore.collections)}
              onOpen={() => setActiveCreatorId(creator.id)}
            />
          ))}
        </div>
      </div>

      <NewCreatorPanel open={createOpen} onClose={() => setCreateOpen(false)} onCreate={creatorsStore.createCreator} />
    </div>
  );
}
