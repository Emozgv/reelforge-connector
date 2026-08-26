import { useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Users as UsersIcon,
  Ban,
  RotateCcw,
  Trash2,
  Gift,
  CalendarClock,
  History,
} from "lucide-react";
import { useAdminWorkspaceDetail } from "../../state/useAdminDashboard";
import { usePlanCatalog } from "../../lib/planCatalog";

const STATUS_STYLE: Record<string, string> = {
  active: "text-emerald-300/85 bg-emerald-400/10",
  suspended: "text-amber-300/85 bg-amber-400/10",
  removed: "text-rose-300/85 bg-rose-400/10",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl surface-panel p-4">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-[13px] font-medium text-neutral-200">{title}</h2>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function AdminClientDetail({ workspaceId, onBack }: { workspaceId: string; onBack: () => void }) {
  const {
    detail,
    loading,
    error,
    setStatus,
    setWorkspacePackage,
    grantBonusCredits,
    grantFreePeriod,
    setCreatorPackage,
    grantCreatorBonusCredits,
  } = useAdminWorkspaceDetail(workspaceId);
  const { catalog } = usePlanCatalog();

  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [bonusReels, setBonusReels] = useState("0");
  const [bonusRegens, setBonusRegens] = useState("0");
  const [freeUntilInput, setFreeUntilInput] = useState("");
  const [packageDraft, setPackageDraft] = useState<{ planName: string; monthlyAllowance: string; regens: string; setups: string } | null>(
    null
  );
  const [editingCreatorId, setEditingCreatorId] = useState<string | null>(null);
  const [creatorDraft, setCreatorDraft] = useState<{ tier: "Trial" | "S" | "M" | "L" | "Enterprise"; label: string; price: string; allowance: string }>({
    tier: "S",
    label: "Starter",
    price: "89",
    allowance: "25",
  });
  const [creatorBonus, setCreatorBonus] = useState<Record<string, { reels: string; regens: string }>>({});

  function catalogDefault(tier: string) {
    return catalog.find((p) => p.tier === tier) ?? { label: tier, price: 0, monthlyReelAllowance: 0 };
  }

  async function run(key: string, fn: () => Promise<{ error: string | null }>) {
    setBusy(key);
    setActionError(null);
    const { error: e } = await fn();
    if (e) setActionError(e);
    setBusy(null);
  }

  if (loading && !detail) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={18} className="animate-spin text-neutral-600" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <p className="text-[13px] text-rose-400">{error ?? "Couldn't load this client."}</p>
        <button onClick={onBack} className="text-[12.5px] text-neutral-400 hover:text-neutral-200">
          ← Back to all clients
        </button>
      </div>
    );
  }

  const { workspace, package: pkg, members, creators, recent_activity, regeneration_requests, admin_log } = detail;
  const owner = members.find((m) => m.role === "owner");

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1080px] mx-auto px-8 pt-6 pb-10">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12px] text-neutral-500 hover:text-neutral-200 transition-colors"
        >
          <ArrowLeft size={13} />
          All clients
        </button>

        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <h1 className="text-[20px] font-serif font-medium text-neutral-50">{workspace.name}</h1>
          <span className={["text-[10px] font-medium px-1.5 py-[2px] rounded-[4px] capitalize", STATUS_STYLE[workspace.status]].join(" ")}>
            {workspace.status}
          </span>
        </div>
        <p className="mt-1 text-[12.5px] text-neutral-500">
          Owner: {owner?.display_name || owner?.email || "—"} {owner?.email && <span className="text-neutral-600">· {owner.email}</span>}
        </p>

        {actionError && (
          <p className="mt-3 rounded-lg surface-field px-3 py-2 text-[12px] text-rose-400">{actionError}</p>
        )}

        {/* Status controls */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          {workspace.status !== "active" && (
            <button
              disabled={busy === "status"}
              onClick={() => void run("status", () => setStatus("active"))}
              className="h-8 px-3 rounded-lg text-[12px] font-medium bg-[#D39448] text-[#020508] hover:brightness-110 transition-[filter] flex items-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw size={12} /> Reactivate
            </button>
          )}
          {workspace.status !== "suspended" && (
            <button
              disabled={busy === "status"}
              onClick={() => void run("status", () => setStatus("suspended"))}
              className="h-8 px-3 rounded-lg text-[12px] text-amber-300/85 surface-field hover:bg-amber-400/[0.08] transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Ban size={12} /> Suspend
            </button>
          )}
          {workspace.status !== "removed" && (
            <button
              disabled={busy === "status"}
              onClick={() => {
                if (confirm(`Remove ${workspace.name}? They'll lose access immediately. This can be reversed by reactivating.`)) {
                  void run("status", () => setStatus("removed"));
                }
              }}
              className="h-8 px-3 rounded-lg text-[12px] text-rose-400/85 surface-field hover:bg-rose-400/[0.08] transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Trash2 size={12} /> Remove
            </button>
          )}
          {busy === "status" && <Loader2 size={13} className="animate-spin text-neutral-500" />}
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl surface-panel-strong px-5 py-4">
            <p className="text-[10px] tracking-wide uppercase text-neutral-500">Plan</p>
            <p className="mt-1 text-[16px] font-serif text-neutral-50">{pkg?.plan_name ?? "None"}</p>
          </div>
          <div className="rounded-xl surface-panel-strong px-5 py-4">
            <p className="text-[10px] tracking-wide uppercase text-neutral-500">Monthly reels</p>
            <p className="mt-1 text-[16px] font-serif text-neutral-50 tabular-nums">{pkg?.monthly_allowance ?? "—"}</p>
          </div>
          <div className="rounded-xl surface-panel-strong px-5 py-4">
            <p className="text-[10px] tracking-wide uppercase text-neutral-500">Free until</p>
            <p className="mt-1 text-[16px] font-serif text-neutral-50">
              {pkg?.free_until ? new Date(pkg.free_until).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "—"}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {/* Grant bonus credits */}
          <SectionCard title="Grant bonus credits" icon={<Gift size={14} className="text-[#D39448]" />}>
            <p className="text-[11.5px] text-neutral-500 mb-2.5">
              Adds to what's already there — the client's own usage display updates immediately.
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-[10.5px] text-neutral-500">Bonus reels</label>
                <input
                  type="number"
                  value={bonusReels}
                  onChange={(e) => setBonusReels(e.target.value)}
                  className="mt-1 w-full h-8 px-2 rounded-md surface-field text-[12.5px] text-neutral-100 outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10.5px] text-neutral-500">Bonus regenerations</label>
                <input
                  type="number"
                  value={bonusRegens}
                  onChange={(e) => setBonusRegens(e.target.value)}
                  className="mt-1 w-full h-8 px-2 rounded-md surface-field text-[12.5px] text-neutral-100 outline-none"
                />
              </div>
            </div>
            <button
              disabled={busy === "credits"}
              onClick={() =>
                void run("credits", async () => {
                  const res = await grantBonusCredits(Number(bonusReels) || 0, Number(bonusRegens) || 0);
                  if (!res.error) {
                    setBonusReels("0");
                    setBonusRegens("0");
                  }
                  return res;
                })
              }
              className="mt-2.5 h-8 px-3 rounded-lg text-[12px] font-medium bg-[#D39448] text-[#020508] hover:brightness-110 transition-[filter] flex items-center gap-1.5 disabled:opacity-50"
            >
              {busy === "credits" && <Loader2 size={12} className="animate-spin" />}
              Grant
            </button>
          </SectionCard>

          {/* Free period */}
          <SectionCard title="Grant a free period" icon={<CalendarClock size={14} className="text-[#D39448]" />}>
            <p className="text-[11.5px] text-neutral-500 mb-2.5">
              No live billing to waive a charge against yet — this sets a visible marker for the team.
            </p>
            <label className="text-[10.5px] text-neutral-500">Free until</label>
            <input
              type="date"
              value={freeUntilInput}
              onChange={(e) => setFreeUntilInput(e.target.value)}
              className="mt-1 w-full h-8 px-2 rounded-md surface-field text-[12.5px] text-neutral-100 outline-none"
            />
            <button
              disabled={busy === "free" || !freeUntilInput}
              onClick={() => void run("free", () => grantFreePeriod(freeUntilInput))}
              className="mt-2.5 h-8 px-3 rounded-lg text-[12px] font-medium bg-[#D39448] text-[#020508] hover:brightness-110 transition-[filter] flex items-center gap-1.5 disabled:opacity-50"
            >
              {busy === "free" && <Loader2 size={12} className="animate-spin" />}
              Set free period
            </button>
          </SectionCard>
        </div>

        {/* Change workspace package */}
        <div className="mt-4">
          <SectionCard title="Change workspace package" icon={<Gift size={14} className="text-[#D39448]" />}>
            {!packageDraft ? (
              <button
                onClick={() =>
                  setPackageDraft({
                    planName: pkg?.plan_name ?? "Growth",
                    monthlyAllowance: String(pkg?.monthly_allowance ?? 60),
                    regens: String(pkg?.regenerations_included ?? 10),
                    setups: String(pkg?.creator_setups_included ?? 5),
                  })
                }
                className="text-[12px] font-medium text-[#D39448] hover:brightness-110 transition-[filter]"
              >
                Edit package terms
              </button>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="text-[10.5px] text-neutral-500">Plan name</label>
                    <input
                      value={packageDraft.planName}
                      onChange={(e) => setPackageDraft({ ...packageDraft, planName: e.target.value })}
                      className="mt-1 w-full h-8 px-2 rounded-md surface-field text-[12.5px] text-neutral-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] text-neutral-500">Monthly reels</label>
                    <input
                      type="number"
                      value={packageDraft.monthlyAllowance}
                      onChange={(e) => setPackageDraft({ ...packageDraft, monthlyAllowance: e.target.value })}
                      className="mt-1 w-full h-8 px-2 rounded-md surface-field text-[12.5px] text-neutral-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] text-neutral-500">Regenerations</label>
                    <input
                      type="number"
                      value={packageDraft.regens}
                      onChange={(e) => setPackageDraft({ ...packageDraft, regens: e.target.value })}
                      className="mt-1 w-full h-8 px-2 rounded-md surface-field text-[12.5px] text-neutral-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] text-neutral-500">Creator setups</label>
                    <input
                      type="number"
                      value={packageDraft.setups}
                      onChange={(e) => setPackageDraft({ ...packageDraft, setups: e.target.value })}
                      className="mt-1 w-full h-8 px-2 rounded-md surface-field text-[12.5px] text-neutral-100 outline-none"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={busy === "package"}
                    onClick={() =>
                      void run("package", async () => {
                        const res = await setWorkspacePackage({
                          planName: packageDraft.planName,
                          monthlyAllowance: Number(packageDraft.monthlyAllowance) || 0,
                          regenerationsIncluded: Number(packageDraft.regens) || 0,
                          creatorSetupsIncluded: Number(packageDraft.setups) || 0,
                        });
                        if (!res.error) setPackageDraft(null);
                        return res;
                      })
                    }
                    className="h-8 px-3 rounded-lg text-[12px] font-medium bg-[#D39448] text-[#020508] hover:brightness-110 transition-[filter] flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {busy === "package" && <Loader2 size={12} className="animate-spin" />}
                    Save
                  </button>
                  <button
                    onClick={() => setPackageDraft(null)}
                    className="h-8 px-3 rounded-lg text-[12px] text-neutral-500 hover:text-neutral-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        {/* Members */}
        <h2 className="mt-6 text-[13px] font-medium text-neutral-200 flex items-center gap-2">
          <UsersIcon size={14} className="text-[#D39448]" />
          Team ({members.length})
        </h2>
        <div className="mt-2.5 rounded-xl surface-panel divide-y divide-white/[0.05]">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2.5 px-4 py-2.5">
              <div className="w-6 h-6 rounded-full bg-[#D39448]/20 flex items-center justify-center text-[10px] font-medium text-[#D39448] shrink-0">
                {(m.display_name || m.email || "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-neutral-200 truncate">{m.display_name || m.email || "Member"}</p>
                <p className="text-[10.5px] text-neutral-600 truncate">{m.email}</p>
              </div>
              <span className="text-[10px] font-medium px-1.5 py-[2px] rounded-[4px] text-neutral-400 bg-white/[0.05] capitalize">
                {m.role}
              </span>
            </div>
          ))}
          {members.length === 0 && <p className="px-4 py-4 text-[12px] text-neutral-500">No members.</p>}
        </div>

        {/* Creators + per-creator plans */}
        <h2 className="mt-6 text-[13px] font-medium text-neutral-200">Creators ({creators.length})</h2>
        <div className="mt-2.5 rounded-xl surface-panel divide-y divide-white/[0.05]">
          {creators.map((c) => (
            <div key={c.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] text-neutral-200 truncate">{c.name}</p>
                  <p className="text-[10.5px] text-neutral-600 truncate">{c.handle}</p>
                </div>
                {c.package ? (
                  <span className="text-[10.5px] text-neutral-400">
                    {c.package.plan_label} · {c.package.monthly_reel_allowance} reels/mo
                    {c.package.price_monthly ? ` · $${c.package.price_monthly}` : ""}
                    {c.package.bonus_reel_credits > 0 && ` · +${c.package.bonus_reel_credits} bonus`}
                  </span>
                ) : (
                  <span className="text-[10.5px] text-neutral-600">No plan</span>
                )}
                <button
                  onClick={() => {
                    if (editingCreatorId === c.id) {
                      setEditingCreatorId(null);
                      return;
                    }
                    setEditingCreatorId(c.id);
                    const tier = (c.package?.plan_tier as "Trial" | "S" | "M" | "L" | "Enterprise") ?? "S";
                    const d = catalogDefault(tier);
                    setCreatorDraft({
                      tier,
                      label: c.package?.plan_label ?? d.label,
                      price: String(c.package?.price_monthly ?? d.price ?? 0),
                      allowance: String(c.package?.monthly_reel_allowance ?? d.monthlyReelAllowance ?? 0),
                    });
                  }}
                  className="shrink-0 text-[11px] font-medium text-[#D39448] hover:brightness-110 transition-[filter]"
                >
                  {editingCreatorId === c.id ? "Close" : "Change plan"}
                </button>
              </div>

              {c.package && (c.package.setup_fee_paid_at || c.package.trial_fee_paid_at || c.package.pending_change_effective_at || c.package.cancel_at_period_end) && (
                <p className="mt-1.5 text-[10px] text-neutral-600 flex flex-wrap gap-x-3">
                  {c.package.setup_fee_paid_at && <span>Setup fee paid {fmtDate(c.package.setup_fee_paid_at)}</span>}
                  {c.package.trial_fee_paid_at && <span>Trial started {fmtDate(c.package.trial_fee_paid_at)}</span>}
                  {c.package.pending_change_effective_at && (
                    <span className="text-amber-400/80">Changing to {c.package.pending_plan_label} on {fmtDate(c.package.pending_change_effective_at)}</span>
                  )}
                  {c.package.cancel_at_period_end && (
                    <span className="text-rose-400/80">Ends {fmtDate(c.package.cancellation_effective_at)}</span>
                  )}
                </p>
              )}

              {editingCreatorId === c.id && (
                <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-3">
                  {c.package && (
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="text-[10.5px] text-neutral-500">Grant bonus reels</label>
                        <input
                          type="number"
                          value={creatorBonus[c.id]?.reels ?? "0"}
                          onChange={(e) => setCreatorBonus({ ...creatorBonus, [c.id]: { reels: e.target.value, regens: creatorBonus[c.id]?.regens ?? "0" } })}
                          className="mt-1 w-full h-8 px-2 rounded-md surface-field text-[12.5px] text-neutral-100 outline-none"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10.5px] text-neutral-500">Grant regen credits</label>
                        <input
                          type="number"
                          value={creatorBonus[c.id]?.regens ?? "0"}
                          onChange={(e) => setCreatorBonus({ ...creatorBonus, [c.id]: { reels: creatorBonus[c.id]?.reels ?? "0", regens: e.target.value } })}
                          className="mt-1 w-full h-8 px-2 rounded-md surface-field text-[12.5px] text-neutral-100 outline-none"
                        />
                      </div>
                      <button
                        disabled={busy === `bonus-${c.id}`}
                        onClick={() =>
                          void run(`bonus-${c.id}`, async () => {
                            const b = creatorBonus[c.id] ?? { reels: "0", regens: "0" };
                            const res = await grantCreatorBonusCredits(c.id, Number(b.reels) || 0, Number(b.regens) || 0);
                            if (!res.error) setCreatorBonus({ ...creatorBonus, [c.id]: { reels: "0", regens: "0" } });
                            return res;
                          })
                        }
                        className="h-8 px-3 rounded-lg text-[12px] font-medium bg-[#D39448]/80 text-[#020508] hover:brightness-110 transition-[filter] flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {busy === `bonus-${c.id}` && <Loader2 size={12} className="animate-spin" />}
                        Grant
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10.5px] text-neutral-500">Tier</label>
                      <select
                        value={creatorDraft.tier}
                        onChange={(e) => {
                          const tier = e.target.value as "Trial" | "S" | "M" | "L" | "Enterprise";
                          const d = catalogDefault(tier);
                          setCreatorDraft({ tier, label: d.label, price: String(d.price ?? 0), allowance: String(d.monthlyReelAllowance ?? 0) });
                        }}
                        className="mt-1 w-full h-8 px-2 rounded-md surface-field text-[12.5px] text-neutral-100 outline-none"
                      >
                        {(["Trial", "S", "M", "L", "Enterprise"] as const).map((t) => (
                          <option key={t} value={t} className="bg-[#0b0f14]">
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10.5px] text-neutral-500">Label</label>
                      <input
                        value={creatorDraft.label}
                        onChange={(e) => setCreatorDraft({ ...creatorDraft, label: e.target.value })}
                        className="mt-1 w-full h-8 px-2 rounded-md surface-field text-[12.5px] text-neutral-100 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10.5px] text-neutral-500">Price/mo</label>
                      <input
                        type="number"
                        value={creatorDraft.price}
                        onChange={(e) => setCreatorDraft({ ...creatorDraft, price: e.target.value })}
                        className="mt-1 w-full h-8 px-2 rounded-md surface-field text-[12.5px] text-neutral-100 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10.5px] text-neutral-500">Reels/mo</label>
                      <input
                        type="number"
                        value={creatorDraft.allowance}
                        onChange={(e) => setCreatorDraft({ ...creatorDraft, allowance: e.target.value })}
                        className="mt-1 w-full h-8 px-2 rounded-md surface-field text-[12.5px] text-neutral-100 outline-none"
                      />
                    </div>
                  </div>
                  <button
                    disabled={busy === `creator-${c.id}`}
                    onClick={() =>
                      void run(`creator-${c.id}`, async () => {
                        const res = await setCreatorPackage({
                          creatorId: c.id,
                          planTier: creatorDraft.tier,
                          planLabel: creatorDraft.label,
                          priceMonthly: Number(creatorDraft.price) || 0,
                          monthlyReelAllowance: Number(creatorDraft.allowance) || 0,
                        });
                        if (!res.error) setEditingCreatorId(null);
                        return res;
                      })
                    }
                    className="h-8 px-3 rounded-lg text-[12px] font-medium bg-[#D39448] text-[#020508] hover:brightness-110 transition-[filter] flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {busy === `creator-${c.id}` && <Loader2 size={12} className="animate-spin" />}
                    Save plan
                  </button>
                </div>
              )}
            </div>
          ))}
          {creators.length === 0 && <p className="px-4 py-4 text-[12px] text-neutral-500">No creators.</p>}
        </div>

        {/* Recent activity + regen requests */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div>
            <h2 className="text-[13px] font-medium text-neutral-200">Recent activity</h2>
            <div className="mt-2.5 rounded-xl surface-panel divide-y divide-white/[0.05] max-h-[280px] overflow-y-auto">
              {recent_activity.map((a) => (
                <div key={a.id} className="px-3.5 py-2">
                  <p className="text-[12px] text-neutral-300">{a.message}</p>
                  <p className="text-[10.5px] text-neutral-600 mt-0.5">{new Date(a.created_at).toLocaleString()}</p>
                </div>
              ))}
              {recent_activity.length === 0 && <p className="px-3.5 py-4 text-[12px] text-neutral-500">Nothing yet.</p>}
            </div>
          </div>
          <div>
            <h2 className="text-[13px] font-medium text-neutral-200">Regeneration requests</h2>
            <div className="mt-2.5 rounded-xl surface-panel divide-y divide-white/[0.05] max-h-[280px] overflow-y-auto">
              {regeneration_requests.map((r) => (
                <div key={r.id} className="px-3.5 py-2">
                  <p className="text-[12px] text-neutral-300">
                    {r.reason} <span className="text-neutral-600">· {r.is_free ? "Free (QC)" : "Billable"}</span>
                  </p>
                  <p className="text-[10.5px] text-neutral-600 mt-0.5">{new Date(r.created_at).toLocaleString()}</p>
                </div>
              ))}
              {regeneration_requests.length === 0 && <p className="px-3.5 py-4 text-[12px] text-neutral-500">None filed.</p>}
            </div>
          </div>
        </div>

        {/* Admin log */}
        <h2 className="mt-6 text-[13px] font-medium text-neutral-200 flex items-center gap-2">
          <History size={14} className="text-[#D39448]" />
          Admin history
        </h2>
        <div className="mt-2.5 rounded-xl surface-panel divide-y divide-white/[0.05]">
          {admin_log.map((l) => (
            <div key={l.id} className="px-4 py-2.5">
              <p className="text-[12px] text-neutral-300">
                {l.admin_email} <span className="text-neutral-600">· {l.action.replace(/_/g, " ")}</span>
              </p>
              <p className="text-[10.5px] text-neutral-600 mt-0.5">{new Date(l.created_at).toLocaleString()}</p>
            </div>
          ))}
          {admin_log.length === 0 && <p className="px-4 py-4 text-[12px] text-neutral-500">No admin actions on this client yet.</p>}
        </div>
      </div>
    </div>
  );
}
