import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface ActiveWorkspace {
  id: string;
  name: string;
  role: string;
}

/**
 * Resolves which client_os workspace the given authenticated user belongs to.
 * V1 assumption: a user belongs to exactly one workspace, so we just take the
 * first membership found. The shape (id/name/role) is deliberately small so
 * multi-workspace switching can be layered on later without a redesign —
 * this hook is the single place that would grow a workspace *list* + an
 * "active workspace" selector when that's needed.
 */
export function useWorkspace(userId: string | undefined) {
  const [workspace, setWorkspace] = useState<ActiveWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setWorkspace(null);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      const { data: membership, error: membershipError } = await supabase
        .schema("client_os")
        .from("workspace_members")
        .select("workspace_id, role")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      if (!active) return;

      if (membershipError) {
        setError(membershipError.message);
        setWorkspace(null);
        setLoading(false);
        return;
      }

      if (!membership) {
        setWorkspace(null);
        setLoading(false);
        return;
      }

      const { data: ws, error: workspaceError } = await supabase
        .schema("client_os")
        .from("workspaces")
        .select("id, name")
        .eq("id", membership.workspace_id)
        .maybeSingle();

      if (!active) return;

      if (workspaceError || !ws) {
        setError(workspaceError?.message ?? "Workspace not found");
        setWorkspace(null);
      } else {
        setWorkspace({ id: ws.id, name: ws.name, role: membership.role });
      }
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  return { workspace, loading, error };
}
