// Wie das Research-Bild zustande kommt.
//
// ---------------------------------------------------------------------------
// DER SCHALTER
//
//   "V1"  Der eingefrorene Stand (Tag connector-v1-freeze). Der Connector
//         liest die Adresse der Videodatei aus Instagrams Antworten mit, und
//         ReelForge spielt eine eigene Kopie davon ab. Instagram bekommt
//         davon nichts mit -- gemessen am 06.10.2026: 2 Minuten Sitzung,
//         9 Reels beim Mitarbeiter, und Instagram sah einen Account, der ein
//         einziges Reel 13 Mal in Schleife ansieht.
//
//   "V2"  Instagrams eigenes Video wird durchgereicht. Bild und Ton kommen
//         als ein Strom an, und jeder Wisch geht in denselben Tab zurueck.
//         Was der Mitarbeiter sieht, IST Instagram -- also zaehlt Instagram
//         auch seine Verweildauer.
//
// V2 braucht einen Connector, der die Buehne kennt (Zweig connector-v2).
// Mit einem aelteren Connector faellt die Ansicht von selbst auf V1 zurueck,
// statt leer zu bleiben.
// ---------------------------------------------------------------------------
export type ResearchModus = "V1" | "V2";
export const RESEARCH_MODUS = "V2" as ResearchModus;
