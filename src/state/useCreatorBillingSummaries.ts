import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Server-computed, billing-cycle-aware summary for one creator (client_os.get_creator_billing_summary)
// — replaces the old all-time client-side computeCreatorUsageStats. Real
// source of truth: reel_usage_events for usage, creator_packages for
// plan/credits/pending-change/cancellation state.
export interface CreatorBillingSummary {
  hasPlan: boolean;
  planTier?: "Trial" | "S" | "M" | "L" | "Enterprise";
  planLabel?: string;
  priceMonthly?: number | null;
  status?: "active" | "paused" | "cancelled";
  billingCycleStart?: string;
  periodStart?: string;
  periodEnd?: string | null;
  reelsUsed?: number;
  reelsTotal?: number | null;
  trialExhausted?: boolean;
  regenCreditsTotal?: number;
  regenCreditsUsed?: number;
  regenCreditsRemaining?: number;
  setupFeePaidAt?: string | null;
  trialFeePaidAt?: string | null;
  freeUntil?: string | null;
  pendingPlanTier?: string | null;
  pendingPlanLabel?: string | null;
  pendingPriceMonthly?: number | null;
  pendingMonthlyReelAllowance?: number | null;
  pendingChangeEffectiveAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  cancellationEffectiveAt?: string | null;
  canChangePlan?: boolean;
  canCancel?: boolean;
  hasStripeSubscription?: boolean;
}

function fromRow(raw: Record<string, unknown>): CreatorBillingSummary {
  if (!raw.has_plan) return { hasPlan: false };
  return {
    hasPlan: true,
    planTier: raw.plan_tier as CreatorBillingSummary["planTier"],
    planLabel: raw.plan_label as string,
    priceMonthly: raw.price_monthly as number | null,
    status: raw.status as CreatorBillingSummary["status"],
    billingCycleStart: raw.billing_cycle_start as string,
    periodStart: raw.period_start as string,
    periodEnd: raw.period_end as string | null,
    reelsUsed: raw.reels_used as number,
    reelsTotal: raw.reels_total as number | null,
    trialExhausted: raw.trial_exhausted as boolean,
    regenCreditsTotal: raw.regen_credits_total as number,
    regenCreditsUsed: raw.regen_credits_used as number,
    regenCreditsRemaining: raw.regen_credits_remaining as number,
    setupFeePaidAt: raw.setup_fee_paid_at as string | null,
    trialFeePaidAt: raw.trial_fee_paid_at as string | null,
    freeUntil: raw.free_until as string | null,
    pendingPlanTier: raw.pending_plan_tier as string | null,
    pendingPlanLabel: raw.pending_plan_label as string | null,
    pendingPriceMonthly: raw.pending_price_monthly as number | null,
    pendingMonthlyReelAllowance: raw.pending_monthly_reel_allowance as number | null,
    pendingChangeEffectiveAt: raw.pending_change_effective_at as string | null,
    cancelAtPeriodEnd: raw.cancel_at_period_end as boolean,
    cancellationEffectiveAt: raw.cancellation_effective_at as string | null,
    canChangePlan: raw.can_change_plan as boolean,
    canCancel: raw.can_cancel as boolean,
    hasStripeSubscription: raw.has_stripe_subscription as boolean,
  };
}

export interface PlanChangePreview {
  isUpgrade: boolean;
  timing: "immediate" | "at_renewal";
  newTier: string;
  newLabel: string;
  newPrice: number | null;
  newMonthlyReelAllowance: number | null;
  proratedEstimate: number | null;
  effectiveAt: string;
  keepsCurrentPlanUntil?: string;
}

export function useCreatorBillingSummaries(workspaceId: string | undefined) {
  const [summaries, setSummaries] = useState<Map<string, CreatorBillingSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!workspaceId) {
      setSummaries(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: e } = await supabase
      .schema("client_os")
      .rpc("get_creator_billing_summaries", { p_workspace_id: workspaceId });
    if (e) {
      setError(e.message);
      setLoading(false);
      return;
    }
    const map = new Map<string, CreatorBillingSummary>();
    for (const [creatorId, raw] of Object.entries((data ?? {}) as Record<string, Record<string, unknown>>)) {
      map.set(creatorId, fromRow(raw));
    }
    setSummaries(map);
    setError(null);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Refetch whenever the tab regains focus — covers returning from a Stripe
  // Checkout tab (whether the browser redirected back or the user just
  // switched/closed that tab) without requiring an exact URL match.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void refetch();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refetch]);

  // Landing back on #billing?stripe=success is a strong signal a payment
  // just happened, but the webhook that actually writes the new plan state
  // can lag the redirect by a second or more — a single refetch on mount can
  // easily land before it. Poll a few times over the following seconds
  // specifically for this case, then clean the URL so it doesn't repeat.
  useEffect(() => {
    if (!window.location.hash.includes("stripe=success")) return;
    const delays = [1200, 2600, 4500];
    const timers = delays.map((ms) => setTimeout(() => void refetch(), ms));
    const cleaned = window.location.hash.replace(/\?stripe=success/, "");
    window.history.replaceState(null, "", window.location.pathname + cleaned);
    return () => timers.forEach(clearTimeout);
  }, [refetch]);

  async function previewPlanChange(creatorId: string, newTier: string): Promise<{ preview: PlanChangePreview | null; error: string | null }> {
    const { data, error: e } = await supabase
      .schema("client_os")
      .rpc("preview_plan_change", { p_creator_id: creatorId, p_new_tier: newTier });
    if (e) return { preview: null, error: e.message };
    const raw = data as Record<string, unknown>;
    return {
      preview: {
        isUpgrade: raw.is_upgrade as boolean,
        timing: raw.timing as PlanChangePreview["timing"],
        newTier: raw.new_tier as string,
        newLabel: raw.new_label as string,
        newPrice: raw.new_price as number | null,
        newMonthlyReelAllowance: raw.new_monthly_reel_allowance as number | null,
        proratedEstimate: raw.prorated_estimate as number | null,
        effectiveAt: raw.effective_at as string,
        keepsCurrentPlanUntil: raw.keeps_current_plan_until as string | undefined,
      },
      error: null,
    };
  }

  async function changePlan(creatorId: string, newTier: string): Promise<{ error: string | null }> {
    const { error: e } = await supabase.schema("client_os").rpc("change_creator_plan", { p_creator_id: creatorId, p_new_tier: newTier });
    if (!e) await refetch();
    return { error: e?.message ?? null };
  }

  async function cancelPendingPlanChange(creatorId: string): Promise<{ error: string | null }> {
    const { error: e } = await supabase.schema("client_os").rpc("cancel_pending_plan_change", { p_creator_id: creatorId });
    if (!e) await refetch();
    return { error: e?.message ?? null };
  }

  async function cancelSubscription(creatorId: string): Promise<{ error: string | null }> {
    const { error: e } = await supabase.schema("client_os").rpc("cancel_creator_subscription", { p_creator_id: creatorId });
    if (!e) await refetch();
    return { error: e?.message ?? null };
  }

  async function undoCancellation(creatorId: string): Promise<{ error: string | null }> {
    const { error: e } = await supabase.schema("client_os").rpc("undo_creator_subscription_cancellation", { p_creator_id: creatorId });
    if (!e) await refetch();
    return { error: e?.message ?? null };
  }

  return { summaries, loading, error, refetch, previewPlanChange, changePlan, cancelPendingPlanChange, cancelSubscription, undoCancellation };
}
