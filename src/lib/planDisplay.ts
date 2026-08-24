import type { CreatorPackage } from "../types";

// Shared plan-badge styling so a creator's plan reads identically wherever it
// appears (Creators list, Creator profile, Billing) — never invents a value,
// just formats whatever CreatorPackage (or its absence) actually is.
export function planBadgeStyle(pkg: CreatorPackage | undefined): string {
  if (!pkg) return "text-neutral-500 bg-white/[0.05] border border-white/[0.08]";
  if (pkg.planTier === "Enterprise") return "text-[#D39448] bg-[#D39448]/15 border border-[#D39448]/30";
  return "text-neutral-200 bg-white/[0.08] border border-white/[0.12]";
}

export function planBadgeLabel(pkg: CreatorPackage | undefined): string {
  return pkg ? pkg.planLabel : "No active plan";
}

export function planPriceLabel(pkg: CreatorPackage): string {
  if (pkg.planTier === "Enterprise") return "Custom quote";
  return pkg.priceMonthly != null ? `$${pkg.priceMonthly}/mo` : "—";
}
