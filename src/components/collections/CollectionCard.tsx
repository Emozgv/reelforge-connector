import { useEffect, useRef, useState } from "react";
import type { Collection, Creator } from "../../types";
import { formatRelativeTime } from "../../lib/relativeTime";
import { isVersionableCollection, nextCollectionName } from "../../lib/collectionNaming";
import { DEFAULT_THUMB_GRADIENT } from "../../data/mockData";
import { CollectionVersionMenu } from "./CollectionVersionMenu";
import { COLLECTION_STATUS_STYLES, effectiveCollectionStatus } from "./CollectionRow";
import { GOLD_RING_SOFT } from "../../lib/goldRing";
import { KARTE_FUELLUNG } from "../../lib/panelLook";

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
  const menuRef = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState(false);
  // Je Feld eigenes Scheitern merken: faellt ein Bild aus, soll nur dieses
  // eine auf die Farbflaeche zurueckfallen, nicht die ganze Kachel.
  const [thumbFailed, setThumbFailed] = useState<Record<number, boolean>>({});
  const [draftName, setDraftName] = useState(current.name);
  const creator = creators.find((c) => c.id === current.creatorId);

  const total = current.concepts.length;
  const used = current.concepts.filter((c) => c.status === "Used").length;
  const available = total - used;
  const status = effectiveCollectionStatus(current);
  // Vier Reels statt einem: die Kachel zeigt jetzt, was in der Collection
  // steckt, statt nur das erste Konzept. Dasselbe Vierfeld, das die
  // Listenansicht (CollectionRow) schon benutzt -- eine Collection soll in
  // beiden Ansichten gleich aussehen.
  //
  // Kein leeres Feld, egal wie viele drin sind. Ein Vierfeld mit drei
  // Bildern sieht nicht nach drei Reels aus, sondern nach einem fehlenden
  // vierten -- deshalb bekommt jede Anzahl ihre eigene, vollstaendig
  // gefuellte Aufteilung:
  //
  //     1   eine ganze Flaeche
  //     2   zwei Baender uebereinander
  //     3   eines hoch links, zwei gestapelt rechts
  //     4   das Vierfeld
  const vorschau = current.concepts.slice(0, 4);
  const anzahl = vorschau.length;
  // Welches Feld wo liegt. Nur bei dreien weicht es vom gleichmaessigen
  // Raster ab -- das erste nimmt die ganze linke Haelfte ein.
  const platz = (i: number): React.CSSProperties =>
    anzahl === 3 && i === 0 ? { gridRow: "1 / 3" } : {};
  const cover = current.concepts[0]?.video;
  const suggestedName = nextCollectionName(current.name, family.map((f) => f.name));

  // Das Menue schloss sich urspruenglich, sobald die Maus es verliess. Das
  // ist hier toedlich: die Karte schrumpft beim Druecken minimal
  // (press-feedback), dadurch rutscht das Menue unter dem Zeiger weg, gilt
  // als verlassen und verschwindet noch zwischen Maustaste-runter und
  // Maustaste-hoch. Der Klick landete dann auf dem, was darunter lag --
  // live nachgestellt: "Maustaste runter" traf den Menuepunkt, der Klick
  // danach eine fremde Karte.
  //
  // Stattdessen schliesst jetzt ein Druck ausserhalb des Menues. Das haelt
  // auch, wenn sich unter dem Zeiger etwas bewegt.
  useEffect(() => {
    if (!menuOpen) return;
    function beiDruck(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", beiDruck);
    return () => document.removeEventListener("pointerdown", beiDruck);
  }, [menuOpen]);

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
      // Bewusst ohne press-feedback: dessen scale(0.98) beim Druecken
      // verschiebt die ganze Karte -- und damit auch das Menue, das in ihr
      // sitzt. Gemessen: Taste-runter traf noch den Menuepunkt, Taste-hoch
      // schon die Nachbarkarte, und der Klick landete dort. In Research
      // Accounts haengt press-feedback an Schaltflaechen, nicht an grossen
      // Flaechen -- ohne ist die Karte also naeher an der DNA, nicht weiter weg.
      style={{ background: KARTE_FUELLUNG, boxShadow: GOLD_RING_SOFT }}
      className="group relative flex h-[104px] items-stretch p-2.5 rounded-xl border border-white/[0.07] hover:border-[#D39448]/35 hover:bg-[#161613] transition-colors duration-150 cursor-pointer"
    >
      <div
        // Die Fuge ist 2 px, nicht 1,5 -- und das ist gerechnet, nicht gegriffen.
        // Die Kachel ist 54 breit und 84 hoch (104 minus zweimal 10
        // Innenabstand). Mit 1,5 ergaben die Haelften 26,25 und 41,25: der
        // Browser rundet das, eine Haelfte wird einen Pixel groesser, und das
        // Kreuz zwischen den Bildern sitzt sichtbar ausserhalb der Mitte.
        // Mit 2 geht beides glatt auf -- 26+2+26=54 und 41+2+41=84 --, alle
        // vier Bilder sind exakt gleich gross.
        className="w-[54px] shrink-0 mr-3 rounded-[6px] overflow-hidden bg-black/30 grid gap-[2px]"
        style={{
          // minmax(0,...) statt blossem 1fr -- und das ist der Punkt.
          //
          // "1fr" heisst in Wahrheit "mindestens so gross wie der Inhalt".
          // Ein 26 Punkte breites Hochformat will von sich aus 46 hoch
          // sein, also nahmen sich zwei Reihen zusammen 94 Punkte in einer
          // 82 Punkte hohen Kachel. Der untere Rand wurde abgeschnitten,
          // und der waagerechte Strich sass dadurch sechs Punkte zu tief
          // (12.10.2026 von Emre bemerkt, hier nachgemessen).
          //
          // Mit minmax(0,1fr) duerfen die Reihen schrumpfen; das Bild wird
          // beschnitten statt die Kachel zu sprengen, und das Kreuz sitzt
          // exakt in der Mitte.
          gridTemplateColumns: anzahl >= 3 ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1fr)",
          gridTemplateRows: anzahl >= 2 ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1fr)",
        }}
      >
        {Array.from({ length: Math.max(1, anzahl) }).map((_, i) => {
          const v = vorschau[i]?.video;
          return v?.thumbnailUrl && !thumbFailed[i] ? (
            <img
              key={i}
              src={v.thumbnailUrl}
              alt=""
              loading="lazy"
              onError={() => setThumbFailed((bisher) => ({ ...bisher, [i]: true }))}
              style={platz(i)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              key={i}
              className="w-full h-full"
              style={{ ...platz(i), background: v?.thumbGradient ?? cover?.thumbGradient ?? DEFAULT_THUMB_GRADIENT }}
            />
          );
        })}
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

      <div ref={menuRef} className="absolute right-2.5 top-1.5" onClick={(e) => e.stopPropagation()}>
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
          <div className="absolute right-0 top-6 z-20 w-40 rounded-lg surface-panel-strong p-1 animate-fade-in">
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
