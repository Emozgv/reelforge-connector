import { useState } from "react";
import { Check, Heart, Library as LibraryIcon, RotateCcw } from "lucide-react";
import type { Collection, Creator, RegenerationReason } from "../../types";
import { DriveGlyph } from "../collections/DriveGlyph";
import { RegenerationPanel } from "./RegenerationPanel";

interface DeliveredReel {
  conceptId: string;
  username: string;
  thumbGradient: string;
  pendingRegeneration: boolean;
}

interface DeliveredBatch {
  submissionId: string;
  index: number;
  sentAt: string;
  deliveryUrl?: string;
  collectionId: string;
  collectionName: string;
  conceptCount: number;
  reels: DeliveredReel[];
  creator?: Creator;
  favorited: boolean;
  approvedAt?: string;
}

interface RegenTarget {
  collectionId: string;
  collectionName: string;
  submissionIndex: number;
  conceptId: string;
  username: string;
}

export function LibraryPage({
  creators,
  collections,
  onOpenCollection,
  onRequestRegeneration,
  onToggleFavorite,
  onApprove,
}: {
  creators: Creator[];
  collections: Collection[];
  onOpenCollection: (collectionId: string) => void;
  onRequestRegeneration: (
    collectionId: string,
    submissionIndex: number,
    conceptId: string,
    reason: RegenerationReason,
    note: string
  ) => void;
  onToggleFavorite: (collectionId: string, submissionId: string, favorited: boolean) => void;
  onApprove: (collectionId: string, submissionId: string) => void;
}) {
  const [regenTarget, setRegenTarget] = useState<RegenTarget | null>(null);

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
          reels: c.concepts
            .filter((concept) => s.conceptIds.includes(concept.video.id))
            .slice(0, 4)
            .map((concept) => ({
              conceptId: concept.video.id,
              username: concept.video.username,
              thumbGradient: concept.video.thumbGradient,
              pendingRegeneration: c.regenerationRequests.some(
                (r) => r.conceptId === concept.video.id && r.status !== "Done"
              ),
            })),
          creator: creators.find((cr) => cr.id === c.creatorId),
          favorited: s.favorited,
          approvedAt: s.approvedAt,
        }))
    )
    .sort((a, b) => Number(b.favorited) - Number(a.favorited) || b.sentAt.localeCompare(a.sentAt));

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1240px] mx-auto px-8 pt-6 pb-8">
        <span className="text-[10.5px] tracking-[0.14em] uppercase text-[#c99a5f]/75 font-medium">Library</span>
        <h1 className="mt-1 text-[20px] font-serif font-medium text-neutral-50">Delivered content</h1>
        <p className="mt-1 text-[12.5px] text-neutral-500 max-w-lg">
          Every finished batch from ReelForge, ready to download.
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
                <div className="grid grid-cols-2 grid-rows-2 gap-[1.5px] bg-black/30 aspect-video">
                  {Array.from({ length: 4 }).map((_, i) => {
                    const reel = b.reels[i];
                    if (!reel) return <div key={i} className="bg-white/[0.03]" />;
                    return (
                      <div key={reel.conceptId} className="group/reel relative" style={{ background: reel.thumbGradient }}>
                        <button
                          onClick={() => onOpenCollection(b.collectionId)}
                          className="absolute inset-0"
                          title={`@${reel.username}`}
                        />
                        {reel.pendingRegeneration ? (
                          <span
                            title="Regeneration requested"
                            className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-[#e8c896]"
                          >
                            <RotateCcw size={10} />
                          </span>
                        ) : (
                          <button
                            onClick={() =>
                              setRegenTarget({
                                collectionId: b.collectionId,
                                collectionName: b.collectionName,
                                submissionIndex: b.index,
                                conceptId: reel.conceptId,
                                username: reel.username,
                              })
                            }
                            title={`Regenerate @${reel.username}`}
                            className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover/reel:opacity-100 hover:bg-black/70 transition-all duration-150"
                          >
                            <RotateCcw size={10} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
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
                <button onClick={() => onOpenCollection(b.collectionId)} className="block w-full text-left">
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
                      className="inline-flex items-center gap-1.5 text-[11.5px] text-neutral-300 hover:text-[#e8c896] transition-colors duration-150"
                    >
                      <DriveGlyph size={13} />
                      Open in Drive
                    </a>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-3">
                    {b.approvedAt ? (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-300/80">
                        <Check size={11} />
                        Approved
                      </span>
                    ) : (
                      <button
                        onClick={() => onApprove(b.collectionId, b.submissionId)}
                        className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-emerald-300 opacity-0 group-hover:opacity-100 transition-all duration-150"
                      >
                        <Check size={11} />
                        Approve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <RegenerationPanel
        open={!!regenTarget}
        collectionName={regenTarget?.collectionName ?? ""}
        submissionIndex={regenTarget?.submissionIndex ?? 0}
        reelUsername={regenTarget?.username ?? ""}
        onClose={() => setRegenTarget(null)}
        onConfirm={(reason, note) => {
          if (regenTarget) {
            onRequestRegeneration(regenTarget.collectionId, regenTarget.submissionIndex, regenTarget.conceptId, reason, note);
          }
        }}
      />
    </div>
  );
}
