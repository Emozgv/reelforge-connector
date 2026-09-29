// Der warme Rand, der eine Flaeche umreisst, ohne einen sichtbaren Strich zu
// ziehen. Er stammt aus dem Creativity Hub und stand dort ueber ein Jahr
// allein -- Emre hat ihn dort erkannt ("das ist das richtige Gold") und wollte
// ihn auf den uebrigen Seiten haben. Damit es genau ein Gold bleibt und nicht
// vier leicht verschiedene, steht er hier und wird ueberall von hier geholt,
// auch vom Hub selbst.
//
// ---------------------------------------------------------------------------
// DER SCHALTER
//
// Emre ist sich zwischen zwei Goldtoenen noch nicht sicher. Statt zwei Staende
// nebeneinander zu pflegen, haengt alles an dieser einen Zeile:
//
//   "neu"  Der Ton, der am Creators-Entwurf gemessen wurde: gedaempftes,
//          warmes Braungold (#5a3b1b, #2f2113, #77582f). Dazu der Ring aus
//          dem Creativity Hub auf allen Seiten.
//   "alt"  Der Stand davor: das helle #D39448 in halbdurchsichtigen
//          Raendern, und kein Ring.
//
// Umschalten heisst: hier ein Wort aendern. Alles andere folgt.
// Die Angabe "as GoldVariante" ist noetig, damit TypeScript den Wert nicht auf
// das eine Wort festnagelt -- sonst haelt es den Vergleich weiter unten fuer
// sinnlos und bricht beim Umschalten ab.
export type GoldVariante = "neu" | "alt";
export const GOLD_VARIANTE = "alt" as GoldVariante;
// ---------------------------------------------------------------------------

const NEU = {
  // Zwei Staerken, und der Unterschied ist Absicht:
  //   ring       fuer die grossen Flaechen -- Panels, Karten, alles, was fuer
  //              sich steht. Halber Punkt Rand auf 32 Prozent, dazu ein Hauch
  //              Schein.
  //   ringWeich  fuer die Werkzeugleiste -- Suchfelder, Chips, Pillen,
  //              Knoepfe. Die sitzen dicht beieinander und wirken bei der
  //              vollen Staerke wie umrandet statt umrissen.
  ring: "0 0 0 0.5px rgba(211,148,72,0.32), 0 0 10px rgba(211,148,72,0.08)",
  ringWeich: "0 0 0 0.5px rgba(211,148,72,0.22), 0 0 8px rgba(211,148,72,0.06)",
  // Aktive Schaltflaechen -- am Entwurf gemessen.
  akzentRand: "#5a3b1b",
  akzentFuellung: "#2f2113",
  akzentSchrift: "#EAC088",
  // Die ausgewaehlte Zeile in Library.
  auswahlRand: "#77582f",
  auswahlSchatten: "0 0 0 1px rgba(119,88,47,0.35), 0 10px 26px -18px rgba(211,148,72,0.35)",
} as const;

const ALT = {
  // Kein Ring -- so sah es aus, bevor der Hub-Ring auf die anderen Seiten kam.
  ring: "none",
  ringWeich: "none",
  // Das helle Gold in halbdurchsichtigen Raendern.
  akzentRand: "rgba(211,148,72,0.6)",
  akzentFuellung: "rgba(211,148,72,0.12)",
  akzentSchrift: "#D39448",
  auswahlRand: "rgba(211,148,72,0.7)",
  auswahlSchatten: "0 0 0 1px rgba(211,148,72,0.18), 0 10px 26px -18px rgba(211,148,72,0.5)",
} as const;

const G = GOLD_VARIANTE === "alt" ? ALT : NEU;

export const GOLD_RING = G.ring;
export const GOLD_RING_SOFT = G.ringWeich;
export const GOLD_AKZENT_RAND = G.akzentRand;
export const GOLD_AKZENT_FUELLUNG = G.akzentFuellung;
export const GOLD_AKZENT_SCHRIFT = G.akzentSchrift;
export const GOLD_AUSWAHL_RAND = G.auswahlRand;
export const GOLD_AUSWAHL_SCHATTEN = G.auswahlSchatten;
