import { useState } from "react";
import { Plus, Users } from "lucide-react";
import type { CollectionsStore } from "../../state/useCollectionsStore";
import type { CreatorsStore } from "../../state/useCreatorsStore";
import { CreatorCard } from "./CreatorCard";
import { computeCreatorStats } from "./creatorStats";
import { CreatorProfilePage } from "./CreatorProfilePage";
import { CreatorSetupWizard } from "./CreatorSetupWizard";

export function CreatorsPage({
  creatorsStore,
  collectionsStore,
  onOpenCollection,
  openCreatorId,
  onOpenCreatorIdChange,
}: {
  creatorsStore: CreatorsStore;
  collectionsStore: CollectionsStore;
  onOpenCollection: (collectionId: string) => void;
  openCreatorId: string | null;
  onOpenCreatorIdChange: (id: string | null) => void;
}) {
  const activeCreatorId = openCreatorId;
  const setActiveCreatorId = onOpenCreatorIdChange;
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
            <span className="text-[10.5px] tracking-[0.14em] uppercase text-[#D39448]/75 font-medium">
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
            className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#D39448] text-[#020508] text-[12.5px] font-medium hover:brightness-110 transition-[filter] duration-150 shrink-0 press-feedback"
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
            <Users size={20} className="mx-auto text-neutral-700 mb-2.5" />
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

      <CreatorSetupWizard
        open={createOpen}
        creatorsStore={creatorsStore}
        onClose={() => setCreateOpen(false)}
        onDone={(creatorId) => {
          setCreateOpen(false);
          setActiveCreatorId(creatorId);
        }}
      />
    </div>
  );
}
