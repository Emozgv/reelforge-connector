import { useEffect, useState } from "react";
import { X, Check, Zap, Plus, FolderHeart, ChevronDown } from "lucide-react";
import type { Collection, Creator, ReelVideo } from "../../types";
import { DEFAULT_THUMB_GRADIENT } from "../../data/mockData";

export function SavePanel({
  open,
  video,
  creators,
  defaultCreatorId,
  collections,
  onClose,
  onQuickSave,
  onSaveToCollection,
  onCreateCollection,
}: {
  open: boolean;
  video: ReelVideo | null;
  creators: Creator[];
  defaultCreatorId: string;
  collections: Collection[];
  onClose: () => void;
  onQuickSave: (note: string, creatorOverrideId: string | undefined) => void;
  onSaveToCollection: (collectionId: string, note: string, creatorOverrideId: string | undefined) => void;
  onCreateCollection: (name: string, note: string, creatorOverrideId: string | undefined) => void;
}) {
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmedLabel, setConfirmedLabel] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState(defaultCreatorId);
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setNote("");
      setCreating(false);
      setNewName("");
      setConfirmedLabel(null);
      setAssigneeId(defaultCreatorId);
      setAssigneeMenuOpen(false);
    }
  }, [open, video?.id, defaultCreatorId]);

  // undefined = no override, use the collection's/default creator.
  const overrideId = assigneeId === defaultCreatorId ? undefined : assigneeId;
  const assignee = creators.find((c) => c.id === assigneeId);
  const creatorName = assignee?.name ?? "";
  // Collections belong to exactly one creator, so switching who this save is
  // assigned to switches which existing collections are even valid targets.
  const collectionsForAssignee = collections.filter((c) => c.creatorId === assigneeId);

  function finish(label: string) {
    setConfirmedLabel(label);
    setTimeout(onClose, 750);
  }

  if (!open || !video) return null;

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[3px] animate-fade-in"
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[380px] rounded-2xl bg-[#141416] border border-white/[0.09] shadow-2xl animate-rise-in overflow-hidden">
          {confirmedLabel ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 px-6">
              <div className="w-10 h-10 rounded-full bg-[#D39448] flex items-center justify-center">
                <Check size={18} className="text-[#020508]" strokeWidth={2.5} />
              </div>
              <p className="text-[13.5px] text-neutral-200 text-center">{confirmedLabel}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 h-14 border-b border-white/[0.07]">
                <div className="relative">
                  {creators.length > 1 ? (
                    <button
                      onClick={() => setAssigneeMenuOpen((v) => !v)}
                      className="flex items-center gap-1.5 text-[15px] font-serif font-medium text-neutral-50 hover:text-neutral-200 transition-colors"
                    >
                      Save for <span className="text-[#D39448]">{creatorName}</span>
                      <ChevronDown size={13} className="text-neutral-500" />
                    </button>
                  ) : (
                    <h2 className="text-[15px] font-serif font-medium text-neutral-50">
                      Save for <span className="text-[#D39448]">{creatorName}</span>
                    </h2>
                  )}

                  {assigneeMenuOpen && (
                    <div
                      onMouseLeave={() => setAssigneeMenuOpen(false)}
                      className="absolute left-0 top-8 z-20 w-56 rounded-xl surface-panel-strong p-1 animate-fade-in"
                    >
                      <p className="px-2.5 pt-1.5 pb-1 text-[10px] tracking-wide uppercase text-neutral-600">
                        Assign to a different creator
                      </p>
                      {creators.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setAssigneeId(c.id);
                            setAssigneeMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
                        >
                          <div className="w-4 h-4 rounded-full shrink-0" style={{ background: c.avatarColor }} />
                          <span className="text-[12.5px] text-neutral-200 truncate">{c.name}</span>
                          {c.id === assigneeId && <Check size={13} className="ml-auto text-[#D39448] shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.06] transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              {overrideId && (
                <div className="mx-5 mt-3 rounded-md bg-[#D39448]/[0.08] px-2.5 py-1.5 text-[11px] text-[#D39448]">
                  Assigning to a different creator than the current research session.
                </div>
              )}

              <div className="px-5 pt-4 flex items-center gap-3">
                <div
                  className="w-9 h-14 rounded-md shrink-0 border border-white/10 bg-cover bg-center"
                  style={
                    video.thumbnailUrl
                      ? { backgroundImage: `url(${video.thumbnailUrl})` }
                      : { background: video.thumbGradient ?? DEFAULT_THUMB_GRADIENT }
                  }
                />
                <div className="min-w-0">
                  <p className="text-[12.5px] text-neutral-200 truncate">@{video.username}</p>
                  <p className="text-[11px] text-neutral-500">{video.views} views · {video.duration}</p>
                </div>
              </div>

              <div className="px-5 pt-4">
                <button
                  onClick={() => {
                    onQuickSave(note, overrideId);
                    finish("Saved to Quick Saves");
                  }}
                  className="w-full h-10 rounded-lg flex items-center justify-center gap-2 bg-[#D39448] text-[#020508] text-[13px] font-medium hover:bg-[#e2b57c] transition-colors press-feedback"
                >
                  <Zap size={14} fill="currentColor" />
                  Quick Save
                </button>
                <p className="mt-1.5 text-[10.5px] text-neutral-600 text-center">
                  Saves into {creatorName}'s "Quick Saves" collection
                </p>
              </div>

              <div className="px-5 pt-2 pb-1 flex items-center gap-2 text-[10.5px] tracking-wide uppercase text-neutral-500">
                <FolderHeart size={11} />
                Or choose a collection
              </div>

              <div className="px-3 max-h-[168px] overflow-y-auto">
                {collectionsForAssignee.length === 0 && (
                  <p className="px-2.5 py-2 text-[11.5px] text-neutral-600">
                    No collections yet for {creatorName} — create one below.
                  </p>
                )}
                {collectionsForAssignee.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      onSaveToCollection(c.id, note, overrideId);
                      finish(`Saved to ${c.name}`);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg hover:bg-white/[0.05] transition-colors"
                  >
                    <span className="text-[12.5px] text-neutral-200 truncate">{c.name}</span>
                    <span className="text-[11px] text-neutral-500 shrink-0 tabular-nums">
                      {c.concepts.length} concepts
                    </span>
                  </button>
                ))}
              </div>

              <div className="px-5 pt-1 pb-2">
                {creating ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newName.trim()) {
                          onCreateCollection(newName.trim(), note, overrideId);
                          finish(`Created "${newName.trim()}" and saved`);
                        }
                      }}
                      placeholder="New collection name"
                      className="flex-1 h-9 rounded-lg surface-field px-3 text-[12.5px] text-neutral-100 placeholder:text-neutral-600 outline-none focus-glow"
                    />
                    <button
                      disabled={!newName.trim()}
                      onClick={() => {
                        onCreateCollection(newName.trim(), note, overrideId);
                        finish(`Created "${newName.trim()}" and saved`);
                      }}
                      className="h-9 px-3 rounded-lg bg-[#D39448] text-[#020508] text-[12px] font-medium disabled:opacity-40 hover:bg-[#e2b57c] transition-colors press-feedback"
                    >
                      Create
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setCreating(true)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12.5px] text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04] transition-colors"
                  >
                    <Plus size={14} />
                    New collection
                  </button>
                )}
              </div>

              <div className="px-5 pb-4">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Add a short note (optional)"
                  className="w-full resize-none rounded-lg surface-field px-3 py-2 text-[12px] text-neutral-300 placeholder:text-neutral-600 outline-none focus-glow"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
