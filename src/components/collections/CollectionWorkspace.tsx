import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Clock, RotateCcw, PackageCheck, Inbox, ArchiveRestore, Loader2, Ban } from "lucide-react";
import type {
  Collection,
  CollectionConcept,
  CollectionStatus,
  ConceptStatus,
  Creator,
  ReelVideo,
  SubmissionStatus,
} from "../../types";
import { formatRelativeTime } from "../../lib/relativeTime";
import { collectionFamily, isVersionableCollection, nextCollectionName } from "../../lib/collectionNaming";
import { resolveReelVideo } from "../../lib/searchReels";
import { ConceptGrid } from "./ConceptGrid";
import { SendToReelForgePanel } from "./SendToReelForgePanel";
import { DriveGlyph } from "./DriveGlyph";
import { COLLECTION_STATUS_STYLES } from "./CollectionRow";
import { CollectionVersionMenu } from "./CollectionVersionMenu";
import { ReelDetailModal } from "../hub/ReelDetailModal";

// ReelForge produces in batches — a submission needs enough concepts to make
// a production run worthwhile. 10 is the floor; more is always fine.
const MIN_SEND_COUNT = 10;

// Production status is read-only for the client — ReelForge Internal owns it.
const SUBMISSION_STATUS_STYLES: Record<SubmissionStatus, string> = {
  Sent: "text-neutral-400 bg-white/[0.05]",
  "In Progress": "text-amber-300/80 bg-amber-400/10",
  "Check Inbox": "text-[#D39448] bg-[#D39448]/20",
  Cancelled: "text-neutral-500 bg-white/[0.04]",
  Finished: "text-emerald-300/80 bg-emerald-400/10",
};

type ConceptFilter = "all" | "Used" | "Unused";

export function CollectionWorkspace({
  collection,
  creators,
  allCollections,
  saveError,
  siblingCollections,
  onBack,
  backLabel,
  onUpdateNotes,
  onReopen,
  onRemoveVideo,
  onSetConceptStatus,
  onSetConceptNotes,
  onSendSubmission,
  onStartNext,
  onSwitchCollection,
  onRestore,
  onReassignConcept,
  onAssignConceptToAnother,
}: {
  collection: Collection;
  creators: Creator[];
  // Every creator's collections, workspace-wide — needed to offer real
  // destination collections when assigning a concept to another creator
  // (siblingCollections below is only this collection's own version family).
  allCollections: Collection[];
  saveError?: string | null;
  siblingCollections: { id: string; name: string; status: CollectionStatus }[];
  onBack: () => void;
  backLabel: string;
  onUpdateNotes: (notes: string) => void;
  // Status itself is never client-writable — Draft -> Sent happens
  // automatically when a submission goes out, and Sent -> Completed only
  // when ReelForge Internal marks the production finished. This is the one
  // deliberate exception: reopening a Completed Collection back to Draft for
  // a new round of work, without touching its existing submission history.
  onReopen: () => void;
  onRemoveVideo: (videoId: string) => void;
  onSetConceptStatus: (videoId: string, status: ConceptStatus) => void;
  onSetConceptNotes: (videoId: string, notes: string) => void;
  onSendSubmission: (note: string) => void;
  // The next version's name is always computed fresh by the store at the
  // moment of creation — this component only supplies a display preview.
  onStartNext: () => void;
  onSwitchCollection: (id: string) => void;
  // Present only when viewing this Collection from the Archive — restores
  // the whole family (every version) back to the active list together.
  onRestore?: () => void;
  onReassignConcept: (videoId: string, targetCreatorId: string, targetCollectionId: string | undefined) => Promise<{ error: string | null }>;
  onAssignConceptToAnother: (videoId: string, targetCreatorId: string, targetCollectionId: string | undefined) => Promise<{ error: string | null }>;
}) {
  const archived = !!collection.archivedAt;
  const [notes, setNotes] = useState(collection.notes);
  const [sendOpen, setSendOpen] = useState(false);
  const [conceptFilter, setConceptFilter] = useState<ConceptFilter>("all");
  const [inboxNoteId, setInboxNoteId] = useState<string | null>(null);
  const notesSaveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // A saved Concept never has its own play_addr persisted (TikTok's signed
  // CDN URLs expire in ~24-48h, so a stored one would eventually just 404)
  // — opening one for playback re-resolves it live from its sourceUrl, then
  // plays it in the exact same ReelDetailModal the Hub uses.
  const [detailConceptId, setDetailConceptId] = useState<string | null>(null);
  const [detailVideo, setDetailVideo] = useState<ReelVideo | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const creator = creators.find((c) => c.id === collection.creatorId);
  const family = collectionFamily(collection.name, [
    { id: collection.id, name: collection.name, status: collection.status },
    ...siblingCollections,
  ]);
  // Display preview only — the actual name is always recomputed fresh by the
  // store at creation time (see createNextVersion). Must include `family`'s
  // full set (which already includes this collection itself): the current
  // version already occupies its own slot (e.g. "Foo 2"), so a names list
  // that excluded it would suggest that same slot again.
  const suggestedName = nextCollectionName(collection.name, family.map((f) => f.name));

  useEffect(() => {
    return () => clearTimeout(notesSaveTimeout.current);
  }, []);

  function handleNotesChange(value: string) {
    setNotes(value);
    clearTimeout(notesSaveTimeout.current);
    notesSaveTimeout.current = setTimeout(() => onUpdateNotes(value), 500);
  }

  async function openConceptDetail(concept: CollectionConcept) {
    setDetailConceptId(concept.video.id);
    setDetailVideo(null);
    setDetailError(null);
    setDetailLoading(true);
    const { results, error } = await resolveReelVideo(concept.video.platform, concept.video.sourceUrl);
    setDetailLoading(false);
    if (error || results.length === 0) {
      setDetailError(error ?? "Couldn't load this video.");
      return;
    }
    // The resolved video's own id is a fresh `tt-<awemeId>` — keep the
    // Concept's real (DB row) id instead so prev/next indexing below still
    // matches it, and prefer the Concept's already-working thumbnail (the
    // resolve endpoint's own cover is HEIC-first and won't render in most
    // browsers) over the freshly resolved one.
    setDetailVideo({
      ...results[0],
      id: concept.video.id,
      thumbnailUrl: concept.video.thumbnailUrl ?? results[0].thumbnailUrl,
      thumbGradient: concept.video.thumbGradient,
      saved: true,
      used: concept.status === "Used",
    });
  }

  function closeConceptDetail() {
    setDetailConceptId(null);
    setDetailVideo(null);
    setDetailError(null);
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
  const detailIndex = visibleConcepts.findIndex((c) => c.video.id === detailConceptId);

  return (
    <div className="h-full overflow-y-auto animate-fade-in">
      <div className="max-w-[1360px] mx-auto px-8 pt-6 pb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12px] text-neutral-500 hover:text-neutral-200 transition-colors duration-150 mb-4"
        >
          <ArrowLeft size={13} />
          {backLabel}
        </button>

        {saveError && (
          <p className="mb-4 text-[12px] text-rose-300/85 rounded-lg surface-field px-3 py-2 max-w-lg">
            {saveError}
          </p>
        )}

        {archived && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg surface-field px-3.5 py-2.5">
            <p className="text-[12px] text-neutral-400">
              This Collection is archived
              {family.length > 1 ? " — restoring brings back every version." : "."}
            </p>
            {onRestore && (
              <button
                onClick={onRestore}
                className="shrink-0 flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-[#D39448]/15 text-[#D39448] text-[11.5px] font-medium hover:bg-[#D39448]/25 transition-colors"
              >
                <ArchiveRestore size={12} />
                Restore
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-6 flex-wrap pb-3 border-b border-white/[0.06]">
          <div>
            <div className="flex items-center gap-2">
              {!archived && isVersionableCollection(collection.name) ? (
                <CollectionVersionMenu
                  family={family}
                  currentId={collection.id}
                  nextName={suggestedName}
                  onSwitch={onSwitchCollection}
                  onCreateNext={onStartNext}
                >
                  <h1 className="text-[19px] font-serif font-medium text-neutral-50 cursor-default">
                    {collection.name}
                    {family.length > 1 && (
                      <span className="ml-2 text-[11px] font-sans font-normal text-neutral-600">
                        {family.length} versions
                      </span>
                    )}
                  </h1>
                </CollectionVersionMenu>
              ) : (
                <h1 className="text-[19px] font-serif font-medium text-neutral-50">
                  {collection.name}
                  {family.length > 1 && (
                    <span className="ml-2 text-[11px] font-sans font-normal text-neutral-600">
                      {family.length} versions
                    </span>
                  )}
                </h1>
              )}

              {/* Read-only — Draft/Sent/Completed reflect real submission
                  state (set automatically), never a manual client pick. */}
              <span
                className={[
                  "text-[10px] font-medium px-1.5 py-[2px] rounded-[4px]",
                  COLLECTION_STATUS_STYLES[collection.status],
                ].join(" ")}
              >
                {collection.status}
              </span>

              {!archived && collection.status === "Completed" && (
                <button
                  onClick={onReopen}
                  title="Reopens this version for a new round of work — its finished production history stays intact."
                  className="flex items-center gap-1 text-[10.5px] text-neutral-500 hover:text-[#D39448] transition-colors"
                >
                  <RotateCcw size={10} />
                  Make Draft Again
                </button>
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
            creators={creators}
            collections={allCollections}
            currentCreatorId={collection.creatorId}
            onStatusChange={onSetConceptStatus}
            onRemove={onRemoveVideo}
            onNotesChange={onSetConceptNotes}
            onOpen={openConceptDetail}
            onReassign={onReassignConcept}
            onAssignToAnother={onAssignConceptToAnother}
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
                    <PackageCheck size={11} className="text-[#D39448]" />
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
                    : "bg-[#D39448] text-[#020508] hover:brightness-110 transition-[filter] duration-150",
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
                            {s.eta && s.status !== "Finished" && s.status !== "Cancelled" && (
                              <> · ETA {s.eta}</>
                            )}
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
                          {s.status === "Cancelled" && <Ban size={10} />}
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
                          className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-neutral-400 hover:text-[#D39448] transition-colors duration-150"
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
                    <div className="mt-[5px] w-1 h-1 rounded-full bg-[#D39448]/60 shrink-0" />
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

      {/* Shown while re-resolving a Concept's playable video (or if that
          fails) — the real detail modal below only ever renders once a
          video has actually loaded. */}
      {detailConceptId && !detailVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-[3px] animate-fade-in">
          <div className="rounded-2xl bg-[#141416] border border-white/[0.09] shadow-2xl px-6 py-5 text-center max-w-xs">
            {detailLoading ? (
              <>
                <Loader2 size={18} className="mx-auto animate-spin text-neutral-400" />
                <p className="mt-2.5 text-[12.5px] text-neutral-400">Loading video…</p>
              </>
            ) : (
              <>
                <p className="text-[13px] text-neutral-300">{detailError ?? "Couldn't load this video."}</p>
                <button
                  onClick={closeConceptDetail}
                  className="mt-3 text-[12px] text-[#D39448] hover:brightness-110 transition-[filter]"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <ReelDetailModal
        video={detailVideo}
        open={!!detailVideo}
        creator={creator}
        onClose={closeConceptDetail}
        onPrev={() => {
          if (detailIndex > 0) void openConceptDetail(visibleConcepts[detailIndex - 1]);
        }}
        onNext={() => {
          if (detailIndex >= 0 && detailIndex < visibleConcepts.length - 1) {
            void openConceptDetail(visibleConcepts[detailIndex + 1]);
          }
        }}
        hasPrev={detailIndex > 0}
        hasNext={detailIndex >= 0 && detailIndex < visibleConcepts.length - 1}
      />
    </div>
  );
}
