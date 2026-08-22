export function formatTimestamp(d: Date): string {
  const day = d.getDate().toString().padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short" });
  const year = d.getFullYear();
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${day} ${month} ${year} · ${hh}:${mm}`;
}

export function formatTimestampFromIso(iso: string): string {
  return formatTimestamp(new Date(iso));
}
