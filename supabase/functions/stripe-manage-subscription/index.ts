// stripe-manage-subscription — upgrade/downgrade/cancel/undo-cancel for a
// creator that already has a real Stripe subscription. Upgrades apply
// immediately with proration; downgrades are scheduled via a Subscription
// Schedule phase at the current period's end; cancellation sets
// cancel_at_period_end rather than deleting immediately. This function
// never writes creator_packages' live plan state itself — the resulting
// customer.subscription.updated/deleted webhook event is the sole writer
// of what actually happened. It does mirror the scheduled change into the
// pending_*/cancellation_* display columns so the Billing UI's banners
// stay accurate while Stripe's own schedule is still pending.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Action = "upgrade" | "downgrade" | "cancel" | "undo_cancel" | "undo_downgrade";

Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (err) {
    console.error("stripe-manage-subscription error", err);
    return json({ error: `Internal error: ${(err as Error).message ?? String(err)}` }, 500);
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header." }, 401);
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  let body: { creatorId?: string; action?: Action; newTier?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { creatorId, action, newTier } = body;
  if (!creatorId || !action) return json({ error: "Missing required fields." }, 400);
  if ((action === "upgrade" || action === "downgrade") && !["S", "M", "L"].includes(newTier ?? "")) {
    return json({ error: "Invalid target plan." }, 400);
  }

  const stripeKey = Deno.env.get("STRIPE_RESTRICTED_KEY") ?? "";
  if (!stripeKey) return json({ error: "Stripe isn't configured yet." }, 500);
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-01-27.acacia", httpClient: Stripe.createFetchHttpClient() });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData?.user) return json({ error: "Not authenticated." }, 401);

  const { data: creator } = await admin
    .schema("client_os")
    .from("creators")
    .select("id, workspace_id")
    .eq("id", creatorId)
    .maybeSingle();
  if (!creator) return json({ error: "Creator not found." }, 404);

  const { data: membership } = await admin
    .schema("client_os")
    .from("workspace_members")
    .select("role, can_change_plan")
    .eq("workspace_id", creator.workspace_id)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  const isOwner = membership?.role === "owner";
  const canChangePlan = isOwner || (membership?.role === "manager" && !!membership.can_change_plan);

  if ((action === "cancel" || action === "undo_cancel") && !isOwner) {
    return json({ error: "Only the workspace Owner can cancel a subscription." }, 403);
  }
  if ((action === "upgrade" || action === "downgrade" || action === "undo_downgrade") && !canChangePlan) {
    return json({ error: "You don't have permission to change this creator's plan." }, 403);
  }

  const { data: pkg } = await admin
    .schema("client_os")
    .from("creator_packages")
    .select("stripe_subscription_id, billing_cycle_start")
    .eq("creator_id", creatorId)
    .maybeSingle();
  const subscriptionId = pkg?.stripe_subscription_id as string | null | undefined;
  if (!subscriptionId) {
    return json({ error: "This creator has no active Stripe subscription yet — start one via checkout first." }, 400);
  }

  if (action === "upgrade" || action === "downgrade") {
    const { data: plan } = await admin.schema("client_os").from("plan_catalog").select("*").eq("tier", newTier).maybeSingle();
    if (!plan?.stripe_price_id) return json({ error: "This plan isn't priced in Stripe yet." }, 500);

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const currentItem = subscription.items.data[0];

    if (action === "upgrade") {
      await stripe.subscriptions.update(subscriptionId, {
        items: [{ id: currentItem.id, price: plan.stripe_price_id }],
        proration_behavior: "always_invoice",
      });
      return json({ ok: true, timing: "immediate" });
    }

    // downgrade — schedule a new phase starting at the current period's end,
    // releasing any existing schedule first so only one is ever active.
    if (subscription.schedule) {
      await stripe.subscriptionSchedules.release(subscription.schedule as string);
    }
    const schedule = await stripe.subscriptionSchedules.create({ from_subscription: subscriptionId });
    const currentPhase = schedule.phases[0];
    const updated = await stripe.subscriptionSchedules.update(schedule.id, {
      phases: [
        { items: currentPhase.items, start_date: currentPhase.start_date, end_date: currentPhase.end_date },
        { items: [{ price: plan.stripe_price_id, quantity: 1 }], iterations: 1 },
      ],
    });
    const effectiveAt = new Date(currentPhase.end_date * 1000).toISOString();

    await admin.schema("client_os").rpc("stripe_set_pending_change", {
      p_creator_id: creatorId,
      p_pending_plan_tier: newTier,
      p_pending_plan_label: plan.label,
      p_pending_price_monthly: plan.price,
      p_pending_monthly_reel_allowance: plan.monthly_reel_allowance,
      p_effective_at: effectiveAt,
    });

    return json({ ok: true, timing: "at_renewal", effectiveAt, scheduleId: updated.id });
  }

  if (action === "cancel") {
    const subscription = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    const effectiveAt = new Date((subscription.current_period_end ?? 0) * 1000).toISOString();
    await admin.schema("client_os").rpc("stripe_set_pending_cancellation", { p_creator_id: creatorId, p_effective_at: effectiveAt });
    return json({ ok: true, effectiveAt });
  }

  if (action === "undo_cancel") {
    await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false });
    await admin.schema("client_os").rpc("stripe_clear_pending_cancellation", { p_creator_id: creatorId });
    return json({ ok: true });
  }

  // undo_downgrade — release the Subscription Schedule so the subscription
  // reverts to its normal (unscheduled) live price, and clear the local
  // display mirror.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.schedule) {
    await stripe.subscriptionSchedules.release(subscription.schedule as string);
  }
  await admin.schema("client_os").rpc("stripe_clear_pending_change", { p_creator_id: creatorId });
  return json({ ok: true });
}
