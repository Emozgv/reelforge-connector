import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ellipsis, Eye, Heart, MessageSquare, ChevronRight, Send, Trash2, UserRoundCog } from "lucide-react";
import type { Collection, CollectionConcept, ConceptStatus, Creator } from "../../types";
import { DEFAULT_THUMB_GRADIENT } from "../../data/mockData";
import { KARTE_FUELLUNG } from "../../lib/panelLook";
import { formatCompactNumber, zahlOderStrich } from "../../lib/formatCount";
import { PlatformIcon } from "../hub/PlatformIcon";
import { AssignCreatorPopover } from "./AssignCreatorPopover";

// Die Konzeptkarte der Collection-Detailseite (Neubau 12.11.2026 nach Emres
// Screenshot): liegende Karte -- Vorschaubild links, rechts Status, Titel,
// Quelle, Kennzahlen und die Notiz. Vorher war es eine stehende 9:16-Kachel
// mit allem im Bild; die Bedienung (Status setzen, Notiz, Creator zuweisen,
// entfernen, Abspielen) ist dieselbe geblieben, nur im Drei-Punkte-Menue
// gesammelt statt als Schwebe-Knoepfe ueber dem Bild.
//
// Was die Karte zeigt, ist echt: Vorschaubild, Plattform, Laenge, Aufrufe,
// Status, Quelle, Notiz. Likes liegen am gespeicherten Konzept nicht vor
// (sie werden beim Speichern nicht mitgenommen) -- dort steht deshalb ein
// Strich, keine Null (Regel vom 28.10.2026).

export type ConceptBadge = ConceptStatus | "Sent";

const BADGE_STYLES: Record<ConceptBadge, string> = {
  Unused: "text-[#cfd3d9] border-white/[0.14] bg-white/[0.04]",
  Sent: "text-[#5eb1ff] border-[rgba(94,177,255,0.35)] bg-[rgba(94,177,255,0.10)]",
  Used: "text-[#63c07f] border-[rgba(99,192,127,0.35)] bg-[rgba(99,192,127,0.10)]",
  Rejected: "text-[#e0664f] border-[rgba(224,102,79,0.35)] bg-[rgba(224,102,79,0.10)]",
};

const STATUS_OPTIONS: ConceptStatus[] = ["Unused", "Used", "Rejected"];

// Ein Konzept, das in einer Uebergabe steckt und noch nicht als Used markiert
// ist, traegt "Sent" -- das ist sein tatsaechlicher Stand. Used und Rejected
// bleiben, was sie sind.
export function conceptBadge(concept: CollectionConcept, submitted: boolean): ConceptBadge {
  if (concept.status === "Unused" && submitted) return "Sent";
  return concept.status;
}

function Vorschau({ concept, breite, radius }: { concept: CollectionConcept; breite: number; radius: number }) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const { video } = concept;
  return (
    <div
      className="relative shrink-0 self-stretch overflow-hidden aspect-[9/16] w-[50%] min-w-[96px]"
      style={{ maxWidth: breite, borderRadius: radius }}
    >
      {video.thumbnailUrl && !thumbnailFailed ? (
        <img
          src={video.thumbnailUrl}
          alt=""
          loading="lazy"
          onError={() => setThumbnailFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0" style={{ background: video.thumbGradient ?? DEFAULT_THUMB_GRADIENT }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/20" />
      {/* Plattform oben links, Laenge oben rechts -- wie im Screenshot. */}
      <div className="absolute top-1.5 left-1.5 right-1.5 flex items-start justify-between gap-1">
        <span
          className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
          style={{
            background:
              video.platform === "instagram"
                ? "linear-gradient(135deg, #f58529 0%, #dd2a7b 50%, #8134af 100%)"
                : "#111113",
          }}
        >
          <PlatformIcon platform={video.platform} size={10} />
        </span>
        <span className="text-[10px] leading-none text-white/90 bg-black/60 rounded-[5px] px-1.5 py-[3px] font-medium tabular-nums">
          {video.duration}
        </span>
      </div>
    </div>
  );
}

export function ConceptCard({
  concept,
  submitted,
  creators,
  collections,
  currentCreatorId,
  ansicht = "raster",
  onStatusChange,
  onRemove,
  onNotesChange,
  onOpen,
  onReassign,
  onAssignToAnother,
}: {
  concept: CollectionConcept;
  submitted: boolean;
  creators: Creator[];
  collections: Collection[];
  currentCreatorId: string | undefined;
  /** "raster" = liegende Karte im Vierer-Raster, "liste" = eine Zeile. */
  ansicht?: "raster" | "liste";
  onStatusChange: (status: ConceptStatus) => void;
  onRemove: () => void;
  onNotesChange: (notes: string) => void;
  onOpen: () => void;
  onReassign: (targetCreatorId: string, targetCollectionId: string | undefined) => Promise<{ error: string | null }>;
  onAssignToAnother: (targetCreatorId: string, targetCollectionId: string | undefined) => Promise<{ error: string | null }>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [assignMenuOpen, setAssignMenuOpen] = useState(false);
  const [assignFeedback, setAssignFeedback] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(concept.notes);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Das Menue liegt als Portal am Dokument, nicht in der Karte: die Karten
  // steigen beim Erscheinen mit einer Bewegung auf, und ein bewegtes
  // Element wird zur eigenen Zeichenebene -- die naechste Karte malte das
  // Menue sonst zu (12.11.2026, in der Vorschau gesehen).
  const [menuLage, setMenuLage] = useState<{ top: number; left: number } | null>(null);
  const { video } = concept;
  const badge = conceptBadge(concept, submitted);

  useEffect(() => {
    if (editingNote) noteInputRef.current?.focus();
  }, [editingNote]);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuLage(null);
      return;
    }
    const rect = menuButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const breite = 196;
    const left = Math.min(Math.max(8, rect.right - breite), window.innerWidth - breite - 8);
    setMenuLage({ top: rect.bottom + 4, left });
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function draussen(e: MouseEvent) {
      const ziel = e.target as Node;
      if (menuRef.current?.contains(ziel) || menuButtonRef.current?.contains(ziel)) return;
      setMenuOpen(false);
    }
    function taste(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", draussen);
    document.addEventListener("keydown", taste);
    return () => {
      document.removeEventListener("mousedown", draussen);
      document.removeEventListener("keydown", taste);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!assignFeedback) return;
    const t = setTimeout(() => setAssignFeedback(null), 2200);
    return () => clearTimeout(t);
  }, [assignFeedback]);

  function commitNote() {
    setEditingNote(false);
    if (noteDraft !== concept.notes) onNotesChange(noteDraft);
  }

  async function handleAssignConfirm(action: "copy" | "move", targetCreatorId: string, targetCollectionId?: string) {
    setAssignMenuOpen(false);
    const targetName = creators.find((c) => c.id === targetCreatorId)?.name ?? "another creator";
    const res =
      action === "move"
        ? await onReassign(targetCreatorId, targetCollectionId)
        : await onAssignToAnother(targetCreatorId, targetCollectionId);
    setAssignFeedback(res.error ?? (action === "move" ? `Moved to ${targetName}` : `Also assigned to ${targetName}`));
  }

  const statusBadge = (
    <span
      className={[
        "inline-flex items-center h-[24px] px-2.5 rounded-full border text-[11.5px] font-medium leading-none whitespace-nowrap",
        BADGE_STYLES[badge],
      ].join(" ")}
    >
      {badge}
    </span>
  );

  const menu = (
    <div className="relative shrink-0">
      <button
        ref={menuButtonRef}
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        title="More"
        className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center text-[#9a9ba0] hover:text-[#f5f5f5] hover:bg-white/[0.06] transition-colors duration-150"
      >
        <Ellipsis size={15} />
      </button>

      {menuOpen && menuLage && createPortal(
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          onMouseLeave={() => setMenuOpen(false)}
          className="fixed z-50 w-[196px] rounded-[9px] surface-panel-strong p-1 animate-fade-in"
          style={{ top: menuLage.top, left: menuLage.left }}
        >
          <p className="px-2 pt-1 pb-1 text-[9.5px] uppercase tracking-[0.06em] text-[#8c877e]">Status</p>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                onStatusChange(s);
                setMenuOpen(false);
              }}
              className={[
                "w-full text-left px-2 py-1.5 rounded-md text-[11.5px] transition-colors",
                s === concept.status
                  ? "text-[#f5f5f5] bg-white/[0.06]"
                  : "text-[#cfd3d9] hover:bg-white/[0.06] hover:text-[#f5f5f5]",
              ].join(" ")}
            >
              {s}
            </button>
          ))}
          <div className="my-1 border-t border-white/[0.06]" />
          <button
            onClick={() => {
              setMenuOpen(false);
              setNoteDraft(concept.notes);
              setEditingNote(true);
            }}
            className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-md text-[11.5px] text-[#cfd3d9] hover:bg-white/[0.06] hover:text-[#f5f5f5] transition-colors"
          >
            <MessageSquare size={12} />
            {concept.notes ? "Edit note" : "Add note"}
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              setAssignMenuOpen(true);
            }}
            className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-md text-[11.5px] text-[#cfd3d9] hover:bg-white/[0.06] hover:text-[#f5f5f5] transition-colors"
          >
            <UserRoundCog size={12} />
            Assign to another creator
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              onRemove();
            }}
            className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-md text-[11.5px] text-[#e0664f]/85 hover:bg-[rgba(224,102,79,0.10)] hover:text-[#e0664f] transition-colors"
          >
            <Trash2 size={12} />
            Remove from collection
          </button>
        </div>,
        document.body
      )}

      {assignMenuOpen && (
        <AssignCreatorPopover
          anchorRef={menuButtonRef}
          creators={creators}
          collections={collections}
          currentCreatorId={currentCreatorId}
          canMove={!submitted}
          onClose={() => setAssignMenuOpen(false)}
          onConfirm={(action, targetCreatorId, targetCollectionId) =>
            void handleAssignConfirm(action, targetCreatorId, targetCollectionId)
          }
        />
      )}
    </div>
  );

  const noteEditor = editingNote ? (
    <textarea
      ref={noteInputRef}
      value={noteDraft}
      onChange={(e) => setNoteDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={commitNote}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          commitNote();
        }
        if (e.key === "Escape") {
          setNoteDraft(concept.notes);
          setEditingNote(false);
        }
      }}
      rows={2}
      placeholder='e.g. "black dress", "German talking version"'
      className="w-full resize-none rounded-[7px] border border-[#2f2113] bg-black/40 px-2 py-1.5 text-[11px] leading-[15px] text-[#f5f5f5] placeholder:text-[#6f7075] outline-none focus-glow"
    />
  ) : (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setNoteDraft(concept.notes);
        setEditingNote(true);
      }}
      title={concept.notes || "Add a note for the production team"}
      className="w-full h-[28px] pl-2 pr-1.5 rounded-[8px] border border-[#1a130b] bg-white/[0.02] flex items-center justify-between gap-1.5 text-[11.5px] text-[#dcdcde] hover:border-[#2f2113] hover:bg-white/[0.04] transition-colors duration-150"
    >
      <span className="flex items-center gap-1.5 min-w-0">
        <MessageSquare size={12} className="shrink-0 text-[#afb7c3]" />
        <span className="truncate">{concept.notes ? "Note (1)" : "Note"}</span>
      </span>
      <ChevronRight size={13} className="shrink-0 text-[#8c877e]" />
    </button>
  );

  const kennzahlen = (
    <div className="flex flex-col gap-[3px] text-[12.5px] text-[#e4e4e7] tabular-nums whitespace-nowrap">
      <span className="flex items-center gap-1.5" title="Views">
        <Eye size={13} className="text-[#8c877e] shrink-0" />
        {zahlOderStrich(video.viewsRaw, formatCompactNumber)}
      </span>
      <span className="flex items-center gap-1.5" title={video.likesVerborgen ? "The creator hides likes on this reel" : video.likes === undefined ? "Likes unknown for this reel" : "Likes"}>
        <Heart size={13} className="text-[#8c877e] shrink-0" />
        {zahlOderStrich(video.likes, formatCompactNumber)}
      </span>
      {concept.notes && (
        <span title={concept.notes} className="flex items-center gap-1.5 text-[#afb7c3] min-w-0">
          <MessageSquare size={13} className="text-[#8c877e] shrink-0" />
          <span className="truncate text-[11.5px]">{concept.notes}</span>
        </span>
      )}
      {submitted && badge !== "Sent" && (
        <span title="Included in a submission to ReelForge" className="flex items-center text-[#D39448]">
          <Send size={10} />
        </span>
      )}
    </div>
  );

  const quelleVoll = concept.sourceLabel ?? (video.platform === "instagram" ? "Instagram" : "TikTok");
  // In der schmalen Spalte zaehlt der Teil, der sich unterscheidet: der Name
  // des Research-Kontos. Dass es Instagram-Research war, zeigt das Zeichen
  // auf dem Bild; der volle Text bleibt als Tooltip.
  const quelle = quelleVoll.replace(/^IG Research\s*[—–-]\s*/i, "");

  if (ansicht === "liste") {
    return (
      <div
        onClick={onOpen}
        className="group relative flex items-center gap-3.5 rounded-[11px] border border-[#1a130b] hover:border-[#2f2113] px-3 py-2.5 cursor-pointer transition-colors duration-150"
        style={{ background: KARTE_FUELLUNG }}
      >
        <Vorschau concept={concept} breite={40} radius={6} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[#f5f5f5] leading-[17px] truncate">@{video.username}</p>
          <p className="mt-0.5 text-[11px] text-[#8c877e] truncate" title={quelleVoll}>{quelle}</p>
        </div>
        <div className="shrink-0 w-[120px]">{kennzahlen}</div>
        <div className="shrink-0 w-[84px] flex justify-start">{statusBadge}</div>
        <div className="shrink-0 w-[150px]" onClick={(e) => e.stopPropagation()}>
          {noteEditor}
        </div>
        {menu}
        {assignFeedback && (
          <div className="absolute left-3 bottom-1 text-[10px] text-[#D39448] animate-fade-in">{assignFeedback}</div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={onOpen}
      className="group relative h-full flex gap-3 rounded-[14px] border border-[#1a130b] hover:border-[#2f2113] overflow-hidden cursor-pointer transition-colors duration-150"
      style={{ background: KARTE_FUELLUNG }}
    >
      <Vorschau concept={concept} breite={180} radius={0} />

      <div className="min-w-0 flex-1 flex flex-col py-3 pr-3">
        <div className="flex items-center justify-between gap-1">
          {statusBadge}
          {menu}
        </div>

        <p className="mt-2 text-[13px] font-semibold text-[#f5f5f5] leading-[17px] line-clamp-2 break-words" title={`@${video.username}`}>
          @{video.username.replace(/([._-])/g, "$1\u200b")}
        </p>
        <p className="mt-0.5 text-[11.5px] text-[#8c877e] truncate" title={quelleVoll}>
          {quelle}
        </p>

        <div className="mt-auto pt-2">{kennzahlen}</div>

        {editingNote && (
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            {noteEditor}
          </div>
        )}
      </div>

      {assignFeedback && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-3 right-3 bottom-3 z-10 rounded-[7px] bg-black/80 px-2 py-1 text-[10.5px] text-white/90 text-center animate-fade-in"
        >
          {assignFeedback}
        </div>
      )}
    </div>
  );
}
