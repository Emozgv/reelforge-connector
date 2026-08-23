import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Clock, ChevronDown, PackageCheck, Inbox, Plus, Sparkles } from "lucide-react";
import type { Collection, CollectionStatus, ConceptStatus, Creator, SubmissionStatus } from "../../types";
import { formatRelativeTime } from "../../lib/relativeTime";
import { nextCollectionName } from "../../lib/collectionNaming";
import { ConceptGrid } from "./ConceptGrid";
import { SendToReelForgePanel } from "./SendToReelForgePanel";
import { DriveGlyph } from "./DriveGlyph";
import { COLLECTION_STATUS_STYLES } from "./CollectionRow";

const ALL_STATUSES: CollectionStatus[] = ["Draft", "Sent", "Completed"];

// ReelForge produces in batches — a submission needs enough concepts to make
// a production run worthwhile. 10 is the floor; more is always fine.
const MIN_SEND_COUNT = 10;

// Production status is read-only for the client — ReelForge Internal owns it.
const SUBMISSION_STATUS_STYLES: Record<SubmissionStatus, string> = {
  Sent: "text-neutral-400 bg-white/[0.05]",
  "In Progress": "text-amber-300/80 bg-amber-400/10",
  "Check Inbox": "text-[#f0c987] bg-[#c99a5f]/20",
  Finished: "text-emerald-300/80 bg-emerald-400/10",
};

type ConceptFilter = "all" | "Used" | "Unused";

export function CollectionWorkspace({
  collection,
  creators,
  saveError,
  siblingNames,
  onBack,
  onUpdateNotes,
  onUpdateStatus,
  onRemoveVideo,
  onSetConceptStatus,
  onSetConceptNotes,
  onSendSubmission,
  onStartNext,
}: {
  collection: Collection;
  creators: Creator[];
  saveError?: string | null;
  siblingNames: string[];
  onBack: () => void;
  onUpdateNotes: (notes: string) => void;
  onUpdateStatus: (status: CollectionStatus) => void;
  onRemoveVideo: (videoId: string) => void;
  onSetConceptStatus: (videoId: string, status: ConceptStatus) => void;
  onSetConceptNotes: (videoId: string, notes: string) => void;
  onSendSubmission: (note: string) => void;
  onStartNext: (name: string) => void;
}) {
  const [notes, setNotes] = useState(collection.notes);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [nextOpen, setNextOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [conceptFilter, setConceptFilter] = useState<ConceptFilter>("all");
  const [inboxNoteId, setInboxNoteId] = useState<string | null>(null);
  const notesSaveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const creator = creators.find((c) => c.id === collection.creatorId);
  const delivered = collection.submissions.some((s) => s.status === "Finished");
  const suggestedName = nextCollectionName(collection.name, siblingNames);

  useEffect(() => {
    return () => clearTimeout(notesSaveTimeout.current);
  }, []);

  function handleNotesChange(value: string) {
    setNotes(value);
    clearTimeout(notesSaveTimeout.current);
    notesSaveTimeout.current = setTimeout(() => onUpdateNotes(value), 500);
  }

  const total = collection.concepts.length;
  const used = collection.concepts.filter((c) => c.status === "Used").length;
  const unused = total - used;

  // Submission membership lives only in client_os.submission_concepts — derive
  // it here from the fetched Submissions rather than a per-Concept array.
  const submittedConceptIds = new Set(collection.submissions.flatMap((s) => s.conceptIds));
  const sendableConcepts = collection.concepts.filter((c) => c.status !== "Rejected");
  const overlapCount = sendableConcepts.filter((c) => submittedConceptIds.has(c.video.id)).length;
  // Which prior Submission(s) a resend would overlap with — shown in the warning
  // so the user knows what was already sent, not just how many concepts.
  const overlapSubmissionIndexes = [
    ...new Set(
      collection.submissions
        .filter((s) => s.conceptIds.some((id) => sendableConcepts.some((c) => c.video.id === id)))
        .map((s) => s.index)
    ),
  ];

  const latestSubmission =
    collection.submissions.length > 0 ? collection.submissions[collection.submissions.length - 1] : null;

  const belowMinimum = sendableConcepts.length < MIN_SEND_COUNT;
  const remainingToMinimum = MIN_SEND_COUNT - sendableConcepts.length;

  const visibleConcepts =
    conceptFilter === "all" ? collection.concepts : collection.concepts.filter((c) => c.status === conceptFilter);

  return (
    <div className="h-full overflow-y-auto animate-fade-in">
      <div className="max-w-[1360px] mx-auto px-8 pt-6 pb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12px] text-neutral-500 hover:text-neutral-200 transition-colors duration-150 mb-4"
        >
          <ArrowLeft size={13} />
          All collections
        </button>

        {saveError && (
          <p className="mb-4 text-[12px] text-rose-300/85 rounded-lg surface-field px-3 py-2 max-w-lg">
            {saveError}
          </p>
        )}

        <div className="flex items-center justify-between gap-6 flex-wrap pb-3 border-b border-white/[0.06]">
          <div>
            <div className="group flex items-center gap-2">
              <h1 className="text-[19px] font-serif font-medium text-neutral-50">{collection.name}</h1>

              <div className="relative">
                <button
                  onClick={() => setStatusMenuOpen((v) => !v)}
                  className={[
                    "flex items-center gap-1 text-[10px] font-medium px-1.5 py-[2px] rounded-[4px] transition-colors",
                    COLLECTION_STATUS_STYLES[collection.status],
                  ].join(" ")}
                >
                  {collection.status}
                  <ChevronDown size={10} />
                </button>
                {statusMenuOpen && (
                  <div
                    onMouseLeave={() => setStatusMenuOpen(false)}
                    className="absolute left-0 top-6 z-20 w-40 rounded-lg surface-panel-strong p-1 animate-fade-in"
                  >
                    {ALL_STATUSES.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          onUpdateStatus(s);
                          setStatusMenuOpen(false);
                        }}
                        className={[
                          "w-full text-left px-2.5 py-1.5 rounded-md text-[11.5px] transition-colors",
                          s === collection.status
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

              {delivered && (
                <div
                  className={[
                    "relative transition-opacity duration-150",
                    nextOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                  ].join(" ")}
                >
                  <button
                    onClick={() => setNextOpen((v) => !v)}
                    title={`Start "${suggestedName}"`}
                    className="w-5 h-5 rounded-full flex items-center justify-center text-neutral-600 hover:text-[#e8c896] hover:bg-white/[0.08] transition-colors duration-150"
                  >
                    <Plus size={13} />
                  </button>
                  {nextOpen && (
                    <div
                      onMouseLeave={() => setNextOpen(false)}
                      className="absolute left-0 top-7 z-20 w-60 rounded-lg surface-panel-strong p-1 animate-fade-in"
                    >
                      <button
                        onClick={() => {
                          setNextOpen(false);
                          onStartNext(suggestedName);
                        }}
                        className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-md text-[12px] text-neutral-200 hover:bg-white/[0.06] transition-colors"
                      >
                        <Sparkles size={12} className="text-[#ddb87e] shrink-0" />
                        <span>
                          Start <span className="text-[#e8c896]">"{suggestedName}"</span>
                        </span>
                      </button>
                      <p className="px-2.5 pb-1.5 pt-0.5 text-[10.5px] text-neutral-600 leading-relaxed">
                        Delivered — keeps this one as-is, starts fresh for {creator?.name ?? "this creator"}.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-neutral-500">
              {creator && <div className="w-4 h-4 rounded-full" style={{ background: creator.avatarColor }} />}
              <span>{creator?.name ?? "Unknown creator"}</span>
              <span className="text-neutral-700">·</span>
              <span>Updated {formatRelativeTime(collection.updatedAt)}</span>
            </div>
          </div>
        </div>

        {/* clickable concept-status filters */}
        <div className="flex items-center gap-1.5 flex-wrap py-3 mb-3">
          {(
            [
              ["all", `${total} Concepts`],
              ["Used", `${used} Used`],
              ["Unused", `${unused} Unused`],
            ] as [ConceptFilter, string][]
          ).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setConceptFilter(f)}
              className={[
                "text-[12px] px-3 py-1.5 rounded-full transition-colors duration-150",
                conceptFilter === f
                  ? "bg-white/[0.08] text-neutral-100"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_284px] gap-6 items-start">
          <ConceptGrid
            concepts={visibleConcepts}
            submittedConceptIds={submittedConceptIds}
            onStatusChange={onSetConceptStatus}
            onRemove={onRemoveVideo}
            onNotesChange={onSetConceptNotes}
          />

          <div className="sticky top-0 space-y-3">
            <div className="rounded-lg surface-panel p-3.5">
              <span className="text-[10.5px] tracking-wide uppercase text-neutral-500">
                Direction &amp; notes
              </span>
              <textarea
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                rows={5}
                className="mt-2 w-full resize-none rounded-md surface-field p-2.5 text-[12.5px] leading-relaxed text-neutral-300 placeholder:text-neutral-600 outline-none focus-glow"
                placeholder="Add direction, references, or constraints for the production team..."
              />

              {latestSubmission && (
                <div className="mt-3 rounded-md surface-field px-2.5 py-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-neutral-300">
                    <PackageCheck size={11} className="text-[#ddb87e]" />
                    Sent to ReelForge
                  </div>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    {latestSubmission.sentAt} · {latestSubmission.conceptIds.length} concepts
                  </p>
                </div>
              )}

              <button
                onClick={() => setSendOpen(true)}
                disabled={belowMinimum}
                title={belowMinimum ? `Add at least ${MIN_SEND_COUNT}–15 concepts before sending` : undefined}
                className={[
                  "mt-3 w-full h-9 rounded-md flex items-center justify-center gap-2 text-[12.5px] font-medium transition-colors duration-150",
                  belowMinimum
                    ? "bg-white/[0.04] text-neutral-500 cursor-not-allowed"
                    : "bg-[#c99a5f] text-[#0a0a0c] hover:bg-[#ddb87e]",
                ].join(" ")}
              >
                <Send size={13} />
                {latestSubmission ? "Send to ReelForge again" : "Send to ReelForge"}
              </button>
              {belowMinimum && (
                <p className="mt-2 text-[11px] text-neutral-500 leading-relaxed">
                  Add {remainingToMinimum} more concept{remainingToMinimum === 1 ? "" : "s"} — collections need
                  at least {MIN_SEND_COUNT}–15 before they can be sent.
                </p>
              )}
            </div>

            {collection.submissions.length > 0 && (
              <div className="rounded-lg surface-panel p-3.5">
                <span className="text-[10.5px] tracking-wide uppercase text-neutral-500 flex items-center gap-1.5">
                  <PackageCheck size={10} />
                  Submissions
                </span>
                <div className="mt-2.5 space-y-3">
                  {[...collection.submissions].reverse().map((s) => (
                    <div key={s.id}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11.5px] text-neutral-300 leading-snug">
                            Submission #{s.index}
                          </p>
                          <p className="text-[10.5px] text-neutral-600">
                            {s.conceptIds.length} concepts · {s.sentAt}
                          </p>
                        </div>

                        {/* production status: read-only for the client */}
                        <button
                          onClick={() => s.status === "Check Inbox" && setInboxNoteId(inboxNoteId === s.id ? null : s.id)}
                          title={
                            s.status === "Check Inbox"
                              ? "ReelForge needs something from you"
                              : "Production status — set by ReelForge"
                          }
                          className={[
                            "shrink-0 flex items-center gap-1 text-[10px] font-medium px-1.5 py-[2px] rounded-[4px]",
                            SUBMISSION_STATUS_STYLES[s.status],
                            s.status === "Check Inbox" ? "animate-pulse cursor-pointer" : "cursor-default",
                          ].join(" ")}
                        >
                          {s.status === "Check Inbox" && <Inbox size={10} />}
                          {s.status}
                        </button>
                      </div>

                      {inboxNoteId === s.id && (
                        <p className="mt-1.5 rounded-md surface-field px-2.5 py-2 text-[11px] text-neutral-300 leading-relaxed animate-fade-in">
                          ReelForge needs additional information for this submission.
                        </p>
                      )}

                      {s.status === "Finished" && s.deliveryUrl && (
                        <a
                          href={s.deliveryUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-neutral-400 hover:text-[#e8c896] transition-colors duration-150"
                        >
                          <DriveGlyph size={12} />
                          Drive
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg surface-panel p-3.5">
              <span className="text-[10.5px] tracking-wide uppercase text-neutral-500 flex items-center gap-1.5">
                <Clock size={10} />
                History
              </span>
              <div className="mt-2.5 space-y-2.5">
                {collection.history.length === 0 && (
                  <p className="text-[11.5px] text-neutral-600">No activity yet.</p>
                )}
                {collection.history.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="mt-[5px] w-1 h-1 rounded-full bg-[#c99a5f]/60 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11.5px] text-neutral-300 leading-snug">{entry.label}</p>
                      <p className="text-[10.5px] text-neutral-600">{entry.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <SendToReelForgePanel
        open={sendOpen}
        creatorName={creator?.name ?? ""}
        collectionName={collection.name}
        totalCount={sendableConcepts.length}
        overlapCount={overlapCount}
        overlapSubmissionIndexes={overlapSubmissionIndexes}
        onClose={() => setSendOpen(false)}
        onConfirm={(note) => onSendSubmission(note)}
      />
    </div>
  );
}
