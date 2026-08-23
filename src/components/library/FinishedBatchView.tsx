import { useRef, useState } from "react";
import { ArrowLeft, Check, Heart, Lock, RotateCcw, UploadCloud } from "lucide-react";
import type { Collection, CollectionConcept, Creator, RegenerationReason, Submission } from "../../types";
import { isFreeReason } from "../../lib/regenerationMapping";
import { DriveGlyph } from "../collections/DriveGlyph";

const REASONS: RegenerationReason[] = [
  "Body",
  "Face",
  "Tattoos",
  "Outfit",
  "Movement",
  "Scene",
  "Technical issue",
  "Creative preference",
  "Other",
];

function ReelRow({
  concept,
  active,
  pending,
  uploading,
  onSelect,
  onUpload,
}: {
  concept: CollectionConcept;
  active: boolean;
  pending: boolean;
  uploading: boolean;
  onSelect: () => void;
  onUpload: (file: File) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onClick={onSelect}
      className={[
        "grid grid-cols-2 gap-3 rounded-xl border p-2.5 cursor-pointer transition-colors duration-150",
        active ? "border-[#c99a5f]/40 bg-[#c99a5f]/[0.05]" : "border-white/[0.07] hover:border-white/[0.14]",
      ].join(" ")}
    >
      <div>
        <p className="mb-1.5 text-[10px] tracking-wide uppercase text-neutral-600">Reference</p>
        <div className="relative aspect-[9/16] rounded-lg overflow-hidden" style={{ background: concept.video.thumbGradient }}>
          <span className="absolute bottom-1.5 left-1.5 text-[10.5px] text-white/90 font-medium">
            @{concept.video.username}
          </span>
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[10px] tracking-wide uppercase text-neutral-600">Delivered</p>
        {concept.finishedVideoUrl ? (
          <a
            href={concept.finishedVideoUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="relative aspect-[9/16] rounded-lg overflow-hidden flex items-center justify-center bg-black/40 border border-white/10 hover:border-[#d7a463]/40 transition-colors duration-150"
          >
            <video src={concept.finishedVideoUrl} className="w-full h-full object-cover" muted />
          </a>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="w-full aspect-[9/16] rounded-lg border border-dashed border-white/15 flex flex-col items-center justify-center gap-1.5 text-neutral-500 hover:text-neutral-300 hover:border-white/25 transition-colors duration-150"
          >
            {uploading ? (
              <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <>
                <UploadCloud size={16} />
                <span className="text-[10.5px]">Upload video</span>
              </>
            )}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onUpload(file);
          }}
        />
      </div>
      {pending && (
        <div className="col-span-2 flex items-center gap-1.5 text-[10.5px] text-[#e8c896]">
          <RotateCcw size={10} />
          Regeneration requested
        </div>
      )}
    </div>
  );
}

export function FinishedBatchView({
  collection,
  submission,
  creator,
  onBack,
  onRequestRegeneration,
  onUploadFinishedVideo,
  onToggleFavorite,
  onApprove,
}: {
  collection: Collection;
  submission: Submission;
  creator?: Creator;
  onBack: () => void;
  onRequestRegeneration: (conceptId: string, reason: RegenerationReason, note: string) => void;
  onUploadFinishedVideo: (conceptId: string, file: File) => Promise<{ error: string | null }>;
  onToggleFavorite: () => void;
  onApprove: () => void;
}) {
  const reels = collection.concepts.filter((c) => submission.conceptIds.includes(c.video.id));
  const [selectedId, setSelectedId] = useState<string | undefined>(reels[0]?.video.id);
  const [reason, setReason] = useState<RegenerationReason>(REASONS[0]);
  const [note, setNote] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const selected = reels.find((r) => r.video.id === selectedId) ?? reels[0];
  const pendingForSelected = selected
    ? collection.regenerationRequests.some((r) => r.conceptId === selected.video.id && r.status !== "Done")
    : false;

  async function handleUpload(conceptId: string, file: File) {
    setUploadingId(conceptId);
    await onUploadFinishedVideo(conceptId, file);
    setUploadingId(null);
  }

  function submitRegeneration() {
    if (!selected) return;
    onRequestRegeneration(selected.video.id, reason, note);
    setNote("");
    setSent(true);
    setTimeout(() => setSent(false), 1800);
  }

  return (
    <div className="h-full overflow-y-auto animate-fade-in">
      <div className="max-w-[1200px] mx-auto px-8 pt-6 pb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12px] text-neutral-500 hover:text-neutral-200 transition-colors duration-150 mb-4"
        >
          <ArrowLeft size={13} />
          Library
        </button>

        <div className="flex items-center justify-between gap-6 flex-wrap pb-3 border-b border-white/[0.06]">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[19px] font-serif font-medium text-neutral-50">{collection.name}</h1>
              <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-[2px] rounded-[4px] text-neutral-500 bg-white/[0.05]">
                <Lock size={9} />
                Finished · read-only
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-neutral-500">
              {creator && <div className="w-4 h-4 rounded-full" style={{ background: creator.avatarColor }} />}
              <span>{creator?.name ?? "Unknown creator"}</span>
              <span className="text-neutral-700">·</span>
              <span>Submission #{submission.index} · {submission.sentAt}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleFavorite}
              className={[
                "h-9 px-3.5 rounded-lg flex items-center gap-1.5 text-[12.5px] font-medium transition-colors duration-150",
                submission.favorited
                  ? "bg-rose-400/10 text-rose-300"
                  : "text-neutral-400 hover:text-rose-300 hover:bg-rose-400/[0.06]",
              ].join(" ")}
            >
              <Heart size={13} fill={submission.favorited ? "currentColor" : "none"} />
              {submission.favorited ? "Favorited" : "Favorite"}
            </button>
            {submission.approvedAt ? (
              <span className="h-9 px-3.5 rounded-lg flex items-center gap-1.5 text-[12.5px] text-emerald-300/80">
                <Check size={13} />
                Approved
              </span>
            ) : (
              <button
                onClick={onApprove}
                className="h-9 px-3.5 rounded-lg flex items-center gap-1.5 text-[12.5px] font-medium text-neutral-400 hover:text-emerald-300 hover:bg-emerald-400/[0.06] transition-colors duration-150"
              >
                <Check size={13} />
                Approve
              </button>
            )}
            {submission.deliveryUrl && (
              <a
                href={submission.deliveryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-3.5 rounded-lg flex items-center gap-1.5 text-[12.5px] font-medium bg-[#c99a5f] text-[#0a0a0c] hover:bg-[#ddb87e] transition-colors duration-150"
              >
                <DriveGlyph size={13} />
                Open in Drive
              </a>
            )}
          </div>
        </div>

        <p className="mt-3 mb-4 text-[11.5px] text-neutral-600 leading-relaxed max-w-xl">
          This is the delivered copy of "{collection.name}" — locked, so what shipped stays exactly what shipped.
          Keep working on new concepts back in Collections.
        </p>

        <div className="grid grid-cols-[1fr_300px] gap-5 items-start">
          <div className="space-y-2.5">
            {reels.map((r) => (
              <ReelRow
                key={r.video.id}
                concept={r}
                active={selected?.video.id === r.video.id}
                pending={collection.regenerationRequests.some((req) => req.conceptId === r.video.id && req.status !== "Done")}
                uploading={uploadingId === r.video.id}
                onSelect={() => setSelectedId(r.video.id)}
                onUpload={(file) => handleUpload(r.video.id, file)}
              />
            ))}
          </div>

          <div className="sticky top-0 rounded-lg surface-panel p-3.5">
            <h2 className="text-[13px] font-medium text-neutral-100 flex items-center gap-1.5">
              <RotateCcw size={13} className="text-[#ddb87e]" />
              Regeneration
            </h2>
            {selected ? (
              <>
                <p className="mt-1 text-[11.5px] text-neutral-500">@{selected.video.username}</p>

                {pendingForSelected ? (
                  <p className="mt-3 text-[12px] text-[#e8c896] leading-relaxed">
                    A regeneration request is already open for this reel.
                  </p>
                ) : sent ? (
                  <div className="mt-4 flex flex-col items-center gap-2 py-4">
                    <div className="w-8 h-8 rounded-full bg-[#d7a463] flex items-center justify-center">
                      <Check size={15} className="text-[#0a0a0c]" strokeWidth={2.5} />
                    </div>
                    <p className="text-[12px] text-neutral-300">Requested</p>
                  </div>
                ) : (
                  <>
                    <div className="mt-3">
                      <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">What's off</label>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {REASONS.map((r) => (
                          <button
                            key={r}
                            onClick={() => setReason(r)}
                            className={[
                              "text-[11.5px] px-2 py-1 rounded-full border transition-all duration-200 ease-out",
                              reason === r
                                ? "border-[#d7a463]/50 bg-[#d7a463]/[0.14] text-[#e8c896]"
                                : "border-white/[0.08] text-neutral-400 hover:text-neutral-200 hover:border-white/[0.16]",
                            ].join(" ")}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                      <p
                        className={[
                          "mt-2 text-[11px] leading-relaxed",
                          isFreeReason(reason) ? "text-emerald-300/80" : "text-[#e8c896]/80",
                        ].join(" ")}
                      >
                        {isFreeReason(reason)
                          ? "Quality issue — free replacement."
                          : "Creative change — may be billable."}
                      </p>
                    </div>

                    <div className="mt-3">
                      <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">Note (optional)</label>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                        placeholder="What should change..."
                        className="mt-1.5 w-full resize-none rounded-lg surface-field px-3 py-2 text-[12px] text-neutral-300 placeholder:text-neutral-600 outline-none focus-glow"
                      />
                    </div>

                    <button
                      onClick={submitRegeneration}
                      className="mt-3 w-full h-9 rounded-lg flex items-center justify-center gap-2 bg-[#d7a463] text-[#0a0a0c] text-[12.5px] font-medium hover:bg-[#e2b57c] transition-colors press-feedback"
                    >
                      <RotateCcw size={13} />
                      Send request
                    </button>
                  </>
                )}
              </>
            ) : (
              <p className="mt-2 text-[12px] text-neutral-500">Select a reel to request a regeneration.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
