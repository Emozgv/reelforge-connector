import { useMemo, useState } from "react";
import { FolderHeart, Plus, Archive, ArchiveRestore } from "lucide-react";
import type { Creator } from "../../types";
import type { CollectionsStore } from "../../state/useCollectionsStore";
import { groupCollectionsByFamily } from "../../lib/collectionNaming";
import { supabase } from "../../lib/supabase";
import { CreatorFilterBar } from "./CreatorFilterBar";
import { StarfieldBackground } from "../shared/StarfieldBackground";
import { CollectionCard } from "./CollectionCard";
import { CollectionWorkspace } from "./CollectionWorkspace";
import { NewCollectionPanel } from "./NewCollectionPanel";

export function CollectionsPage({
  creators,
  collectionsStore,
  openCollectionId,
  onOpenCollectionIdChange,
  onCloseCollection,
  backLabel,
  isSydOwner,
  onOpenCreator,
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
  // Gates the private SYD send button — UI hint only, create_syd_submission
  // re-checks client_os.is_syd_owner() server-side regardless.
  isSydOwner?: boolean;
  // Figma's per-creator "View creator" button (node 3368:64). Reuses the
  // Creators page's own already-existing deep link (App's openCreatorId) —
  // no new navigation concept, and the button simply isn't rendered when the
  // host doesn't provide one.
  onOpenCreator?: (creatorId: string) => void;
}) {
  const { collections, renameCollection, duplicateCollection, deleteCollection } = collectionsStore;
  const [activeCreatorId, setActiveCreatorId] = useState<string | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  // Archiving is a whole-family action (see collectionsStore.archiveCollectionFamily),
  // so this is a simple binary view split, not a per-row filter.
  const [viewMode, setViewMode] = useState<"active" | "archived">("active");
  const activeCollectionId = openCollectionId;
  const setActiveCollectionId = (id: string | null) => {
    collectionsStore.clearSaveError();
    onOpenCollectionIdChange(id);
  };

  const groups = useMemo(() => {
    const relevantCreators =
      activeCreatorId === "all" ? creators : creators.filter((c) => c.id === activeCreatorId);
    const visible = collections.filter((c) => (viewMode === "archived" ? !!c.archivedAt : !c.archivedAt));
    return relevantCreators
      .map((creator) => ({
        creator,
        // One entry per numbered family ("Aesthetic Reels" + "Aesthetic Reels 2"
        // is one folder, not two independent rows) — oldest -> newest within.
        // "Quick Saves" (the creator's automatic default collection) always
        // leads the list — everything else keeps its existing order.
        families: groupCollectionsByFamily(visible.filter((c) => c.creatorId === creator.id)).sort(
          (a, b) => Number(b[0].name === "Quick Saves") - Number(a[0].name === "Quick Saves")
        ),
      }))
      .filter((g) => g.families.length > 0);
  }, [collections, activeCreatorId, viewMode]);

  const activeCollection = collections.find((c) => c.id === activeCollectionId) ?? null;

  if (activeCollection) {
    return (
      <CollectionWorkspace
        collection={activeCollection}
        creators={creators}
        allCollections={collections}
        saveError={collectionsStore.saveError}
        onBack={() => {
          collectionsStore.clearSaveError();
          onCloseCollection();
        }}
        backLabel={backLabel}
        onUpdateNotes={(notes) => collectionsStore.updateNotes(activeCollection.id, notes)}
        onReopen={() => collectionsStore.updateStatus(activeCollection.id, "Draft")}
        onRemoveVideo={(videoId) => collectionsStore.removeVideoFromCollection(activeCollection.id, videoId)}
        onSetConceptStatus={(videoId, status) =>
          collectionsStore.setConceptStatus(activeCollection.id, videoId, status)
        }
        onSetConceptNotes={(videoId, notes) =>
          collectionsStore.updateConceptNotes(activeCollection.id, videoId, notes)
        }
        onSendSubmission={(note) => collectionsStore.sendSubmission(activeCollection.id, note)}
        isSydOwner={isSydOwner}
        onSendToSyd={async (note) => {
          const { error } = await supabase
            .schema("client_os")
            .rpc("create_syd_submission", { p_collection_id: activeCollection.id, p_note: note || null });
          if (error) return { ok: false, error: error.message };
          return { ok: true };
        }}
        siblingCollections={collections
          .filter((c) => c.creatorId === activeCollection.creatorId && c.id !== activeCollection.id)
          .map((c) => ({ id: c.id, name: c.name, status: c.status, submissions: c.submissions }))}
        onStartNext={async () => {
          const result = await collectionsStore.createNextVersion(activeCollection.id);
          if (result.id) setActiveCollectionId(result.id);
        }}
        onSwitchCollection={(id) => setActiveCollectionId(id)}
        onRestore={
          activeCollection.archivedAt
            ? () => void collectionsStore.restoreCollectionFamily(activeCollection.id)
            : undefined
        }
        onReassignConcept={(videoId, targetCreatorId, targetCollectionId) =>
          collectionsStore.reassignConceptCreator(activeCollection.id, videoId, targetCreatorId, targetCollectionId)
        }
        onAssignConceptToAnother={(videoId, targetCreatorId, targetCollectionId) =>
          collectionsStore.assignConceptToCreator(videoId, targetCreatorId, targetCollectionId)
        }
      />
    );
  }

  return (
    <div className="relative h-full overflow-y-auto" style={{ background: "#020203" }}>
      {/* Same scoped starfield boost Research Accounts uses for its own hero —
          the shared .dashboard-starfield-boost stays untouched for the frozen
          Dashboard. */}
      <style>{`
        .rf-collections-starfield .star-twinkle { opacity: 0.6 !important; box-shadow: 0 0 4px rgba(255,250,240,0.45) !important; transform: scale(0.85); }
        @media (prefers-reduced-motion: no-preference) {
          .rf-collections-starfield .star-twinkle { animation-name: star-twinkle-boosted !important; }
        }
      `}</style>
      {/* Container and spacing taken from ResearchAccountsPage so both pages
          sit at the same scale — the Figma frame was drawn at a much larger
          zoom than the rest of the app. */}
      <div className="relative max-w-[1400px] xl:max-w-[1650px] 2xl:max-w-[1900px] mx-auto px-10 xl:px-16 2xl:px-24 pt-8 pb-8">
        {/* Confined to the header band only, never the whole scrollable page —
            same scoping as Research Accounts / Dashboard / Creativity Hub. */}
        <div className="dashboard-starfield-boost rf-collections-starfield pointer-events-none absolute inset-x-0 top-0 h-[160px] overflow-hidden">
          <StarfieldBackground starCount={110} />
        </div>

        <div className="relative flex items-start justify-between gap-6 flex-wrap">
          <div>
            <span className="block text-[11px] tracking-[0.22em] uppercase text-[#D39448] font-medium">
              Collections
            </span>
            <h1 className="mt-1 font-serif font-medium text-[34px] text-neutral-50">
              {viewMode === "archived" ? "Archived collections" : "Creative collections"}
            </h1>
            <p className="mt-1.5 text-[13px] text-neutral-500 max-w-xl">
              {viewMode === "archived"
                ? "Restore a Collection to bring it — and every version of it — back to the active list."
                : "Organize your concepts, manage versions, and keep your best ideas ready for production."}
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {viewMode === "active" ? (
              <button
                onClick={() => setViewMode("archived")}
                title="View archived collections"
                className="flex items-center gap-2 h-9 px-3.5 rounded-lg bg-[#111114] border border-[#26262a] text-[#d7d4d6] text-[12.5px] font-medium hover:border-[#34343a] transition-colors duration-150 press-feedback"
              >
                <Archive size={14} strokeWidth={1.5} />
                Archive
              </button>
            ) : (
              <button
                onClick={() => setViewMode("active")}
                className="flex items-center gap-2 h-9 px-3.5 rounded-lg bg-[#111114] border border-[#26262a] text-[#d7d4d6] text-[12.5px] font-medium hover:border-[#34343a] transition-colors duration-150 press-feedback"
              >
                <ArchiveRestore size={14} strokeWidth={1.5} />
                Active Collections
              </button>
            )}

            {viewMode === "active" && (
              <button
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-2 h-9 px-4 rounded-lg border border-[#e5a249] text-[#21160c] text-[12.5px] font-medium hover:brightness-[1.06] transition-[filter] duration-150 press-feedback"
                style={{
                  backgroundImage: "linear-gradient(to bottom, #f8c477, #dea057)",
                  filter: "drop-shadow(0px 6px 9px rgba(215,145,55,0.22))",
                }}
              >
                <Plus size={14} strokeWidth={1.8} />
                New Collection
              </button>
            )}
          </div>
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

        <div className="relative mt-5 pb-4 border-b border-[#242326]">
          <CreatorFilterBar creators={creators} activeId={activeCreatorId} onSelect={setActiveCreatorId} />
        </div>

        {/* Creator sections — Figma node 3368:53 ("Article"): border #24211d,
            radius 15, padding 12/14/14, gradient 103.94deg rgba(10,12,13,0.86)
            -> rgba(8,11,12,0.62). Cards sit in a grid, gap 11. */}
        <div className="relative mt-5 flex flex-col gap-3">
          {groups.map(({ creator, families }) => {
            const conceptTotal = families.reduce(
              (sum, family) => sum + family[family.length - 1].concepts.length,
              0
            );
            return (
              <div
                key={creator.id}
                className="rounded-xl border border-[#24211d] pt-2.5 px-3 pb-3"
                style={{
                  backgroundImage:
                    "linear-gradient(103.94deg, rgba(10,12,13,0.86) 0%, rgba(8,11,12,0.62) 100%)",
                }}
              >
                <div className="flex items-start gap-3 pb-2.5">
                  <span
                    className="w-11 h-11 rounded-full shrink-0 overflow-hidden ring-1 ring-white/10"
                    style={creator.profileImage ? undefined : { background: creator.avatarColor }}
                  >
                    {creator.profileImage && (
                      <img src={creator.profileImage} alt={creator.name} className="w-full h-full object-cover" />
                    )}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <h2 className="font-serif font-medium text-[16px] leading-none text-[#f2f0ef] truncate">
                      {creator.name}
                    </h2>
                    <p className="mt-1.5 text-[11.5px] text-[#818187]">
                      {families.length} collection{families.length === 1 ? "" : "s"}
                      <span className="px-2 text-[#4f5054]">•</span>
                      {conceptTotal} concept{conceptTotal === 1 ? "" : "s"} total
                    </p>
                  </div>

                  {onOpenCreator && (
                    <button
                      onClick={() => onOpenCreator(creator.id)}
                      className="ml-auto shrink-0 flex items-center gap-3 h-8 px-3 rounded-lg bg-[#111316] border border-[#24262a] text-[11.5px] text-[#c6c4c7] hover:border-[#34363a] transition-colors duration-150 press-feedback"
                    >
                      View creator
                      <span aria-hidden className="text-[14px] leading-none text-[#848589]">
                        ›
                      </span>
                    </button>
                  )}
                </div>

                <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(310px,1fr))]">
                  {families.map((family) => {
                    const current = family[family.length - 1];
                    return (
                      <CollectionCard
                        key={current.id}
                        family={family}
                        current={current}
                        creators={creators}
                        archived={viewMode === "archived"}
                        onOpen={() => setActiveCollectionId(current.id)}
                        onSwitch={(id) => setActiveCollectionId(id)}
                        onRename={(name) => renameCollection(current.id, name)}
                        onDuplicate={() => duplicateCollection(current.id)}
                        onDelete={() => deleteCollection(current.id)}
                        onStartNext={async () => {
                          const result = await collectionsStore.createNextVersion(current.id);
                          if (result.id) setActiveCollectionId(result.id);
                        }}
                        onArchive={() => void collectionsStore.archiveCollectionFamily(current.id)}
                        onRestore={() => void collectionsStore.restoreCollectionFamily(current.id)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {groups.length === 0 && (
            <div className="rounded-xl surface-panel py-16 text-center">
              {viewMode === "archived" ? (
                <>
                  <Archive size={20} className="mx-auto text-neutral-700 mb-2.5" />
                  <p className="text-[13px] text-neutral-400">No archived collections.</p>
                  <p className="text-[12px] text-neutral-600 mt-1">
                    Archiving a Collection moves it — and every version of it — here.
                  </p>
                </>
              ) : (
                <>
                  <FolderHeart size={20} className="mx-auto text-neutral-700 mb-2.5" />
                  <p className="text-[13px] text-neutral-400">No collections yet.</p>
                  <p className="text-[12px] text-neutral-600 mt-1">
                    Create one, or save a Reel from the Creativity Hub.
                  </p>
                </>
              )}
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
