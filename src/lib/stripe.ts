import { supabase } from "./supabase";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

// The only non-Supabase-RPC HTTP calls in the app — deliberately isolated
// to this one file rather than spread across components. Both Edge
// Functions require the caller's own access token (verify_jwt: true) so
// the permission check happens server-side against the real signed-in user,
// never a client-supplied claim.
async function callStripeFunction<T>(name: "stripe-checkout" | "stripe-manage-subscription", body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return { data: null, error: "Not signed in." };

  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });

  let json: Record<string, unknown>;
  try {
    json = await res.json();
  } catch {
    return { data: null, error: "Unexpected response from Stripe." };
  }

  if (!res.ok) return { data: null, error: (json.error as string) ?? "Something went wrong." };
  return { data: json as T, error: null };
}

export async function startStripeCheckout(input: {
  creatorId: string;
  kind: "subscription" | "trial" | "regen_pack";
  tier?: "S" | "M" | "L";
  pack?: 5 | 10 | 25;
}): Promise<{ error: string | null }> {
  const { data, error } = await callStripeFunction<{ url: string }>("stripe-checkout", input);
  if (error || !data?.url) return { error: error ?? "Couldn't start checkout." };
  window.location.href = data.url;
  return { error: null };
}

export async function manageStripeSubscription(input: {
  creatorId: string;
  action: "upgrade" | "downgrade" | "cancel" | "undo_cancel" | "undo_downgrade";
  newTier?: "S" | "M" | "L";
}): Promise<{ error: string | null }> {
  const { error } = await callStripeFunction("stripe-manage-subscription", input);
  return { error };
}
