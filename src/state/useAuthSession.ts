import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

/**
 * Thin wrapper around Supabase Auth session state. Resolves the initial
 * session once on mount, then stays in sync via onAuthStateChange (covers
 * sign-in, sign-out, and token refresh) so a page refresh restores the
 * logged-in state instead of flashing the login screen.
 */
export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;
      setSession(newSession);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return { session, user: session?.user ?? null, loading, signIn, signOut };
}
