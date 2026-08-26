// stripe-webhook — the sole writer of authoritative creator_packages plan
// state once Stripe confirms something actually happened (payment,
// subscription change, cancellation). Every event is verified against
// STRIPE_WEBHOOK_SECRET before anything is trusted; no verify_jwt (Stripe
// calls this directly, not a signed-in user), so signature verification is
// the only thing standing between this endpoint and a forged request.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@18.5.0";

// Recent Stripe API versions moved current_period_start/end from the
// Subscription object to each subscription item; check both locations so
// this keeps working regardless of which shape the configured API version
// returns.
function periodStartDate(subscription: Stripe.Subscription): string | null {
  const topLevel = (subscription as unknown as { current_period_start?: number }).current_period_start;
  const itemLevel = (subscription.items.data[0] as unknown as { current_period_start?: number } | undefined)
    ?.current_period_start;
  const unixSeconds = topLevel ?? itemLevel;
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (err) {
    console.error("stripe-webhook top-level error", err);
    return new Response(`Internal error: ${(err as Error).message ?? String(err)}`, { status: 500, headers: corsHeaders });
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_RESTRICTED_KEY") ?? "";
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  if (!stripeKey || !webhookSecret) {
    return new Response("Stripe isn't configured yet.", { status: 500, headers: corsHeaders });
  }
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-01-27.acacia", httpClient: Stripe.createFetchHttpClient() });
  const cryptoProvider = Stripe.createSubtleCryptoProvider();

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();
  if (!signature) return new Response("Missing stripe-signature header.", { status: 400, headers: corsHeaders });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret, undefined, cryptoProvider);
  } catch (err) {
    return new Response(`Invalid signature: ${(err as Error).message}`, { status: 400, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const rpc = <T extends Record<string, unknown>>(fn: string, args: T) => admin.schema("client_os").rpc(fn, args);

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== "paid") break;

        const creatorId = session.metadata?.creatorId;
        const kind = session.metadata?.kind;
        if (!creatorId || !kind) break;

        if (kind === "subscription") {
          const tier = session.metadata?.tier ?? "";
          const { data: plan } = await admin.schema("client_os").from("plan_catalog").select("*").eq("tier", tier).maybeSingle();
          if (!plan) break;
          const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
          if (!subscriptionId) break;
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = subscription.items.data[0]?.price.id ?? plan.stripe_price_id;

          await rpc("stripe_sync_creator_subscription", {
            p_creator_id: creatorId,
            p_stripe_subscription_id: subscriptionId,
            p_stripe_price_id: priceId,
            p_plan_tier: tier,
            p_plan_label: plan.label,
            p_price_monthly: plan.price,
            p_monthly_reel_allowance: plan.monthly_reel_allowance,
            p_status: "active",
            p_billing_cycle_start: periodStartDate(subscription),
          });
        } else if (kind === "trial") {
          await rpc("stripe_record_trial_purchase", { p_creator_id: creatorId, p_stripe_payment_id: session.id });
        } else if (kind === "regen_pack") {
          const credits = Number(session.metadata?.credits ?? 0);
          if (credits > 0) await rpc("stripe_record_regen_purchase", { p_creator_id: creatorId, p_credits: credits });
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const creatorId = subscription.metadata?.creatorId;
        if (!creatorId) break;

        const priceId = subscription.items.data[0]?.price.id;
        if (!priceId) break;
        const { data: plan } = await admin.schema("client_os").from("plan_catalog").select("*").eq("stripe_price_id", priceId).maybeSingle();
        if (!plan) break;

        await rpc("stripe_sync_creator_subscription", {
          p_creator_id: creatorId,
          p_stripe_subscription_id: subscription.id,
          p_stripe_price_id: priceId,
          p_plan_tier: plan.tier,
          p_plan_label: plan.label,
          p_price_monthly: plan.price,
          p_monthly_reel_allowance: plan.monthly_reel_allowance,
          p_status: subscription.status === "canceled" ? "cancelled" : "active",
          p_billing_cycle_start: periodStartDate(subscription),
          p_cancel_at_period_end: subscription.cancel_at_period_end ?? false,
          p_cancellation_effective_at: subscription.cancel_at
            ? new Date(subscription.cancel_at * 1000).toISOString()
            : null,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await rpc("stripe_mark_cancelled", { p_stripe_subscription_id: subscription.id });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
        if (!subscriptionId) break;
        const { data: pkg } = await admin
          .schema("client_os")
          .from("creator_packages")
          .select("workspace_id")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();
        if (pkg) {
          await admin.schema("client_os").from("activity_events").insert({
            workspace_id: pkg.workspace_id,
            event_type: "stripe_payment_failed",
            message: "A subscription payment failed — Stripe will retry automatically.",
          });
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("stripe-webhook handler error", err);
    return new Response("Webhook handler error", { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
