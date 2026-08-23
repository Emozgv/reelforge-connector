import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatRelativeTime } from "../lib/relativeTime";

export interface ActivityFeedItem {
  id: string;
  message: string;
  collectionId: string | null;
  createdAtRaw: string;
  relativeTime: string;
}

/**
 * Workspace-wide activity feed (not scoped to one Collection) — same
 * client_os.activity_events rows a Collection's History panel reads, just
 * queried across the whole workspace and capped to the most recent N, for
 * the Dashboard's "Recent activity" list.
 */
export function useActivityFeed(workspaceId: string | undefined, limit = 12) {
  const [items, setItems] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setItems([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    (async () => {
      const { data } = await supabase
        .schema("client_os")
        .from("activity_events")
        .select("id, message, collection_id, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!active) return;
      setItems(
        (data ?? []).map((row) => ({
          id: row.id as string,
          message: row.message as string,
          collectionId: row.collection_id as string | null,
          createdAtRaw: row.created_at as string,
          relativeTime: formatRelativeTime(row.created_at as string),
        }))
      );
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [workspaceId, limit]);

  return { items, loading };
}
