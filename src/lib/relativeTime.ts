// Formats a real Supabase timestamp for display — collections no longer store
// precomputed strings like "2 hours ago", so this is computed at render time.
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (diffMs < minute) return "Just now";
  if (diffMs < hour) {
    const m = Math.floor(diffMs / minute);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (diffMs < day) {
    const h = Math.floor(diffMs / hour);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (diffMs < week) {
    const d = Math.floor(diffMs / day);
    return d === 1 ? "Yesterday" : `${d} days ago`;
  }
  const w = Math.floor(diffMs / week);
  return `${w} week${w === 1 ? "" : "s"} ago`;
}
