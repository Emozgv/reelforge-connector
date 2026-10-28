// Shared K/M abbreviation for follower/like/view-style counts across the Hub.
export function formatCompactNumber(raw: number): string {
  if (raw >= 1_000_000) return `${(raw / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (raw >= 1_000) return `${(raw / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(raw);
}

// Kein Wert ist kein Null.
//
// Ein Reel ohne Likes ist fast nie ein Reel mit null Likes -- meistens hat
// der Creator die Anzeige abgeschaltet, oder die Zahl kam beim Erfassen
// nicht mit. Eine glatte "0" behauptet dann etwas, das wir nicht wissen.
// Ein Strich sagt stattdessen: hier steht nichts (Emre, 28.10.2026).
export function zahlOderStrich(raw: number | undefined | null, formatieren: (n: number) => string): string {
  if (raw === undefined || raw === null || raw === 0) return "–";
  return formatieren(raw);
}
