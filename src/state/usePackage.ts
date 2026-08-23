import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { WorkspacePackage } from "../types";

interface WorkspacePackageRow {
  workspace_id: string;
  plan_name: string;
  monthly_allowance: number;
  regenerations_included: number;
  creator_setups_included: number;
  billing_cycle_start: string;
}

// Real plan terms (client_os.workspace_packages) — set by ReelForge, no
// client-facing write path yet. Read-only, one row per workspace.
export function usePackage(workspaceId: string | undefined) {
  const [pkg, setPkg] = useState<WorkspacePackage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setPkg(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    (async () => {
      const { data } = await supabase
        .schema("client_os")
        .from("workspace_packages")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (!active) return;
      if (data) {
        const row = data as WorkspacePackageRow;
        setPkg({
          planName: row.plan_name,
          monthlyAllowance: row.monthly_allowance,
          regenerationsIncluded: row.regenerations_included,
          creatorSetupsIncluded: row.creator_setups_included,
          billingCycleStart: row.billing_cycle_start,
        });
      } else {
        setPkg(null);
      }
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [workspaceId]);

  return { package: pkg, loading };
}
