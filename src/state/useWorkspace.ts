import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface ActiveWorkspace {
  id: string;
  name: string;
  role: string;
  membershipId: string;
  displayName: string | null;
}

/**
 * Resolves which client_os workspace the given authenticated user belongs to.
 * V1 assumption: a user belongs to exactly one workspace, so we just take the
 * first membership found. The shape is deliberately small so multi-workspace
 * switching can be layered on later without a redesign — this hook is the
 * single place that would grow a workspace *list* + an "active workspace"
 * selector when that's needed.
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
        .select("id, workspace_id, role, display_name")
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
        setWorkspace({
          id: ws.id,
          name: ws.name,
          role: membership.role,
          membershipId: membership.id,
          displayName: membership.display_name,
        });
      }
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  async function updateDisplayName(displayName: string): Promise<{ error: string | null }> {
    if (!workspace) return { error: "No active workspace." };
    const trimmed = displayName.trim();
    const previous = workspace;
    setWorkspace({ ...workspace, displayName: trimmed || null });

    const { error: updateError } = await supabase
      .schema("client_os")
      .from("workspace_members")
      .update({ display_name: trimmed || null })
      .eq("id", workspace.membershipId);

    if (updateError) {
      setWorkspace(previous);
      return { error: updateError.message };
    }
    return { error: null };
  }

  return { workspace, loading, error, updateDisplayName };
}
