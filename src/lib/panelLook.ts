import type { CSSProperties } from "react";
import { GOLD_RING } from "./goldRing";

// Wie die grossen Flaechen der App aussehen -- Panels, Sektionen, Karten.
//
// ---------------------------------------------------------------------------
// DER SCHALTER
//
// Emre will den Stil der neuen Creator-Seite einmal auf allen Seiten sehen,
// um ihn gegen den bisherigen zu halten. Statt zwei Staende nebeneinander zu
// pflegen, haengt alles an dieser einen Zeile:
//
//   "V1"  Design V1 -- der aelteste Stand: fast schwarzer Verlauf von oben
//         nach unten (#070707 -> #020202), warmer Rand #1a130b, Innenkante
//         und tiefer Schlagschatten. Karten darin #111114.
//   "V2"  Design V2 -- der Stil, der auf der neuen Creator-Seite entstanden
//         ist: kuehler, leicht heller, diagonaler Verlauf, neutraler Rand
//         #24272b, kein Schatten.
//   "V3"  Design V3 -- der aktuelle Stand und der, mit dem gearbeitet wird.
//         Flaeche und Schatten von V2, Rand von V1. Emre wollte die ruhige
//         kuehle Flaeche behalten, aber die dunkelgoldene Umrandung aus V1
//         zurueck. Das ist der ganze Unterschied zwischen V2 und V3.
//
// Umschalten heisst: hier ein Wort aendern. Alle Seiten folgen -- Panels,
// Karten und Zeilen.
export type PanelStil = "V1" | "V2" | "V3";
export const PANEL_STIL = "V3" as PanelStil;
// ---------------------------------------------------------------------------

const V1 = {
  fuellung: "linear-gradient(180deg, #070707, #020202)",
  rand: "#1a130b",
  schatten:
    "inset 0 1px 0 rgba(255,255,255,0.035), inset 0 0 0 1px rgba(0,0,0,0.4), 0 16px 32px -18px rgba(0,0,0,0.8)",
} as const;

const V2 = {
  fuellung: "linear-gradient(120deg, rgba(16,19,21,0.667) 0%, rgba(11,14,17,0.733) 100%)",
  rand: "#24272b",
  schatten: "",
} as const;

// V3 erfindet nichts Eigenes -- es setzt sich aus den beiden vorhandenen
// zusammen: die Flaeche von V2, der Rand von V1.
const V3 = { fuellung: V2.fuellung, rand: V1.rand, schatten: V2.schatten } as const;

const P = PANEL_STIL === "V1" ? V1 : PANEL_STIL === "V2" ? V2 : V3;

export const PANEL_FUELLUNG = P.fuellung;
export const PANEL_RAND = P.rand;
export const PANEL_SCHATTEN = P.schatten;

// ---------------------------------------------------------------------------
// DIE ZWEITE EBENE: KARTEN UND ZEILEN
//
// Panels sind das eine, aber auf den meisten Seiten ist die Flaeche, die man
// wirklich sieht, eine Karte oder eine Zeile darin -- Lieferzeilen in Library,
// Produktionszeilen, Reel-Karten im Hub, Collection-Karten. Die hingen nie am
// Schalter und blieben deshalb stehen, waehrend die Panels umschalteten. Genau
// das sah man auf Library: Kopfzeile neu, alles darunter alt.
//
// V2s Wert ist #0d0d0f -- dieselbe Flaeche, die Emre fuer die Collection-
// Karten ausgesucht hat (sie stammt aus dem "Now Viewing"-Feld in Research
// Accounts). Dadurch sprechen alle Karten der App dieselbe Sprache.
const KARTE = { V1: "#111114", V2: "#0d0d0f", V3: "#0d0d0f" } as const;
export const KARTE_FUELLUNG = KARTE[PANEL_STIL];

// borderColor steht bewusst mit drin: die Seiten setzen ihren Rand als
// Tailwind-Klasse (border-[#1a130b]), und ein Inline-Wert sticht die Klasse.
// So folgt der Rand dem Schalter, ohne dass jede einzelne Klasse im ganzen
// Bestand angefasst werden muss.
//
// mitGoldRing gibt es, weil einige Seiten den warmen Ring zusaetzlich fuehren.
// Steht der Ring auf "none" (Goldvariante "alt" in goldRing.ts), faellt er
// hier raus -- eine
// Schattenliste mit "none" darin waere ungueltig und wuerde den ganzen
// Schatten schlucken.
export function panelStil(mitGoldRing = false): CSSProperties {
  const teile = [P.schatten, mitGoldRing ? GOLD_RING : ""].filter((t) => t && t !== "none");
  return {
    background: P.fuellung,
    borderColor: P.rand,
    ...(teile.length > 0 ? { boxShadow: teile.join(", ") } : {}),
  };
}
