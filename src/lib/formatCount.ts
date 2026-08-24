// Shared K/M abbreviation for follower/like/view-style counts across the Hub.
export function formatCompactNumber(raw: number): string {
  if (raw >= 1_000_000) return `${(raw / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (raw >= 1_000) return `${(raw / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(raw);
}
