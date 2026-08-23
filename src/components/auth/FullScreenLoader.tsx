import { Loader2 } from "lucide-react";

// Shown while auth/workspace state is being resolved — prevents any flash of
// the Client OS UI (or the login screen) before we actually know the state.
export function FullScreenLoader() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#020508]">
      <Loader2 size={20} className="animate-spin text-[#D39448]/70" />
    </div>
  );
}
