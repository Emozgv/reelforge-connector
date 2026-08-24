import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Platform, ResearchAccount, ResearchAccountStatus } from "../types";

interface ResearchAccountRow {
  id: string;
  creator_id: string;
  platform: string;
  label: string;
  status: string;
  last_synced_at: string | null;
  last_opened_at: string | null;
}

// Up to 5 per Creator per platform — same cap style as the 5-reference-photo
// limit on Creators, enforced client-side rather than a DB trigger.
export const MAX_RESEARCH_ACCOUNTS_PER_PLATFORM = 5;

function fromRow(row: ResearchAccountRow): ResearchAccount {
  return {
    id: row.id,
    creatorId: row.creator_id,
    platform: row.platform as Platform,
    label: row.label,
    status: row.status as ResearchAccountStatus,
    lastSyncedAt: row.last_synced_at ?? undefined,
    lastOpenedAt: row.last_opened_at ?? undefined,
  };
}

/**
 * Research Accounts for the active workspace, backed by
 * client_os.research_accounts. Real login/session/proxy handling lives
 * entirely outside this app — this hook only manages the account's identity
 * and shared "who's researching, what's synced" state, so any authorized
 * workspace member sees the same context.
 */
export function useResearchAccounts(workspaceId: string | undefined) {
  const [accounts, setAccounts] = useState<ResearchAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const accountsRef = useRef<ResearchAccount[]>([]);
  accountsRef.current = accounts;

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

  async function createAccount(
    creatorId: string,
    platform: Platform,
    label: string
  ): Promise<{ id: string | null; error: string | null }> {
    if (!workspaceId) return { id: null, error: "No active workspace." };
    if (countFor(creatorId, platform) >= MAX_RESEARCH_ACCOUNTS_PER_PLATFORM) {
      return { id: null, error: `Up to ${MAX_RESEARCH_ACCOUNTS_PER_PLATFORM} ${platform} research accounts per creator.` };
    }

    const { data, error: insertError } = await supabase
      .schema("client_os")
      .from("research_accounts")
      .insert({ workspace_id: workspaceId, creator_id: creatorId, platform, label })
      .select()
      .single();

    if (insertError || !data) {
      return { id: null, error: insertError?.message ?? "Couldn't create research account." };
    }

    const created = fromRow(data as ResearchAccountRow);
    setAccounts((prev) => [...prev, created]);
    return { id: created.id, error: null };
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

  // Queues a re-sync — the actual fetch happens in the external sync worker;
  // this just timestamps the request so that worker (polling this column)
  // knows to pick it up, and the UI can show "sync requested" meanwhile.
  async function requestSync(accountId: string) {
    await supabase
      .schema("client_os")
      .from("research_accounts")
      .update({ sync_requested_at: new Date().toISOString() })
      .eq("id", accountId);
  }

  return {
    accounts,
    loading,
    error,
    countFor,
    createAccount,
    renameAccount,
    deleteAccount,
    markOpened,
    requestSync,
  };
}

export type ResearchAccountsStore = ReturnType<typeof useResearchAccounts>;
