import { useState } from "react";
import type { Collection, Creator } from "../../types";
import { formatRelativeTime } from "../../lib/relativeTime";
import { isVersionableCollection, nextCollectionName } from "../../lib/collectionNaming";
import { DEFAULT_THUMB_GRADIENT } from "../../data/mockData";
import { CollectionVersionMenu } from "./CollectionVersionMenu";
import { COLLECTION_STATUS_STYLES, effectiveCollectionStatus } from "./CollectionRow";

// Figma's Collections Overview draws each Collection as a card, not as a row
// (node 3368:69 and its siblings). CollectionRow stays exactly as it is —
// CollectionVersionMenu, CollectionWorkspace, SavedCollectionsPopover and
// CreatorProfilePage all import COLLECTION_STATUS_STYLES/
// effectiveCollectionStatus from it, and those pages are out of scope here.
// This card reuses the same actions, the same version menu and the same
// status derivation; only the presentation is new.

export function CollectionCard({
  family,
  current,
  creators,
  archived = false,
  onOpen,
  onSwitch,
  onRename,
  onDuplicate,
  onDelete,
  onStartNext,
  onArchive,
  onArchiveVersion,
  onRestore,
}: {
  family: Collection[];
  current: Collection;
  creators: Creator[];
  archived?: boolean;
  onOpen: () => void;
  onSwitch: (id: string) => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onStartNext: () => void;
  onArchive?: () => void;
  // Archiviert nur die Version, die die Karte gerade zeigt.
  onArchiveVersion?: (id: string) => void;
  onRestore?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [draftName, setDraftName] = useState(current.name);
  const creator = creators.find((c) => c.id === current.creatorId);

  const total = current.concepts.length;
  const used = current.concepts.filter((c) => c.status === "Used").length;
  const available = total - used;
  const status = effectiveCollectionStatus(current);
  // Figma shows one tall cover per card (node 3368:71), not CollectionRow's
  // 2x2 mosaic — the newest concept is the cover.
  const cover = current.concepts[0]?.video;
  const suggestedName = nextCollectionName(current.name, family.map((f) => f.name));

  function commitRename() {
    const trimmed = draftName.trim();
    if (trimmed) onRename(trimmed);
    else setDraftName(current.name);
    setRenaming(false);
  }

  const title = (
    <h3 className="text-[13px] font-medium text-neutral-50 truncate">{current.name}</h3>
  );

  return (
    <div
      onClick={() => {
        if (!renaming) onOpen();
      }}
      className="press-feedback group relative flex h-[104px] items-stretch p-2.5 rounded-xl border border-white/[0.07] bg-[#111114] hover:border-[#D39448]/35 hover:bg-[#161613] transition-colors duration-150 cursor-pointer"
    >
      <div className="w-[54px] shrink-0 mr-3 rounded-[6px] overflow-hidden bg-black/30">
        {cover?.thumbnailUrl && !thumbFailed ? (
          <img
            src={cover.thumbnailUrl}
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full"
            style={{ background: cover?.thumbGradient ?? DEFAULT_THUMB_GRADIENT }}
          />
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="pr-[62px]">
          {renaming ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setDraftName(current.name);
                  setRenaming(false);
                }
              }}
              onBlur={commitRename}
              className="w-full h-6 rounded surface-field px-1.5 text-[13px] text-neutral-100 outline-none focus-glow"
            />
          ) : !archived && isVersionableCollection(current.name) ? (
            <CollectionVersionMenu
              family={family}
              currentId={current.id}
              nextName={suggestedName}
              onSwitch={onSwitch}
              onCreateNext={onStartNext}
            >
              {title}
            </CollectionVersionMenu>
          ) : (
            title
          )}
        </div>

        <p className="mt-1 text-[11.5px] text-neutral-400">
          {total} concept{total === 1 ? "" : "s"}
        </p>
        <p className="mt-1 text-[10.5px] text-neutral-600">
          {used} used <span className="px-1.5">•</span> {available} available
        </p>

        <div className="mt-auto flex items-center gap-2">
          {creator && (
            <span
              title={creator.name}
              className="w-2 h-2 rounded-full shrink-0 ring-1 ring-white/15"
              style={{ background: creator.avatarColor }}
            />
          )}
          <span
            className={[
              "shrink-0 px-1.5 py-[2px] rounded-[4px] text-[10px] font-medium leading-[15px] whitespace-nowrap",
              COLLECTION_STATUS_STYLES[status],
            ].join(" ")}
          >
            {status}
          </span>
          <span className="ml-auto shrink-0 text-[10.5px] text-neutral-600 whitespace-nowrap">
            Edited {formatRelativeTime(current.updatedAt).replace(/^Just now$/, "just now")}
          </span>
        </div>
      </div>

      {family.length > 1 && (
        <div className="absolute right-[36px] top-2.5 px-2 py-[3px] rounded-md surface-field text-[10px] text-neutral-500 whitespace-nowrap">
          {family.length} versions
        </div>
      )}

      <span
        aria-hidden
        className="absolute right-[16px] top-[44px] text-[18px] font-extralight leading-none text-[#D39448] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
      >
        →
      </span>

      <div className="absolute right-2.5 top-1.5" onClick={(e) => e.stopPropagation()}>
        {current.name !== "Quick Saves" && (
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Collection actions"
            className="w-5 h-4 flex items-center justify-center text-[14px] tracking-[1px] leading-[8px] text-neutral-500 hover:text-neutral-100 transition-colors duration-150"
          >
            ···
          </button>
        )}
        {menuOpen && (
          <div
            onMouseLeave={() => setMenuOpen(false)}
            className="absolute right-0 top-6 z-20 w-40 rounded-lg surface-panel-strong p-1 animate-fade-in"
          >
            {archived ? (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onRestore?.();
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] text-[#D39448] hover:bg-white/[0.06] transition-colors"
              >
                Restore
              </button>
            ) : (
              <>
                {current.name !== "Quick Saves" && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setRenaming(true);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] text-neutral-300 hover:bg-white/[0.06] transition-colors"
                  >
                    Rename
                  </button>
                )}
                {current.name !== "Quick Saves" && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDuplicate();
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] text-neutral-300 hover:bg-white/[0.06] transition-colors"
                  >
                    Duplicate
                  </button>
                )}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onArchive?.();
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] text-neutral-300 hover:bg-white/[0.06] transition-colors"
                >
                  Archive collection
                </button>
                {/* Nur wenn es ueberhaupt eine zweite Version gibt — bei einer
                    einzigen waere das dasselbe wie "Archive collection", nur
                    unter anderem Namen. Gemeint ist immer die Version, die die
                    Karte gerade zeigt. */}
                {family.length > 1 && onArchiveVersion && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onArchiveVersion(current.id);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] text-neutral-300 hover:bg-white/[0.06] transition-colors"
                  >
                    Archive this version
                  </button>
                )}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] text-red-400/80 hover:bg-white/[0.06] transition-colors"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
