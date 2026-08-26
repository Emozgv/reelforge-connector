// stripe-checkout — creates a Stripe Checkout Session for a creator's
// subscription (Starter/Growth/Scale, with the one-time setup fee bundled
// in as a second line item the first time it's owed), a Trial purchase, or
// a regeneration credit pack. Returns the session URL for the client to
// redirect to. Never writes creator_packages itself — checkout.session.
// completed (see stripe-webhook) is the only writer, once Stripe confirms
// payment actually happened.
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

const CLIENT_OS_URL = "https://reelforge-client-os.vercel.app/";

type Kind = "subscription" | "trial" | "regen_pack";

Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (err) {
    console.error("stripe-checkout error", err);
    return json({ error: `Internal error: ${(err as Error).message ?? String(err)}` }, 500);
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header." }, 401);
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  let body: { creatorId?: string; kind?: Kind; tier?: string; pack?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { creatorId, kind, tier, pack } = body;
  if (!creatorId || !kind) return json({ error: "Missing required fields." }, 400);
  if (kind === "subscription" && !["S", "M", "L"].includes(tier ?? "")) {
    return json({ error: "Invalid tier." }, 400);
  }
  if (kind === "regen_pack" && ![5, 10, 25].includes(pack ?? 0)) {
    return json({ error: "Invalid regeneration pack." }, 400);
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
    .select("id, workspace_id, name")
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
  const canChangePlan = !!membership && (membership.role === "owner" || (membership.role === "manager" && membership.can_change_plan));
  if (!canChangePlan) return json({ error: "You don't have permission to change this creator's plan." }, 403);

  const { data: workspace } = await admin
    .schema("client_os")
    .from("workspaces")
    .select("id, stripe_customer_id")
    .eq("id", creator.workspace_id)
    .maybeSingle();
  if (!workspace) return json({ error: "Workspace not found." }, 404);

  let stripeCustomerId = workspace.stripe_customer_id as string | null;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({ metadata: { workspace_id: workspace.id } });
    stripeCustomerId = customer.id;
    await admin.schema("client_os").from("workspaces").update({ stripe_customer_id: stripeCustomerId }).eq("id", workspace.id);
  }

  const successUrl = `${CLIENT_OS_URL}#billing?stripe=success`;
  const cancelUrl = `${CLIENT_OS_URL}#billing?stripe=cancelled`;

  if (kind === "subscription") {
    const { data: plan } = await admin.schema("client_os").from("plan_catalog").select("*").eq("tier", tier).maybeSingle();
    if (!plan?.stripe_price_id) return json({ error: "This plan isn't priced in Stripe yet." }, 500);

    const { data: existingPackage } = await admin
      .schema("client_os")
      .from("creator_packages")
      .select("setup_fee_paid_at")
      .eq("creator_id", creatorId)
      .maybeSingle();
    const setupFeeOwed = !existingPackage?.setup_fee_paid_at;

    const lineItems: { price: string; quantity: number }[] = [{ price: plan.stripe_price_id, quantity: 1 }];
    if (setupFeeOwed) {
      const { data: setupFee } = await admin.schema("client_os").from("stripe_addon_prices").select("stripe_price_id").eq("kind", "setup_fee").maybeSingle();
      if (setupFee?.stripe_price_id) lineItems.push({ price: setupFee.stripe_price_id, quantity: 1 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: lineItems,
      subscription_data: { metadata: { creatorId, workspaceId: workspace.id } },
      metadata: { creatorId, workspaceId: workspace.id, kind: "subscription", tier: tier ?? "" },
      success_url: successUrl,
      cancel_url: cancelUrl,
      managed_payments: { enabled: false },
    });
    return json({ url: session.url });
  }

  if (kind === "trial") {
    const { data: trialPrice } = await admin.schema("client_os").from("stripe_addon_prices").select("stripe_price_id").eq("kind", "trial").maybeSingle();
    if (!trialPrice?.stripe_price_id) return json({ error: "Trial isn't priced in Stripe yet." }, 500);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: stripeCustomerId,
      line_items: [{ price: trialPrice.stripe_price_id, quantity: 1 }],
      metadata: { creatorId, workspaceId: workspace.id, kind: "trial" },
      success_url: successUrl,
      cancel_url: cancelUrl,
      managed_payments: { enabled: false },
    });
    return json({ url: session.url });
  }

  // regen_pack
  const addonKind = `regen_${pack}`;
  const { data: regenPrice } = await admin.schema("client_os").from("stripe_addon_prices").select("stripe_price_id").eq("kind", addonKind).maybeSingle();
  if (!regenPrice?.stripe_price_id) return json({ error: "This regeneration pack isn't priced in Stripe yet." }, 500);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: stripeCustomerId,
    line_items: [{ price: regenPrice.stripe_price_id, quantity: 1 }],
    metadata: { creatorId, workspaceId: workspace.id, kind: "regen_pack", credits: String(pack) },
    success_url: successUrl,
    cancel_url: cancelUrl,
    managed_payments: { enabled: false },
  });
  return json({ url: session.url });
}
