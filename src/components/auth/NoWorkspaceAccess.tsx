import { LogOut } from "lucide-react";

export function NoWorkspaceAccess({ email, onSignOut }: { email: string | undefined; onSignOut: () => void }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0b0b0d] px-4">
      <div className="w-full max-w-[380px] rounded-2xl surface-panel p-6 text-center">
        <h1 className="text-[16px] font-serif font-medium text-neutral-50">No workspace access yet</h1>
        <p className="mt-2 text-[12.5px] text-neutral-400 leading-relaxed">
          You don't have access to a ReelForge workspace yet.
          {email && (
            <>
              {" "}
              Signed in as <span className="text-neutral-200">{email}</span>.
            </>
          )}
        </p>
        <p className="mt-1.5 text-[12px] text-neutral-600">Ask your ReelForge contact to add you to a workspace.</p>
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
