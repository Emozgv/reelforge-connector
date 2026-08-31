import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Sydney Studio access — completely separate from client_os.platform_admins
// (Admin Dashboard) and from public.memberships (ReelForge Internal staff).
// Backed by client_os.syd_members via a SECURITY DEFINER RPC that only ever
// answers about the calling account; every syd_* RPC re-checks this
// server-side independently, so this hook only ever controls whether the UI
// offers the SYD entry points (send button, Owner area, invite control).
export function useSydAccess(userId: string | undefined) {
  // current_syd_role() returns one of Sydney's real role strings
  // ("Owner"/"Manager"/"AI Manager"/"Content Assistant") for any active
  // Sydney member, or null otherwise -- any non-null value is a valid,
  // active Sydney membership. (Previously checked stale lowercase
  // 'owner'/'va' sentinels that no longer exist under Sydney's real
  // role/permissions model, which silently hid every SYD entry point for
  // every Sydney member, Owner included.)
  const [sydRole, setSydRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setSydRole(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    supabase
      .schema("client_os")
      .rpc("current_syd_role")
      .then(({ data, error }) => {
        if (!active) return;
        setSydRole(!error && data ? data : null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  return { sydRole, isSydOwner: sydRole === "Owner", hasSydAccess: sydRole !== null, loading };
}
