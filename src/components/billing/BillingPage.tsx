import { useState } from "react";
import { ArrowLeft, Ban, CreditCard, Loader2, RefreshCw, RotateCcw, ShieldAlert, Sparkles } from "lucide-react";
import type { Creator } from "../../types";
import { useCreatorBillingSummaries, type CreatorBillingSummary, type PlanChangePreview } from "../../state/useCreatorBillingSummaries";
import { usePlanCatalog, type PlanCatalogEntry } from "../../lib/planCatalog";
import { startStripeCheckout, manageStripeSubscription } from "../../lib/stripe";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n % 1 === 0 ? n : n.toFixed(2)}`;
}

// ---- Change-plan dedicated view -------------------------------------------------

function ChangePlanView({
  creator,
  summary,
  catalog,
  onBack,
  onConfirmed,
  previewPlanChange,
  changePlan,
  refetch,
}: {
  creator: Creator;
  summary: CreatorBillingSummary;
  catalog: PlanCatalogEntry[];
  onBack: () => void;
  onConfirmed: () => void;
  previewPlanChange: (creatorId: string, newTier: string) => Promise<{ preview: PlanChangePreview | null; error: string | null }>;
  changePlan: (creatorId: string, newTier: string) => Promise<{ error: string | null }>;
  refetch: () => void;
}) {
  const selectable = catalog.filter((p) => (p.tier === "S" || p.tier === "M" || p.tier === "L") && p.tier !== summary.planTier);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [preview, setPreview] = useState<PlanChangePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function selectTier(tier: string) {
    setSelectedTier(tier);
    setPreview(null);
    setError(null);
    const res = await previewPlanChange(creator.id, tier);
    if (res.error) setError(res.error);
    else setPreview(res.preview);
  }

  async function confirm() {
    if (!selectedTier || !preview) return;
    setBusy(true);
    const res = summary.hasStripeSubscription
      ? await manageStripeSubscription({ creatorId: creator.id, action: preview.isUpgrade ? "upgrade" : "downgrade", newTier: selectedTier as "S" | "M" | "L" })
      : await changePlan(creator.id, selectedTier);
    setBusy(false);
    if (res.error) setError(res.error);
    else {
      if (summary.hasStripeSubscription) refetch();
      onConfirmed();
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[640px] mx-auto px-8 pt-6 pb-10">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] text-neutral-500 hover:text-neutral-200 transition-colors">
          <ArrowLeft size={13} />
          Back to Billing
        </button>

        <h1 className="mt-3 text-[19px] font-serif font-medium text-neutral-50">Change plan for {creator.name}</h1>
        <p className="mt-1 text-[12.5px] text-neutral-500">
          Currently on <span className="text-neutral-300">{summary.planLabel}</span>
          {summary.priceMonthly != null && <> · {money(summary.priceMonthly)}/mo</>} · {summary.reelsUsed} / {summary.reelsTotal} reels used this
          cycle.
        </p>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {selectable.map((p) => (
            <button
              key={p.tier}
              onClick={() => void selectTier(p.tier)}
              className={[
                "rounded-xl p-4 text-left border transition-colors duration-150",
                selectedTier === p.tier ? "surface-panel-strong border-[#D39448]/40" : "surface-panel border-white/[0.06] hover:border-white/[0.14]",
              ].join(" ")}
            >
              <p className="text-[13px] font-medium text-neutral-100">{p.label}</p>
              <p className="mt-1 text-[17px] font-serif text-neutral-50">
                {money(p.price)} <span className="text-[11px] text-neutral-500 font-sans">/mo</span>
              </p>
              <p className="mt-1 text-[11.5px] text-neutral-500">{p.monthlyReelAllowance} reels/mo</p>
            </button>
          ))}
        </div>

        {error && <p className="mt-4 text-[12px] text-rose-400">{error}</p>}

        {preview && (
          <div className="mt-5 rounded-xl surface-panel p-4">
            {preview.isUpgrade ? (
              <>
                <p className="text-[12.5px] text-neutral-200">
                  This takes effect <span className="text-neutral-50 font-medium">immediately</span> — {creator.name}'s allowance updates to{" "}
                  {preview.newMonthlyReelAllowance} reels/mo right away.
                </p>
                {preview.proratedEstimate != null && (
                  <p className="mt-2 text-[12px] text-neutral-500 leading-relaxed">
                    Estimated additional charge for the rest of this cycle: <span className="text-neutral-300">{money(preview.proratedEstimate)}</span>.
                    From your next renewal, billing becomes {money(preview.newPrice)}/mo. This is an estimate — the real prorated charge will be
                    calculated automatically once Stripe checkout is connected.
                  </p>
                )}
              </>
            ) : (
              <p className="text-[12.5px] text-neutral-200 leading-relaxed">
                {creator.name} keeps the current <span className="text-neutral-50 font-medium">{summary.planLabel}</span> plan and allowance through
                the end of this billing cycle. The change to <span className="text-neutral-50 font-medium">{preview.newLabel}</span> (
                {money(preview.newPrice)}/mo, {preview.newMonthlyReelAllowance} reels/mo) takes effect on{" "}
                <span className="text-neutral-50 font-medium">{formatDate(preview.effectiveAt)}</span> — no charge before then, and you can undo this
                any time until it applies.
              </p>
            )}
            <button
              disabled={busy}
              onClick={() => void confirm()}
              className="mt-3.5 h-9 px-4 rounded-lg text-[12.5px] font-medium bg-[#D39448] text-[#020508] hover:brightness-110 transition-[filter] flex items-center gap-2 disabled:opacity-50"
            >
              {busy && <Loader2 size={13} className="animate-spin" />}
              Confirm {preview.isUpgrade ? "upgrade" : "downgrade"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Cancel-subscription dedicated view -----------------------------------------

function CancelSubscriptionView({
  creator,
  summary,
  onBack,
  onConfirmed,
  cancelSubscription,
  refetch,
}: {
  creator: Creator;
  summary: CreatorBillingSummary;
  onBack: () => void;
  onConfirmed: () => void;
  cancelSubscription: (creatorId: string) => Promise<{ error: string | null }>;
  refetch: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    const res = summary.hasStripeSubscription
      ? await manageStripeSubscription({ creatorId: creator.id, action: "cancel" })
      : await cancelSubscription(creator.id);
    setBusy(false);
    if (res.error) setError(res.error);
    else {
      if (summary.hasStripeSubscription) refetch();
      onConfirmed();
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[560px] mx-auto px-8 pt-6 pb-10">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] text-neutral-500 hover:text-neutral-200 transition-colors">
          <ArrowLeft size={13} />
          Back to Billing
        </button>

        <div className="mt-3 flex items-center gap-2">
          <ShieldAlert size={16} className="text-rose-400" />
          <h1 className="text-[19px] font-serif font-medium text-neutral-50">Cancel subscription</h1>
        </div>

        <div className="mt-5 rounded-xl surface-panel p-4">
          <p className="text-[12.5px] text-neutral-200">
            You're about to cancel the subscription for <span className="text-neutral-50 font-medium">{creator.name}</span>, currently on{" "}
            {summary.planLabel} ({money(summary.priceMonthly)}/mo).
          </p>
          <ul className="mt-3 space-y-1.5 text-[12px] text-neutral-400 list-disc list-inside">
            <li>
              Access and the current {summary.reelsTotal}-reel allowance stay valid through{" "}
              <span className="text-neutral-200">{formatDate(summary.periodEnd)}</span>.
            </li>
            <li>The subscription will not renew after that date.</li>
            <li>You can undo this any time before {formatDate(summary.periodEnd)}.</li>
          </ul>
        </div>

        {error && <p className="mt-4 text-[12px] text-rose-400">{error}</p>}

        <button
          disabled={busy}
          onClick={() => void confirm()}
          className="mt-5 h-9 px-4 rounded-lg text-[12.5px] font-medium bg-rose-500/90 text-white hover:brightness-110 transition-[filter] flex items-center gap-2 disabled:opacity-50"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          Confirm cancellation
        </button>
      </div>
    </div>
  );
}

// ---- Per-creator card -------------------------------------------------------------

function CreatorPlanCard({
  creator,
  summary,
  catalog,
  canChangePlanFallback,
  onOpenChangePlan,
  onOpenCancel,
  cancelPendingPlanChange,
  undoCancellation,
  refetch,
}: {
  creator: Creator;
  summary: CreatorBillingSummary | undefined;
  catalog: PlanCatalogEntry[];
  canChangePlanFallback: boolean;
  onOpenChangePlan: () => void;
  onOpenCancel: () => void;
  cancelPendingPlanChange: (creatorId: string) => Promise<{ error: string | null }>;
  undoCancellation: (creatorId: string) => Promise<{ error: string | null }>;
  refetch: () => void;
}) {
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function beginCheckout(kind: "subscription" | "trial", tier?: "S" | "M" | "L") {
    setCheckoutBusy(kind + (tier ?? ""));
    setCheckoutError(null);
    const res = await startStripeCheckout({ creatorId: creator.id, kind, tier });
    if (res.error) {
      setCheckoutError(res.error);
      setCheckoutBusy(null);
    }
    // on success the browser navigates away to Stripe Checkout
  }
  const [busy, setBusy] = useState(false);
  const hasPlan = summary?.hasPlan;
  const canChangePlan = summary?.canChangePlan ?? canChangePlanFallback;
  const canCancel = summary?.canCancel ?? false;
  const isEnterprise = summary?.planTier === "Enterprise";
  const isTrial = summary?.planTier === "Trial";
  const pct =
    hasPlan && !isEnterprise && summary?.reelsTotal ? Math.min(100, ((summary.reelsUsed ?? 0) / summary.reelsTotal) * 100) : 0;

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
        <span
          className={[
            "shrink-0 text-[10.5px] font-medium px-2 py-[3px] rounded-full",
            !hasPlan
              ? "text-neutral-500 bg-white/[0.05] border border-white/[0.08]"
              : isEnterprise
                ? "text-[#D39448] bg-[#D39448]/15 border border-[#D39448]/30"
                : "text-neutral-200 bg-white/[0.08] border border-white/[0.12]",
          ].join(" ")}
        >
          {hasPlan ? summary?.planLabel : "No active plan"}
        </span>
      </div>

      {hasPlan && summary ? (
        <div className="mt-3.5 pt-3.5 border-t border-white/[0.06]">
          {isEnterprise ? (
            <p className="text-[12.5px] text-neutral-300">Pooled Enterprise allowance — managed directly by ReelForge.</p>
          ) : isTrial && summary.trialExhausted ? (
            <p className="text-[12.5px] text-amber-300/90 leading-relaxed">
              Trial completed — all 5 reels used. Choose a plan below to keep producing for {creator.name.split(" ")[0]}.
            </p>
          ) : (
            <>
              <div className="flex items-baseline justify-between text-[12.5px]">
                <span>
                  <span className="text-neutral-100 font-medium tabular-nums">{summary.reelsUsed}</span>
                  <span className="text-neutral-500"> / {summary.reelsTotal} reels {isTrial ? "(one-time)" : "this cycle"}</span>
                </span>
                <span className="text-neutral-400">{isTrial ? "$25 one-time" : `${money(summary.priceMonthly)}/mo`}</span>
              </div>
              <div className="relative mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#A97942] to-[#D39448]" style={{ width: `${pct}%` }} />
              </div>
            </>
          )}

          {!isEnterprise && (
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-neutral-600">
              <span>{isTrial ? `Started ${formatDate(summary.billingCycleStart)}` : `Renews ${formatDate(summary.periodEnd)}`}</span>
              <span>
                {summary.regenCreditsRemaining ?? 0} regen credit{(summary.regenCreditsRemaining ?? 0) === 1 ? "" : "s"} left
              </span>
            </div>
          )}

          {!isTrial && !isEnterprise && (
            <p className="mt-1.5 text-[10.5px] text-neutral-600">
              Setup fee: {summary.setupFeePaidAt ? `paid ${formatDate(summary.setupFeePaidAt)}` : "—"}
            </p>
          )}

          {summary.pendingChangeEffectiveAt && (
            <div className="mt-3 rounded-lg bg-amber-400/[0.06] border border-amber-400/20 px-3 py-2">
              <p className="text-[11.5px] text-amber-200/90">
                Changing to {summary.pendingPlanLabel} on {formatDate(summary.pendingChangeEffectiveAt)}.
              </p>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  if (summary.hasStripeSubscription) {
                    await manageStripeSubscription({ creatorId: creator.id, action: "undo_downgrade" });
                    refetch();
                  } else {
                    await cancelPendingPlanChange(creator.id);
                  }
                  setBusy(false);
                }}
                className="mt-1 text-[11px] text-amber-300 hover:text-amber-100 underline underline-offset-2"
              >
                Undo
              </button>
            </div>
          )}

          {summary.cancelAtPeriodEnd && (
            <div className="mt-3 rounded-lg bg-rose-400/[0.06] border border-rose-400/20 px-3 py-2">
              <p className="text-[11.5px] text-rose-300/90">Subscription ends {formatDate(summary.cancellationEffectiveAt)} — won't renew.</p>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  if (summary.hasStripeSubscription) {
                    await manageStripeSubscription({ creatorId: creator.id, action: "undo_cancel" });
                    refetch();
                  } else {
                    await undoCancellation(creator.id);
                  }
                  setBusy(false);
                }}
                className="mt-1 text-[11px] text-rose-300 hover:text-rose-100 underline underline-offset-2"
              >
                Undo cancellation
              </button>
            </div>
          )}

          {!isEnterprise && (
            <div className="mt-3 flex items-center gap-3">
              {canChangePlan ? (
                <button
                  onClick={onOpenChangePlan}
                  className="inline-flex items-center gap-1.5 text-[11.5px] text-neutral-400 hover:text-[#D39448] transition-colors duration-150"
                >
                  <RefreshCw size={11} />
                  Change plan
                </button>
              ) : (
                <p className="text-[11px] text-neutral-600">Ask the Owner to change this creator's plan.</p>
              )}
              {!isTrial && canCancel && !summary.cancelAtPeriodEnd && (
                <button
                  onClick={onOpenCancel}
                  className="inline-flex items-center gap-1.5 text-[11.5px] text-neutral-500 hover:text-rose-400 transition-colors duration-150"
                >
                  <Ban size={11} />
                  Cancel subscription
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3.5 pt-3.5 border-t border-white/[0.06]">
          <p className="text-[11.5px] text-neutral-500 leading-relaxed">
            No active ReelForge plan — reels can't be produced for {creator.name.split(" ")[0]} until one is set up.
          </p>
          {checkoutError && <p className="mt-2 text-[11px] text-rose-400">{checkoutError}</p>}
          {canChangePlanFallback ? (
            <>
              <button
                disabled={checkoutBusy !== null}
                onClick={() => void beginCheckout("trial")}
                className="mt-2.5 inline-flex items-center gap-1.5 h-8 px-3 rounded-full surface-field text-neutral-200 text-[11.5px] font-medium hover:bg-white/[0.06] transition-colors duration-150 disabled:opacity-50"
              >
                {checkoutBusy === "trial" ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                Start Trial — $25
              </button>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {catalog
                  .filter((p) => p.tier === "S" || p.tier === "M" || p.tier === "L")
                  .map((p) => (
                    <button
                      key={p.tier}
                      disabled={checkoutBusy !== null}
                      onClick={() => void beginCheckout("subscription", p.tier as "S" | "M" | "L")}
                      className="h-8 px-2 rounded-lg bg-[#D39448] text-[#020508] text-[11px] font-medium hover:brightness-110 transition-[filter] duration-150 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {checkoutBusy === "subscription" + p.tier && <Loader2 size={10} className="animate-spin" />}
                      {p.label} ${p.price}
                    </button>
                  ))}
              </div>
            </>
          ) : (
            <p className="mt-2.5 text-[11px] text-neutral-600">Ask the Owner to set up a plan.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Page ---------------------------------------------------------------------------

type View = { type: "list" } | { type: "change"; creatorId: string } | { type: "cancel"; creatorId: string };

function RegenPackButton({ creatorId, count, price }: { creatorId: string; count: 5 | 10 | 25; price: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setError(null);
    const res = await startStripeCheckout({ creatorId, kind: "regen_pack", pack: count });
    if (res.error) {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <button
      disabled={busy}
      onClick={() => void buy()}
      className="rounded-lg surface-field px-3 py-2.5 text-center hover:bg-white/[0.06] transition-colors duration-150 disabled:opacity-50"
    >
      <p className="text-[15px] font-serif text-neutral-50 flex items-center justify-center gap-1.5">
        {busy && <Loader2 size={12} className="animate-spin" />}
        {count}
      </p>
      <p className="text-[11px] text-neutral-500">${price}</p>
      {error && <p className="mt-1 text-[9.5px] text-rose-400">{error}</p>}
    </button>
  );
}

export function BillingPage({
  creators,
  workspaceId,
  canChangePlan,
}: {
  creators: Creator[];
  workspaceId: string | undefined;
  canChangePlan: boolean;
}) {
  const { summaries, refetch, previewPlanChange, changePlan, cancelPendingPlanChange, cancelSubscription, undoCancellation } =
    useCreatorBillingSummaries(workspaceId);
  const { catalog } = usePlanCatalog();
  const [view, setView] = useState<View>({ type: "list" });

  const activeCount = creators.filter((c) => summaries.get(c.id)?.hasPlan).length;
  const monthlySpend = creators.reduce((sum, c) => {
    const s = summaries.get(c.id);
    if (!s?.hasPlan || s.planTier === "Trial") return sum;
    return sum + (s.priceMonthly ?? 0);
  }, 0);
  const hasEnterprise = [...summaries.values()].some((s) => s.planTier === "Enterprise");
  const totalRegenRemaining = creators.reduce((sum, c) => sum + (summaries.get(c.id)?.regenCreditsRemaining ?? 0), 0);
  const creatorsWithPlan = creators.filter((c) => summaries.get(c.id)?.hasPlan);
  const [regenCreatorId, setRegenCreatorId] = useState<string | null>(null);
  const activeRegenCreatorId = regenCreatorId ?? creatorsWithPlan[0]?.id ?? null;

  if (view.type === "change") {
    const creator = creators.find((c) => c.id === view.creatorId);
    const summary = summaries.get(view.creatorId);
    if (creator && summary?.hasPlan) {
      return (
        <ChangePlanView
          creator={creator}
          summary={summary}
          catalog={catalog}
          onBack={() => setView({ type: "list" })}
          onConfirmed={() => setView({ type: "list" })}
          previewPlanChange={previewPlanChange}
          changePlan={changePlan}
          refetch={refetch}
        />
      );
    }
  }

  if (view.type === "cancel") {
    const creator = creators.find((c) => c.id === view.creatorId);
    const summary = summaries.get(view.creatorId);
    if (creator && summary?.hasPlan) {
      return (
        <CancelSubscriptionView
          creator={creator}
          summary={summary}
          onBack={() => setView({ type: "list" })}
          onConfirmed={() => setView({ type: "list" })}
          cancelSubscription={cancelSubscription}
          refetch={refetch}
        />
      );
    }
  }

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
            <p className="text-[10px] tracking-wide uppercase text-neutral-500">Regen credits remaining</p>
            <p className="mt-1 text-[19px] font-serif text-neutral-50 tabular-nums">{totalRegenRemaining}</p>
          </div>
        </div>

        <h2 className="mt-8 text-[13px] font-medium text-neutral-200">Per creator</h2>
        {creators.length === 0 ? (
          <p className="mt-3 text-[12px] text-neutral-500">Add a Creator to set up their plan.</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {creators.map((c) => (
              <CreatorPlanCard
                key={c.id}
                creator={c}
                summary={summaries.get(c.id)}
                catalog={catalog}
                canChangePlanFallback={canChangePlan}
                onOpenChangePlan={() => setView({ type: "change", creatorId: c.id })}
                onOpenCancel={() => setView({ type: "cancel", creatorId: c.id })}
                cancelPendingPlanChange={cancelPendingPlanChange}
                undoCancellation={undoCancellation}
                refetch={refetch}
              />
            ))}
          </div>
        )}

        <div className="mt-8 rounded-xl surface-panel p-4">
          <div className="flex items-center gap-1.5">
            <RefreshCw size={13} className="text-[#D39448]" />
            <h2 className="text-[13px] font-medium text-neutral-100">Regenerations</h2>
          </div>
          <p className="mt-1.5 text-[11.5px] text-neutral-500 leading-relaxed">
            Regenerations are a separate credit balance from reels — a QC failure is always replaced free, no credit used. Buy more as a one-time
            pack:
          </p>
          {creatorsWithPlan.length === 0 ? (
            <p className="mt-3 text-[11.5px] text-neutral-600">Set up a creator's plan first to buy regeneration credits for them.</p>
          ) : (
            <>
              <label className="mt-3 block text-[10.5px] text-neutral-500">For creator</label>
              <select
                value={activeRegenCreatorId ?? ""}
                onChange={(e) => setRegenCreatorId(e.target.value)}
                className="mt-1 h-8 px-2 rounded-md surface-field text-[12.5px] text-neutral-100 outline-none"
              >
                {creatorsWithPlan.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#0b0f14]">
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="mt-3 grid grid-cols-3 gap-2.5">
                {activeRegenCreatorId && (
                  <>
                    <RegenPackButton creatorId={activeRegenCreatorId} count={5} price={20} />
                    <RegenPackButton creatorId={activeRegenCreatorId} count={10} price={35} />
                    <RegenPackButton creatorId={activeRegenCreatorId} count={25} price={69} />
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <h2 className="mt-8 text-[13px] font-medium text-neutral-200 flex items-center gap-2">
          <CreditCard size={14} className="text-[#D39448]" />
          Payment &amp; billing management
        </h2>
        <p className="mt-1 text-[12px] text-neutral-600 max-w-md">
          Subscriptions, upgrades, downgrades, cancellations, Trial, and regeneration packs above are all real — backed by Stripe Checkout and
          your subscription webhooks.
        </p>
        <div className="mt-3 rounded-xl surface-panel p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12.5px] text-neutral-300">Update payment method &amp; invoices</p>
            <p className="text-[11px] text-neutral-600 mt-0.5">Add or change the card on file, download past charges.</p>
          </div>
          <span className="shrink-0 text-[9px] tracking-wide uppercase text-neutral-600 border border-white/[0.08] rounded-[3px] px-1.5 py-[2px] flex items-center gap-1">
            <RotateCcw size={9} />
            Coming soon
          </span>
        </div>
      </div>
    </div>
  );
}
