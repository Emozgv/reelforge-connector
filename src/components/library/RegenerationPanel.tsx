import { useEffect, useState } from "react";
import { X, Check, RotateCcw } from "lucide-react";
import { isFreeReason } from "../../lib/regenerationMapping";
import type { RegenerationReason } from "../../types";

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

export function RegenerationPanel({
  open,
  collectionName,
  submissionIndex,
  reelUsername,
  onClose,
  onConfirm,
}: {
  open: boolean;
  collectionName: string;
  submissionIndex: number;
  reelUsername: string;
  onClose: () => void;
  onConfirm: (reason: RegenerationReason, note: string) => void;
}) {
  const [reason, setReason] = useState<RegenerationReason>(REASONS[0]);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setReason(REASONS[0]);
      setNote("");
      setDone(false);
    }
  }, [open]);

  if (!open) return null;

  function submit() {
    onConfirm(reason, note);
    setDone(true);
    setTimeout(onClose, 900);
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[4px] animate-fade-in" />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[400px] rounded-2xl bg-[#141416] border border-white/[0.09] shadow-2xl animate-rise-in overflow-hidden">
          {done ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 px-6">
              <div className="w-10 h-10 rounded-full bg-[#d7a463] flex items-center justify-center">
                <Check size={18} className="text-[#0a0a0c]" strokeWidth={2.5} />
              </div>
              <p className="text-[13.5px] text-neutral-200 text-center">Regeneration requested</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 h-14 border-b border-white/[0.07]">
                <h2 className="text-[15px] font-serif font-medium text-neutral-50 flex items-center gap-2">
                  <RotateCcw size={14} className="text-[#ddb87e]" />
                  Request regeneration
                </h2>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.06] transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="px-5 pt-4">
                <div className="rounded-lg surface-field p-3.5">
                  <p className="text-[12.5px] text-neutral-300 leading-relaxed">
                    <span className="text-neutral-100 font-medium">@{reelUsername}</span>
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    {collectionName} · Submission #{submissionIndex}
                  </p>
                </div>
              </div>

              <div className="px-5 pt-3.5">
                <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">What's off</label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {REASONS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setReason(r)}
                      className={[
                        "text-[12px] px-2.5 py-1.5 rounded-full border transition-all duration-200 ease-out",
                        reason === r
                          ? "border-[#d7a463]/50 bg-[#d7a463]/[0.14] text-[#e8c896]"
                          : "border-white/[0.08] text-neutral-400 hover:text-neutral-200 hover:border-white/[0.16] hover:bg-white/[0.04]",
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
                    ? "Quality issue — this is a free replacement."
                    : "Creative change — this may be a billable regeneration."}
                </p>
              </div>

              <div className="px-5 pt-3.5">
                <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">Note (optional)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="What should change..."
                  className="mt-1.5 w-full resize-none rounded-lg surface-field px-3 py-2 text-[12px] text-neutral-300 placeholder:text-neutral-600 outline-none focus-glow"
                />
              </div>

              <div className="px-5 py-4">
                <button
                  onClick={submit}
                  className="w-full h-10 rounded-lg flex items-center justify-center gap-2 bg-[#d7a463] text-[#0a0a0c] text-[13px] font-medium hover:bg-[#e2b57c] transition-colors press-feedback"
                >
                  <RotateCcw size={13} />
                  Send request
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
