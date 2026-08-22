import { useState } from "react";
import { ArrowLeft, Send, Clock, ChevronDown, PackageCheck, Inbox } from "lucide-react";
import type { Collection, CollectionStatus, ConceptStatus, SubmissionStatus } from "../../types";
import { creatorByName } from "../../data/mockData";
import { ConceptGrid } from "./ConceptGrid";
import { SendToReelForgePanel } from "./SendToReelForgePanel";
import { DriveGlyph } from "./DriveGlyph";
import { COLLECTION_STATUS_STYLES } from "./CollectionRow";

const ALL_STATUSES: CollectionStatus[] = ["Draft", "Ready", "Sent", "Completed"];

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
  onBack,
  onUpdateNotes,
  onUpdateStatus,
  onRemoveVideo,
  onSetConceptStatus,
  onSendSubmission,
}: {
  collection: Collection;
  onBack: () => void;
  onUpdateNotes: (notes: string) => void;
  onUpdateStatus: (status: CollectionStatus) => void;
  onRemoveVideo: (videoId: string) => void;
  onSetConceptStatus: (videoId: string, status: ConceptStatus) => void;
  onSendSubmission: (note: string) => void;
}) {
  const [notes, setNotes] = useState(collection.notes);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [conceptFilter, setConceptFilter] = useState<ConceptFilter>("all");
  const [inboxNoteId, setInboxNoteId] = useState<string | null>(null);
  const creator = creatorByName(collection.creator);

  const total = collection.concepts.length;
  const used = collection.concepts.filter((c) => c.status === "Used").length;
  const unused = total - used;

  const sendableConcepts = collection.concepts.filter((c) => c.status !== "Rejected");
  const overlapCount = sendableConcepts.filter((c) => c.submissionIds.length > 0).length;

  const latestSubmission =
    collection.submissions.length > 0 ? collection.submissions[collection.submissions.length - 1] : null;

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

        <div className="flex items-center justify-between gap-6 flex-wrap pb-3 border-b border-white/[0.06]">
          <div>
            <div className="flex items-center gap-2">
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
            </div>

            <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-neutral-500">
              {creator && <div className="w-4 h-4 rounded-full" style={{ background: creator.avatarColor }} />}
              <span>{collection.creator}</span>
              <span className="text-neutral-700">·</span>
              <span>Updated {collection.lastUpdated}</span>
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
                "text-[12px] px-2.5 py-1 rounded-md transition-colors duration-150",
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
            onStatusChange={onSetConceptStatus}
            onRemove={onRemoveVideo}
          />

          <div className="sticky top-0 space-y-3">
            <div className="rounded-lg surface-panel p-3.5">
              <span className="text-[10.5px] tracking-wide uppercase text-neutral-500">
                Direction &amp; notes
              </span>
              <textarea
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  onUpdateNotes(e.target.value);
                }}
                rows={5}
                className="mt-2 w-full resize-none rounded-md surface-field p-2.5 text-[12.5px] leading-relaxed text-neutral-300 placeholder:text-neutral-600 outline-none focus:border-[#c99a5f]/35 transition-colors duration-150"
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
                disabled={sendableConcepts.length === 0}
                className={[
                  "mt-3 w-full h-9 rounded-md flex items-center justify-center gap-2 text-[12.5px] font-medium transition-colors duration-150",
                  sendableConcepts.length === 0
                    ? "bg-white/[0.04] text-neutral-500 cursor-not-allowed"
                    : "bg-[#c99a5f] text-[#0a0a0c] hover:bg-[#ddb87e]",
                ].join(" ")}
              >
                <Send size={13} />
                {latestSubmission ? "Send to ReelForge again" : "Send to ReelForge"}
              </button>
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
        creatorName={collection.creator}
        collectionName={collection.name}
        totalCount={sendableConcepts.length}
        overlapCount={overlapCount}
        onClose={() => setSendOpen(false)}
        onConfirm={(note) => onSendSubmission(note)}
      />
    </div>
  );
}
