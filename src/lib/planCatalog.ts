import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// Single source of truth for tier/label/price/allowance (client_os.plan_catalog)
// — replaces any hardcoded plan constants. Enterprise has null price/allowance
// (custom quote, not a flat number); Trial is one-time (price_is_recurring
// false), not a monthly subscription.
export interface PlanCatalogEntry {
  tier: "Trial" | "S" | "M" | "L" | "Enterprise";
  label: string;
  price: number | null;
  priceIsRecurring: boolean;
  monthlyReelAllowance: number | null;
  sortOrder: number;
}

interface PlanCatalogRow {
  tier: string;
  label: string;
  price: number | null;
  price_is_recurring: boolean;
  monthly_reel_allowance: number | null;
  sort_order: number;
}

export function usePlanCatalog() {
  const [catalog, setCatalog] = useState<PlanCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.schema("client_os").from("plan_catalog").select("*").order("sort_order");
      if (!active) return;
      setCatalog(
        ((data ?? []) as PlanCatalogRow[]).map((r) => ({
          tier: r.tier as PlanCatalogEntry["tier"],
          label: r.label,
          price: r.price,
          priceIsRecurring: r.price_is_recurring,
          monthlyReelAllowance: r.monthly_reel_allowance,
          sortOrder: r.sort_order,
        }))
      );
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return { catalog, loading };
}
