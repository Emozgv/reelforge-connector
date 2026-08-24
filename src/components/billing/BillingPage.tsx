import { CreditCard, Mail, RefreshCw } from "lucide-react";
import type { Collection, Creator, CreatorPackage } from "../../types";
import { computeCreatorUsageStats } from "../../lib/creatorUsageStats";
import { planBadgeLabel, planBadgeStyle, planPriceLabel } from "../../lib/planDisplay";

const CONTACT_EMAIL = "hello@reelforgeai.net";

function mailtoFor(subject: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

function CreatorPlanCard({
  creator,
  plan,
  collections,
}: {
  creator: Creator;
  plan: CreatorPackage | undefined;
  collections: Collection[];
}) {
  const usage = plan ? computeCreatorUsageStats(plan, collections) : null;
  const pct = usage && plan && plan.planTier !== "Enterprise" ? Math.min(100, (usage.reelsUsed / usage.reelsTotal) * 100) : 0;

  return (
    <div className="rounded-xl surface-panel p-4">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-medium text-[#020508] shrink-0 ring-1 ring-white/15 overflow-hidden"
          style={creator.profileImage ? undefined : { background: creator.avatarColor }}
        >
          {creator.profileImage ? (
            <img src={creator.profileImage} alt={creator.name} className="w-full h-full object-cover" />
          ) : (
            creator.name.slice(0, 2).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-neutral-100 truncate">{creator.name}</p>
          <p className="text-[11px] text-neutral-500 truncate">{creator.handle}</p>
        </div>
        <span className={["shrink-0 text-[10.5px] font-medium px-2 py-[3px] rounded-full", planBadgeStyle(plan)].join(" ")}>
          {planBadgeLabel(plan)}
        </span>
      </div>

      {plan && usage ? (
        <div className="mt-3.5 pt-3.5 border-t border-white/[0.06]">
          <div className="flex items-baseline justify-between text-[12.5px]">
            <span>
              {plan.planTier === "Enterprise" ? (
                <span className="text-neutral-300">Pooled Enterprise allowance</span>
              ) : (
                <>
                  <span className="text-neutral-100 font-medium tabular-nums">{usage.reelsUsed}</span>
                  <span className="text-neutral-500"> / {usage.reelsTotal} reels this cycle</span>
                </>
              )}
            </span>
            <span className="text-neutral-400">{planPriceLabel(plan)}</span>
          </div>
          {plan.planTier !== "Enterprise" && (
            <div className="relative mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#A97942] to-[#D39448]"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-neutral-600">
            <span>
              Cycle started{" "}
              {new Date(plan.billingCycleStart).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
            </span>
            {usage.paidRegenerationsUsed > 0 && (
              <span>
                {usage.paidRegenerationsUsed} paid regeneration{usage.paidRegenerationsUsed === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <a
            href={mailtoFor(`Change plan for ${creator.name}`)}
            className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] text-neutral-400 hover:text-[#D39448] transition-colors duration-150"
          >
            <RefreshCw size={11} />
            Change plan
          </a>
        </div>
      ) : (
        <div className="mt-3.5 pt-3.5 border-t border-white/[0.06]">
          <p className="text-[11.5px] text-neutral-500 leading-relaxed">
            No active ReelForge plan — reels can't be produced for {creator.name.split(" ")[0]} until one is set up.
          </p>
          <a
            href={mailtoFor(`Set up a plan for ${creator.name}`)}
            className="mt-2.5 inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#D39448] text-[#020508] text-[11.5px] font-medium hover:brightness-110 transition-[filter] duration-150"
          >
            Get started
          </a>
        </div>
      )}
    </div>
  );
}

function ComingSoonRow({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-white/[0.05] last:border-0">
      <div className="min-w-0">
        <p className="text-[12.5px] text-neutral-300">{title}</p>
        <p className="text-[11px] text-neutral-600 mt-0.5">{description}</p>
      </div>
      <span className="shrink-0 text-[9px] tracking-wide uppercase text-neutral-600 border border-white/[0.08] rounded-[3px] px-1.5 py-[2px]">
        Requires Stripe
      </span>
    </div>
  );
}

export function BillingPage({
  creators,
  creatorPackages,
  collections,
}: {
  creators: Creator[];
  creatorPackages: Map<string, CreatorPackage>;
  collections: Collection[];
}) {
  const activeCount = creators.filter((c) => creatorPackages.has(c.id)).length;
  const monthlySpend = creators.reduce((sum, c) => {
    const pkg = creatorPackages.get(c.id);
    return sum + (pkg?.priceMonthly ?? 0);
  }, 0);
  const hasEnterprise = [...creatorPackages.values()].some((p) => p.planTier === "Enterprise");

  const totalPaidRegens = creators.reduce((sum, c) => {
    const pkg = creatorPackages.get(c.id);
    if (!pkg) return sum;
    return sum + computeCreatorUsageStats(pkg, collections).paidRegenerationsUsed;
  }, 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[900px] mx-auto px-8 pt-6 pb-8">
        <span className="text-[10.5px] tracking-[0.14em] uppercase text-[#D39448]/75 font-medium">Billing</span>
        <h1 className="mt-1 text-[20px] font-serif font-medium text-neutral-50">Plans &amp; subscriptions</h1>
        <p className="mt-1 text-[12.5px] text-neutral-500 max-w-lg">
          Every ReelForge plan is per creator — see what's active, what it includes, and current usage for each one.
        </p>

        <div className="mt-6 rounded-xl surface-panel-strong flex divide-x divide-white/[0.06] overflow-hidden">
          <div className="flex-1 px-5 py-4">
            <p className="text-[10px] tracking-wide uppercase text-neutral-500">Creators on a plan</p>
            <p className="mt-1 text-[19px] font-serif text-neutral-50 tabular-nums">
              {activeCount} <span className="text-[12px] text-neutral-500 font-sans">/ {creators.length}</span>
            </p>
          </div>
          <div className="flex-1 px-5 py-4">
            <p className="text-[10px] tracking-wide uppercase text-neutral-500">Monthly spend</p>
            <p className="mt-1 text-[19px] font-serif text-neutral-50 tabular-nums">
              ${monthlySpend}
              {hasEnterprise && <span className="text-[12px] text-neutral-500 font-sans"> + Enterprise</span>}
            </p>
          </div>
          <div className="flex-1 px-5 py-4">
            <p className="text-[10px] tracking-wide uppercase text-neutral-500">Paid regenerations used</p>
            <p className="mt-1 text-[19px] font-serif text-neutral-50 tabular-nums">{totalPaidRegens}</p>
          </div>
        </div>

        <h2 className="mt-8 text-[13px] font-medium text-neutral-200">Per creator</h2>
        {creators.length === 0 ? (
          <p className="mt-3 text-[12px] text-neutral-500">Add a Creator to set up their plan.</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {creators.map((c) => (
              <CreatorPlanCard key={c.id} creator={c} plan={creatorPackages.get(c.id)} collections={collections} />
            ))}
          </div>
        )}

        <div className="mt-8 rounded-xl surface-panel p-4">
          <div className="flex items-center gap-1.5">
            <RefreshCw size={13} className="text-[#D39448]" />
            <h2 className="text-[13px] font-medium text-neutral-100">Regenerations</h2>
          </div>
          <p className="mt-1.5 text-[11.5px] text-neutral-500 leading-relaxed">
            Regenerations are sold as add-on packs (not part of a plan's monthly allowance) — a QC failure is always
            replaced free, no credit used. {totalPaidRegens} paid regeneration{totalPaidRegens === 1 ? "" : "s"} used
            so far.
          </p>
          <a
            href={mailtoFor("Buy more regenerations")}
            className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] text-neutral-400 hover:text-[#D39448] transition-colors duration-150"
          >
            <Mail size={11} />
            Request more regenerations
          </a>
        </div>

        <h2 className="mt-8 text-[13px] font-medium text-neutral-200 flex items-center gap-2">
          <CreditCard size={14} className="text-[#D39448]" />
          Payment &amp; billing management
        </h2>
        <p className="mt-1 text-[12px] text-neutral-600 max-w-md">
          Plan changes and purchases go through ReelForge directly today — self-serve billing below needs a real
          Stripe integration before it can work.
        </p>
        <div className="mt-3 rounded-xl surface-panel p-4">
          <ComingSoonRow title="Update payment method" description="Add or change the card on file." />
          <ComingSoonRow title="Invoices & receipts" description="Download past charges for your records." />
          <ComingSoonRow title="Self-serve upgrade / downgrade" description="Change a creator's plan instantly, no email needed." />
          <ComingSoonRow title="Cancel or pause a plan" description="Stop billing for a creator without contacting ReelForge." />
        </div>
      </div>
    </div>
  );
}
