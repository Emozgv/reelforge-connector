import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface AdminWorkspaceRow {
  workspaceId: string;
  workspaceName: string;
  status: "active" | "suspended" | "removed";
  ownerName: string | null;
  ownerEmail: string | null;
  memberCount: number;
  creatorCount: number;
  planName: string | null;
  monthlyAllowance: number | null;
  reelsUsed: number;
  createdAt: string;
}

interface WorkspaceListRow {
  workspace_id: string;
  workspace_name: string;
  status: string;
  owner_name: string | null;
  owner_email: string | null;
  member_count: number;
  creator_count: number;
  plan_name: string | null;
  monthly_allowance: number | null;
  reels_used: number;
  created_at: string;
}

function fromListRow(r: WorkspaceListRow): AdminWorkspaceRow {
  return {
    workspaceId: r.workspace_id,
    workspaceName: r.workspace_name,
    status: r.status as AdminWorkspaceRow["status"],
    ownerName: r.owner_name,
    ownerEmail: r.owner_email,
    memberCount: Number(r.member_count),
    creatorCount: Number(r.creator_count),
    planName: r.plan_name,
    monthlyAllowance: r.monthly_allowance,
    reelsUsed: Number(r.reels_used),
    createdAt: r.created_at,
  };
}

// Cross-tenant reads/writes go entirely through admin_* RPCs (SECURITY
// DEFINER, each independently re-checking is_platform_admin() server-side)
// — this hook never touches client_os tables directly, so it can't
// accidentally rely on RLS doing the gating for it.
export function useAdminDashboard() {
  const [workspaces, setWorkspaces] = useState<AdminWorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async (searchTerm: string) => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase
      .schema("client_os")
      .rpc("admin_list_workspaces", { p_search: searchTerm || null });
    if (rpcError) {
      setError(rpcError.message);
      setWorkspaces([]);
      setLoading(false);
      return;
    }
    setWorkspaces(((data ?? []) as WorkspaceListRow[]).map(fromListRow));
    setLoading(false);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => void load(search), 250);
    return () => clearTimeout(handle);
  }, [search, load]);

  return { workspaces, loading, error, search, setSearch, refresh: () => load(search) };
}

// Everything the detail view needs, assembled server-side into one jsonb
// blob (admin_get_workspace_detail) rather than several separate
// client-orchestrated queries.
export interface AdminWorkspaceDetail {
  workspace: { id: string; name: string; status: string; created_at: string; updated_at: string };
  package: {
    workspace_id: string;
    plan_name: string;
    monthly_allowance: number;
    regenerations_included: number;
    creator_setups_included: number;
    billing_cycle_start: string;
    free_until: string | null;
  } | null;
  members: {
    id: string;
    user_id: string;
    role: string;
    email: string | null;
    display_name: string | null;
    can_change_plan: boolean;
  }[];
  creators: {
    id: string;
    name: string;
    handle: string | null;
    package: {
      creator_id: string;
      plan_tier: string;
      plan_label: string;
      price_monthly: number | null;
      monthly_reel_allowance: number;
      status: string;
      setup_fee_paid_at: string | null;
      trial_fee_paid_at: string | null;
      bonus_reel_credits: number;
      regeneration_credits_total: number;
      pending_plan_tier: string | null;
      pending_plan_label: string | null;
      pending_change_effective_at: string | null;
      cancel_at_period_end: boolean;
      cancellation_effective_at: string | null;
    } | null;
  }[];
  recent_activity: { id: string; event_type: string; message: string; created_at: string }[];
  regeneration_requests: { id: string; reason: string; is_free: boolean; status: string; note: string; created_at: string }[];
  admin_log: { id: string; action: string; details: Record<string, unknown>; created_at: string; admin_email: string }[];
}

export function useAdminWorkspaceDetail(workspaceId: string | null) {
  const [detail, setDetail] = useState<AdminWorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase
      .schema("client_os")
      .rpc("admin_get_workspace_detail", { p_workspace_id: workspaceId });
    if (rpcError) {
      setError(rpcError.message);
      setDetail(null);
      setLoading(false);
      return;
    }
    setDetail(data as AdminWorkspaceDetail);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  function parseError(e: unknown): string {
    return (e as { message?: string })?.message ?? "Something went wrong.";
  }

  async function setStatus(status: "active" | "suspended" | "removed", reason?: string): Promise<{ error: string | null }> {
    if (!workspaceId) return { error: "No workspace selected." };
    const { error: e } = await supabase
      .schema("client_os")
      .rpc("admin_set_workspace_status", { p_workspace_id: workspaceId, p_status: status, p_reason: reason ?? null });
    if (e) return { error: parseError(e) };
    await load();
    return { error: null };
  }

  async function setWorkspacePackage(input: {
    planName: string;
    monthlyAllowance: number;
    regenerationsIncluded: number;
    creatorSetupsIncluded: number;
  }): Promise<{ error: string | null }> {
    if (!workspaceId) return { error: "No workspace selected." };
    const { error: e } = await supabase.schema("client_os").rpc("admin_set_workspace_package", {
      p_workspace_id: workspaceId,
      p_plan_name: input.planName,
      p_monthly_allowance: input.monthlyAllowance,
      p_regenerations_included: input.regenerationsIncluded,
      p_creator_setups_included: input.creatorSetupsIncluded,
    });
    if (e) return { error: parseError(e) };
    await load();
    return { error: null };
  }

  async function grantBonusCredits(bonusReels: number, bonusRegenerations: number): Promise<{ error: string | null }> {
    if (!workspaceId) return { error: "No workspace selected." };
    const { error: e } = await supabase.schema("client_os").rpc("admin_grant_bonus_credits", {
      p_workspace_id: workspaceId,
      p_bonus_reels: bonusReels,
      p_bonus_regenerations: bonusRegenerations,
    });
    if (e) return { error: parseError(e) };
    await load();
    return { error: null };
  }

  async function grantFreePeriod(freeUntil: string): Promise<{ error: string | null }> {
    if (!workspaceId) return { error: "No workspace selected." };
    const { error: e } = await supabase
      .schema("client_os")
      .rpc("admin_grant_free_period", { p_workspace_id: workspaceId, p_free_until: freeUntil });
    if (e) return { error: parseError(e) };
    await load();
    return { error: null };
  }

  async function setCreatorPackage(input: {
    creatorId: string;
    planTier: "Trial" | "S" | "M" | "L" | "Enterprise";
    planLabel: string;
    priceMonthly: number;
    monthlyReelAllowance: number;
  }): Promise<{ error: string | null }> {
    const { error: e } = await supabase.schema("client_os").rpc("admin_set_creator_package", {
      p_creator_id: input.creatorId,
      p_plan_tier: input.planTier,
      p_plan_label: input.planLabel,
      p_price_monthly: input.priceMonthly,
      p_monthly_reel_allowance: input.monthlyReelAllowance,
    });
    if (e) return { error: parseError(e) };
    await load();
    return { error: null };
  }

  async function grantCreatorBonusCredits(
    creatorId: string,
    bonusReels: number,
    bonusRegenerations: number
  ): Promise<{ error: string | null }> {
    const { error: e } = await supabase.schema("client_os").rpc("admin_grant_creator_bonus_credits", {
      p_creator_id: creatorId,
      p_bonus_reels: bonusReels,
      p_bonus_regenerations: bonusRegenerations,
    });
    if (e) return { error: parseError(e) };
    await load();
    return { error: null };
  }

  return {
    detail,
    loading,
    error,
    refresh: load,
    setStatus,
    setWorkspacePackage,
    grantBonusCredits,
    grantFreePeriod,
    setCreatorPackage,
    grantCreatorBonusCredits,
  };
}
