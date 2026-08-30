import { useEffect, useState } from "react";
import { X, Check, AlertTriangle } from "lucide-react";

// Deliberately separate from SendToReelForgePanel — different action
// (create_syd_submission), different destination, different visibility
// rules. Only ever rendered when the caller has already confirmed
// isSydOwner (see CollectionWorkspace.tsx), and the RPC re-checks that
// server-side regardless.
export function SendToSydPanel({
  open,
  collectionName,
  onClose,
  onConfirm,
}: {
  open: boolean;
  collectionName: string;
  onClose: () => void;
  onConfirm: (note: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote("");
      setSending(false);
      setDone(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  async function send() {
    setSending(true);
    setError(null);
    const result = await onConfirm(note);
    setSending(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't send to Sydney — please try again.");
      return;
    }
    setDone(true);
    setTimeout(onClose, 900);
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[3px] animate-fade-in" />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[380px] rounded-2xl bg-[#141416] border border-[#D39448]/25 shadow-2xl animate-rise-in overflow-hidden">
          {done ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 px-6">
              <div className="w-10 h-10 rounded-full bg-[#D39448] flex items-center justify-center">
                <Check size={18} className="text-[#020508]" strokeWidth={2.5} />
              </div>
              <p className="text-[13.5px] text-neutral-200 text-center">Sent to Sydney Studio (private)</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 h-14 border-b border-white/[0.07]">
                <h2 className="text-[15px] font-serif font-medium text-neutral-50">Send to SYD</h2>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.06] transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="px-5 pt-4">
                <div className="rounded-lg surface-field p-3.5 flex gap-2.5">
                  <AlertTriangle size={14} className="text-[#D39448] mt-0.5 shrink-0" />
                  <p className="text-[12px] text-neutral-300 leading-relaxed">
                    Private, owner-only request. <span className="text-neutral-100 font-medium">{collectionName}</span> will
                    go to Sydney Studio Internal only — never to normal ReelForge queues or customer activity.
                  </p>
                </div>
              </div>
              <div className="px-5 pt-3.5">
                <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">Note (optional)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Anything specific for Sydney..."
                  className="mt-1.5 w-full resize-none rounded-lg surface-field px-3 py-2 text-[12px] text-neutral-300 placeholder:text-neutral-600 outline-none focus-glow"
                />
              </div>
              {error && (
                <div className="px-5 pt-3.5">
                  <div className="rounded-lg bg-red-500/[0.08] border border-red-500/20 p-3 flex gap-2">
                    <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
                    <p className="text-[12px] text-red-300 leading-relaxed">{error}</p>
                  </div>
                </div>
              )}
              <div className="px-5 py-4">
                <button
                  disabled={sending}
                  onClick={() => void send()}
                  className="w-full h-10 rounded-lg flex items-center justify-center gap-2 bg-[#D39448] text-[#020508] text-[13px] font-medium disabled:opacity-40 hover:brightness-110 transition-[filter] press-feedback"
                >
                  {sending ? "Sending…" : "Confirm & Send to SYD"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
