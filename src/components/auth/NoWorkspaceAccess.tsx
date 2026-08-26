import { LogOut } from "lucide-react";

export function NoWorkspaceAccess({
  email,
  cancelled,
  suspendedStatus,
  onSignOut,
}: {
  email: string | undefined;
  // True when this exact session came from an invite link that's since
  // been cancelled (see useWorkspace's inviteCancelled) — an honest,
  // specific message instead of the generic one below, same branding.
  cancelled?: boolean;
  // Set when the workspace itself was suspended or removed by ReelForge
  // admin (see useWorkspace's suspendedStatus / my_workspace_status()) —
  // again a distinct, honest message rather than the generic one.
  suspendedStatus?: "suspended" | "removed" | null;
  onSignOut: () => void;
}) {
  const heading = suspendedStatus
    ? suspendedStatus === "suspended"
      ? "This workspace is suspended"
      : "This workspace is no longer available"
    : cancelled
      ? "This invitation is no longer valid"
      : "No workspace access yet";

  const body = suspendedStatus
    ? suspendedStatus === "suspended"
      ? "Access to this workspace has been temporarily suspended."
      : "This workspace has been removed."
    : cancelled
      ? "This invite link has been cancelled."
      : "You don't have access to a ReelForge workspace yet.";

  const footer = suspendedStatus
    ? "Contact ReelForge support if you believe this is a mistake."
    : cancelled
      ? "Ask your ReelForge contact for a new invitation."
      : "Ask your ReelForge contact to add you to a workspace.";

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#020508] px-4">
      <div className="w-full max-w-[380px] rounded-2xl surface-panel p-6 text-center">
        <h1 className="text-[16px] font-serif font-medium text-neutral-50">{heading}</h1>
        <p className="mt-2 text-[12.5px] text-neutral-400 leading-relaxed">
          {body}
          {email && (
            <>
              {" "}
              Signed in as <span className="text-neutral-200">{email}</span>.
            </>
          )}
        </p>
        <p className="mt-1.5 text-[12px] text-neutral-600">{footer}</p>
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
