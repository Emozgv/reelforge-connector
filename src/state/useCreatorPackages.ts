import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { CreatorPackage } from "../types";

interface CreatorPackageRow {
  creator_id: string;
  plan_tier: string;
  plan_label: string;
  price_monthly: number | null;
  monthly_reel_allowance: number;
  billing_cycle_start: string;
  status: string;
}

// Real per-creator plan terms (client_os.creator_packages) — one row per
// creator that actually has an active ReelForge plan. Set by ReelForge,
// no client-facing write path yet. A creator absent from this map has no
// active plan; render that as "No active plan," never a default/free tier.
export function useCreatorPackages(workspaceId: string | undefined) {
  const [packages, setPackages] = useState<Map<string, CreatorPackage>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setPackages(new Map());
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    (async () => {
      const { data } = await supabase
        .schema("client_os")
        .from("creator_packages")
        .select("*")
        .eq("workspace_id", workspaceId);

      if (!active) return;
      const map = new Map<string, CreatorPackage>();
      for (const row of (data ?? []) as CreatorPackageRow[]) {
        map.set(row.creator_id, {
          creatorId: row.creator_id,
          planTier: row.plan_tier as CreatorPackage["planTier"],
          planLabel: row.plan_label,
          priceMonthly: row.price_monthly ?? undefined,
          monthlyReelAllowance: row.monthly_reel_allowance,
          billingCycleStart: row.billing_cycle_start,
          status: row.status as CreatorPackage["status"],
        });
      }
      setPackages(map);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [workspaceId]);

  return { packages, loading };
}
