import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Platform, ResearchAccount, ResearchAccountStatus } from "../types";

interface ResearchAccountRow {
  id: string;
  creator_id: string;
  platform: string;
  label: string;
  status: string;
  username: string | null;
  last_synced_at: string | null;
  last_opened_at: string | null;
  last_shown_seq: number | null;
  session_verified_at: string | null;
  action_kind: string | null;
  action_target_url: string | null;
  action_status: string | null;
  action_error: string | null;
  action_completed_at: string | null;
}

// Up to 5 per Creator per platform — same cap style as the 5-reference-photo
// limit on Creators, enforced client-side (and authoritatively, again, by
// connect-research-account server-side).
export const MAX_RESEARCH_ACCOUNTS_PER_PLATFORM = 5;

function fromRow(row: ResearchAccountRow): ResearchAccount {
  return {
    id: row.id,
    creatorId: row.creator_id,
    platform: row.platform as Platform,
    label: row.label,
    username: row.username ?? undefined,
    status: row.status as ResearchAccountStatus,
    lastSyncedAt: row.last_synced_at ?? undefined,
    lastOpenedAt: row.last_opened_at ?? undefined,
    lastShownSeq: row.last_shown_seq ?? undefined,
    sessionVerifiedAt: row.session_verified_at ?? undefined,
    actionKind: row.action_kind === "like" ? "like" : undefined,
    actionTargetUrl: row.action_target_url ?? undefined,
    actionStatus: row.action_status === "done" || row.action_status === "failed" ? row.action_status : undefined,
    actionError: row.action_error ?? undefined,
    actionCompletedAt: row.action_completed_at ?? undefined,
  };
}

export interface ConnectStart {
  id: string;
  token: string;
  platform: Platform;
}

/**
 * Research Accounts for the active workspace, backed by
 * client_os.research_accounts. Real login/session/proxy handling lives
 * entirely outside this app — this hook only manages the account's identity
 * and shared "who's researching, is it genuinely connected" state, so any
 * authorized workspace member sees the same context.
 */
export function useResearchAccounts(workspaceId: string | undefined) {
  const [accounts, setAccounts] = useState<ResearchAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const accountsRef = useRef<ResearchAccount[]>([]);
  accountsRef.current = accounts;

  // Returns the freshly fetched list directly (not just via setState) so
  // callers polling for a specific change (e.g. a feed sync landing) can
  // read the real current value instead of a stale closure snapshot from
  // whichever render they were called in.
  async function refetch(): Promise<ResearchAccount[]> {
    if (!workspaceId) return accountsRef.current;
    const { data, error: fetchError } = await supabase
      .schema("client_os")
      .from("research_accounts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });
    if (fetchError) return accountsRef.current;
    const next = (data as ResearchAccountRow[]).map(fromRow);
    setAccounts(next);
    return next;
  }

  useEffect(() => {
    if (!workspaceId) {
      setAccounts([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      const { data, error: fetchError } = await supabase
        .schema("client_os")
        .from("research_accounts")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true });

      if (!active) return;
      if (fetchError) {
        setError(fetchError.message);
        setAccounts([]);
      } else {
        setAccounts((data as ResearchAccountRow[]).map(fromRow));
      }
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [workspaceId]);

  function countFor(creatorId: string, platform: Platform): number {
    return accountsRef.current.filter((a) => a.creatorId === creatorId && a.platform === platform).length;
  }

  function parseInvokeError(invokeError: unknown, data: { error?: string } | null): Promise<string> {
    return (async () => {
      const context = (invokeError as { context?: Response } | undefined)?.context;
      if (context && typeof context.json === "function") {
        try {
          const responseBody = await context.clone().json();
          if (typeof responseBody?.error === "string") return responseBody.error;
        } catch {
          // fall through
        }
      }
      return data?.error ?? (invokeError as { message?: string } | undefined)?.message ?? "Something went wrong.";
    })();
  }

  // Step 1 of the real connect flow: creates the account (status
  // "connecting") and returns a short-lived, single-use token. This does
  // NOT connect anything by itself — the account only becomes "active"
  // once the companion connector script (run locally, opening a real
  // browser for the human to actually complete login/verification in) has
  // its submitted session verified by submit-research-account-session.
  async function connectAccount(
    creatorId: string,
    platform: Platform,
    label: string,
    username: string
  ): Promise<{ start: ConnectStart | null; error: string | null }> {
    if (!workspaceId) return { start: null, error: "No active workspace." };
    if (countFor(creatorId, platform) >= MAX_RESEARCH_ACCOUNTS_PER_PLATFORM) {
      return { start: null, error: `Up to ${MAX_RESEARCH_ACCOUNTS_PER_PLATFORM} ${platform} research accounts per creator.` };
    }

    const { data, error: invokeError } = await supabase.functions.invoke<{
      account?: ResearchAccountRow;
      token?: string;
      error?: string;
    }>("connect-research-account", {
      body: { workspaceId, creatorId, platform, label, username },
    });

    if (invokeError || !data?.account || !data.token) {
      return { start: null, error: await parseInvokeError(invokeError, data ?? null) };
    }

    const created = fromRow(data.account);
    setAccounts((prev) => [...prev, created]);
    return { start: { id: created.id, token: data.token, platform }, error: null };
  }

  // Re-issues a fresh token on an existing account (needs_attention /
  // disconnected -> connecting again) — the real "reconnect" path, same
  // underlying login flow as a first-time connect.
  async function reconnectAccount(accountId: string, platform: Platform): Promise<{ start: ConnectStart | null; error: string | null }> {
    if (!workspaceId) return { start: null, error: "No active workspace." };

    const { data, error: invokeError } = await supabase.functions.invoke<{
      account?: ResearchAccountRow;
      token?: string;
      error?: string;
    }>("connect-research-account", {
      body: { workspaceId, platform, reconnectAccountId: accountId },
    });

    if (invokeError || !data?.account || !data.token) {
      return { start: null, error: await parseInvokeError(invokeError, data ?? null) };
    }

    const updated = fromRow(data.account);
    setAccounts((prev) => prev.map((a) => (a.id === accountId ? updated : a)));
    return { start: { id: updated.id, token: data.token, platform }, error: null };
  }

  async function renameAccount(accountId: string, label: string) {
    setAccounts((prev) => prev.map((a) => (a.id === accountId ? { ...a, label } : a)));
    await supabase.schema("client_os").from("research_accounts").update({ label }).eq("id", accountId);
  }

  async function deleteAccount(accountId: string) {
    const previous = accountsRef.current;
    setAccounts((prev) => prev.filter((a) => a.id !== accountId));
    const { error: deleteError } = await supabase
      .schema("client_os")
      .from("research_accounts")
      .delete()
      .eq("id", accountId);
    if (deleteError) setAccounts(previous);
  }

  // Marks this account as the one currently being worked from, and who by —
  // real, DB-backed, so a VA reopening it later (possibly on another device)
  // sees the same "last opened" context instead of nothing.
  async function markOpened(accountId: string, byUserId: string | undefined) {
    const now = new Date().toISOString();
    setAccounts((prev) => prev.map((a) => (a.id === accountId ? { ...a, lastOpenedAt: now } : a)));
    await supabase
      .schema("client_os")
      .from("research_accounts")
      .update({ last_opened_at: now, last_opened_by: byUserId ?? null })
      .eq("id", accountId);
  }

  // Step 1 of a real feed resync: issues a short-lived sync token for an
  // already-connected account. ReelForge Connector uses it to reuse the
  // account's existing, already-verified session (no fresh login) and pull
  // in more of its real feed — see submit-research-feed-sync for where that
  // actually lands in research_feed_items.
  async function syncAccountFeed(accountId: string, platform: Platform): Promise<{ start: ConnectStart | null; error: string | null }> {
    if (!workspaceId) return { start: null, error: "No active workspace." };

    const { data, error: invokeError } = await supabase.functions.invoke<{
      accountId?: string;
      platform?: string;
      token?: string;
      error?: string;
    }>("start-research-feed-sync", { body: { workspaceId, accountId } });

    if (invokeError || !data?.token) {
      return { start: null, error: await parseInvokeError(invokeError, data ?? null) };
    }
    return { start: { id: accountId, token: data.token, platform }, error: null };
  }

  // Step 1 of a real Like: issues a short-lived token scoped to this one
  // reel URL. ReelForge Connector uses it to reuse the account's existing
  // session and click the actual Like control on the actual Instagram page
  // — see submit-research-reel-action for where the real, verified result
  // (not an assumption) lands back on this account's row.
  async function likeReel(accountId: string, platform: Platform, targetUrl: string): Promise<{ start: ConnectStart | null; error: string | null }> {
    if (!workspaceId) return { start: null, error: "No active workspace." };

    const { data, error: invokeError } = await supabase.functions.invoke<{
      accountId?: string;
      platform?: string;
      token?: string;
      error?: string;
    }>("start-research-reel-action", { body: { workspaceId, accountId, targetUrl, kind: "like" } });

    if (invokeError || !data?.token) {
      return { start: null, error: await parseInvokeError(invokeError, data ?? null) };
    }
    return { start: { id: accountId, token: data.token, platform }, error: null };
  }

  // Advances the swipe-mode watermark as a VA swipes past reels — workspace-
  // shared, so nobody (including a different authorized VA later) re-sees
  // the same reel. Only ever moves forward.
  async function markSeen(accountId: string, seq: number) {
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === accountId && (a.lastShownSeq === undefined || seq > a.lastShownSeq) ? { ...a, lastShownSeq: seq } : a
      )
    );
    await supabase
      .schema("client_os")
      .from("research_accounts")
      .update({ last_shown_seq: seq })
      .eq("id", accountId);
  }

  return {
    accounts,
    loading,
    error,
    countFor,
    connectAccount,
    reconnectAccount,
    refetch,
    renameAccount,
    markSeen,
    deleteAccount,
    markOpened,
    syncAccountFeed,
    likeReel,
  };
}

export type ResearchAccountsStore = ReturnType<typeof useResearchAccounts>;
