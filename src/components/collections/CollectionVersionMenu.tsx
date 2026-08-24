import { useState, type ReactNode } from "react";
import { Check, Plus } from "lucide-react";
import type { CollectionStatus } from "../../types";
import { COLLECTION_STATUS_STYLES } from "./CollectionRow";

export interface VersionEntry {
  id: string;
  name: string;
  status: CollectionStatus;
}

// One main folder, several numbered versions nested under it — hovering the
// title reveals every version plus an action to start a fresh next version.
// This is a general Collection behavior: every Collection in the app gets
// this menu, not a one-off for a specific one — the only thing that varies
// is which versions happen to exist so far.
export function CollectionVersionMenu({
  family,
  currentId,
  nextName,
  onSwitch,
  onCreateNext,
  children,
}: {
  family: VersionEntry[];
  currentId: string;
  nextName: string;
  onSwitch: (id: string) => void;
  onCreateNext: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      {open && (
        // Flush against the trigger (no margin gap) with the offset done via
        // padding instead — padding is still part of this element's hoverable
        // box, unlike margin, so there's no dead pixel for the mouse to fall
        // through between the title and the popover.
        <span className="absolute left-0 top-full pt-1 z-30 w-60 block">
          <span
            className="block rounded-lg surface-panel-strong p-1 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {family.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setOpen(false);
                  if (f.id !== currentId) onSwitch(f.id);
                }}
                className={[
                  "w-full flex items-center justify-between gap-2 text-left px-2.5 py-1.5 rounded-md text-[12px] transition-colors",
                  f.id === currentId ? "text-neutral-100 bg-white/[0.06]" : "text-neutral-300 hover:bg-white/[0.06]",
                ].join(" ")}
              >
                <span className="truncate">{f.name}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={["text-[9.5px] font-medium px-1 py-[1px] rounded-[3px]", COLLECTION_STATUS_STYLES[f.status]].join(" ")}
                  >
                    {f.status}
                  </span>
                  {f.id === currentId && <Check size={11} className="text-[#D39448]" />}
                </span>
              </button>
            ))}

            <span className="block my-1 h-px bg-white/[0.06]" />

            <button
              onClick={() => {
                setOpen(false);
                onCreateNext();
              }}
              className="w-full flex items-center gap-1.5 text-left px-2.5 py-1.5 rounded-md text-[12px] text-[#D39448] hover:bg-white/[0.06] transition-colors"
            >
              <Plus size={11} />
              New version — "{nextName}"
            </button>
          </span>
        </span>
      )}
    </span>
  );
}
