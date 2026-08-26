// One-time script: creates the Stripe Products/Prices behind ReelForge's
// billing catalog and prints their IDs.
//
// Run locally, once, with your own restricted key — never paste that key
// into chat or commit it. Requires the `stripe` package:
//
//   npm install --save-dev stripe
//   STRIPE_RESTRICTED_KEY=rk_test_... node scripts/stripe-setup.mjs
//
// Copy the printed IDs back so they can be written into plan_catalog /
// stripe_addon_prices — the key itself never needs to leave your terminal.

import Stripe from "stripe";

const key = process.env.STRIPE_RESTRICTED_KEY;
if (!key) {
  console.error("Set STRIPE_RESTRICTED_KEY in your shell first, then re-run this script.");
  process.exit(1);
}

const stripe = new Stripe(key);

// One Product per tier — never share a Product across tiers, or every line
// item on Checkout/invoices would display the same name.
const SUBSCRIPTION_PLANS = [
  { tier: "S", name: "ReelForge Starter", unitAmount: 8900 },
  { tier: "M", name: "ReelForge Growth", unitAmount: 17900 },
  { tier: "L", name: "ReelForge Scale", unitAmount: 29900 },
];

const ADDON_PRICES = [
  { kind: "setup_fee", name: "ReelForge Creator Setup Fee", unitAmount: 4900 },
  { kind: "trial", name: "ReelForge 5-Reel Trial", unitAmount: 2500 },
  { kind: "regen_5", name: "ReelForge Regenerations (5-pack)", unitAmount: 2000 },
  { kind: "regen_10", name: "ReelForge Regenerations (10-pack)", unitAmount: 3500 },
  { kind: "regen_25", name: "ReelForge Regenerations (25-pack)", unitAmount: 6900 },
];

async function main() {
  const results = { subscriptions: {}, addons: {} };

  for (const plan of SUBSCRIPTION_PLANS) {
    const product = await stripe.products.create({ name: plan.name });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.unitAmount,
      currency: "usd",
      recurring: { interval: "month" },
    });
    results.subscriptions[plan.tier] = price.id;
    console.log(`${plan.tier} (${plan.name}): ${price.id}`);
  }

  for (const addon of ADDON_PRICES) {
    const product = await stripe.products.create({ name: addon.name });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: addon.unitAmount,
      currency: "usd",
    });
    results.addons[addon.kind] = price.id;
    console.log(`${addon.kind} (${addon.name}): ${price.id}`);
  }

  console.log("\nAll done. Paste the above tier/kind -> price ID pairs back so they can be");
  console.log("written into client_os.plan_catalog.stripe_price_id and");
  console.log("client_os.stripe_addon_prices.stripe_price_id.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
