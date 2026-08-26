import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Platform-admin access (the Admin Dashboard, cross-tenant client
// management) is completely separate from client_os.workspace_members.role
// — a normal Agency Owner must never gain this just because they're
// "owner" in their own workspace. This checks client_os.platform_admins
// (a flat allowlist) via a single RPC that only ever answers about the
// calling account itself. The real enforcement lives server-side in every
// admin_* RPC (each independently re-checks is_platform_admin()) — this
// hook only controls whether the UI even offers the entry point.
export function useAdminAccess(userId: string | undefined) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    supabase
      .schema("client_os")
      .rpc("is_platform_admin")
      .then(({ data, error }) => {
        if (!active) return;
        setIsAdmin(!error && data === true);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  return { isAdmin, loading };
}
