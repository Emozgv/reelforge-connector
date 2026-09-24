import { useState, type ReactNode } from "react";
import { Archive, Check, Plus } from "lucide-react";
import type { CollectionStatus } from "../../types";
import { COLLECTION_STATUS_STYLES, effectiveCollectionStatus } from "./CollectionRow";

export interface VersionEntry {
  id: string;
  name: string;
  status: CollectionStatus;
  submissions: { status: string }[];
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
  onArchiveVersion,
  children,
}: {
  family: VersionEntry[];
  currentId: string;
  nextName: string;
  onSwitch: (id: string) => void;
  onCreateNext: () => void;
  // Archiviert genau diese eine Version. Nur die Collections-Uebersicht
  // reicht das durch -- im Workspace und im Popover der Creativity Hub
  // bleibt das Menue wie es war, dort fehlt die Aktion schlicht.
  // Bei nur noch einer Version wird sie nicht angeboten: dann ist
  // "Archive collection" im Karten-Menue der richtige Weg.
  onArchiveVersion?: (id: string) => void;
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
              // Zwei Schaltflaechen nebeneinander statt einer in der anderen —
              // eine Schaltflaeche in einer Schaltflaeche ist ungueltiges HTML
              // und React meldet es als Fehler.
              <span
                key={f.id}
                className={[
                  "group/version flex items-center rounded-md transition-colors",
                  f.id === currentId ? "bg-white/[0.06]" : "hover:bg-white/[0.06]",
                ].join(" ")}
              >
                <button
                  onClick={() => {
                    setOpen(false);
                    if (f.id !== currentId) onSwitch(f.id);
                  }}
                  className={[
                    "min-w-0 flex-1 flex items-center justify-between gap-2 text-left pl-2.5 py-1.5 text-[12px]",
                    onArchiveVersion && family.length > 1 ? "pr-1" : "pr-2.5",
                    f.id === currentId ? "text-neutral-100" : "text-neutral-300",
                  ].join(" ")}
                >
                  <span className="truncate">{f.name}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={[
                        "text-[9.5px] font-medium px-1 py-[1px] rounded-[3px]",
                        COLLECTION_STATUS_STYLES[effectiveCollectionStatus(f)],
                      ].join(" ")}
                    >
                      {effectiveCollectionStatus(f)}
                    </span>
                    {f.id === currentId && <Check size={11} className="text-[#D39448]" />}
                  </span>
                </button>

                {/* Nur wenn noch eine weitere Version uebrig ist — die letzte
                    verbliebene archiviert man ueber "Archive collection". */}
                {onArchiveVersion && family.length > 1 && (
                  <button
                    title="Archive version"
                    aria-label={`Archive version ${f.name}`}
                    onClick={() => {
                      setOpen(false);
                      onArchiveVersion(f.id);
                    }}
                    className="shrink-0 pr-2.5 pl-1 py-1.5 text-neutral-600 opacity-0 group-hover/version:opacity-100 focus-visible:opacity-100 hover:text-neutral-200 transition-opacity duration-150"
                  >
                    <Archive size={11} />
                  </button>
                )}
              </span>
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
