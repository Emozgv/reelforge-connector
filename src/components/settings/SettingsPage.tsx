import { useState } from "react";
import { Building2, Check, CreditCard, LogOut } from "lucide-react";
import { canViewBilling } from "../../lib/permissions";
import { TeamSection } from "./TeamSection";

export function SettingsPage({
  userId,
  userEmail,
  workspaceId,
  workspaceName,
  role,
  displayName,
  onUpdateDisplayName,
  onSignOut,
  onOpenBilling,
}: {
  userId: string;
  userEmail?: string;
  workspaceId: string;
  workspaceName?: string;
  role?: string;
  displayName?: string | null;
  onUpdateDisplayName: (name: string) => Promise<{ error: string | null }>;
  onSignOut: () => void;
  onOpenBilling: () => void;
}) {
  const [nameInput, setNameInput] = useState(displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shownName = displayName || userEmail;
  const dirty = nameInput.trim() !== (displayName ?? "").trim();

  async function handleSave() {
    setSaving(true);
    setError(null);
    const { error: saveError } = await onUpdateDisplayName(nameInput);
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[720px] mx-auto px-8 pt-6 pb-8">
        <span className="text-[10.5px] tracking-[0.14em] uppercase text-[#D39448]/75 font-medium">Settings</span>
        <h1 className="mt-1 text-[20px] font-serif font-medium text-neutral-50">Workspace</h1>

        <div className="mt-6 rounded-xl surface-panel p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#D39448] flex items-center justify-center text-[13px] font-medium text-[#020508] shrink-0">
              {(shownName ?? "EM").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-neutral-100 truncate">{workspaceName ?? "Client workspace"}</p>
              <p className="text-[11.5px] text-neutral-500 truncate">
                {userEmail} {role && <span className="text-neutral-600">· {role}</span>}
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/[0.06]">
            <label className="text-[11.5px] font-medium text-neutral-300">Nickname</label>
            <p className="mt-0.5 text-[11.5px] text-neutral-500">
              Shown instead of your email throughout the app.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder={userEmail ?? "Your name"}
                maxLength={40}
                className="focus-glow flex-1 h-9 px-3 rounded-lg surface-field text-[12.5px] text-neutral-100 placeholder:text-neutral-600 outline-none"
              />
              <button
                onClick={handleSave}
                disabled={!dirty || saving}
                className="press-feedback h-9 px-3.5 rounded-lg text-[12.5px] font-medium bg-[#D39448] text-[#020508] disabled:opacity-35 disabled:cursor-default hover:brightness-110 transition-[filter] duration-150 flex items-center gap-1.5 shrink-0"
              >
                {saved ? <Check size={13} /> : null}
                {saving ? "Saving…" : saved ? "Saved" : "Save"}
              </button>
            </div>
            {error && <p className="mt-1.5 text-[11px] text-rose-400">{error}</p>}
          </div>

          <button
            onClick={onSignOut}
            className="mt-4 flex items-center gap-2 h-9 px-3.5 rounded-lg text-[12.5px] text-neutral-400 hover:text-rose-300 hover:bg-rose-400/[0.06] transition-colors duration-150"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>

        {canViewBilling(role) && (
          <>
            <h2 className="mt-8 text-[13px] font-medium text-neutral-200 flex items-center gap-2">
              <CreditCard size={14} className="text-[#D39448]" />
              Billing
            </h2>
            <button
              onClick={onOpenBilling}
              className="mt-3 w-full text-left rounded-xl surface-panel p-4 hover:bg-white/[0.03] transition-colors duration-150 flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-[12.5px] text-neutral-200">Plans, per-creator usage, and regenerations</p>
                <p className="mt-0.5 text-[11px] text-neutral-500">Every ReelForge plan is per creator — manage them all in Billing.</p>
              </div>
              <span className="shrink-0 text-[11.5px] font-medium text-[#D39448]">Open →</span>
            </button>
          </>
        )}

        <h2 className="mt-8 text-[13px] font-medium text-neutral-200">Team</h2>
        <p className="mt-1 text-[12px] text-neutral-600 max-w-md">
          {role === "owner"
            ? "Invite teammates, assign roles, and control who can see Billing or manage the team."
            : "Everyone on your workspace's team — only the Owner can invite, change roles, or remove someone."}
        </p>
        <div className="mt-3">
          <TeamSection workspaceId={workspaceId} currentUserId={userId} callerRole={role} />
        </div>

        <h2 className="mt-8 text-[13px] font-medium text-neutral-200">Coming soon</h2>
        <p className="mt-1 text-[12px] text-neutral-600 max-w-md">
          These aren't wired up yet — placeholders so you can see where they'll live.
        </p>

        <div className="mt-4 space-y-3">
          <div className="rounded-xl surface-panel p-4 opacity-60">
            <div className="flex items-center gap-2.5">
              <Building2 size={15} className="text-neutral-500" />
              <span className="text-[13px] font-medium text-neutral-300">Brand direction</span>
              <span className="ml-auto text-[9px] tracking-wide uppercase text-neutral-600 border border-white/[0.08] rounded-[3px] px-1 py-[1px]">
                soon
              </span>
            </div>
            <p className="mt-1.5 text-[11.5px] text-neutral-500">
              Workspace-wide tone, do's/don'ts, and references that apply across every creator.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
