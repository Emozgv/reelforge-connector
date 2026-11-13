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

// AUSGEBLENDETE LIKES ERKENNEN (13.11.2026, Emre).
//
// Blendet ein Creator die Likes aus, meldet Instagram trotzdem eine Zahl --
// gemessen an 416 Archiv-Reels fast immer genau 3, auch bei Reels mit fast
// zwei Millionen Aufrufen. Echte Reels mit so vielen Aufrufen haben nie so
// wenige Likes (der niedrigste echte Wert im Archiv lag bei 0,17 Prozent).
// Regel: hoechstens 10 Likes bei mindestens 1.500 Aufrufen und unter
// 0,2 Prozent -- dann gilt die Zahl als ausgeblendet und es steht ein
// Strich. Sobald die zugehoerige Connector-Aenderung veroeffentlicht ist,
// kommen neue Archiv-Eintraege ohnehin ohne diese Zahl an; die Regel faengt
// die aelteren ab.
export function likesSindVerborgen(likes: number | null | undefined, views: number | null | undefined): boolean {
  if (typeof likes !== "number" || typeof views !== "number") return false;
  return likes <= 10 && views >= 1500 && likes / views < 0.002;
}
