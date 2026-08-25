import { Ban, Clapperboard, Inbox, PackageCheck } from "lucide-react";
import type { Collection, Creator, SubmissionStatus } from "../../types";
import { DriveGlyph } from "../collections/DriveGlyph";

const SUBMISSION_STATUS_STYLES: Record<SubmissionStatus, string> = {
  Sent: "text-neutral-400 bg-white/[0.05]",
  "In Progress": "text-amber-300/80 bg-amber-400/10",
  "Check Inbox": "text-[#D39448] bg-[#D39448]/20",
  Cancelled: "text-neutral-500 bg-white/[0.04]",
  Finished: "text-emerald-300/80 bg-emerald-400/10",
};

interface ProductionRow {
  submissionId: string;
  index: number;
  status: SubmissionStatus;
  sentAt: string;
  eta?: string;
  conceptCount: number;
  deliveryUrl?: string;
  collectionId: string;
  collectionName: string;
  creator?: Creator;
}

export function ProductionPage({
  creators,
  collections,
  onOpenCollection,
}: {
  creators: Creator[];
  collections: Collection[];
  onOpenCollection: (collectionId: string) => void;
}) {
  const rows: ProductionRow[] = collections
    .flatMap((c) =>
      c.submissions.map((s) => ({
        submissionId: s.id,
        index: s.index,
        status: s.status,
        sentAt: s.sentAt,
        eta: s.eta,
        conceptCount: s.conceptIds.length,
        deliveryUrl: s.deliveryUrl,
        collectionId: c.id,
        collectionName: c.name,
        creator: creators.find((cr) => cr.id === c.creatorId),
      }))
    )
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));

  const active = rows.filter((r) => r.status !== "Finished" && r.status !== "Cancelled");
  const finished = rows.filter((r) => r.status === "Finished");
  const cancelled = rows.filter((r) => r.status === "Cancelled");

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1080px] mx-auto px-8 pt-6 pb-8">
        <span className="text-[10.5px] tracking-[0.14em] uppercase text-[#D39448]/75 font-medium">
          Production
        </span>
        <h1 className="mt-1 text-[20px] font-serif font-medium text-neutral-50">
          Everything currently in the pipeline
        </h1>
        <p className="mt-1 text-[12.5px] text-neutral-500 max-w-lg">
          Every submission across every creator, in one place — so you never have to ask "how far are you?"
        </p>

        {rows.length === 0 && (
          <div className="mt-6 rounded-xl surface-panel py-16 text-center">
            <Clapperboard size={20} className="mx-auto text-neutral-700 mb-2" />
            <p className="text-[13px] text-neutral-400">Nothing sent to ReelForge yet.</p>
            <p className="text-[12px] text-neutral-600 mt-1">
              Send a collection from its workspace and it'll show up here.
            </p>
          </div>
        )}

        {active.length > 0 && (
          <div className="mt-6">
            <h2 className="text-[13px] font-medium text-neutral-200 mb-2">In progress</h2>
            <div className="rounded-xl surface-panel divide-y divide-white/[0.05] [&>*:first-child]:rounded-t-xl [&>*:last-child]:rounded-b-xl">
              {active.map((r) => (
                <ProductionRowItem key={r.submissionId} row={r} onOpenCollection={onOpenCollection} />
              ))}
            </div>
          </div>
        )}

        {finished.length > 0 && (
          <div className="mt-7">
            <h2 className="text-[13px] font-medium text-neutral-200 mb-2 flex items-center gap-1.5">
              <PackageCheck size={13} className="text-[#D39448]" />
              Finished
            </h2>
            <div className="rounded-xl surface-panel divide-y divide-white/[0.05] [&>*:first-child]:rounded-t-xl [&>*:last-child]:rounded-b-xl">
              {finished.map((r) => (
                <ProductionRowItem key={r.submissionId} row={r} onOpenCollection={onOpenCollection} />
              ))}
            </div>
          </div>
        )}

        {cancelled.length > 0 && (
          <div className="mt-7">
            <h2 className="text-[13px] font-medium text-neutral-500 mb-2 flex items-center gap-1.5">
              <Ban size={13} className="text-neutral-500" />
              Cancelled
            </h2>
            <div className="rounded-xl surface-panel divide-y divide-white/[0.05] [&>*:first-child]:rounded-t-xl [&>*:last-child]:rounded-b-xl">
              {cancelled.map((r) => (
                <ProductionRowItem key={r.submissionId} row={r} onOpenCollection={onOpenCollection} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductionRowItem({
  row,
  onOpenCollection,
}: {
  row: ProductionRow;
  onOpenCollection: (collectionId: string) => void;
}) {
  return (
    <button
      onClick={() => onOpenCollection(row.collectionId)}
      className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-white/[0.03] transition-colors duration-150 text-left"
    >
      {row.creator && (
        <div
          className="w-7 h-7 rounded-full shrink-0 ring-1 ring-white/15 overflow-hidden"
          style={row.creator.profileImage ? undefined : { background: row.creator.avatarColor }}
        >
          {row.creator.profileImage && (
            <img src={row.creator.profileImage} alt={row.creator.name} className="w-full h-full object-cover" />
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] text-neutral-100 truncate">
          {row.collectionName} <span className="text-neutral-600">· Submission #{row.index}</span>
        </p>
        <p className="text-[11px] text-neutral-500">
          {row.creator?.name ?? "Unknown creator"} · {row.conceptCount} concept{row.conceptCount === 1 ? "" : "s"} ·{" "}
          {row.sentAt}
          {row.eta && row.status !== "Finished" && row.status !== "Cancelled" && (
            <> · ETA {row.eta}</>
          )}
        </p>
      </div>
      {row.status === "Finished" && row.deliveryUrl && (
        <a
          href={row.deliveryUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-[#D39448] transition-colors duration-150 shrink-0"
        >
          <DriveGlyph size={12} />
          Drive
        </a>
      )}
      <span
        className={[
          "shrink-0 flex items-center gap-1 text-[10px] font-medium px-1.5 py-[2px] rounded-[4px]",
          SUBMISSION_STATUS_STYLES[row.status],
        ].join(" ")}
      >
        {row.status === "Check Inbox" && <Inbox size={10} />}
        {row.status === "Cancelled" && <Ban size={10} />}
        {row.status}
      </span>
    </button>
  );
}
