import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { WorkspaceRole } from "../lib/permissions";

// Owner + up to this many invited/active non-owner members — mirrors the
// same constant enforced server-side in invite-workspace-member.
export const MAX_ADDITIONAL_MEMBERS = 5;

export interface TeamMember {
  id: string;
  userId: string;
  role: WorkspaceRole;
  email: string | null;
  displayName: string | null;
  canChangePlan: boolean;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: Extract<WorkspaceRole, "manager" | "va">;
  createdAt: string;
}

interface MemberRow {
  id: string;
  user_id: string;
  role: string;
  email: string | null;
  display_name: string | null;
  can_change_plan: boolean;
}

interface InviteRow {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

function parseInvokeError(invokeError: unknown, data: { error?: string } | null): Promise<string> {
  return (async () => {
    const context = (invokeError as { context?: Response } | undefined)?.context;
    if (context && typeof context.json === "function") {
      try {
        const responseBody = await context.clone().json();
        if (typeof responseBody?.error === "string") return responseBody.error;
      } catch {
        // fall through
      }
    }
    return data?.error ?? (invokeError as { message?: string } | undefined)?.message ?? "Something went wrong.";
  })();
}

// Real DB-level enforcement backs every one of these actions (RLS on
// workspace_invites, SECURITY DEFINER checks in each RPC/edge function) —
// this hook is only the client-side surface for them, not where the actual
// permission decisions get made.
export function useTeamMembers(workspaceId: string | undefined) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) {
      setMembers([]);
      setInvites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const [membersRes, invitesRes] = await Promise.all([
      supabase
        .schema("client_os")
        .from("workspace_members")
        .select("id, user_id, role, email, display_name, can_change_plan")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true }),
      supabase
        .schema("client_os")
        .from("workspace_invites")
        .select("id, email, role, created_at")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
    ]);

    if (membersRes.error) {
      setError(membersRes.error.message);
      setLoading(false);
      return;
    }

    setMembers(
      ((membersRes.data ?? []) as MemberRow[]).map((r) => ({
        id: r.id,
        userId: r.user_id,
        role: r.role as WorkspaceRole,
        email: r.email,
        displayName: r.display_name,
        canChangePlan: !!r.can_change_plan,
      }))
    );
    // A VA's RLS grant returns zero invite rows rather than an error — the
    // Team management UI just never renders for them, so this staying empty
    // silently is the correct outcome, not a failure to surface.
    setInvites(
      ((invitesRes.data ?? []) as InviteRow[]).map((r) => ({
        id: r.id,
        email: r.email,
        role: r.role as PendingInvite["role"],
        createdAt: r.created_at,
      }))
    );
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function inviteMember(email: string, role: "manager" | "va"): Promise<{ error: string | null }> {
    if (!workspaceId) return { error: "No active workspace." };
    const { data, error: invokeError } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
      "invite-workspace-member",
      { body: { workspaceId, email, role } }
    );
    if (invokeError || !data?.ok) {
      return { error: await parseInvokeError(invokeError, data ?? null) };
    }
    await load();
    return { error: null };
  }

  async function changeRole(membershipId: string, role: "manager" | "va"): Promise<{ error: string | null }> {
    const { error } = await supabase
      .schema("client_os")
      .rpc("update_workspace_member_role", { p_membership_id: membershipId, p_role: role });
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }

  async function removeMember(membershipId: string): Promise<{ error: string | null }> {
    const { error } = await supabase.schema("client_os").rpc("remove_workspace_member", { p_membership_id: membershipId });
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }

  async function cancelInvite(inviteId: string): Promise<{ error: string | null }> {
    const { error } = await supabase.schema("client_os").rpc("cancel_workspace_invite", { p_invite_id: inviteId });
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }

  // Owner-only server-side (see update_member_plan_permission) — only ever
  // applies to a member currently in the Manager role.
  async function updatePlanPermission(membershipId: string, canChangePlan: boolean): Promise<{ error: string | null }> {
    const { error } = await supabase
      .schema("client_os")
      .rpc("update_member_plan_permission", { p_membership_id: membershipId, p_can_change_plan: canChangePlan });
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }

  const additionalCount = members.filter((m) => m.role !== "owner").length + invites.length;
  const atMax = additionalCount >= MAX_ADDITIONAL_MEMBERS;

  return {
    members,
    invites,
    loading,
    error,
    atMax,
    additionalCount,
    inviteMember,
    changeRole,
    removeMember,
    cancelInvite,
    updatePlanPermission,
  };
}
