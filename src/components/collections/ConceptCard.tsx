import { useEffect, useRef, useState } from "react";
import { X, Send, Eye, MessageSquarePlus } from "lucide-react";
import type { CollectionConcept, ConceptStatus } from "../../types";
import { DEFAULT_THUMB_GRADIENT } from "../../data/mockData";
import { PlatformIcon } from "../hub/PlatformIcon";

const STATUS_STYLES: Record<ConceptStatus, string> = {
  Unused: "text-neutral-400 bg-white/[0.06]",
  Used: "text-emerald-300/85 bg-emerald-400/10",
  Rejected: "text-rose-300/70 bg-rose-400/[0.08]",
};

const STATUS_OPTIONS: ConceptStatus[] = ["Unused", "Used", "Rejected"];

export function ConceptCard({
  concept,
  submitted,
  onStatusChange,
  onRemove,
  onNotesChange,
  onOpen,
}: {
  concept: CollectionConcept;
  submitted: boolean;
  onStatusChange: (status: ConceptStatus) => void;
  onRemove: () => void;
  onNotesChange: (notes: string) => void;
  onOpen: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(concept.notes);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const { video } = concept;

  useEffect(() => {
    if (editingNote) noteInputRef.current?.focus();
  }, [editingNote]);

  function commitNote() {
    setEditingNote(false);
    if (noteDraft !== concept.notes) onNotesChange(noteDraft);
  }

  return (
    <div
      onClick={onOpen}
      className="group relative aspect-[9/16] w-full rounded-xl overflow-hidden border border-white/[0.08] transition-all duration-200 ease-out hover:border-white/[0.16] hover:shadow-[0_10px_24px_-10px_rgba(0,0,0,0.55)] cursor-pointer"
    >
      {video.thumbnailUrl ? (
        <img src={video.thumbnailUrl} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: video.thumbGradient ?? DEFAULT_THUMB_GRADIENT }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/25" />

      {/* top row: platform (+ where this was found), submitted indicator, duration */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1 min-w-0">
          <div className="w-5 h-5 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center shrink-0">
            <PlatformIcon platform={video.platform} size={11} />
          </div>
          {concept.sourceLabel && (
            <span
              title={concept.sourceLabel}
              className="text-[9px] text-white/55 bg-black/45 backdrop-blur-sm rounded-full px-1.5 py-[1px] truncate max-w-[92px]"
            >
              {concept.sourceLabel}
            </span>
          )}
          {submitted && (
            <div
              title="Included in a submission to ReelForge"
              className="w-5 h-5 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center text-[#D39448]"
            >
              <Send size={10} />
            </div>
          )}
        </div>
        <span className="text-[10px] text-white/85 bg-black/45 backdrop-blur-sm rounded-full px-1.5 py-[1px] font-medium tabular-nums">
          {video.duration}
        </span>
      </div>

      {/* remove — hover only */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        title="Remove from collection"
        className="absolute top-2 right-2 mt-6 w-6 h-6 rounded-full bg-black/45 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/65 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
      >
        <X size={12} />
      </button>

      {/* bottom content */}
      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[11.5px] text-white font-medium truncate">@{video.username}</span>
          <span className="flex items-center gap-1 text-[10.5px] text-white/80 font-medium shrink-0 tabular-nums">
            <Eye size={10} className="text-white/50" />
            {video.views}
          </span>
        </div>

        {concept.status === "Used" && concept.producedDate && (
          <p className="mt-0.5 text-[9.5px] text-emerald-300/70">Produced {concept.producedDate}</p>
        )}

        {editingNote ? (
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
            className="mt-1.5 w-full resize-none rounded-md bg-black/55 backdrop-blur-sm border border-white/15 px-2 py-1.5 text-[10.5px] text-neutral-100 placeholder:text-neutral-500 outline-none focus-glow"
          />
        ) : concept.notes ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setNoteDraft(concept.notes);
              setEditingNote(true);
            }}
            className="mt-1.5 w-full text-left text-[10.5px] text-white/70 bg-black/35 backdrop-blur-sm rounded-md px-1.5 py-1 line-clamp-2 hover:bg-black/50 transition-colors"
          >
            {concept.notes}
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setNoteDraft("");
              setEditingNote(true);
            }}
            className="mt-1.5 flex items-center gap-1 text-[10px] text-white/40 hover:text-white/70 transition-colors opacity-0 group-hover:opacity-100"
          >
            <MessageSquarePlus size={11} />
            Add note
          </button>
        )}

        <div className="relative mt-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className={[
              "text-[10px] font-medium px-1.5 py-[2px] rounded-[4px] transition-colors duration-150",
              STATUS_STYLES[concept.status],
            ].join(" ")}
          >
            {concept.status}
          </button>

          {menuOpen && (
            <div
              onMouseLeave={() => setMenuOpen(false)}
              className="absolute bottom-6 left-0 z-20 w-28 rounded-lg surface-panel-strong p-1 animate-fade-in"
            >
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(s);
                    setMenuOpen(false);
                  }}
                  className={[
                    "w-full text-left px-2 py-1.5 rounded-md text-[11px] transition-colors",
                    s === concept.status
                      ? "text-neutral-100 bg-white/[0.06]"
                      : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200",
                  ].join(" ")}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
