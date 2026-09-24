import { useState } from "react";
import type { Collection, Creator } from "../../types";
import { formatRelativeTime } from "../../lib/relativeTime";
import { isVersionableCollection, nextCollectionName } from "../../lib/collectionNaming";
import { DEFAULT_THUMB_GRADIENT } from "../../data/mockData";
import { CollectionVersionMenu } from "./CollectionVersionMenu";
import { effectiveCollectionStatus } from "./CollectionRow";

// Figma's Collections Overview draws each Collection as a card, not as a row
// (node 3368:69 and its siblings). CollectionRow stays exactly as it is —
// CollectionVersionMenu, CollectionWorkspace, SavedCollectionsPopover and
// CreatorProfilePage all import COLLECTION_STATUS_STYLES/
// effectiveCollectionStatus from it, and those pages are out of scope here.
// This card reuses the same actions, the same version menu and the same
// status derivation; only the presentation is new.

// Exact values read from Figma, not approximated:
// card       bg linear-gradient(114.75deg, #15171a 0%, #101215 100%), border #25262a, r10, p11, h126
// title      14px semibold #f2f0f1   ·  concepts 12px #85858b
// counts     11px #76777c            ·  versions pill bg #1a1b20 / border #24262b / r5 / 11px #898a90
// "···"      16px #c2c3c4 tracking 1px  ·  "→" 23px extralight #e4e4e5
// Draft      bg #1a1d21 / 11px #aaa9ae ·  Sent bg #10242c / 11px #1b8dba
// edited     11px #77787d
const STATUS_BADGE: Record<string, string> = {
  Draft: "bg-[#1a1d21] text-[#aaa9ae]",
  Sent: "bg-[#10242c] text-[#1b8dba]",
  "In Progress": "bg-[#2a2113] text-[#d0a13f]",
  Completed: "bg-[#12241a] text-[#4fb47d]",
  Cancelled: "bg-[#1a1d21] text-[#77787d]",
};

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
    <h3 className="text-[13px] font-semibold text-[#f2f0f1] truncate">{current.name}</h3>
  );

  return (
    <div
      onClick={() => {
        if (!renaming) onOpen();
      }}
      className="group relative flex h-[104px] items-stretch p-2.5 rounded-[10px] border border-[#25262a] hover:border-[#32333a] transition-colors duration-150 cursor-pointer"
      style={{ backgroundImage: "linear-gradient(114.75deg, rgb(21,23,26) 0%, rgb(16,18,21) 100%)" }}
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

        <p className="mt-1 text-[11.5px] text-[#85858b]">
          {total} concept{total === 1 ? "" : "s"}
        </p>
        <p className="mt-1 text-[10.5px] text-[#76777c]">
          {used} used <span className="px-1.5">•</span> {available} available
        </p>

        <div className="mt-auto flex items-center gap-2">
          {creator && (
            <span
              title={creator.name}
              className="w-[11px] h-[11px] rounded-full shrink-0"
              style={{ background: creator.avatarColor, boxShadow: `0 0 10px 0 ${creator.avatarColor}` }}
            />
          )}
          <span
            className={[
              "shrink-0 px-1.5 py-[2px] rounded-[4px] text-[10px] leading-[15px] whitespace-nowrap",
              STATUS_BADGE[status] ?? STATUS_BADGE.Draft,
            ].join(" ")}
          >
            {status}
          </span>
          <span className="ml-auto shrink-0 text-[10.5px] text-[#77787d] whitespace-nowrap">
            Edited {formatRelativeTime(current.updatedAt).replace(/^Just now$/, "just now")}
          </span>
        </div>
      </div>

      {family.length > 1 && (
        <div className="absolute right-[36px] top-2.5 px-2 py-[3px] rounded-[5px] bg-[#1a1b20] border border-[#24262b] text-[10px] text-[#898a90] whitespace-nowrap">
          {family.length} versions
        </div>
      )}

      <span
        aria-hidden
        className="absolute right-[16px] top-[44px] text-[18px] font-extralight leading-none text-[#e4e4e5] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
      >
        →
      </span>

      <div className="absolute right-2.5 top-1.5" onClick={(e) => e.stopPropagation()}>
        {current.name !== "Quick Saves" && (
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Collection actions"
            className="w-5 h-4 flex items-center justify-center text-[14px] tracking-[1px] leading-[8px] text-[#c2c3c4] hover:text-neutral-100 transition-colors duration-150"
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
                  Archive{family.length > 1 ? " all versions" : ""}
                </button>
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
