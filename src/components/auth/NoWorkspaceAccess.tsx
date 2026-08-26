import { LogOut } from "lucide-react";

export function NoWorkspaceAccess({
  email,
  cancelled,
  onSignOut,
}: {
  email: string | undefined;
  // True when this exact session came from an invite link that's since
  // been cancelled (see useWorkspace's inviteCancelled) — an honest,
  // specific message instead of the generic one below, same branding.
  cancelled?: boolean;
  onSignOut: () => void;
}) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#020508] px-4">
      <div className="w-full max-w-[380px] rounded-2xl surface-panel p-6 text-center">
        <h1 className="text-[16px] font-serif font-medium text-neutral-50">
          {cancelled ? "This invitation is no longer valid" : "No workspace access yet"}
        </h1>
        <p className="mt-2 text-[12.5px] text-neutral-400 leading-relaxed">
          {cancelled
            ? "This invite link has been cancelled."
            : "You don't have access to a ReelForge workspace yet."}
          {email && (
            <>
              {" "}
              Signed in as <span className="text-neutral-200">{email}</span>.
            </>
          )}
        </p>
        <p className="mt-1.5 text-[12px] text-neutral-600">
          {cancelled
            ? "Ask your ReelForge contact for a new invitation."
            : "Ask your ReelForge contact to add you to a workspace."}
        </p>
        <button
          onClick={onSignOut}
          className="mt-5 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[12.5px] text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.05] transition-colors"
        >
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </div>
  );
}
