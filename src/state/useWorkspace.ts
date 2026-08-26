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
  // True only for the one load right after a fresh invite gets accepted —
  // lets the app show a one-time "set your password" step before dropping
  // an invited person straight into the workspace they just joined.
  const [justJoined, setJustJoined] = useState(false);
  // True when this session came from an invite link that's since been
  // cancelled (see cancel_workspace_invite) — a distinct, honest message
  // rather than the generic "no workspace access" screen.
  const [inviteCancelled, setInviteCancelled] = useState(false);

  useEffect(() => {
    if (!userId) {
      setWorkspace(null);
      setLoading(false);
      setError(null);
      setJustJoined(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      let membership = await supabase
        .schema("client_os")
        .from("workspace_members")
        .select("id, workspace_id, role, display_name")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      if (!active) return;

      let didAccept = false;
      // No membership yet doesn't necessarily mean "no access" — it's also
      // exactly the state a freshly-invited person lands in the instant
      // Supabase's invite link signs them in, before anything has turned
      // their invite into a real membership. Trying this unconditionally
      // whenever no membership is found is harmless: it's a no-op error for
      // every other case (already a member, no invite, etc).
      let cancelled = false;
      if (!membership.error && !membership.data) {
        const { data: accepted, error: acceptError } = await supabase
          .schema("client_os")
          .rpc("accept_pending_workspace_invite");
        if (accepted) {
          didAccept = true;
          membership = await supabase
            .schema("client_os")
            .from("workspace_members")
            .select("id, workspace_id, role, display_name")
            .eq("user_id", userId)
            .limit(1)
            .maybeSingle();
        } else if (acceptError?.message?.includes("invite_cancelled")) {
          cancelled = true;
        }
      }
      setInviteCancelled(cancelled);

      if (!active) return;

      if (membership.error) {
        setError(membership.error.message);
        setWorkspace(null);
        setLoading(false);
        return;
      }

      if (!membership.data) {
        setWorkspace(null);
        setLoading(false);
        return;
      }

      const { data: ws, error: workspaceError } = await supabase
        .schema("client_os")
        .from("workspaces")
        .select("id, name")
        .eq("id", membership.data.workspace_id)
        .maybeSingle();

      if (!active) return;

      if (workspaceError || !ws) {
        setError(workspaceError?.message ?? "Workspace not found");
        setWorkspace(null);
      } else {
        setWorkspace({
          id: ws.id,
          name: ws.name,
          role: membership.data.role,
          membershipId: membership.data.id,
          displayName: membership.data.display_name,
        });
        setJustJoined(didAccept);
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

  return {
    workspace,
    loading,
    error,
    justJoined,
    dismissJustJoined: () => setJustJoined(false),
    inviteCancelled,
    updateDisplayName,
  };
}
