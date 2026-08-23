import { useState } from "react";
import { Check, Heart, Library as LibraryIcon } from "lucide-react";
import type { Collection, Creator, RegenerationReason } from "../../types";
import { DriveGlyph } from "../collections/DriveGlyph";
import { FinishedBatchView } from "./FinishedBatchView";
import { DEFAULT_THUMB_GRADIENT } from "../../data/mockData";

interface DeliveredBatch {
  submissionId: string;
  index: number;
  sentAt: string;
  deliveryUrl?: string;
  collectionId: string;
  collectionName: string;
  conceptCount: number;
  thumbGradients: string[];
  creator?: Creator;
  favorited: boolean;
  approvedAt?: string;
}

export function LibraryPage({
  creators,
  collections,
  onRequestRegeneration,
  onToggleFavorite,
  onApprove,
  onUploadFinishedVideo,
}: {
  creators: Creator[];
  collections: Collection[];
  onRequestRegeneration: (
    collectionId: string,
    submissionIndex: number,
    conceptId: string,
    reason: RegenerationReason,
    note: string
  ) => void;
  onToggleFavorite: (collectionId: string, submissionId: string, favorited: boolean) => void;
  onApprove: (collectionId: string, submissionId: string) => void;
  onUploadFinishedVideo: (collectionId: string, conceptId: string, file: File) => Promise<{ error: string | null }>;
}) {
  const [openSubmissionId, setOpenSubmissionId] = useState<string | null>(null);

  const batches: DeliveredBatch[] = collections
    .flatMap((c) =>
      c.submissions
        .filter((s) => s.status === "Finished")
        .map((s) => ({
          submissionId: s.id,
          index: s.index,
          sentAt: s.sentAt,
          deliveryUrl: s.deliveryUrl,
          collectionId: c.id,
          collectionName: c.name,
          conceptCount: s.conceptIds.length,
          thumbGradients: c.concepts
            .filter((concept) => s.conceptIds.includes(concept.video.id))
            .slice(0, 4)
            .map((concept) => concept.video.thumbGradient ?? DEFAULT_THUMB_GRADIENT),
          creator: creators.find((cr) => cr.id === c.creatorId),
          favorited: s.favorited,
          approvedAt: s.approvedAt,
        }))
    )
    .sort((a, b) => Number(b.favorited) - Number(a.favorited) || b.sentAt.localeCompare(a.sentAt));

  // The Finished view is a separate, locked read-only page — never the live
  // Collection editor. It's derived fresh from `collections` on every render
  // so uploads/regeneration requests made inside it show up immediately.
  if (openSubmissionId) {
    const collection = collections.find((c) => c.submissions.some((s) => s.id === openSubmissionId));
    const submission = collection?.submissions.find((s) => s.id === openSubmissionId);
    if (collection && submission) {
      return (
        <FinishedBatchView
          collection={collection}
          submission={submission}
          creator={creators.find((cr) => cr.id === collection.creatorId)}
          onBack={() => setOpenSubmissionId(null)}
          onRequestRegeneration={(conceptId, reason, note) =>
            onRequestRegeneration(collection.id, submission.index, conceptId, reason, note)
          }
          onUploadFinishedVideo={(conceptId, file) => onUploadFinishedVideo(collection.id, conceptId, file)}
          onToggleFavorite={() => onToggleFavorite(collection.id, submission.id, !submission.favorited)}
          onApprove={() => onApprove(collection.id, submission.id)}
        />
      );
    }
    setOpenSubmissionId(null);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1240px] mx-auto px-8 pt-6 pb-8">
        <span className="text-[10.5px] tracking-[0.14em] uppercase text-[#D39448]/75 font-medium">Library</span>
        <h1 className="mt-1 text-[20px] font-serif font-medium text-neutral-50">Delivered content</h1>
        <p className="mt-1 text-[12.5px] text-neutral-500 max-w-lg">
          Every finished batch from ReelForge — locked copies, ready to review.
        </p>

        {batches.length === 0 && (
          <div className="mt-6 rounded-xl surface-panel py-20 text-center">
            <LibraryIcon size={20} className="mx-auto text-neutral-700 mb-2" />
            <p className="text-[13px] text-neutral-400">Nothing delivered yet.</p>
            <p className="text-[12px] text-neutral-600 mt-1">Finished submissions will show up here automatically.</p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {batches.map((b) => (
            <div
              key={b.submissionId}
              className="group rounded-xl border border-white/[0.07] bg-white/[0.015] hover:border-white/[0.14] hover:bg-white/[0.025] transition-colors duration-150 overflow-hidden"
            >
              <div className="relative">
                <button onClick={() => setOpenSubmissionId(b.submissionId)} className="block w-full text-left">
                  <div className="grid grid-cols-2 grid-rows-2 gap-[1.5px] bg-black/30 aspect-video">
                    {Array.from({ length: 4 }).map((_, i) =>
                      b.thumbGradients[i] ? (
                        <div key={i} style={{ background: b.thumbGradients[i] }} />
                      ) : (
                        <div key={i} className="bg-white/[0.03]" />
                      )
                    )}
                  </div>
                </button>
                <button
                  onClick={() => onToggleFavorite(b.collectionId, b.submissionId, !b.favorited)}
                  title={b.favorited ? "Unfavorite" : "Favorite"}
                  className={[
                    "absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center transition-all duration-150",
                    b.favorited ? "text-rose-400 opacity-100" : "text-white opacity-0 group-hover:opacity-100",
                  ].join(" ")}
                >
                  <Heart size={13} fill={b.favorited ? "currentColor" : "none"} />
                </button>
              </div>
              <div className="p-3.5">
                <button onClick={() => setOpenSubmissionId(b.submissionId)} className="block w-full text-left">
                  <div className="flex items-center gap-2 mb-1.5">
                    {b.creator && (
                      <div
                        className="rounded-full shrink-0 ring-1 ring-white/15 overflow-hidden"
                        style={{ width: 18, height: 18, ...(b.creator.profileImage ? {} : { background: b.creator.avatarColor }) }}
                      >
                        {b.creator.profileImage && (
                          <img src={b.creator.profileImage} alt={b.creator.name} className="w-full h-full object-cover" />
                        )}
                      </div>
                    )}
                    <span className="text-[11.5px] text-neutral-400 truncate">{b.creator?.name ?? "Unknown creator"}</span>
                  </div>
                  <h3 className="text-[13.5px] font-medium text-neutral-100 truncate">
                    {b.collectionName} <span className="text-neutral-600 font-normal">· #{b.index}</span>
                  </h3>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    {b.conceptCount} concept{b.conceptCount === 1 ? "" : "s"} · {b.sentAt}
                  </p>
                </button>

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  {b.deliveryUrl ? (
                    <a
                      href={b.deliveryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 text-[11.5px] text-neutral-300 hover:text-[#D39448] transition-colors duration-150"
                    >
                      <DriveGlyph size={13} />
                      Open in Drive
                    </a>
                  ) : (
                    <span />
                  )}
                  {b.approvedAt && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-300/80">
                      <Check size={11} />
                      Approved
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
