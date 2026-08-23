import { useState } from "react";
import { MoreHorizontal, ArrowUpRight, Plus } from "lucide-react";
import type { Collection, Creator } from "../../types";
import { formatRelativeTime } from "../../lib/relativeTime";
import { collectionFamily, nextCollectionName } from "../../lib/collectionNaming";

export const COLLECTION_STATUS_STYLES: Record<Collection["status"], string> = {
  Draft: "text-neutral-400 bg-white/[0.04]",
  Sent: "text-sky-300/80 bg-sky-400/10",
  Completed: "text-emerald-300/80 bg-emerald-400/10",
};

export function CollectionRow({
  collection,
  creators,
  siblingCollections,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onStartNext,
}: {
  collection: Collection;
  creators: Creator[];
  siblingCollections: { id: string; name: string }[];
  onOpen: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onStartNext: (name: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(collection.name);
  const creator = creators.find((c) => c.id === collection.creatorId);
  const preview = collection.concepts.slice(0, 4);
  const total = collection.concepts.length;
  const used = collection.concepts.filter((c) => c.status === "Used").length;
  const available = total - used;
  const delivered = collection.submissions.some((s) => s.status === "Finished");
  const family = collectionFamily(collection.name, [{ id: collection.id, name: collection.name }, ...siblingCollections]);
  const isLastInFamily = family[family.length - 1]?.id === collection.id;
  const suggestedName = nextCollectionName(collection.name, siblingCollections.map((s) => s.name));

  function commitRename() {
    const trimmed = draftName.trim();
    if (trimmed) onRename(trimmed);
    else setDraftName(collection.name);
    setRenaming(false);
  }

  return (
    <div
      onClick={() => {
        if (!renaming) onOpen();
      }}
      className="group flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.03] transition-colors duration-150 cursor-pointer"
    >
      <div className="w-11 h-11 rounded-md overflow-hidden shrink-0 grid grid-cols-2 grid-rows-2 gap-[1.5px] bg-black/30">
        {Array.from({ length: 4 }).map((_, i) =>
          preview[i] ? (
            <div key={i} style={{ background: preview[i].video.thumbGradient }} />
          ) : (
            <div key={i} className="bg-white/[0.03]" />
          )
        )}
      </div>

      <div className="min-w-0 flex-1">
        {renaming ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setDraftName(collection.name);
                setRenaming(false);
              }
            }}
            onBlur={commitRename}
            className="w-full h-6 rounded surface-field px-1.5 text-[13px] text-neutral-100 outline-none focus-glow"
          />
        ) : (
          <div className="flex items-center gap-1.5">
            <h3 className="text-[13px] font-medium text-neutral-100 truncate">{collection.name}</h3>
            {delivered && isLastInFamily && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStartNext(suggestedName);
                }}
                title={`Start "${suggestedName}"`}
                className="w-4.5 h-4.5 rounded-full flex items-center justify-center text-neutral-600 hover:text-[#e8c896] hover:bg-white/[0.08] transition-colors duration-150 opacity-0 group-hover:opacity-100 shrink-0"
              >
                <Plus size={12} />
              </button>
            )}
          </div>
        )}
        <p className="text-[11px] text-neutral-500 mt-0.5">
          {total} concepts · {used} used · {available} available
        </p>
      </div>

      {creator && (
        <div
          title={creator.name}
          className="w-3 h-3 rounded-full shrink-0 ring-1 ring-white/15"
          style={{ background: creator.avatarColor }}
        />
      )}

      <span
        className={[
          "shrink-0 text-[10px] font-medium px-1.5 py-[2px] rounded-[4px] whitespace-nowrap",
          COLLECTION_STATUS_STYLES[collection.status],
        ].join(" ")}
      >
        {collection.status}
      </span>

      <span className="shrink-0 text-[10.5px] text-neutral-600 w-[92px] text-right">
        {formatRelativeTime(collection.updatedAt)}
      </span>

      <ArrowUpRight
        size={13}
        className="shrink-0 text-neutral-700 group-hover:text-[#ddb87e] transition-colors duration-150"
      />

      <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="w-7 h-7 rounded-md flex items-center justify-center text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.05] transition-colors duration-150"
        >
          <MoreHorizontal size={14} />
        </button>
        {menuOpen && (
          <div
            onMouseLeave={() => setMenuOpen(false)}
            className="absolute right-0 top-8 z-20 w-36 rounded-lg surface-panel-strong p-1 animate-fade-in"
          >
            <button
              onClick={() => {
                setMenuOpen(false);
                setRenaming(true);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] text-neutral-300 hover:bg-white/[0.06] transition-colors"
            >
              Rename
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                onDuplicate();
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] text-neutral-300 hover:bg-white/[0.06] transition-colors"
            >
              Duplicate
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
          </div>
        )}
      </div>
    </div>
  );
}
