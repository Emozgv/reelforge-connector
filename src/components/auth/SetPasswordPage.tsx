import { useState } from "react";
import { Loader2 } from "lucide-react";
import { StarfieldBackground } from "../shared/StarfieldBackground";

// Shown exactly once, right after a fresh invite turns into a real
// membership (see useWorkspace's justJoined) — Supabase's invite link signs
// someone in directly with no password at all, so without this they'd have
// no way to sign back in later except clicking a fresh email link every time.
export function SetPasswordPage({
  workspaceName,
  onSetPassword,
}: {
  workspaceName?: string;
  onSetPassword: (password: string) => Promise<string | null>;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatched = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= 8 && password === confirm && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const message = await onSetPassword(password);
    if (message) {
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex h-screen w-screen items-center justify-center bg-[#020508] overflow-hidden">
      <StarfieldBackground starCount={68} />
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: "radial-gradient(900px 460px at 50% -10%, rgba(224,164,79,0.10), transparent 62%)",
        }}
      />
      <div className="grain-overlay" />

      <div className="relative z-10 w-full max-w-[380px] px-4">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div
            className="w-[27px] h-6 shrink-0"
            style={{
              WebkitMaskImage: "url(/rf-mark.png)",
              maskImage: "url(/rf-mark.png)",
              WebkitMaskSize: "contain",
              maskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition: "center",
              background: "linear-gradient(135deg, #D39448, #A97942)",
            }}
          />
          <span className="font-brand text-[17px] text-neutral-100">ReelForge</span>
        </div>

        <div className="rounded-2xl surface-panel p-6">
          <h1 className="text-[19px] font-serif font-medium text-neutral-50 text-center">Welcome aboard</h1>
          <p className="mt-1.5 text-[12.5px] text-neutral-500 text-center">
            {workspaceName ? `You're joining ${workspaceName}.` : "You're joining a ReelForge workspace."} Set a
            password to finish.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <div>
              <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">Password</label>
              <input
                type="password"
                autoComplete="new-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="mt-1.5 w-full h-10 rounded-lg surface-field px-3 text-[13px] text-neutral-100 placeholder:text-neutral-600 outline-none focus-glow"
              />
              {tooShort && <p className="mt-1 text-[11px] text-neutral-500">At least 8 characters.</p>}
            </div>

            <div>
              <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">Confirm password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 w-full h-10 rounded-lg surface-field px-3 text-[13px] text-neutral-100 placeholder:text-neutral-600 outline-none focus-glow"
              />
              {mismatched && <p className="mt-1 text-[11px] text-rose-400">Passwords don't match.</p>}
            </div>

            {error && (
              <p className="text-[12px] text-rose-300/85 rounded-lg surface-field px-3 py-2 leading-relaxed">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full h-10 rounded-lg flex items-center justify-center gap-2 bg-[#D39448] text-[#020508] text-[13px] font-medium disabled:opacity-40 hover:brightness-110 transition-[filter] press-feedback"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting ? "Setting password..." : "Set password and continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
