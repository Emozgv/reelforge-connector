import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";

export function NewCreatorPanel({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, handle: string) => Promise<{ error: string | null }>;
}) {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setHandle("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  async function handleCreate() {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await onCreate(name.trim(), handle.trim());
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
    } else {
      onClose();
    }
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[3px] animate-fade-in" />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[380px] rounded-2xl bg-[#141416] border border-white/[0.09] shadow-2xl animate-rise-in overflow-hidden">
          <div className="flex items-center justify-between px-5 h-14 border-b border-white/[0.07]">
            <h2 className="text-[15px] font-serif font-medium text-neutral-50">New Creator</h2>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.06] transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          <div className="px-5 py-4 space-y-3.5">
            <div>
              <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">Name</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                placeholder="e.g. Morgan Lee"
                className="mt-1.5 w-full h-10 rounded-lg surface-field px-3 text-[13px] text-neutral-100 placeholder:text-neutral-600 outline-none focus-glow"
              />
            </div>

            <div>
              <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">Handle (optional)</label>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                placeholder="@morganlee"
                className="mt-1.5 w-full h-10 rounded-lg surface-field px-3 text-[13px] text-neutral-100 placeholder:text-neutral-600 outline-none focus-glow"
              />
            </div>

            {error && (
              <p className="text-[12px] text-rose-300/85 rounded-lg surface-field px-3 py-2 leading-relaxed">
                {error}
              </p>
            )}
          </div>

          <div className="px-5 pb-5">
            <button
              disabled={!name.trim() || submitting}
              onClick={handleCreate}
              className="w-full h-10 rounded-lg flex items-center justify-center gap-2 bg-[#d7a463] text-[#0a0a0c] text-[13px] font-medium disabled:opacity-40 hover:bg-[#e2b57c] transition-colors press-feedback"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting ? "Creating..." : "Create Creator"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
