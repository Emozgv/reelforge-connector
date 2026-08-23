import { Library as LibraryIcon } from "lucide-react";
import type { Collection, Creator } from "../../types";
import { DriveGlyph } from "../collections/DriveGlyph";

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
}

export function LibraryPage({
  creators,
  collections,
  onOpenCollection,
}: {
  creators: Creator[];
  collections: Collection[];
  onOpenCollection: (collectionId: string) => void;
}) {
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
            .map((concept) => concept.video.thumbGradient),
          creator: creators.find((cr) => cr.id === c.creatorId),
        }))
    )
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));

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
            <button
              key={b.submissionId}
              onClick={() => onOpenCollection(b.collectionId)}
              className="text-left rounded-xl border border-white/[0.07] bg-white/[0.015] hover:border-white/[0.14] hover:bg-white/[0.025] transition-colors duration-150 overflow-hidden"
            >
              <div className="grid grid-cols-2 grid-rows-2 gap-[1.5px] bg-black/30 aspect-video">
                {Array.from({ length: 4 }).map((_, i) =>
                  b.thumbGradients[i] ? (
                    <div key={i} style={{ background: b.thumbGradients[i] }} />
                  ) : (
                    <div key={i} className="bg-white/[0.03]" />
                  )
                )}
              </div>
              <div className="p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  {b.creator && (
                    <div
                      className="w-4.5 h-4.5 rounded-full shrink-0 ring-1 ring-white/15 overflow-hidden"
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
                {b.deliveryUrl && (
                  <a
                    href={b.deliveryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] text-neutral-300 hover:text-[#e8c896] transition-colors duration-150"
                  >
                    <DriveGlyph size={13} />
                    Open in Drive
                  </a>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
