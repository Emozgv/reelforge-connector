import { useEffect, useState } from "react";
import { X, Check, Send, AlertTriangle } from "lucide-react";

type Step = "confirm" | "warn" | "done";

export function SendToReelForgePanel({
  open,
  creatorName,
  collectionName,
  totalCount,
  overlapCount,
  onClose,
  onConfirm,
}: {
  open: boolean;
  creatorName: string;
  collectionName: string;
  totalCount: number;
  overlapCount: number;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [step, setStep] = useState<Step>("confirm");

  useEffect(() => {
    if (open) {
      setNote("");
      setStep("confirm");
    }
  }, [open]);

  if (!open) return null;

  function send() {
    onConfirm(note);
    setStep("done");
    setTimeout(onClose, 900);
  }

  function handlePrimaryClick() {
    if (overlapCount > 0) {
      setStep("warn");
    } else {
      send();
    }
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[3px] animate-fade-in" />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[400px] rounded-2xl bg-[#141416] border border-white/[0.09] shadow-2xl animate-rise-in overflow-hidden">
          {step === "done" ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 px-6">
              <div className="w-10 h-10 rounded-full bg-[#d7a463] flex items-center justify-center">
                <Check size={18} className="text-[#0a0a0c]" strokeWidth={2.5} />
              </div>
              <p className="text-[13.5px] text-neutral-200 text-center">
                {totalCount} concept{totalCount === 1 ? "" : "s"} sent to ReelForge
              </p>
            </div>
          ) : step === "warn" ? (
            <>
              <div className="flex items-center justify-between px-5 h-14 border-b border-white/[0.07]">
                <h2 className="text-[15px] font-serif font-medium text-neutral-50">Resend concepts?</h2>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.06] transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="px-5 pt-4 pb-5">
                <div className="rounded-lg surface-field p-3.5 flex gap-2.5">
                  <AlertTriangle size={15} className="text-[#ddb87e] mt-0.5 shrink-0" />
                  <p className="text-[12.5px] text-neutral-300 leading-relaxed">
                    <span className="text-neutral-100 font-medium">
                      {overlapCount} concept{overlapCount === 1 ? "" : "s"}
                    </span>{" "}
                    in this submission {overlapCount === 1 ? "was" : "were"} already sent to ReelForge. Send{" "}
                    {overlapCount === 1 ? "it" : "them"} again?
                  </p>
                </div>

                <div className="mt-3 flex items-center gap-2.5">
                  <button
                    onClick={() => setStep("confirm")}
                    className="flex-1 h-9 rounded-md text-[12.5px] font-medium text-neutral-300 hover:bg-white/[0.05] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={send}
                    className="flex-1 h-9 rounded-md flex items-center justify-center gap-1.5 bg-[#c99a5f] text-[#0a0a0c] text-[12.5px] font-medium hover:bg-[#ddb87e] transition-colors"
                  >
                    <Send size={12} />
                    Send Anyway
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 h-14 border-b border-white/[0.07]">
                <h2 className="text-[15px] font-serif font-medium text-neutral-50">Send to ReelForge</h2>
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
                    Submitting <span className="text-neutral-100 font-medium">{totalCount}</span> concept
                    {totalCount === 1 ? "" : "s"} from <span className="text-neutral-100 font-medium">{collectionName}</span> for{" "}
                    <span className="text-[#e8c896] font-medium">{creatorName}</span>.
                  </p>
                </div>
              </div>

              <div className="px-5 pt-3.5">
                <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">
                  Direction for this submission (optional)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Anything specific for this batch..."
                  className="mt-1.5 w-full resize-none rounded-lg surface-field px-3 py-2 text-[12px] text-neutral-300 placeholder:text-neutral-600 outline-none focus:border-[#d7a463]/40 transition-colors"
                />
              </div>

              <div className="px-5 py-4">
                <button
                  disabled={totalCount === 0}
                  onClick={handlePrimaryClick}
                  className="w-full h-10 rounded-lg flex items-center justify-center gap-2 bg-[#d7a463] text-[#0a0a0c] text-[13px] font-medium disabled:opacity-40 hover:bg-[#e2b57c] transition-colors"
                >
                  <Send size={13} />
                  Confirm &amp; Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
