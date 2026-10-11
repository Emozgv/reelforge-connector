import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Circle,
  Coins,
  CheckCircle2,
  CreditCard,
  Database,
  Crown,
  Gem,
  Info,
  KeyRound,
  Landmark,
  Loader2,
  Mail,
  MapPin,
  MoreHorizontal,
  Play,
  Power,
  ReceiptText,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Target,
  UserCheck,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Creator } from "../../types";
import { useCreatorBillingSummaries, type CreatorBillingSummary, type PlanChangePreview } from "../../state/useCreatorBillingSummaries";
import { usePlanCatalog, type PlanCatalogEntry } from "../../lib/planCatalog";
import { startStripeCheckout, manageStripeSubscription } from "../../lib/stripe";
import { useTeamMembers, MAX_ADDITIONAL_MEMBERS } from "../../state/useTeamMembers";
import { StarfieldBackground } from "../shared/StarfieldBackground";
import { KOPF_ABSTAND, KOPF_KUERZEL, KOPF_TITEL, KOPF_UNTERZEILE } from "../../lib/pageHeader";
import {
  AbschnittKopf,
  Balken,
  GoldKnopf,
  GoldVerweis,
  Auftritt,
  RahmenKnopf,
  Ring,
  Zahl,
  ZeichenFeld,
  V3_GOLD as GOLD,
  V3_KACHEL as KACHEL,
  V3_KACHEL_STIL as KACHEL_STIL,
  V3_KARTE as KARTE,
  V3_KARTE_STIL as KARTE_STIL,
} from "../shared/v3";

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

        <h1 className="mt-3 text-[19px] font-semibold tracking-[-0.1px] text-neutral-50">Change plan for {creator.name}</h1>
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
                    Estimated additional charge for the rest of this cycle: <span className="text-neutral-300">{money(preview.proratedEstimate)}</span>,
                    charged to the card on file right away. From your next renewal, billing becomes {money(preview.newPrice)}/mo.
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
          <h1 className="text-[19px] font-semibold tracking-[-0.1px] text-neutral-50">Cancel subscription</h1>
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

// Die Design-Bausteine liegen jetzt in components/shared/v3.tsx -- sie sind
// die Grundlage fuer den ganzen Workspace, nicht mehr nur fuer diese Seite
// (Emre, 11.10.2026). Hier bleiben nur die beiden Bausteine, die unsere
// Datentypen kennen: das Creator-Bild und die Plan-Pille.

function CreatorBild({ creator, size = 26 }: { creator: Creator; size?: number }) {
  return (
    <span
      className="rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[9px] font-medium text-[#020508] ring-1 ring-[#202024]"
      style={{ width: size, height: size, background: creator.profileImage ? undefined : creator.avatarColor }}
    >
      {creator.profileImage ? (
        <img src={creator.profileImage} alt={creator.name} className="w-full h-full object-cover" />
      ) : (
        creator.name.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

// Die Plan-Pille in der Dienste-Tabelle. Farben je Stufe wie im Design:
// die hoechste Stufe gold, die mittlere violett, die kleine blau, Trial
// neutral, ohne Plan grau.
// "schein" ist bewusst viel schwaecher als der Rand: die Pillen sollen
// Tiefe haben, nicht leuchten (Emre fand den ersten Schein zu hell,
// 11.10.2026).
const PLAN_FARBE: Record<string, { bg: string; rand: string; schein: string; text: string; icon: LucideIcon }> = {
  L: { bg: "rgba(255,190,41,0.12)", rand: "rgba(255,190,41,0.32)", schein: "rgba(255,190,41,0.13)", text: "#EAC088", icon: Crown },
  M: { bg: "rgba(167,106,255,0.12)", rand: "rgba(167,106,255,0.30)", schein: "rgba(167,106,255,0.13)", text: "#c79bff", icon: Gem },
  S: { bg: "rgba(59,146,255,0.12)", rand: "rgba(59,146,255,0.30)", schein: "rgba(59,146,255,0.13)", text: "#79b6ff", icon: Power },
  Trial: { bg: "rgba(255,255,255,0.045)", rand: "rgba(255,255,255,0.11)", schein: "rgba(255,255,255,0.05)", text: "#d4d4d4", icon: Target },
  Enterprise: { bg: "rgba(255,190,41,0.14)", rand: "rgba(255,190,41,0.36)", schein: "rgba(255,190,41,0.15)", text: "#EAC088", icon: Crown },
};

function PlanPille({ tier, label }: { tier?: string; label?: string }) {
  if (!tier) {
    return (
      <span className="inline-flex h-[28px] items-center rounded-[7px] border border-[#202024] bg-[#0e0e11] px-[11px] text-[12px] text-[#8b93a0]">
        No service
      </span>
    );
  }
  const f = PLAN_FARBE[tier] ?? PLAN_FARBE.Trial;
  const Icon = f.icon;
  return (
    <span
      className="inline-flex h-[28px] items-center gap-[6px] rounded-[7px] px-[11px] text-[12px] font-semibold"
      // Der leichte Schein stammt aus Emres Vorlage -- er hebt die Pille von
      // der Zeile ab, ohne sie lauter zu machen (11.10.2026).
      style={{ background: f.bg, border: `1px solid ${f.rand}`, color: f.text, boxShadow: `0 0 10px ${f.schein}` }}
    >
      <Icon size={12} strokeWidth={2} />
      {label}
    </span>
  );
}

// Eine Zeile der Dienste-Tabelle.
function DienstZeile({
  creator,
  summary,
  catalog,
  darfPlanAendern,
  onManage,
  onCancel,
}: {
  creator: Creator;
  summary: CreatorBillingSummary | undefined;
  catalog: PlanCatalogEntry[];
  darfPlanAendern: boolean;
  onManage: () => void;
  onCancel: () => void;
}) {
  const [menueOffen, setMenueOffen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [checkoutFehler, setCheckoutFehler] = useState<string | null>(null);

  async function kaufen(kind: "subscription" | "trial", tier?: "S" | "M" | "L") {
    setCheckoutBusy(kind + (tier ?? ""));
    setCheckoutFehler(null);
    const res = await startStripeCheckout({ creatorId: creator.id, kind, tier });
    if (res.error) {
      setCheckoutFehler(res.error);
      setCheckoutBusy(null);
    }
  }

  const hatPlan = !!summary?.hasPlan;
  const istTrial = summary?.planTier === "Trial";
  const istEnterprise = summary?.planTier === "Enterprise";
  const anteil =
    hatPlan && !istEnterprise && summary?.reelsTotal
      ? Math.min(100, ((summary.reelsUsed ?? 0) / summary.reelsTotal) * 100)
      : 0;
  const tageBis = (() => {
    if (!summary?.periodEnd) return null;
    const d = Math.ceil((new Date(summary.periodEnd).getTime() - Date.now()) / 86400000);
    return d >= 0 ? d : null;
  })();

  return (
    <div className="border-t border-[#1c1c20] grid grid-cols-[minmax(0,1.45fr)_126px_minmax(0,1.5fr)_148px_124px_128px_184px] items-center gap-x-[13px] py-[10px]">
      {/* CREATOR */}
      <div className="flex items-center gap-[10px] min-w-0">
        <CreatorBild creator={creator} size={34} />
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-[#f5f5f5] truncate leading-[17px]">{creator.name}</p>
          <p className="text-[11.5px] text-[#8b93a0] truncate leading-[15px]">{creator.handle}</p>
        </div>
      </div>

      {/* PLAN */}
      <div><PlanPille tier={hatPlan ? summary?.planTier : undefined} label={summary?.planLabel} /></div>

      {/* USAGE THIS CYCLE */}
      <div className="min-w-0">
        {hatPlan && !istEnterprise && summary?.reelsTotal ? (
          <>
            <p className="text-[12.5px] text-[#d4d4d4] leading-[17px]">
              {summary.reelsUsed ?? 0} / {summary.reelsTotal} reels
            </p>
            <div className="mt-[4px] flex items-center gap-[10px]">
              <Balken anteil={anteil} />
              <span className="text-[11.5px] text-[#8b93a0] tabular-nums w-[30px] text-right">{Math.round(anteil)}%</span>
            </div>
          </>
        ) : (
          <span className="text-[13px] text-[#525252]">—</span>
        )}
      </div>

      {/* NEXT RENEWAL */}
      <div>
        {hatPlan ? (
          istTrial ? (
            <>
              <p className="text-[12.5px] text-[#d4d4d4] leading-[17px]">One-time</p>
              <p className="text-[11px] text-[#8b93a0] leading-[15px]">Started {formatDate(summary?.billingCycleStart)}</p>
            </>
          ) : (
            <>
              <p className="text-[12.5px] text-[#d4d4d4] leading-[17px]">{formatDate(summary?.periodEnd)}</p>
              {tageBis !== null && (
                <p className="text-[11px] text-[#8b93a0] leading-[15px]">
                  in {tageBis} day{tageBis === 1 ? "" : "s"}
                </p>
              )}
            </>
          )
        ) : (
          <span className="text-[13px] text-[#525252]">—</span>
        )}
      </div>

      {/* MONTHLY PRICE */}
      <div>
        {hatPlan && summary?.priceMonthly != null ? (
          <p className="text-[17px] font-bold text-[#f5f5f5] leading-[21px] tracking-[-0.3px]">
            {money(summary.priceMonthly)}
            {!istTrial && <span className="text-[11.5px] font-normal text-[#8b93a0]"> /mo</span>}
          </p>
        ) : (
          <span className="text-[13px] text-[#525252]">—</span>
        )}
      </div>

      {/* STATUS */}
      <div>
        {hatPlan ? (
          <span className="inline-flex items-center gap-[6px] rounded-[14px] border border-[rgba(99,192,127,0.3)] bg-[rgba(99,192,127,0.14)] px-[9px] py-[4px] text-[11.5px] text-[#63c07f] shadow-[0_0_10px_rgba(99,192,127,0.1)]">
            <span className="w-[6px] h-[6px] rounded-full bg-[#63c07f] shadow-[0_0_6px_rgba(99,192,127,0.55)]" />
            {summary?.cancelAtPeriodEnd ? "Ends soon" : "Active"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-[6px] text-[11.5px] text-[#8b93a0]">
            <Circle size={11} strokeWidth={1.8} />
            Not set up
          </span>
        )}
      </div>

      {/* ACTIONS */}
      <div className="relative flex items-center justify-end gap-[8px]">
        {hatPlan ? (
          <RahmenKnopf
            onClick={onManage}
            disabled={!darfPlanAendern || istEnterprise}
            title={istEnterprise ? "Enterprise is managed by ReelForge" : !darfPlanAendern ? "Ask the Owner to change this plan" : undefined}
            className="h-[34px] w-full text-[12px]"
          >
            Manage
          </RahmenKnopf>
        ) : (
          <GoldKnopf
            onClick={() => setMenueOffen((o) => !o)}
            disabled={!darfPlanAendern}
            title={!darfPlanAendern ? "Ask the Owner to set up a plan" : undefined}
            className="h-[34px] w-full text-[12px]"
          >
            Add service
          </GoldKnopf>
        )}
        <button
          onClick={() => (hatPlan ? setMenueOffen((o) => !o) : setMenueOffen((o) => !o))}
          className="h-[34px] w-[34px] shrink-0 rounded-[7px] border border-[#26262b] bg-[#0e0e11] text-[#8c877e] hover:text-[#f2f0ef] hover:border-[#3a3a40] transition-colors duration-150 flex items-center justify-center"
        >
          <MoreHorizontal size={15} />
        </button>

        {menueOffen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenueOffen(false)} />
            <div className="absolute right-0 top-[38px] z-40 w-[196px] rounded-[9px] border border-[#26262b] bg-[#0e0e11] p-[5px] shadow-[0_14px_36px_rgba(0,0,0,0.55)]">
              {hatPlan ? (
                <>
                  {!istEnterprise && darfPlanAendern && (
                    <button
                      onClick={() => { setMenueOffen(false); onManage(); }}
                      className="w-full text-left rounded-[6px] px-[9px] py-[7px] text-[11.5px] text-[#d4d4d4] hover:bg-white/[0.05]"
                    >
                      Change plan
                    </button>
                  )}
                  {!istTrial && summary?.canCancel && !summary?.cancelAtPeriodEnd && (
                    <button
                      onClick={() => { setMenueOffen(false); onCancel(); }}
                      className="w-full text-left rounded-[6px] px-[9px] py-[7px] text-[11.5px] text-[#ff8a8a] hover:bg-white/[0.05]"
                    >
                      Cancel subscription
                    </button>
                  )}
                  {istEnterprise && (
                    <p className="px-[9px] py-[7px] text-[11px] text-[#737373]">Managed by ReelForge.</p>
                  )}
                </>
              ) : (
                <>
                  <p className="px-[9px] pt-[5px] pb-[6px] text-[10px] uppercase tracking-[0.1em] text-[#737373]">Set up a service</p>
                  <button
                    disabled={checkoutBusy !== null}
                    onClick={() => void kaufen("trial")}
                    className="w-full text-left rounded-[6px] px-[9px] py-[7px] text-[11.5px] text-[#d4d4d4] hover:bg-white/[0.05] flex items-center gap-2 disabled:opacity-50"
                  >
                    {checkoutBusy === "trial" && <Loader2 size={11} className="animate-spin" />}
                    Trial — $25 one-time
                  </button>
                  {catalog
                    .filter((p) => p.tier === "S" || p.tier === "M" || p.tier === "L")
                    .map((p) => (
                      <button
                        key={p.tier}
                        disabled={checkoutBusy !== null}
                        onClick={() => void kaufen("subscription", p.tier as "S" | "M" | "L")}
                        className="w-full text-left rounded-[6px] px-[9px] py-[7px] text-[11.5px] text-[#d4d4d4] hover:bg-white/[0.05] flex items-center gap-2 disabled:opacity-50"
                      >
                        {checkoutBusy === "subscription" + p.tier && <Loader2 size={11} className="animate-spin" />}
                        {p.label} — ${p.price}/mo
                      </button>
                    ))}
                  {checkoutFehler && <p className="px-[9px] py-[5px] text-[10.5px] text-[#ff8a8a]">{checkoutFehler}</p>}
                </>
              )}
            </div>
          </>
        )}
      </div>
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
  const { summaries, refetch, previewPlanChange, changePlan, cancelSubscription } = useCreatorBillingSummaries(workspaceId);
  const { catalog } = usePlanCatalog();
  const [view, setView] = useState<View>({ type: "list" });

  const monthlySpend = creators.reduce((sum, c) => {
    const s = summaries.get(c.id);
    if (!s?.hasPlan || s.planTier === "Trial") return sum;
    return sum + (s.priceMonthly ?? 0);
  }, 0);
  const totalRegenRemaining = creators.reduce((sum, c) => sum + (summaries.get(c.id)?.regenCreditsRemaining ?? 0), 0);
  const creatorsWithPlan = creators.filter((c) => summaries.get(c.id)?.hasPlan);
  const [regenCreatorId, setRegenCreatorId] = useState<string | null>(null);
  const [krediteOffen, setKrediteOffen] = useState(false);
  const { members, invites } = useTeamMembers(workspaceId);
  const teamCount = members.length + invites.length;
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

  // --- Zahlen fuer die Kopf-Kacheln, alle aus echten Daten --------------
  const mitPlan = creators.filter((c) => summaries.get(c.id)?.hasPlan);
  const wiederkehrend = mitPlan.filter((c) => summaries.get(c.id)?.planTier !== "Trial");
  const kreditGesamt = creators.reduce((s, c) => s + (summaries.get(c.id)?.regenCreditsTotal ?? 0), 0);
  const kreditBenutzt = creators.reduce((s, c) => s + (summaries.get(c.id)?.regenCreditsUsed ?? 0), 0);
  const kreditAnteil = kreditGesamt > 0 ? Math.round((kreditBenutzt / kreditGesamt) * 100) : 0;

  return (
    <div className="relative h-full overflow-y-auto">
      {/* Der warme Schimmer oben -- er gehoert auf die GANZE Breite der
          Flaeche, nicht in den Inhaltsrahmen. Dort endete er vor dem
          rechten Rand und hinterliess einen schwarzen Streifen (Emre,
          11.10.2026). Rein dekorativ, faengt keine Klicks ab. */}
      {/* Sterne im Kopf. Jeder einzelne Stern sieht aus wie auf Collections,
          Library und Research -- dieselbe Grundhelligkeit, derselbe feine
          Schein, dieselbe Groesse. Der Unterschied ist allein die ANZAHL:
          52 statt 110. Vorher war das Feld zusaetzlich auf 50 % gedimmt,
          dadurch wirkten die Sterne matter als auf den anderen Seiten
          (Emre, 11.10.2026). Die Sternschnuppen kommen in unregelmaessigen
          Abstaenden von selbst. */}
      <style>{`
        .rf-billing-starfield .star-twinkle { opacity: 0.6 !important; box-shadow: 0 0 4px rgba(255,250,240,0.45) !important; transform: scale(0.85); }
        @media (prefers-reduced-motion: no-preference) {
          .rf-billing-starfield .star-twinkle { animation-name: star-twinkle-boosted !important; }
        }
      `}</style>
      <div className="dashboard-starfield-boost rf-billing-starfield pointer-events-none absolute inset-x-0 top-0 h-[160px] overflow-hidden">
        <StarfieldBackground starCount={52} />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[200px]"
        style={{
          background:
            "radial-gradient(115% 150% at 68% 0%, rgba(211,148,72,0.042) 0%, rgba(211,148,72,0.014) 40%, rgba(0,0,0,0) 74%)",
        }}
      />
      <div className="relative mx-auto w-full max-w-[1900px] px-6 xl:px-8 pt-8 pb-8 font-sans">{/* Rahmen wie bei den uebrigen Reitern (11.10.2026): Billing stand
          vorher auf 1284 und wirkte dadurch herangezoomt. */}
        {/* ---- Kopfzeile ------------------------------------------------ */}
        {/* Die Seite baut sich beim Oeffnen von oben nach unten auf, statt
            auf einen Schlag dazustehen (Emre, 11.10.2026). Die Staffelung
            ist bewusst kurz -- 70 ms je Abschnitt; mehr fuehlt sich wie
            Warten an. */}
        <Auftritt className="relative">
          <p className={`relative ${KOPF_KUERZEL}`}>Billing</p>
          <h1 className={`relative ${KOPF_TITEL}`}>Billing &amp; subscription</h1>
          <p className={`relative ${KOPF_UNTERZEILE} text-[#8c877e]`}>
            Manage your ReelForge workspace, creator access, services, usage and payments.
          </p>
          <div className="absolute right-0 top-[26px]">
            <RahmenKnopf disabled title="Invoices are not available yet." className="h-[36px]">
              View invoices
              <ArrowRight size={14} />
            </RahmenKnopf>
          </div>
        </Auftritt>

        {/* ---- Billing overview ----------------------------------------- */}
        {/* Gegen Emres Vorlage nachgezogen (11.10.2026): beide Bilder sind
            gleich breit, meine Fassung war durchgehend rund ein Viertel
            kleiner. Dazu fehlten drei Dinge, die der Vorlage ihr Leben
            geben: RUNDE Zeichentraeger mit weichem Schein, hoehere Kacheln,
            und unter dem Monatsbetrag eine feine goldene Linie. */}
        <Auftritt verzoegerung={70}>
        <div className={[KARTE, KOPF_ABSTAND, "p-[17px]"].join(" ")} style={KARTE_STIL}>
          <div className="flex items-start gap-[14px]">
            <ZeichenFeld icon={CalendarDays} size={38} rund glanz />
            <div className="min-w-0 flex-1 pt-[2px]">
              <h2 className="text-[15px] font-semibold leading-[20px] tracking-[-0.1px] text-[#f5f5f5]">Billing overview</h2>
              <p className="mt-[2px] text-[11px] leading-[15px] text-[#afb7c3]">
                A clear overview of your current subscriptions, usage and upcoming payments.
              </p>
            </div>
            <span className="shrink-0 inline-flex h-[34px] items-center gap-[8px] rounded-[7px] border border-[#26262b] bg-[#0e0e11] px-[13px] text-[12px] text-[#d4d4d4]">
              This month
              <ChevronDown size={15} className="opacity-60" />
            </span>
          </div>

          <div className="mt-[16px] grid grid-cols-4 gap-[13px]">
            <div className={[KACHEL, "px-[14px] py-[13px] flex items-start gap-[12px]"].join(" ")} style={KACHEL_STIL}>
              <ZeichenFeld icon={Wallet} size={40} rund glanz />
              <div className="min-w-0">
                <p className="text-[12px] text-[#afb7c3] leading-[16px] truncate">Total monthly spend</p>
                <p className="mt-[2px] text-[24px] leading-[29px] font-bold text-[#f5f5f5] tabular-nums tracking-[-0.5px]">
                  <Zahl wert={monthlySpend} formatieren={(n) => money(Math.round(n))} />
                </p>
                <p className="mt-[1px] text-[11px] text-[#b9c0ca] leading-[15px] truncate">per month, recurring</p>
              </div>
            </div>

            {[
              {
                icon: CreditCard,
                label: "Workspace & Creator Access",
                zahl: mitPlan.length,
                wort: `active creator${mitPlan.length === 1 ? "" : "s"}`,
                bilder: mitPlan.slice(0, 3),
                rest: 0,
              },
              {
                icon: Zap,
                label: "AI Production Services",
                zahl: wiederkehrend.length,
                wort: `active plan${wiederkehrend.length === 1 ? "" : "s"}`,
                bilder: wiederkehrend.slice(0, 2),
                rest: Math.max(0, wiederkehrend.length - 2),
              },
            ].map((k) => (
              <div key={k.label} className={[KACHEL, "px-[14px] py-[13px] flex items-start gap-[12px]"].join(" ")} style={KACHEL_STIL}>
                <ZeichenFeld icon={k.icon} size={40} rund glanz />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-[#afb7c3] leading-[16px] truncate">{k.label}</p>
                  <p className="mt-[1px] text-[16px] leading-[22px] text-[#f5f5f5] truncate">
                    <span className="font-bold"><Zahl wert={k.zahl} /></span> {k.wort}
                  </p>
                  <div className="mt-[5px] flex items-end justify-between gap-2">
                    {/* Die feine goldene Linie unter dem Betrag -- sie steht
                        so in der Vorlage und haelt die Zeile zusammen. */}
                    <span className="text-[12.5px] text-[#d4d4d4] border-b border-[#D39448]/35 pb-[2px] whitespace-nowrap">
                      {money(monthlySpend)} <span className="text-[11px] text-[#b9c0ca]">/ mo</span>
                    </span>
                    <span className="flex -space-x-[8px] items-center">
                      {k.bilder.map((c) => (
                        <CreatorBild key={c.id} creator={c} size={24} />
                      ))}
                      {k.rest > 0 && <span className="ml-[11px] text-[11px] text-[#b9c0ca]">+{k.rest}</span>}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            <div className={[KACHEL, "px-[14px] py-[13px] flex items-start gap-[12px]"].join(" ")} style={KACHEL_STIL}>
              <ZeichenFeld icon={Coins} size={40} rund glanz />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-[#afb7c3] leading-[16px] truncate">Workspace Credits</p>
                <p className="mt-[1px] text-[16px] leading-[22px] text-[#f5f5f5] truncate">
                  <span className="font-bold"><Zahl wert={totalRegenRemaining} /></span> credit{totalRegenRemaining === 1 ? "" : "s"} left
                </p>
                <p className="mt-[1px] text-[11px] text-[#b9c0ca] leading-[15px] truncate">For regenerations</p>
              </div>
              <GoldKnopf
                onClick={() => setKrediteOffen(true)}
                disabled={creatorsWithPlan.length === 0}
                title={creatorsWithPlan.length === 0 ? "Set up a creator's plan first." : undefined}
                className="h-[31px] px-[12px] self-center shrink-0 text-[12px]"
              >
                Buy credits
              </GoldKnopf>
            </div>
          </div>
        </div>
        </Auftritt>

        {/* ---- Workspace & Creator Access -------------------------------- */}
        {/* Feinabgleich gegen Emres Vorlage (11.10.2026): dichter gesetzt als
            zuvor, Werte in Weiss mit gruenem Status statt durchgehend Gold,
            goldumrandeter Manage-Knopf, Fussnoten mit Kreis-Haken in Grau. */}
        <Auftritt verzoegerung={140}>
        <div className={[KARTE, "mt-[14px] p-[14px]"].join(" ")} style={KARTE_STIL}>
          <div className="flex items-start gap-[12px]">
            <ZeichenFeld icon={CalendarDays} size={38} radius={10} glanz />
            <div className="min-w-0 flex-1 pt-[1px]">
              <div className="flex items-center gap-[9px]">
                <h2 className="text-[15px] font-semibold leading-[20px] tracking-[-0.1px] text-[#f5f5f5]">
                  Workspace &amp; Creator Access
                </h2>
                {mitPlan.length > 0 && (
                  <span className="inline-flex items-center gap-[4px] rounded-[12px] border border-[rgba(99,192,127,0.28)] bg-[rgba(99,192,127,0.14)] px-[7px] py-[2px] text-[10px] text-[#63c07f]">
                    <CheckCircle2 size={10} strokeWidth={2} />
                    Active
                  </span>
                )}
              </div>
              <p className="mt-[3px] text-[11px] leading-[15px] text-[#afb7c3]">
                Your agency workspace, team access and creator app for all connected creators.
              </p>
            </div>
            <div className="shrink-0 flex items-start gap-[14px]">
              <div className="text-right pt-[1px]">
                <p className="text-[9.5px] leading-[13px] text-[#b9c0ca]">Current Creator Access total</p>
                <p className="text-[19px] leading-[24px] font-bold text-[#f5f5f5] tabular-nums tracking-[-0.3px]">
                  <Zahl wert={monthlySpend} formatieren={(n) => money(Math.round(n))} />{" "}
                  <span className="text-[11px] font-normal text-[#b0b7c0]">/ month</span>
                </p>
                <p className="text-[10px] leading-[14px] text-[#b9c0ca]">
                  {mitPlan.length} active creator{mitPlan.length === 1 ? "" : "s"}
                </p>
              </div>
              {/* Der Knopf traegt in der Vorlage einen goldenen Rand, nicht
                  den grauen der uebrigen Knoepfe. */}
              <button
                disabled
                title="Managed per creator in the table below."
                className="h-[34px] px-[20px] rounded-[7px] text-[11.5px] text-[#f2f0ef] border border-[#D39448]/55 bg-[#17171a] disabled:cursor-default"
              >
                Manage
              </button>
            </div>
          </div>

          <div className="mt-[11px] grid grid-cols-5 gap-[10px]">
            {[
              { icon: ShieldCheck, label: "Agency workspace", wert: <span className="text-[#63c07f] [text-shadow:0_0_7px_rgba(99,192,127,0.14)]">Active</span>, sub: "Full platform access for your team." },
              { icon: Users, label: "Team members", wert: <>{teamCount} / {MAX_ADDITIONAL_MEMBERS} used</>, sub: "Invite and manage your team." },
              { icon: UserCheck, label: "Active creators", wert: <>{creators.length} creator{creators.length === 1 ? "" : "s"}</>, sub: "Connected to your workspace." },
              { icon: KeyRound, label: "Creator Access", wert: <>{mitPlan.length} <span className="text-[#63c07f] [text-shadow:0_0_7px_rgba(99,192,127,0.14)]">active</span></>, sub: "Billed per creator with a plan." },
              { icon: Smartphone, label: "Creator App", wert: <span className="text-[#63c07f] [text-shadow:0_0_7px_rgba(99,192,127,0.14)]">Included</span>, sub: "For all active creators." },
            ].map((k) => (
              <div key={k.label} className={[KACHEL, "px-[12px] py-[10px] flex items-start gap-[10px]"].join(" ")} style={KACHEL_STIL}>
                <ZeichenFeld icon={k.icon} size={30} radius={8} glanz />
                <div className="min-w-0">
                  {/* Die Beschriftung ist in der Vorlage hell, nicht grau -- Figmas
                      Weiss #f5f5f5. Der Rang entsteht ueber Groesse und
                      Schnitt des Wertes darunter, nicht ueber die Farbe. */}
                  <p className="text-[11.5px] leading-[16px] text-[#f5f5f5] truncate">{k.label}</p>
                  <p className="text-[14px] leading-[19px] font-semibold text-[#f5f5f5] truncate">{k.wert}</p>
                  <p className="text-[10px] leading-[14px] text-[#b9c0ca] truncate">{k.sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Der Streifen hat in der Vorlage eine eigene, minimal hellere
              Toenung als die Karte darueber -- genau diese kleine Abweichung
              laesst ihn als eigenen Bereich lesen (Emre, 11.10.2026). */}
          <div
            className="mt-[10px] rounded-[9px] border border-[#1a130b] px-[15px] py-[7px] flex items-center"
            style={{ background: "linear-gradient(0deg, rgba(255,255,255,0.022), rgba(255,255,255,0.022)), " + String(KACHEL_STIL.background) }}
          >
            {[
              "Workspace access for your agency is included.",
              "Creator Access is billed per active creator.",
              "AI Production plans include Creator Access automatically.",
              "Credits are shared across your workspace.",
            ].map((text, i) => (
              <span
                key={text}
                className={[
                  "flex-1 flex items-center gap-[8px] whitespace-nowrap text-[10px] text-[#b9c0ca]",
                  i > 0 ? "border-l border-[#1c1c20] pl-[16px]" : "",
                ].join(" ")}
              >
                <CheckCircle2 size={10} strokeWidth={1.8} className="shrink-0 text-[#b9c0ca]" />
                {text}
              </span>
            ))}
          </div>
        </div>
        </Auftritt>

        {/* ---- AI video production services ------------------------------ */}
        <Auftritt verzoegerung={210}>
        <div className={[KARTE, "mt-[14px] p-[17px]"].join(" ")} style={KARTE_STIL}>
          <AbschnittKopf
            icon={Play}
            titel="AI video production services"
            unterzeile="Production services for your creators. We handle the AI-generated videos based on your selected plan."
            rechts={
              <GoldKnopf disabled={!canChangePlan} title={!canChangePlan ? "Ask the Owner to set up a plan." : "Use Add service on a creator below."}>
                Add creator service
              </GoldKnopf>
            }
          />

          <div className="mt-[14px]">
            <div className="grid grid-cols-[minmax(0,1.45fr)_126px_minmax(0,1.5fr)_148px_124px_128px_184px] items-center gap-x-[12px] pb-[10px] text-[10.5px] uppercase tracking-[0.07em] text-[#8b93a0]">
              <span>Creator</span>
              <span>Plan</span>
              <span className="flex items-center gap-[5px]">Usage this cycle <Info size={12} className="opacity-60" /></span>
              <span>Next renewal</span>
              <span>Monthly price</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>

            {creators.length === 0 ? (
              <p className="border-t border-[#1c1c20] py-[14px] text-[12px] text-[#737373]">
                Add a creator to set up their production service.
              </p>
            ) : (
              creators.map((c) => (
                <DienstZeile
                  key={c.id}
                  creator={c}
                  summary={summaries.get(c.id)}
                  catalog={catalog}
                  darfPlanAendern={summaries.get(c.id)?.canChangePlan ?? canChangePlan}
                  onManage={() => setView({ type: "change", creatorId: c.id })}
                  onCancel={() => setView({ type: "cancel", creatorId: c.id })}
                />
              ))
            )}
          </div>
        </div>
        </Auftritt>

        {/* ---- Untere Reihe ---------------------------------------------- */}
        <Auftritt verzoegerung={280} className="mt-[14px] grid grid-cols-[478fr_330fr_372fr] gap-[14px] items-stretch">
          {/* Workspace credits */}
          <div className={[KARTE, "min-w-0 px-[16px] pt-[6px] pb-[14px]"].join(" ")} style={KARTE_STIL}>
            <div className="flex items-center gap-[13px] h-[30px]">
              <ZeichenFeld icon={Zap} size={36} rund glanz />
              <h2 className="text-[14px] leading-[20px] font-semibold text-[#f2f0ef]">Workspace credits</h2>
              <span className="ml-auto"><GoldVerweis title="Usage detail is not available yet.">View usage</GoldVerweis></span>
            </div>
            <p className="pl-[49px] text-[8px] leading-[14px] text-[#8c877e]">
              Regenerations are a separate credit balance from reels — a failed QC is always replaced free.
            </p>
            <div className="mt-[14px] flex items-center gap-[19px]">
              {/* Der Ring zeigt, wie viel vom Kreditvorrat NOCH da ist --
                  voll bei allen, halb bei der Haelfte, bei null bleibt die
                  duenne Spur. Er laeuft weich mit, wenn sich der Stand
                  aendert (Emre, 11.10.2026). */}
              <Ring anteil={kreditGesamt > 0 ? (totalRegenRemaining / kreditGesamt) * 100 : 0}>
                <Database size={25} style={{ color: GOLD }} strokeWidth={1.7} />
              </Ring>
              <div className="flex-1 min-w-0">
                <p className="leading-[19px]">
                  <span className="text-[18px] font-semibold text-[#f2f0ef] tabular-nums"><Zahl wert={totalRegenRemaining} /></span>
                  <span className="ml-[6px] text-[14px] font-medium text-[#f2f0ef]">credits</span>
                  <span className="ml-[5px] text-[13px] text-[#a3a3a3]">available</span>
                </p>
                <p className="pt-[2px] text-[9px] leading-[15px] text-[#8c877e]">
                  Used {kreditBenutzt} / {kreditGesamt} this cycle
                </p>
                <div className="mt-[4px] flex items-center gap-[32px]">
                  <Balken anteil={kreditAnteil} />
                  <span className="text-[10px] text-[#8c877e] tabular-nums">{kreditAnteil}%</span>
                </div>
              </div>
            </div>
            <div className="mt-[14px] flex gap-[7px]">
              <GoldKnopf
                onClick={() => setKrediteOffen(true)}
                disabled={creatorsWithPlan.length === 0}
                title={creatorsWithPlan.length === 0 ? "Set up a creator's plan first." : undefined}
                className="flex-1"
              >
                Buy credits
              </GoldKnopf>
              <RahmenKnopf disabled title="Usage detail is not available yet." className="flex-1 border-[#202024]">
                View usage
              </RahmenKnopf>
            </div>
          </div>

          {/* Payment method */}
          {/* Details aus Emres Vorlage (11.10.2026), ohne etwas zu
              vergroessern: Schein am Abschnittszeichen, die drei Zeilen-
              zeichen sitzen in kleinen umrandeten Feldern, Beschriftungen in
              Figmas Grau, Werte in Weiss. */}
          <div className={[KARTE, "min-w-0 px-[15px] pt-[7px] pb-[11px]"].join(" ")} style={KARTE_STIL}>
            {/* Die Kopfzeile stand auf fester Hoehe 30, das Zeichen ist aber
                33 hoch -- es ragte oben und unten heraus, und darunter folgten
                nur 2 Punkt. Dadurch klebten die beiden Felder aneinander
                (Emre, 11.10.2026). Jetzt richtet sich die Zeile nach ihrem
                Inhalt, und darunter stehen 10 Punkt Luft. */}
            <div className="flex items-center gap-[9px] py-[3px]">
              <ZeichenFeld icon={CreditCard} size={33} radius={9} glanz />
              <h2 className="text-[14px] leading-[20px] font-semibold text-[#f5f5f5]">Payment method</h2>
              <span className="ml-auto"><GoldVerweis title="Card management is not available yet.">Manage</GoldVerweis></span>
            </div>
            <div className="mt-[10px] flex h-[37px] items-center gap-[9px] rounded-[5px] border border-[#1a130b] px-[8px]" style={KACHEL_STIL}>
              {/* 11 statt 13: damit hier dieselben 5 Punkt Luft um das Zeichen
                  stehen wie in den drei Zeilen darunter. Mit 13 waren es nur
                  4, und das Zeichen klebte am Rand (Emre, 11.10.2026). */}
              <span className="flex h-[21px] w-[32px] items-center justify-center rounded-[3px] border border-[#202024] bg-[#0e0e11] shrink-0">
                <CreditCard size={11} className="text-[#8b93a0]" />
              </span>
              <span className="text-[11px] text-[#afb7c3]">No card on file</span>
            </div>
            <div className="pt-[7px]">
              {[
                { icon: Mail, label: "Billing email", wert: "Not added", tat: "Add" },
                { icon: MapPin, label: "Billing address", wert: "Not added", tat: "Add" },
                { icon: Landmark, label: "Tax information", wert: "Not added", tat: "Add" },
              ].map((z) => (
                <div key={z.label} className="flex h-[25px] items-center gap-[10px] pl-[1px]">
                  <span className="flex h-[21px] w-[21px] items-center justify-center rounded-[5px] border border-[#1a130b] shrink-0" style={KACHEL_STIL}>
                    <z.icon size={11} className="text-[#b9c0ca]" />
                  </span>
                  <span className="w-[86px] text-[11px] text-[#afb7c3]">{z.label}</span>
                  <span className="text-[11px] text-[#f5f5f5] tracking-[-0.1px]">{z.wert}</span>
                  <span className="ml-auto pr-[3px] text-[11px] text-[#D39448]/55 cursor-default" title="Not available yet.">
                    {z.tat}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Billing history */}
          <div className={[KARTE, "min-w-0 pl-[19px] pr-[16px] pt-[7px] pb-[6px]"].join(" ")} style={KARTE_STIL}>
            {/* Wie bei "Payment method": die Zeile stand auf fester Hoehe 35
                bei einem 35 hohen Zeichen -- es ragte heraus, und die Linie
                darunter klebte am Kopf (Emre, 11.10.2026). Jetzt richtet
                sich die Zeile nach ihrem Inhalt, und die Linie hat 10 Punkt
                Abstand. */}
            <div className="flex items-center gap-[9px] py-[3px]">
              <ZeichenFeld icon={ReceiptText} size={33} radius={9} glanz />
              <h2 className="text-[14px] leading-[20px] font-semibold text-[#f5f5f5]">Billing history</h2>
              <span className="ml-auto"><GoldVerweis title="Invoice history is not available yet.">View all</GoldVerweis></span>
            </div>
            <div className="mt-[10px] border-t border-[#1c1c20] py-[16px]">
              <p className="text-[12px] text-[#b8c0cb]">No invoices yet.</p>
              <p className="mt-[3px] text-[10px] text-[#b9c0ca]">
                Charges appear here once Stripe has billed a full cycle.
              </p>
            </div>
          </div>
        </Auftritt>

        {/* ---- Kredite kaufen (bestehende Funktion, als Fenster) ---------- */}
        {krediteOffen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setKrediteOffen(false)}>
            <div className={[KARTE, "w-[392px] p-[18px]"].join(" ")} style={KARTE_STIL} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start gap-[11px]">
                <ZeichenFeld icon={Coins} size={33} />
                <div className="flex-1">
                  <h2 className="text-[14px] font-semibold text-[#f2f0ef]">Buy regeneration credits</h2>
                  <p className="mt-[2px] text-[9px] text-[#8c877e] leading-[14px]">
                    A failed QC is always replaced free — credits are only for regenerations you ask for.
                  </p>
                </div>
                <button onClick={() => setKrediteOffen(false)} className="text-[#737373] hover:text-[#f2f0ef]">
                  <X size={15} />
                </button>
              </div>
              <label className="mt-[14px] block text-[10px] text-[#737373]">For creator</label>
              <select
                value={activeRegenCreatorId ?? ""}
                onChange={(e) => setRegenCreatorId(e.target.value)}
                className="mt-[4px] h-[33px] w-full rounded-[6px] border border-[#26262b] bg-[#0e0e11] px-[10px] text-[12px] text-[#f2f0ef] outline-none"
              >
                {creatorsWithPlan.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#0e0e11]">
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="mt-[12px] grid grid-cols-3 gap-[8px]">
                {activeRegenCreatorId && (
                  <>
                    <RegenPackButton creatorId={activeRegenCreatorId} count={5} price={20} />
                    <RegenPackButton creatorId={activeRegenCreatorId} count={10} price={35} />
                    <RegenPackButton creatorId={activeRegenCreatorId} count={25} price={69} />
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
