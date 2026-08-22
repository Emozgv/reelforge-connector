import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Creator } from "../../types";

export function NewCollectionPanel({
  open,
  creators,
  defaultCreatorId,
  onClose,
  onCreate,
}: {
  open: boolean;
  creators: Creator[];
  defaultCreatorId?: string;
  onClose: () => void;
  onCreate: (name: string, creatorName: string, note: string) => void;
}) {
  const [name, setName] = useState("");
  const [creatorId, setCreatorId] = useState(defaultCreatorId ?? creators[0]?.id ?? "");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setNote("");
      setCreatorId(defaultCreatorId ?? creators[0]?.id ?? "");
    }
  }, [open, defaultCreatorId, creators]);

  if (!open) return null;

  const creator = creators.find((c) => c.id === creatorId) ?? creators[0];

  function handleCreate() {
    if (!name.trim() || !creator) return;
    onCreate(name.trim(), creator.name, note);
    onClose();
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[3px] animate-fade-in" />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[380px] rounded-2xl bg-[#141416] border border-white/[0.09] shadow-2xl animate-rise-in overflow-hidden">
          <div className="flex items-center justify-between px-5 h-14 border-b border-white/[0.07]">
            <h2 className="text-[15px] font-serif font-medium text-neutral-50">New Collection</h2>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.06] transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          <div className="px-5 py-4 space-y-3.5">
            <div>
              <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">Name</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                placeholder="e.g. October Concepts"
                className="mt-1.5 w-full h-10 rounded-lg surface-field px-3 text-[13px] text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-[#d7a463]/40"
              />
            </div>

            <div>
              <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">Creator</label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {creators.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCreatorId(c.id)}
                    className={[
                      "flex items-center gap-1.5 h-8 pl-1.5 pr-3 rounded-lg border text-[12px] transition-colors duration-150",
                      creatorId === c.id
                        ? "border-[#d7a463]/40 bg-[#d7a463]/12 text-[#e8c896]"
                        : "border-white/[0.07] text-neutral-400 hover:text-neutral-200",
                    ].join(" ")}
                  >
                    <span className="w-4 h-4 rounded-full shrink-0" style={{ background: c.avatarColor }} />
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">Note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Direction for this collection..."
                className="mt-1.5 w-full resize-none rounded-lg surface-field px-3 py-2 text-[12px] text-neutral-300 placeholder:text-neutral-600 outline-none focus:border-[#d7a463]/40"
              />
            </div>
          </div>

          <div className="px-5 pb-5">
            <button
              disabled={!name.trim()}
              onClick={handleCreate}
              className="w-full h-10 rounded-lg bg-[#d7a463] text-[#0a0a0c] text-[13px] font-medium disabled:opacity-40 hover:bg-[#e2b57c] transition-colors"
            >
              Create Collection
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
