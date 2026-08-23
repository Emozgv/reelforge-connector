import { Building2, CreditCard, LogOut, Users as UsersIcon } from "lucide-react";

export function SettingsPage({
  userEmail,
  workspaceName,
  role,
  onSignOut,
}: {
  userEmail?: string;
  workspaceName?: string;
  role?: string;
  onSignOut: () => void;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[720px] mx-auto px-8 pt-6 pb-8">
        <span className="text-[10.5px] tracking-[0.14em] uppercase text-[#c99a5f]/75 font-medium">Settings</span>
        <h1 className="mt-1 text-[20px] font-serif font-medium text-neutral-50">Workspace</h1>

        <div className="mt-6 rounded-xl surface-panel p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#c99a5f] flex items-center justify-center text-[13px] font-medium text-[#0a0a0c] shrink-0">
              {(userEmail ?? "EM").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-neutral-100 truncate">{workspaceName ?? "Client workspace"}</p>
              <p className="text-[11.5px] text-neutral-500 truncate">
                {userEmail} {role && <span className="text-neutral-600">· {role}</span>}
              </p>
            </div>
          </div>

          <button
            onClick={onSignOut}
            className="mt-4 flex items-center gap-2 h-9 px-3.5 rounded-lg text-[12.5px] text-neutral-400 hover:text-rose-300 hover:bg-rose-400/[0.06] transition-colors duration-150"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>

        <h2 className="mt-8 text-[13px] font-medium text-neutral-200">Coming soon</h2>
        <p className="mt-1 text-[12px] text-neutral-600 max-w-md">
          These aren't wired up yet — placeholders so you can see where they'll live.
        </p>

        <div className="mt-4 space-y-3">
          <div className="rounded-xl surface-panel p-4 opacity-60">
            <div className="flex items-center gap-2.5">
              <UsersIcon size={15} className="text-neutral-500" />
              <span className="text-[13px] font-medium text-neutral-300">Team</span>
              <span className="ml-auto text-[9px] tracking-wide uppercase text-neutral-600 border border-white/[0.08] rounded-[3px] px-1 py-[1px]">
                soon
              </span>
            </div>
            <p className="mt-1.5 text-[11.5px] text-neutral-500">
              Invite teammates, assign roles, control who can save, send, and approve.
            </p>
          </div>

          <div className="rounded-xl surface-panel p-4 opacity-60">
            <div className="flex items-center gap-2.5">
              <CreditCard size={15} className="text-neutral-500" />
              <span className="text-[13px] font-medium text-neutral-300">Package &amp; billing</span>
              <span className="ml-auto text-[9px] tracking-wide uppercase text-neutral-600 border border-white/[0.08] rounded-[3px] px-1 py-[1px]">
                soon
              </span>
            </div>
            <p className="mt-1.5 text-[11.5px] text-neutral-500">
              Your reel allowance, regenerations remaining, and billing cycle.
            </p>
          </div>

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
